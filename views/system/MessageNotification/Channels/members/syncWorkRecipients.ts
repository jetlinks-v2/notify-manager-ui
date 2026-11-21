import type { NoticeChannelTemplateItem } from '../../../../../api/notice-center'
import type { MessageNotificationApi } from '../../../../../api/notice/messageNotification'
import { NotificationRequestError } from '../../../../../api/notice/messageNotificationState'
import type { NotificationTemplate } from '../../../../../api/notice/messageNotificationTypes'
import { applyWorkRecipients, workChannelRecipients, type WorkChannelId, type WorkRecipients } from '../../shared/workRecipients'
import { businessChannelKey } from '../../Templates/workspace/businessTemplates'

export type RecipientSyncApi = Pick<MessageNotificationApi, 'queryTemplateDirectory' | 'queryTemplates' |
  'getTemplate' | 'getBusinessTemplate' | 'saveBusinessTemplate' | 'updateTemplate'>

interface TemplateTarget {
  id: string
  name: string
  businessId?: string
  channelKey?: string
}

const channelType = (channelId: WorkChannelId) => channelId.split(':')[0]
const providerFor = (channelId: WorkChannelId) => `notifier-${channelType(channelId)}`

/** Use the writable business directory for atomic template plus channel-variable changes. */
export async function loadRecipientTargets(api: RecipientSyncApi, configId: string, channelId: WorkChannelId): Promise<TemplateTarget[]> {
  const [type, provider] = channelId.split(':')
  const [directory, templates] = await Promise.all([
    api.queryTemplateDirectory(),
    api.queryTemplates({ paging: false, terms: [{ column: 'configId', termType: 'eq', value: configId }, { column: 'type', termType: 'eq', value: type }, { column: 'provider', termType: 'eq', value: provider }] }),
  ])
  const matchingTemplates = templates.data.filter(template => template.configId === configId && matchesWorkTemplate(template, channelId))
  const templateIds = new Set(matchingTemplates.map(template => template.id))
  const targets = new Map<string, TemplateTarget>()
  for (const business of directory) {
    if (!business.id) continue
    for (const channel of business.channels ?? []) {
      if (channel.channelProvider !== providerFor(channelId)) continue
      const id = channel.channelConfiguration?.templateId
      if (!id) continue
      const channelKey = businessChannelKey(channel)
      const notifierId = channel.channelConfiguration?.notifierId
      // 具名实例按模板引用或实际凭证匹配，旧通道没有 notifierId 时由详情确认。
      if (templateIds.has(id) || (notifierId || channelKey || configId) === configId) {
        targets.set(id, { id, name: business.name || id, businessId: business.id, channelKey })
      }
    }
  }
  for (const template of matchingTemplates) {
    if (!targets.has(template.id)) {
      targets.set(template.id, { id: template.id, name: template.name || template.id })
    }
  }
  return [...targets.values()]
}

function matchesWorkTemplate(template: NotificationTemplate | NonNullable<NoticeChannelTemplateItem['template']>, channelId: WorkChannelId): boolean {
  const type = typeof template.type === 'string' ? template.type : template.type?.value
  const provider = typeof template.provider === 'string' ? template.provider : template.provider?.value
  return `${type}:${provider}` === channelId
}

async function resolveTarget(api: RecipientSyncApi, target: TemplateTarget, configId: string, channelId: WorkChannelId) {
  if (target.businessId) {
    const original = await api.getBusinessTemplate(target.businessId, providerFor(channelId), target.channelKey)
    if (!original?.template || original.template.id !== target.id) throw new NotificationRequestError('error')
    if (original.template.configId !== configId || !matchesWorkTemplate(original.template, channelId)) return
    if (original.channel.providerId !== target.businessId || original.channel.channelProvider !== providerFor(channelId)
      || businessChannelKey(original.channel) !== target.channelKey
      || original.channel.channelConfiguration?.templateId !== target.id) throw new NotificationRequestError('error')
    return original
  }
  const template = await api.getTemplate(target.id)
  if (template.id !== target.id) throw new NotificationRequestError('error')
  if (template.configId !== configId || !matchesWorkTemplate(template, channelId)) return
  const [type, provider] = channelId.split(':')
  return { channel: {}, template: { ...template, type, provider } }
}

const fieldsFor = (channelId: WorkChannelId) => [...Object.values(workChannelRecipients[channelId]), ...(channelId === 'dingTalk:dingTalkMessage' ? ['toAllUser'] : [])]

function valuesChanged(original: NoticeChannelTemplateItem, next: NoticeChannelTemplateItem, channelId: WorkChannelId) {
  const fields = fieldsFor(channelId)
  return fields.some(key => (original.template?.template?.[key] ?? '') !== (next.template?.template?.[key] ?? ''))
    || fields.some(key => Object.hasOwn(original.channel.channelConfiguration?.variables ?? {}, key))
}

export interface RecipientTemplatePreview {
  id: string
  name: string
  previous: string
  dynamic: boolean
}

export async function previewRecipientTemplates(api: RecipientSyncApi, configId: string, channelId: WorkChannelId, recipients: WorkRecipients) {
  const targets = await loadRecipientTargets(api, configId, channelId)
  const rows: RecipientTemplatePreview[] = []
  for (const target of targets) {
    const original = await resolveTarget(api, target, configId, channelId)
    if (!original || !valuesChanged(original, applyWorkRecipients(original, channelId, recipients), channelId)) continue
    const previous = fieldsFor(channelId).flatMap(key => {
      const value = original.template?.template?.[key]
      return typeof value === 'string' && value.trim() ? [value] : value === true ? ['@all'] : []
    }).join(' / ')
    const dynamic = fieldsFor(channelId).some(key => Object.hasOwn(original.channel.channelConfiguration?.variables ?? {}, key))
    rows.push({ id: target.id, name: target.name, previous, dynamic })
  }
  return rows
}

/** Re-read each binding before writing. Retrying skips matching records and reports every failed template. */
export async function syncRecipientTemplates(api: RecipientSyncApi, configId: string, channelId: WorkChannelId,
  recipients: WorkRecipients, active: () => boolean, verifySetting?: () => Promise<void>) {
  const targets = await loadRecipientTargets(api, configId, channelId)
  const failed: string[] = []
  for (const target of targets) {
    if (!active()) break
    try {
      const original = await resolveTarget(api, target, configId, channelId)
      if (!active()) break
      if (!original) continue
      const next = applyWorkRecipients(original, channelId, recipients)
      if (!valuesChanged(original, next, channelId)) continue
      await verifySetting?.()
      if (!active()) break
      if (target.businessId) {
        const saved = await api.saveBusinessTemplate(target.businessId, providerFor(channelId), next)
        if (saved.template?.id !== target.id || saved.template.configId !== configId
          || valuesChanged(saved, next, channelId)) throw new NotificationRequestError('error', saved)
      } else {
        // A managed template outside the write-scoped business directory cannot be updated directly.
        if (target.id.startsWith('stpl_')) throw new NotificationRequestError('forbidden')
        const template = next.template
        if (!template?.id || !template.name || !template.type || !template.provider || !template.template) throw new NotificationRequestError('error')
        await api.updateTemplate({ ...template, id: template.id, name: template.name, type: template.type, provider: template.provider, template: template.template })
        const saved = await resolveTarget(api, target, configId, channelId)
        if (!saved || valuesChanged(saved, next, channelId)) throw new NotificationRequestError('error')
      }
    } catch {
      if (active()) failed.push(target.name)
    }
  }
  return failed
}
