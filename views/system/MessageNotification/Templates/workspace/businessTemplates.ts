import type { NoticeChannelConfig, NoticeChannelTemplateItem } from '../../../../../api/notice-center'
import type { MessageNotificationApi } from '../../../../../api/notice/messageNotification'
import { buildNoticeTemplateChannelVariables } from '../../../../notice/template/hooks/noticeTemplateChannelVariables'
import { extractVariableIds } from '../../../../notice/template/hooks/noticeTemplateFormModel'
import {
  cloneNotificationValue, dingTalkRobotChannelId, notificationEnumValue, NotificationRequestError, usesBusinessChannelKey,
  type NotificationChannel, type NotificationTemplate, type NotificationTemplatePayload,
} from '../../shared'
import { createTemplateDraft, isEmailDraft, type TemplateDraft } from '../model'

export interface TemplateDraftEntry {
  draft: TemplateDraft
  baseline: string
  baselineDraft: TemplateDraft
  existing: boolean
  businessIdentity?: string
  businessConfigId?: string
  channel?: NoticeChannelConfig
  prototype?: NotificationTemplate
}

/** Persisted and unsaved topics have distinct local identities until first save returns the actual ID. */
export function businessIdentity(business: NoticeChannelConfig): string {
  return JSON.stringify([business.provider || '', business.id || null])
}

export function businessDraftKey(business: NoticeChannelConfig, channelId: string, configId?: string): string {
  const identity = `business:${businessIdentity(business)}:${channelId}`
  return configId ? `${identity}:${JSON.stringify(configId)}` : identity
}

export function channelProviderFor(channel: NotificationChannel): string {
  return `notifier-${channel.type}`
}

type StoredBusinessTemplate = {
  channel?: NoticeChannelConfig
  template?: NotificationTemplate
  savedItem?: NoticeChannelTemplateItem
}

export function businessChannelKey(channel: NoticeChannelConfig): string | undefined {
  return channel.channelKey || undefined
}

/** 保存接口按实例身份定位，详情回读必须仍指向同一通道、模板和凭证。 */
export async function readBusinessChannelBinding(api: Pick<MessageNotificationApi, 'getBusinessTemplate'>,
  providerId: string, expected: NoticeChannelConfig, templateId: string, configId: string | undefined): Promise<NoticeChannelConfig> {
  const channelProvider = expected.channelProvider
  const channelKey = businessChannelKey(expected)
  if (!expected.id || !channelProvider || !configId) throw new NotificationRequestError('unavailable')
  const { channel, template } = await api.getBusinessTemplate(providerId, channelProvider, channelKey) ?? {}
  if (channel?.id !== expected.id || channel.providerId !== providerId || channel.channelProvider !== channelProvider
    || businessChannelKey(channel) !== channelKey || channel.channelConfiguration?.templateId !== templateId
    || template?.id !== templateId || template.configId !== configId) throw new NotificationRequestError('unavailable')
  return channel
}

/** 模板目录的凭证优先于旧通道上为兼容写入的 notifierId。 */
export function bindingConfigId(channel: NoticeChannelConfig, templates: readonly NotificationTemplate[]): string | undefined {
  const reference = channel.channelConfiguration
  return templates.find(item => item.id === reference?.templateId)?.configId || reference?.notifierId
}

export function businessChannelBindings(business: NoticeChannelConfig, channel: NotificationChannel): NoticeChannelConfig[] {
  return (business.channels ?? []).filter(item => item.channelProvider === channelProviderFor(channel)
    && (item.id || item.channelConfiguration?.templateId))
}

/** 核对业务、实例和模板引用。历史默认实例的 key 可能省略，也可能为空。 */
export function readBusinessTemplate(business: NoticeChannelConfig, channel: NotificationChannel,
  item?: NoticeChannelTemplateItem, channelKey?: string): StoredBusinessTemplate {
  const provider = channelProviderFor(channel)
  const declared = business.channels?.find(value => value.channelProvider === provider && businessChannelKey(value) === channelKey)
  const actual = item?.channel
  if (actual && (actual.channelProvider !== provider || actual.providerId !== business.id || businessChannelKey(actual) !== channelKey)) {
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
  if (notificationEnumValue(template.provider) !== channel.provider) return { channel: actual || declared }
  return { channel: actual || declared, savedItem: item, template: {
    ...cloneNotificationValue(template), id: template.id,
    name: template.name || business.name || channel.name || channel.type,
    type: channel.type, provider: channel.provider, template: cloneNotificationValue(template.template),
  } }
}

/** 先按凭证找已有绑定，读取时校验实际凭证，避免同类型的其他实例被当作当前模板。 */
export async function loadBusinessTemplateForConfig(api: Pick<MessageNotificationApi, 'getBusinessTemplate'>,
  business: NoticeChannelConfig, channel: NotificationChannel, configId: string,
  templates: readonly NotificationTemplate[] = []): Promise<StoredBusinessTemplate> {
  const providerId = business.id
  if (!providerId || !configId) return {}
  const channelProvider = channelProviderFor(channel)
  const bindings = businessChannelBindings(business, channel)
  const matches = bindings.filter(binding => (bindingConfigId(binding, templates) || binding.channelKey) === configId)
  if (matches.length > 1) throw new NotificationRequestError('error')
  const binding = matches[0]
  const channelKey = binding ? businessChannelKey(binding) : configId
  const item = await api.getBusinessTemplate(providerId, channelProvider, channelKey)
  if (item || binding) {
    const stored = readBusinessTemplate(business, channel, item, channelKey)
    if (stored.template?.configId !== configId) throw new NotificationRequestError('error', item)
    return stored
  }

  // 目录快照可能缺少旧默认通道。只有详情绑定同一凭证时才沿用原通道 ID。
  const legacy = bindings.find(binding => !businessChannelKey(binding))
  const legacyConfigId = legacy && bindingConfigId(legacy, templates)
  if (legacyConfigId && legacyConfigId !== configId) return {}
  const stored = readBusinessTemplate(business, channel, await api.getBusinessTemplate(providerId, channelProvider))
  return stored.template?.configId === configId ? stored : {}
}

/** 校验服务端实际写入的实例，可识别旧后端忽略 channelKey 的响应。 */
export function readSavedBusinessTemplate(business: NoticeChannelConfig, channel: NotificationChannel,
  submitted: NoticeChannelTemplateItem, saved?: NoticeChannelTemplateItem): NotificationTemplate {
  const template = readBusinessTemplate(business, channel, saved, businessChannelKey(submitted.channel)).template
  if (!template || template.configId !== submitted.template?.configId) throw new NotificationRequestError('error', saved)
  if (usesBusinessChannelKey(channel.id) && (
    submitted.channel.id && saved?.channel.id !== submitted.channel.id
    || submitted.template?.id && template.id !== submitted.template.id
  )) {
    throw new NotificationRequestError('error', saved)
  }
  return template
}

/** 正文写入省略已有绑定的状态，服务端按字段更新。新绑定沿用默认状态。 */
export function buildBusinessTemplateItem(business: NoticeChannelConfig, channel: NotificationChannel,
  entry: TemplateDraftEntry, payload: NotificationTemplatePayload): NoticeChannelTemplateItem {
  const original = cloneNotificationValue(entry.channel || {})
  const state = typeof original.state === 'string' ? original.state : original.state?.value
  const channelKey = usesBusinessChannelKey(channel.id) && !entry.channel?.id && !entry.existing
    ? payload.configId : original.channelKey
  return {
    channel: {
      ...original, providerId: business.id,
      ...(channelKey ? { channelKey } : {}),
      name: original.name || channel.name || channel.typeName || channel.type,
      channelProvider: channelProviderFor(channel),
      state: entry.existing && original.id ? undefined : state === 'disabled' ? 'disabled' : 'enabled',
      channelConfiguration: {
        ...original.channelConfiguration, notifierId: payload.configId,
        variables: buildNoticeTemplateChannelVariables({
          channelProvider: channel.id === dingTalkRobotChannelId ? undefined : channelProviderFor(channel),
          variableDefinitions: payload.variableDefinitions,
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
  const index = channels.findIndex(item => item.channelProvider === channel.channelProvider
    && businessChannelKey(item) === businessChannelKey(channel))
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
