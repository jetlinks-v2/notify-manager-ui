import { request } from '@jetlinks-web/core'
import type { AxiosResponseRewrite } from '@jetlinks-web/types'
import type {
  NotificationHistory,
  NotificationHistoryCounts,
  NotificationObject,
  NotificationPage,
  NotificationQuery,
  NotificationTemplate,
  NotificationTemplatePayload,
  NotifierConfig,
  NotifierConfigPayload,
  NotificationProvider,
  NotificationConfigMetadata,
  NotificationVariable,
} from './messageNotificationTypes'
import { classifyNotificationFailure, normalizeNotificationPage, NotificationRequestError } from './messageNotificationState'
import { readHistoryCounts } from './notificationHistoryCounts'
import { httpWebhookConfigMetadata, normalizeNotificationConfigMetadata } from './notificationConfigMetadata'
import type { NoticeChannelConfig, NoticeChannelTemplateItem, NoticeProviderTemplateInfo } from '../notice-center'

interface BusinessVariableMetadata extends NotificationVariable { valueType?: { type?: string; format?: string } }

/** Preserve platform request behavior, but require success before a page updates its saved baseline. */
async function checked<T>(operation: Promise<AxiosResponseRewrite<T>>): Promise<T> {
  try {
    const response = await operation
    if (!response.success) throw new NotificationRequestError(classifyNotificationFailure(response), response)
    return response.result
  } catch (error) {
    if (error instanceof NotificationRequestError) throw error
    throw new NotificationRequestError(classifyNotificationFailure(error), error)
  }
}

/** IDs are opaque route segments, never raw URL fragments or an implicit first configuration. */
function idSegment(id: string): string {
  if (!id.trim()) throw new NotificationRequestError('error')
  return encodeURIComponent(id)
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim()
}

function enumIdentity(value: unknown): boolean {
  return nonemptyString(value) || !!value && typeof value === 'object' && 'value' in value && nonemptyString(value.value)
}

/** A malformed directory is an error, never evidence that a type has no providers. */
function directory(value: unknown): NotificationProvider[] {
  if (!Array.isArray(value) || value.some(item => !item || !nonemptyString(item.id))) {
    throw new NotificationRequestError('error')
  }
  return value
}

/** Missing channels are valid; malformed successful responses must not become prototype defaults. */
function businessTemplate(value: unknown): NoticeChannelTemplateItem | undefined {
  if (value === undefined || value === null) return
  if (!value || typeof value !== 'object' || !('channel' in value)
    || !value.channel || typeof value.channel !== 'object'
    || !('channelProvider' in value.channel) || !nonemptyString(value.channel.channelProvider)) {
    throw new NotificationRequestError('error', value)
  }
  if ('template' in value && value.template !== undefined && value.template !== null) {
    const template = value.template
    if (typeof template !== 'object' || !('id' in template) || !nonemptyString(template.id)
      || !('configId' in template) || !nonemptyString(template.configId)
      || !('type' in template) || !nonemptyString(template.type)
      || !('provider' in template) || !nonemptyString(template.provider)
      || !('template' in template) || !template.template || typeof template.template !== 'object'
      || Array.isArray(template.template)) throw new NotificationRequestError('error', value)
  }
  return value as NoticeChannelTemplateItem
}

/** Typed notification facade using the platform request context and checked responses. */
export const messageNotificationApi = {
  /** Existing business directory supplies grouping and exact template bindings, never name matching. */
  async queryTemplateDirectory(): Promise<NoticeChannelConfig[]> {
    const result = await checked<NoticeChannelConfig[]>(request.get('/notify/channel/all-for-save'))
    if (!Array.isArray(result) || result.some(item => !item || typeof item !== 'object'
      || (item.channels !== undefined && !Array.isArray(item.channels)))) throw new NotificationRequestError('error')
    return result
  },
  async queryTypes(): Promise<NotificationProvider[]> {
    return directory(await checked<unknown>(request.get('/notifier/config/types')))
  },
  async queryProviders(type: string): Promise<NotificationProvider[]> {
    return directory(await checked<unknown>(request.get(`/notifier/config/type/${idSegment(type)}/providers`)))
  },
  async getConfigMetadata(type: string, provider: string): Promise<NotificationConfigMetadata> {
    const result = await checked<unknown>(request.get(`/notifier/config/${idSegment(type)}/${idSegment(provider)}/metadata`))
    // Only the verified HTTP provider omits metadata; errors and unknown providers remain explicit.
    return normalizeNotificationConfigMetadata(result ?? (type === 'webhook' && provider === 'http' ? httpWebhookConfigMetadata : undefined))
  },
  /** Template fields have their own metadata endpoint; absent or empty metadata permits the JSON editor. */
  async getTemplateMetadata(type: string, provider: string): Promise<NotificationConfigMetadata | undefined> {
    const result = await checked<unknown>(request.get(`/notifier/template/${idSegment(type)}/${idSegment(provider)}/config/metadata`))
    if (result === undefined || result === null) return
    if (typeof result !== 'object' || Array.isArray(result)) throw new NotificationRequestError('error', result)
    return normalizeNotificationConfigMetadata({ ...result, properties: 'properties' in result ? result.properties : [] })
  },
  /** Business channels use persisted provider IDs; HTTP failures never mean an unconfigured channel. */
  async getBusinessTemplate(providerId: string, channelProvider: string): Promise<NoticeChannelTemplateItem | undefined> {
    return businessTemplate(await checked<unknown>(request.get(`/notify/channel/${idSegment(providerId)}/${idSegment(channelProvider)}/_query-with-template`)))
  },
  async saveBusinessTemplate(providerId: string, channelProvider: string, payload: NoticeChannelTemplateItem): Promise<NoticeChannelTemplateItem> {
    const result = businessTemplate(await checked<unknown>(request.put(`/notify/channel/${idSegment(providerId)}/${idSegment(channelProvider)}/_save-with-template`, payload)))
    if (!result?.template) throw new NotificationRequestError('error', result)
    return result
  },
  /** First save creates one disabled topic and its current channel in the backend transaction. */
  async saveBusinessTemplates(topicProvider: string, payload: NoticeProviderTemplateInfo): Promise<NoticeProviderTemplateInfo> {
    const result = await checked<NoticeProviderTemplateInfo>(request.put(`/notify/channel/${idSegment(topicProvider)}/_save-with-templates`, payload))
    if (!result?.provider || !nonemptyString(result.provider.id) || !Array.isArray(result.channels)) throw new NotificationRequestError('error', result)
    result.channels = result.channels.map(item => {
      const normalized = businessTemplate(item)
      if (!normalized?.template) throw new NotificationRequestError('error', item)
      return normalized
    })
    return result
  },
  async queryBusinessVariables(providerId: string): Promise<NotificationVariable[]> {
    const result = await checked<BusinessVariableMetadata[]>(request.get(`/notify/channel/${idSegment(providerId)}/variables`))
    if (!Array.isArray(result) || result.some(item => !item || !nonemptyString(item.id))) throw new NotificationRequestError('error', result)
    // PropertyMetadata exposes valueType, while stored template declarations expose type directly.
    return result.map(item => {
      const format = item.format || item.valueType?.format || item.expands?.format
      return { ...item, type: typeof item.type === 'string' ? item.type : item.valueType?.type,
        ...(typeof format === 'string' ? { format } : {}) }
    })
  },
  async queryAllConfigs(): Promise<NotifierConfig[]> {
    const result = await checked<unknown>(request.post('/notifier/config/_query/no-paging', {}))
    if (!Array.isArray(result) || result.some(item => !item || !nonemptyString(item.id) || typeof item.name !== 'string'
      || !enumIdentity(item.type) || !enumIdentity(item.provider) || !item.configuration
      || typeof item.configuration !== 'object' || Array.isArray(item.configuration))) throw new NotificationRequestError('error')
    return normalizeNotificationPage<NotifierConfig>(result).data
  },
  /** Global history is scoped by backend asset permissions; keep filters and cancellation intact. */
  async queryHistory(query: NotificationQuery, signal?: AbortSignal): Promise<NotificationPage<NotificationHistory>> {
    return normalizeNotificationPage(await checked<NotificationPage<NotificationHistory> | NotificationHistory[]>(
      request.post('/notify/history/_query', query, { signal }),
    ))
  },
  /** Aggregate the same asset-filtered history scope; malformed counts must not become zero. */
  async countHistory(filter: NotificationQuery, signal?: AbortSignal): Promise<NotificationHistoryCounts> {
    try {
      // This Flux endpoint only produces SSE (JSON negotiation returns 406). Axios buffers the finite stream.
      return readHistoryCounts(await request.post('/notify/history/_agg', {
        columns: [{ column: 'id', alias: 'total', aggregation: 'COUNT' }],
        groupBy: [{ column: 'state', alias: 'state' }], filter, limit: 100,
      }, { signal, headers: { Accept: 'text/event-stream' }, responseType: 'text' }))
    } catch (error) {
      if (error instanceof NotificationRequestError) throw error
      throw new NotificationRequestError(classifyNotificationFailure(error), error)
    }
  },
  async queryConfigs(query: NotificationQuery): Promise<NotificationPage<NotifierConfig>> {
    return normalizeNotificationPage(await checked<NotificationPage<NotifierConfig> | NotifierConfig[]>(request.post('/notifier/config/_query', query)))
  },
  getConfig(id: string): Promise<NotifierConfig> {
    return checked<NotifierConfig>(request.get(`/notifier/config/${idSegment(id)}`))
  },
  createConfig(payload: NotifierConfigPayload): Promise<unknown> {
    return checked<unknown>(request.post('/notifier/config', payload))
  },
  updateConfig(payload: NotifierConfigPayload & { id: string }): Promise<unknown> {
    return checked<unknown>(request.patch('/notifier/config', payload))
  },
  deleteConfig(id: string): Promise<unknown> {
    return checked<unknown>(request.remove(`/notifier/config/${idSegment(id)}`))
  },
  async queryTemplates(query: NotificationQuery): Promise<NotificationPage<NotificationTemplate>> {
    return normalizeNotificationPage(await checked<NotificationPage<NotificationTemplate> | NotificationTemplate[]>(request.post('/notifier/template/_query', query)))
  },
  getTemplate(id: string): Promise<NotificationTemplate> {
    return checked<NotificationTemplate>(request.get(`/notifier/template/${idSegment(id)}`))
  },
  createTemplate(payload: NotificationTemplatePayload): Promise<unknown> {
    return checked<unknown>(request.post('/notifier/template', payload))
  },
  updateTemplate(payload: NotificationTemplatePayload & { id: string }): Promise<unknown> {
    return checked<unknown>(request.patch('/notifier/template', payload))
  },
  deleteTemplate(id: string): Promise<unknown> {
    return checked<unknown>(request.remove(`/notifier/template/${idSegment(id)}`))
  },
  send(configId: string, templateId: string, variables: NotificationObject): Promise<unknown> {
    return checked<unknown>(request.post(`/notifier/${idSegment(configId)}/${idSegment(templateId)}/_send`, variables))
  },
}

export type MessageNotificationApi = typeof messageNotificationApi
