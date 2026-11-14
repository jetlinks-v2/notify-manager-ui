import type { NoticeChannelConfig, NoticeChannelTemplateItem } from '../../../../../api/notice-center'
import { buildNoticeTemplateChannelVariables } from '../../../../notice/template/hooks/noticeTemplateChannelVariables'
import { extractVariableIds } from '../../../../notice/template/hooks/noticeTemplateFormModel'
import {
  cloneNotificationValue, notificationEnumValue, NotificationRequestError,
  type NotificationChannel, type NotificationTemplate, type NotificationTemplatePayload,
} from '../../shared'
import { createTemplateDraft, isEmailDraft, type TemplateDraft } from '../model'

export interface TemplateDraftEntry {
  draft: TemplateDraft
  baseline: string
  baselineDraft: TemplateDraft
  existing: boolean
  enabled?: boolean
  baselineEnabled?: boolean
  businessIdentity?: string
  channel?: NoticeChannelConfig
  prototype?: NotificationTemplate
}

/** Persisted and unsaved topics have distinct local identities until first save returns the actual ID. */
export function businessIdentity(business: NoticeChannelConfig): string {
  return JSON.stringify([business.provider || '', business.id || null])
}

export function businessDraftKey(business: NoticeChannelConfig, channelId: string): string {
  return `business:${businessIdentity(business)}:${channelId}`
}

export function channelProviderFor(channel: NotificationChannel): string {
  return `notifier-${channel.type}`
}

/** Validate declared references before deciding whether this precise provider has stored content. */
export function readBusinessTemplate(business: NoticeChannelConfig, channel: NotificationChannel,
  item?: NoticeChannelTemplateItem): { channel?: NoticeChannelConfig; template?: NotificationTemplate } {
  const provider = channelProviderFor(channel)
  const declared = business.channels?.find(value => value.channelProvider === provider)
  const actual = item?.channel
  if (actual && (actual.channelProvider !== provider || actual.providerId !== business.id)) {
    throw new NotificationRequestError('error', item)
  }
  const bound = actual?.channelConfiguration?.templateId || declared?.channelConfiguration?.templateId
  const template = item?.template
  if (bound && (!template || template.id !== bound)) throw new NotificationRequestError('error', item)
  if (!template) return { channel: actual || declared }
  if (!template.id || !template.configId || notificationEnumValue(template.type) !== channel.type
    || !template.template || typeof template.template !== 'object' || Array.isArray(template.template)) {
    throw new NotificationRequestError('error', item)
  }
  // One channelProvider can bind only one vendor. A second vendor starts its own draft and can replace that binding on save.
  if (notificationEnumValue(template.provider) !== channel.provider) return { channel: actual || declared }
  return { channel: actual || declared, template: {
    ...cloneNotificationValue(template), id: template.id,
    name: template.name || business.name || channel.name || channel.type,
    type: channel.type, provider: channel.provider, template: cloneNotificationValue(template.template),
  } }
}

/** Retain channel state, grant and explicit variable expressions while updating the current binding. */
export function buildBusinessTemplateItem(business: NoticeChannelConfig, channel: NotificationChannel,
  entry: TemplateDraftEntry, payload: NotificationTemplatePayload): NoticeChannelTemplateItem {
  const original = cloneNotificationValue(entry.channel || {})
  return {
    channel: {
      ...original, providerId: business.id,
      name: original.name || channel.name || channel.typeName || channel.type,
      channelProvider: channelProviderFor(channel), state: entry.enabled === undefined ? original.state ?? 'enabled' : entry.enabled ? 'enabled' : 'disabled',
      channelConfiguration: {
        ...original.channelConfiguration, notifierId: payload.configId,
        variables: buildNoticeTemplateChannelVariables({
          channelProvider: channelProviderFor(channel), variableDefinitions: payload.variableDefinitions,
          currentVariables: original.channelConfiguration?.variables,
        }),
      },
    },
    template: { ...cloneNotificationValue(payload) },
  }
}

/** Replace only the saved channel in the directory snapshot; sibling bindings and topic settings survive. */
export function mergeSavedBusiness(business: NoticeChannelConfig, channel: NoticeChannelConfig,
  provider?: NoticeChannelConfig): NoticeChannelConfig {
  const channels = [...(business.channels || [])]
  const index = channels.findIndex(item => item.channelProvider === channel.channelProvider)
  if (index < 0) channels.push(cloneNotificationValue(channel))
  else channels[index] = cloneNotificationValue(channel)
  return { ...cloneNotificationValue(business), ...cloneNotificationValue(provider || {}), channels }
}

/** Only definite client rejections permit retry; timeout/server failures cannot prove that first-save creation rolled back. */
export function hasDefiniteSaveRejection(error: unknown): boolean {
  const value = error instanceof NotificationRequestError ? error.original : error
  if (!value || typeof value !== 'object') return false
  const source = value as { status?: number; response?: { status?: number }; data?: { status?: number } }
  // Axios transport status wins over body fields; success=false alone is also used for gateway failures.
  const status = Number(source.response?.status ?? source.status ?? source.data?.status)
  return Number.isFinite(status) && status >= 400 && status < 500 && status !== 408 && status !== 499
}

/** Restore content while retaining saved names, destinations and actual supplier/app selections. */
export function restoreBusinessDefaultDraft(current: TemplateDraft, prototype: NotificationTemplate): TemplateDraft {
  let previous = cloneNotificationValue(current.extraTemplate)
  if (!isEmailDraft(current)) {
    try {
      const value: unknown = JSON.parse(current.templateJson)
      if (value && typeof value === 'object' && !Array.isArray(value)) previous = value as Record<string, unknown>
    } catch {
      // Restoring content also repairs invalid edited JSON; trusted delivery fields remain in the last parsed object.
    }
  }
  const content = { ...previous, ...cloneNotificationValue(prototype.template) }
  const deliveryFields = ['agentId', 'toUser', 'toParty', 'toTag', 'userIdList', 'sendTo', 'phoneNumber', 'calledNumber',
    'atMobiles', 'atUserIds', 'isAtAll', 'code', 'signName', 'templateCode', 'ttsCode', 'templateType']
  for (const key of deliveryFields) if (Object.hasOwn(previous, key)) content[key] = cloneNotificationValue(previous[key])
  if (isEmailDraft(current)) content.sendTo = cloneNotificationValue(current.sendTo)
  const used = new Set(extractVariableIds(JSON.stringify(content)))
  const definitions = new Map((prototype.variableDefinitions || []).map(value => [value.id, cloneNotificationValue(value)]))
  for (const value of current.variables) if (used.has(value.id) && !definitions.has(value.id)) definitions.set(value.id, cloneNotificationValue(value))
  return createTemplateDraft({ ...prototype, id: current.id, name: current.name, configId: current.configId,
    description: current.description, template: content, variableDefinitions: [...definitions.values()] })
}
