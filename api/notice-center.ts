import { request } from '@jetlinks-web/core'

export type NoticeCenterState = string | { value?: string; text?: string }

export interface NoticeChannelProvider {
  id: string
  name?: string
  i18nName?: string
  receiverPolicy?: unknown
}

export interface NoticeTemplateVariable {
  id: string
  name?: string
  type?: string
  description?: string
  expands?: Record<string, unknown>
}

export interface NoticeTemplateEntity {
  id?: string
  name?: string
  type?: string
  provider?: string
  configId?: string
  description?: string
  template?: Record<string, unknown>
  variableDefinitions?: NoticeTemplateVariable[]
  [key: string]: unknown
}

export interface NoticeChannelConfiguration {
  notifierId?: string
  templateId?: string
  variables?: Record<string, unknown>
}

export interface NoticeChannelConfig {
  id?: string
  providerId?: string
  name?: string
  i18nName?: string
  provider?: string
  channelProvider?: string
  state?: NoticeCenterState
  grant?: Record<string, unknown>
  configuration?: Record<string, unknown>
  defaultSubscribed?: boolean
  defaultNotifyChannels?: string[]
  channelConfiguration?: NoticeChannelConfiguration
  channels?: NoticeChannelConfig[]
  type?: {
    id?: string
    name?: string
  }
  [key: string]: unknown
}

export interface NoticeChannelTemplateItem {
  channel: NoticeChannelConfig
  template?: NoticeTemplateEntity | null
}

export interface NoticeProviderTemplateInfo {
  provider?: NoticeChannelConfig
  channels: NoticeChannelTemplateItem[]
}

export interface NoticeMetadataValueType {
  type?: string
  format?: string
  expands?: Record<string, unknown>
  elements?: Array<{ label?: string; text?: string; value: unknown }>
  trueText?: string
  falseText?: string
  trueValue?: unknown
  falseValue?: unknown
  [key: string]: unknown
}

export interface NoticeMetadataProperty {
  id: string
  name?: string
  description?: string
  valueType?: NoticeMetadataValueType
  expands?: Record<string, unknown>
  [key: string]: unknown
}

export interface NotifierConfigMetadata {
  name?: string
  description?: string
  properties?: NoticeMetadataProperty[]
  [key: string]: unknown
}

export interface NotifierProviderInfo {
  id: string
  name?: string
  type?: string
  [key: string]: unknown
}

export interface NotifierConfig {
  id?: string
  name?: string
  type?: string
  provider?: string
  description?: string
  configuration?: Record<string, unknown>
  createTime?: number
  [key: string]: unknown
}

export interface SendNotifierInlineTestPayload {
  template: NoticeTemplateEntity
  context: Record<string, unknown>
}

export interface NoticeSmsTemplateOption {
  templateCode?: string
  templateName?: string
  templateContent?: string
  [key: string]: unknown
}

export interface NoticeSmsSignOption {
  signName?: string
  [key: string]: unknown
}

export interface NoticeCorpDepartment {
  id: string
  name?: string
  children?: NoticeCorpDepartment[]
  [key: string]: unknown
}

export interface NoticeCorpUser {
  id: string
  name?: string
  [key: string]: unknown
}

export interface NoticeCorpTag {
  id: string
  name?: string
  [key: string]: unknown
}

export interface NoticePlatformUser {
  id: string
  name?: string
  username?: string
  telephone?: string
  phone?: string
  [key: string]: unknown
}
export const queryNoticeChannelAll_api = (): Promise<any> =>
    request.get('/notify/channel/all')

export const queryNoticeChannelConfig_api = (): Promise<any> =>
  request.get('/notify/channel/all-for-save')

export const enableNoticeChannel_api = (providerId: string): Promise<any> =>
  request.post(`/notify/channel/${providerId}/enable`)

export const disableNoticeChannel_api = (providerId: string): Promise<any> =>
  request.post(`/notify/channel/${providerId}/disable`)

export const queryNoticeChannelProviders_api = (): Promise<any> =>
  request.get('/notify/channel/providers')

export const queryNoticeChannelVariables_api = (providerId: string): Promise<any> =>
  request.get(`/notify/channel/${providerId}/variables`)

export const queryNoticeChannelWithTemplates_api = (providerId: string): Promise<any> =>
  request.get(`/notify/channel/${providerId}/_query-with-templates`)

export const saveNoticeChannelWithTemplates_api = (
  providerId: string,
  data: NoticeProviderTemplateInfo,
): Promise<any> =>
  request.put(`/notify/channel/${providerId}/_save-with-templates`, data)

export const queryNotifierConfig_api = (data: Record<string, unknown>): Promise<any> =>
  request.post('/notifier/config/_query', data)

export const queryNotifierConfigDetail_api = (id: string): Promise<any> =>
  request.get(`/notifier/config/${encodeURIComponent(id)}`)

export const queryNotifierTemplateDetail_api = (id: string): Promise<any> =>
  request.get(`/notifier/template/${encodeURIComponent(id)}/detail`)

export const queryNotifyHistoryByTemplate_api = (
  templateId: string,
  data: Record<string, unknown>,
): Promise<any> =>
  request.post(`/notify/history/template/${encodeURIComponent(templateId)}/_query`, data)

export const saveNotifierConfig_api = (data: NotifierConfig): Promise<any> =>
  request.post('/notifier/config', data)

export const updateNotifierConfig_api = (data: NotifierConfig): Promise<any> =>
  request.patch('/notifier/config', data)

export const queryNotifierConfigMetadata_api = (
  type: string,
  provider: string,
): Promise<any> =>
  request.get(`/notifier/config/${encodeURIComponent(type)}/${encodeURIComponent(provider)}/metadata`)

export const queryNotifierTypeProviders_api = (type: string): Promise<any> =>
  request.get(`/notifier/config/type/${encodeURIComponent(type)}/providers`)

export const queryAliyunSmsTemplates_api = (configId: string): Promise<any> =>
  request.get(`/notifier/sms/aliyun/${encodeURIComponent(configId)}/templates`)

export const queryAliyunSmsSigns_api = (configId: string): Promise<any> =>
  request.get(`/notifier/sms/aliyun/${encodeURIComponent(configId)}/signs`)

export const queryWechatCorpDepartments_api = (configId: string): Promise<any> =>
  request.get(`/notifier/wechat/corp/${encodeURIComponent(configId)}/departments/tree`)

export const queryWechatCorpUsers_api = (
  configId: string,
  departmentId: string,
): Promise<any> =>
  request.get(`/notifier/wechat/corp/${encodeURIComponent(configId)}/${encodeURIComponent(departmentId)}/users`)

export const queryWechatCorpTags_api = (configId: string): Promise<any> =>
  request.get(`/notifier/wechat/corp/${encodeURIComponent(configId)}/tags`)

export const queryNoticePlatformUsers_api = (data: Record<string, unknown>): Promise<any> =>
  request.post('/user/_query/no-paging', data)

export const sendNotifierTest_api = (
  configId: string,
  templateId: string,
  context: Record<string, unknown>,
): Promise<any> =>
  request.post(
    `/notifier/${encodeURIComponent(configId)}/${encodeURIComponent(templateId)}/_send`,
    context,
  )

export const sendNotifierInlineTest_api = (
  configId: string,
  data: SendNotifierInlineTestPayload,
): Promise<any> =>
  request.post(`/notifier/${encodeURIComponent(configId)}/_send`, data)
