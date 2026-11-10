import type { NotificationEnum, NotifyState, NotifyType } from '../../../../api/notice/messageNotificationTypes'

export interface NotificationChannel {
  id: string
  type: NotifyType
  provider: string
  labelKey: string
  group: 'instant' | 'telephone' | 'integration'
  secretFields: readonly string[]
}

/** Narrow catalog verified against existing UI choices and notify-component provider metadata. */
export const notificationChannels: readonly NotificationChannel[] = [
  { id: 'email:embedded', type: 'email', provider: 'embedded', labelKey: 'messageNotification.channel.email', group: 'instant', secretFields: ['password'] },
  { id: 'dingTalk:dingTalkMessage', type: 'dingTalk', provider: 'dingTalkMessage', labelKey: 'messageNotification.channel.dingTalkCorp', group: 'instant', secretFields: ['appSecret'] },
  { id: 'dingTalk:dingTalkRobotWebHook', type: 'dingTalk', provider: 'dingTalkRobotWebHook', labelKey: 'messageNotification.channel.dingTalkRobot', group: 'instant', secretFields: ['url'] },
  { id: 'weixin:corpMessage', type: 'weixin', provider: 'corpMessage', labelKey: 'messageNotification.channel.wechatCorp', group: 'instant', secretFields: ['corpSecret'] },
  { id: 'voice:aliyun', type: 'voice', provider: 'aliyun', labelKey: 'messageNotification.channel.voice', group: 'telephone', secretFields: ['secret'] },
  { id: 'sms:aliyunSms', type: 'sms', provider: 'aliyunSms', labelKey: 'messageNotification.channel.sms', group: 'telephone', secretFields: ['secret'] },
  { id: 'webhook:http', type: 'webhook', provider: 'http', labelKey: 'messageNotification.channel.webhook', group: 'integration', secretFields: [] },
]

export const notificationStates: readonly NotifyState[] = ['success', 'error', 'retrying', 'cancel']

export const notificationCapabilities = {
  config: { query: true, create: true, update: true, delete: true, send: true },
  template: { query: true, create: true, update: true, delete: true, send: true },
  history: { query: false, count: false, retry: false, export: false },
  memberBinding: false,
  internalInboxTemplate: false,
} as const

/** Frontend menu action codes; backend resource/action mappings are declared in baseMenu.json. */
export const notificationPermissions = {
  channels: {
    query: 'system/MessageNotification/Channels:query',
    add: 'system/MessageNotification/Channels:add',
    update: 'system/MessageNotification/Channels:update',
    delete: 'system/MessageNotification/Channels:delete',
    action: 'system/MessageNotification/Channels:action',
  },
  templates: {
    query: 'system/MessageNotification/Templates:query',
    add: 'system/MessageNotification/Templates:add',
    update: 'system/MessageNotification/Templates:update',
    delete: 'system/MessageNotification/Templates:delete',
    action: 'system/MessageNotification/Templates:action',
  },
  records: { query: 'system/MessageNotification/Records:query' },
} as const

/** EnumDict labels come from the server; callers use this value for logic and requests only. */
export function notificationEnumValue(value: NotificationEnum | null | undefined): string {
  return typeof value === 'string' ? value : value?.value ?? ''
}

/** Preserve server-localized EnumDict text; a caller can translate a raw value separately. */
export function notificationEnumText(value: NotificationEnum | null | undefined): string {
  return typeof value === 'string' ? value : value?.text || value?.value || ''
}

/** Resolve only verified channels; unknown providers must not inherit another provider's editor. */
export function findNotificationChannel(id: string | undefined): NotificationChannel | undefined {
  return notificationChannels.find(channel => channel.id === id)
}

/** Shared mapping for configuration/template DTOs and historical notifyType/provider pairs. */
export function resolveNotificationChannel(type: NotificationEnum | undefined, provider: NotificationEnum | undefined): NotificationChannel | undefined {
  return findNotificationChannel(`${notificationEnumValue(type)}:${notificationEnumValue(provider)}`)
}
