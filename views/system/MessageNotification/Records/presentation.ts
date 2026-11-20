import dayjs from 'dayjs'
import type { ConditionFilterField } from '@jetlinks-web-core/components/ConditionFilter'
import {
  notificationChannels, notificationEnumText, notificationEnumValue, notificationStates,
  resolveNotificationChannel, type NotificationEnum, type NotificationHistory,
} from '../shared'
import { formatEmailListPreview } from '../Templates/definition/emailTemplateContent'

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

/** 将空白和独立横线识别为缺省值，保留文本中的连字符。 */
function reportedText(value?: string | null): string | undefined {
  const text = value?.trim()
  return text && !/^[-–—−－]+$/.test(text) ? text : undefined
}

function reportedEnum(value?: NotificationEnum): NotificationEnum | undefined {
  if (typeof value === 'object' && value) {
    return { value: reportedText(value.value) ?? '', text: reportedText(value.text) }
  }
  return reportedText(value)
}

function historyTableMessage(
  value: string | undefined,
  type: NotificationEnum | undefined,
  t: Translate,
): { text: string; html?: string } | undefined {
  const text = reportedText(value)
  if (text === undefined) return undefined
  if (notificationEnumValue(type) !== 'email') return { text }
  const preview = formatEmailListPreview(text)
  return reportedText(preview.text) ? preview : { text: t('messageNotification.records.viewDetail') }
}

/** 表格和悬浮提示共用展示值，避免把缺省文案写入发送记录。 */
export function historyTableCells(row: NotificationHistory, t: Translate) {
  const type = reportedEnum(row.notifyType)
  const provider = reportedEnum(row.provider)
  const state = reportedEnum(row.state)

  return {
    notifyTime: reportedText(historyTime(row.notifyTime)) ?? t('comm.table.empty-2'),
    channel: reportedText(historyChannelLabel(type, provider, t)) ?? t('comm.table.empty'),
    channelIcon: historyChannelIcon(type),
    receiver: row.receiver?.map(reportedText).filter(Boolean).join(', ') || t('messageNotification.records.receiverUnspecified'),
    reason: reportedText(row.errorMessage) ?? reportedText(row.errorType) ?? t('messageNotification.records.noException'),
    state: notificationEnumValue(state),
    stateLabel: reportedText(historyStateLabel(state, t)) ?? t('comm.table.empty-2'),
    message: historyTableMessage(row.notifyMessage, type, t),
  }
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
