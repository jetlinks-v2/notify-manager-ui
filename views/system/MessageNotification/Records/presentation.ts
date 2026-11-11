import dayjs from 'dayjs'
import type { ConditionFilterField } from '@jetlinks-web-core/components/ConditionFilter'
import {
  notificationChannels, notificationEnumText, notificationEnumValue, notificationStates,
  resolveNotificationChannel, type NotificationEnum,
} from '../shared'

type Translate = (key: string, values?: Record<string, unknown>) => string

/** Historical providers outside the known catalog keep a neutral channel icon. */
export function historyChannelIcon(type: NotificationEnum | undefined): string {
  const icons: Record<string, string> = { email: 'MailOutlined', dingTalk: 'DingdingOutlined', weixin: 'WechatOutlined', sms: 'MessageOutlined', voice: 'PhoneOutlined', webhook: 'ApiOutlined' }
  return icons[notificationEnumValue(type)] || 'NotificationOutlined'
}

/** Preserve backend EnumDict text; translate only known raw state values. */
export function historyStateLabel(value: NotificationEnum | undefined, t: Translate): string {
  if (typeof value === 'object' && value?.text) return value.text
  const state = notificationEnumValue(value)
  return notificationStates.includes(state as typeof notificationStates[number])
    ? t(`messageNotification.records.state.${state}`) : notificationEnumText(value) || '—'
}

/** Use the shared provider catalog; unknown historical providers remain visible verbatim. */
export function historyChannelLabel(type: NotificationEnum | undefined, provider: NotificationEnum | undefined, t: Translate): string {
  if (typeof type === 'object' && type?.text) return [type.text, notificationEnumText(provider)].filter(Boolean).join(' / ')
  const channel = resolveNotificationChannel(type, provider)
  return channel ? t(channel.labelKey) : [notificationEnumText(type), notificationEnumText(provider)].filter(Boolean).join(' / ') || '—'
}

/** Timestamp zero is valid historical data; missing or invalid values stay unspecified. */
export function historyTime(value?: number): string {
  return value !== undefined && Number.isFinite(value) && dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

/** Display stored content as text, preserving invalid serialized JSON and never evaluating templates. */
export function historySnapshot(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value !== 'string') return JSON.stringify(value, null, 2)
  try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value }
}

/** Shared field metadata drives editor, route codec and adapter query conversion. */
export function historyFilterFields(t: Translate): ConditionFilterField[] {
  const text = (dataIndex: string) => ({
    dataIndex, title: t(`messageNotification.records.field.${dataIndex}`),
    search: { type: 'string', defaultTermType: 'eq' },
  })
  return [
    { ...text('notifyMessage'), search: { type: 'string', defaultTermType: 'like' } },
    text('receiver'), text('notifierId'), text('templateId'), text('bizType'), text('bizId'),
    {
      dataIndex: 'notifyTime', title: t('messageNotification.records.field.notifyTime'),
      search: { type: 'date', defaultTermType: 'btw' },
    },
    {
      dataIndex: 'state', title: t('messageNotification.records.field.state'),
      search: { type: 'select', defaultTermType: 'eq', options: notificationStates.map(value => ({ value, label: t(`messageNotification.records.state.${value}`) })) },
    },
    {
      dataIndex: 'notifyType', title: t('messageNotification.records.field.notifyType'),
      search: { type: 'select', defaultTermType: 'eq', options: [...new Set(notificationChannels.map(channel => channel.type))].map(value => ({ value, label: t(`messageNotification.records.type.${value}`) })) },
    },
  ]
}
