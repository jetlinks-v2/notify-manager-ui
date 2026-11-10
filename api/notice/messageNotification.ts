import { request } from '@jetlinks-web/core'
import type { AxiosResponseRewrite } from '@jetlinks-web/types'
import type {
  NotificationObject,
  NotificationPage,
  NotificationQuery,
  NotificationTemplate,
  NotificationTemplatePayload,
  NotifierConfig,
  NotifierConfigPayload,
} from './messageNotificationTypes'
import { classifyNotificationFailure, normalizeNotificationPage, NotificationRequestError } from './messageNotificationState'

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

/** Typed config/template facade. History querying remains unavailable pending a separate integration. */
export const messageNotificationApi = {
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
