/** Verified notifier DTOs; provider-specific extension fields remain in their own maps. */
export type NotificationObject = Record<string, unknown>
export type NotificationEnum = string | { value: string; text?: string }
export type NotifyType = 'email' | 'dingTalk' | 'weixin' | 'voice' | 'sms' | 'webhook'
export type NotifyState = 'success' | 'error' | 'retrying' | 'cancel'

export interface NotificationQuery {
  paging?: boolean
  pageIndex?: number
  pageSize?: number
  terms?: NotificationObject[]
  sorts?: NotificationObject[]
  context?: NotificationObject
}

export interface NotificationPage<T> {
  data: T[]
  total?: number
  pageIndex?: number
  pageSize?: number
}

export interface NotifierConfig {
  id: string
  name: string
  type: NotificationEnum
  provider: NotificationEnum
  receiptKey?: string
  configuration: NotificationObject
}

export interface NotifierConfigPayload {
  id?: string
  name: string
  type: string
  provider: string
  receiptKey?: string
  configuration: NotificationObject
}

export interface EmailProperty {
  name: string
  value: string
  description?: string
}

export interface EmailConfiguration extends NotificationObject {
  host?: string
  port?: number
  sender?: string
  username?: string
  password?: string
  properties?: EmailProperty[]
}

export interface NotificationVariable {
  id: string
  name?: string
  description?: string
  type?: string
  required?: boolean
  format?: string
  expands?: NotificationObject
  defaultValue?: string
}

export interface NotificationAttachment {
  name: string
  location: string
}

export interface EmailTemplate extends NotificationObject {
  subject?: string
  text?: string
  sendTo?: string[]
  attachments?: NotificationAttachment[]
}

export interface NotificationTemplate {
  id: string
  name: string
  configId?: string
  type: NotificationEnum
  provider: NotificationEnum
  template: NotificationObject
  variableDefinitions?: NotificationVariable[]
  description?: string
}

export interface NotificationTemplatePayload {
  id?: string
  name: string
  configId?: string
  type: string
  provider: string
  template: NotificationObject
  variableDefinitions?: NotificationVariable[]
  description?: string
}

/** Historical snapshots may contain storage-serialized JSON; invalid strings must stay visible. */
export interface NotificationHistory {
  id: string
  notifierId?: string
  state?: NotificationEnum
  errorType?: string
  errorMessage?: string
  errorStack?: string
  templateId?: string
  template?: string
  context?: NotificationObject | string
  provider?: NotificationEnum
  notifyType?: NotificationEnum
  notifyTime?: number
  receiver?: string[]
  bindings?: string[]
  creatorId?: string
  bizType?: string
  bizId?: string
  callId?: string
  result?: NotificationObject | string
  bizExt?: NotificationObject | string
  notifyMessage?: string
  description?: string
}
