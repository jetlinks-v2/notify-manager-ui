import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type { NotificationQuery, NotifyState } from '../../../../api/notice/messageNotificationTypes'
import { findNotificationChannel, notificationChannels, notificationStates, type NotificationChannel } from './catalog'

export const notificationRouteNames = {
  channels: 'system/MessageNotification/Channels',
  templates: 'system/MessageNotification/Templates',
  records: 'system/MessageNotification/Records',
} as const

export type NotificationPageName = keyof typeof notificationRouteNames
export interface NotificationNavigation {
  channel?: string
  configId?: string
  templateId?: string
  state?: NotifyState
}

const prototypeChannelTypes: Record<string, string> = {
  邮件: 'email', 钉钉: 'dingTalk', 企业微信: 'weixin', 语音: 'voice', 短信: 'sms', Webhook: 'webhook',
}

function queryString(value: LocationQuery[string]): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' && first.trim() ? first : undefined
}

/** Normalize shared query keys once; prototype business categories are not persisted bindings. */
export function normalizeNotificationNavigation(query: LocationQuery, channels: readonly NotificationChannel[] = notificationChannels): NotificationNavigation {
  const requestedChannel = queryString(query.channel)
  const prototypeType = prototypeChannelTypes[queryString(query.ch) ?? '']
  const matches = channels.filter(channel => channel.type === prototypeType)
  // Ambiguous prototype channels require a provider selection rather than silently using the first.
  const fallback = matches.length === 1 ? matches[0] : undefined
  const channel = findNotificationChannel(requestedChannel, channels)?.id ?? (!requestedChannel ? fallback?.id : undefined)
  const state = queryString(query.state) ?? queryString(query.status)
  return {
    ...(channel ? { channel } : {}),
    ...(queryString(query.configId) ? { configId: queryString(query.configId) } : {}),
    ...(queryString(query.templateId) ? { templateId: queryString(query.templateId) } : {}),
    ...(notificationStates.includes(state as NotifyState) ? { state: state as NotifyState } : {}),
  }
}

/** Preserve ConditionFilter and host-owned query keys while replacing this feature's selection. */
export function notificationQuery(navigation: NotificationNavigation, existing: LocationQueryRaw = {}, channels: readonly NotificationChannel[] = notificationChannels): LocationQueryRaw {
  const query = { ...existing }
  for (const key of ['channel', 'configId', 'templateId', 'state', 'ch', 'status', 'sub', 'sec', 'tab']) delete query[key]
  if (findNotificationChannel(navigation.channel, channels)) query.channel = navigation.channel
  if (navigation.configId) query.configId = navigation.configId
  if (navigation.templateId) query.templateId = navigation.templateId
  if (navigation.state && notificationStates.includes(navigation.state)) query.state = navigation.state
  return query
}

/** Pass the result to useMenuStore().jumpPage(name, options), preserving platform route resolution. */
export function notificationNavigationTarget(page: NotificationPageName, navigation: NotificationNavigation = {}) {
  return { name: notificationRouteNames[page], options: { query: notificationQuery(navigation) } }
}

/** Add provider-scoped terms while preserving caller filters and the backend's zero-based paging. */
export function withNotificationChannel(query: NotificationQuery, channel: NotificationChannel): NotificationQuery {
  return {
    ...query,
    terms: [
      ...(query.terms ?? []),
      { column: 'type', termType: 'eq', value: channel.type },
      { column: 'provider', termType: 'eq', value: channel.provider },
    ],
  }
}

/** A single matching record can be selected; multiple records always require an explicit ID. */
export function selectNotificationConfig<T extends { id: string }>(configs: T[], requestedId?: string): T | undefined {
  if (requestedId) return configs.find(config => config.id === requestedId)
  return configs.length === 1 ? configs[0] : undefined
}
