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
} from './messageNotificationTypes'
import { classifyNotificationFailure, normalizeNotificationPage, NotificationRequestError } from './messageNotificationState'
import { readHistoryCounts } from './notificationHistoryCounts'
import { httpWebhookConfigMetadata, normalizeNotificationConfigMetadata } from './notificationConfigMetadata'
import { queryNoticeChannelTemplate_api, saveNoticeChannelTemplate_api, type NoticeChannelConfig, type NoticeChannelTemplateItem } from '../notice-center'

export interface CurrentNotificationBinding { type: string; provider: string; providerName?: string; thirdPartyUserId: string }

/** Preserve platform request behavior, but require success before a page updates its saved baseline. */
export async function checked<T>(operation: Promise<AxiosResponseRewrite<T>>): Promise<T> {
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

/** Typed notification facade using the platform request context and checked responses. */
export const messageNotificationApi = {
  getBusinessTemplate(providerId: string, channelProvider: string): Promise<NoticeChannelTemplateItem | undefined> {
    return checked(queryNoticeChannelTemplate_api(providerId, channelProvider))
  },
  saveBusinessTemplate(providerId: string, channelProvider: string, payload: NoticeChannelTemplateItem): Promise<NoticeChannelTemplateItem> {
    return checked(saveNoticeChannelTemplate_api(providerId, channelProvider, payload))
  },
  setBusinessEnabled(providerId: string, enabled: boolean): Promise<unknown> {
    return checked(request.post(`/notify/channel/${idSegment(providerId)}/${enabled ? 'enable' : 'disable'}`))
  },
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
    return checked<unknown>(request.post('/notifier/config', payload, { hiddenError: true }))
  },
  updateConfig(payload: NotifierConfigPayload & { id: string }): Promise<unknown> {
    return checked<unknown>(request.patch('/notifier/config', payload, { hiddenError: true }))
  },
  deleteConfig(id: string): Promise<unknown> {
    return checked<unknown>(request.remove(`/notifier/config/${idSegment(id)}`, undefined, { hiddenError: true }))
  },
  async queryTemplates(query: NotificationQuery): Promise<NotificationPage<NotificationTemplate>> {
    return normalizeNotificationPage(await checked<NotificationPage<NotificationTemplate> | NotificationTemplate[]>(request.post('/notifier/template/_query', query)))
  },
  getTemplate(id: string): Promise<NotificationTemplate> {
    return checked<NotificationTemplate>(request.get(`/notifier/template/${idSegment(id)}`))
  },
  /** Trial sends need the provider's embedded variables in addition to stored template fields. */
  getSendTemplate(id: string): Promise<NotificationTemplate> {
    return checked<NotificationTemplate>(request.get(`/notifier/template/${idSegment(id)}/detail`))
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
  /** Inline trials use the existing notifier send action and do not create a database template. */
  sendInline(configId: string, template: NotificationTemplatePayload, context: NotificationObject): Promise<unknown> {
    return checked<unknown>(request.post(`/notifier/${idSegment(configId)}/_send`, { template, context }, { hiddenError: true }))
  },
  /** Match personal-center precedence: primary email identity, first email identity, then profile email. */
  async getCurrentEmail(): Promise<string> {
    const identities = await checked<{ provider: string; identity: string; isPrimary?: boolean }[]>(
      request.get('/user/identity/_me', undefined, { hiddenError: true }),
    )
    if (!Array.isArray(identities)) throw new NotificationRequestError('error')
    const emails = identities.filter(item => item.provider === 'email')
    const identity = emails.find(item => item.isPrimary) || emails[0]
    if (identity?.identity) return identity.identity
    const profile = await checked<{ email?: string }>(request.get('/user/detail', undefined, { applicationScope: false, hiddenError: true }))
    if (!profile || typeof profile !== 'object') throw new NotificationRequestError('error')
    return typeof profile.email === 'string' ? profile.email : ''
  },
  /** Personal phone and bindings need no member-management or template-query permission. */
  async getCurrentPhone(): Promise<string> {
    const profile = await checked<{ telephone?: string }>(request.get('/user/detail', undefined, { applicationScope: false, hiddenError: true }))
    if (!profile || typeof profile !== 'object' || Array.isArray(profile) || (profile.telephone != null && typeof profile.telephone !== 'string')) throw new NotificationRequestError('error')
    return profile.telephone || ''
  },
  async getCurrentBindings(): Promise<CurrentNotificationBinding[]> {
    const bindings = await checked<CurrentNotificationBinding[]>(request.get('/user/third-party/me', undefined, { hiddenError: true }))
    if (!Array.isArray(bindings) || bindings.some(item => !item || typeof item.type !== 'string' || typeof item.provider !== 'string' || typeof item.thirdPartyUserId !== 'string')) throw new NotificationRequestError('error')
    return bindings
  },
}

export type MessageNotificationApi = typeof messageNotificationApi
