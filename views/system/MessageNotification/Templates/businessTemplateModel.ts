import type { NoticeChannelConfig, NoticeChannelTemplateItem } from '../../../../api/notice-center'
import { buildChannelPayload } from '../../../notice/template/hooks/noticeTemplatePayload'
import { getTemplateFieldSchemas, getByPath, resolveTemplateContext, normalizeTemplateBeforeSubmit, resolveTemplateForm } from '../../../notice/template/hooks/noticeTemplateFormModel'
import { cloneNotificationValue, notificationEnumValue, type NotificationChannel, type NotificationTemplate } from '../shared'
import { buildTemplatePayload, createTemplateDraft, newTemplateDraft, parseTemplateObject, TemplateValidationError, type TemplateDraft } from './model'

/** Exact records isolate asset scopes; placeholders are identified by their business code until explicitly enabled. */
export const businessIdentity = (business: NoticeChannelConfig) => business.id || business.providerId || business.provider || ''
export const businessRecordId = (business: NoticeChannelConfig) => business.id || business.providerId || ''
export const businessDraftKey = (business: NoticeChannelConfig, channel: NotificationChannel) => JSON.stringify([businessIdentity(business), channel.type, channel.provider])

export function businessTemplateDraft(business: NoticeChannelConfig, channel: NotificationChannel, item?: NoticeChannelTemplateItem): TemplateDraft {
  const template = item?.template
  if (template && (notificationEnumValue(template.type) !== channel.type || notificationEnumValue(template.provider) !== channel.provider)) {
    // One delivery type owns one binding. Changing vendors starts a separate draft without copying incompatible content.
    return newBusinessDraft(business, channel)
  }
  if (!template) return newBusinessDraft(business, channel)
  const draft = createTemplateDraft({ ...template, id: template.id || '', name: template.name || business.name || '',
    type: channel.type, provider: channel.provider, template: template.template || {},
    configId: template.configId || item?.channel.channelConfiguration?.notifierId } as NotificationTemplate)
  if (channel.type !== 'email') draft.templateJson = JSON.stringify(resolveTemplateForm(undefined, { ...template, type: channel.type, provider: channel.provider }, draft.name).payload.template, null, 2)
  return draft
}
function newBusinessDraft(business: NoticeChannelConfig, channel: NotificationChannel) {
  const draft = newTemplateDraft(channel)
  draft.name = business.name || business.provider || ''
  if (channel.type !== 'email') draft.templateJson = JSON.stringify(resolveTemplateForm(undefined, {
    type: channel.type, provider: channel.provider,
  }, draft.name).payload.template, null, 2)
  return draft
}

/** Reuse legacy form normalization and subscriber mapping; never submit a whole business or its sibling channels. */
export function buildBusinessTemplatePayload(business: NoticeChannelConfig, original: NoticeChannelConfig, draft: TemplateDraft, enabled: boolean): NoticeChannelTemplateItem {
  if (!businessRecordId(business)) throw new TemplateValidationError('enableFirst')
  if (!draft.configId) throw new TemplateValidationError('configRequired')
  const template = buildTemplatePayload(draft)
  if (draft.type !== 'email') {
    const form = { ...template, template: parseTemplateObject(draft.templateJson), variableDefinitions: template.variableDefinitions || [] }
    for (const field of getTemplateFieldSchemas(resolveTemplateContext(undefined, { type: template.type, provider: template.provider }), form).filter(field => field.required && field.key !== 'provider')) {
      const value = getByPath(form.template, field.path)
      if (value === undefined || value === null || typeof value === 'string' && !value.trim()) throw new TemplateValidationError('providerFieldsRequired')
    }
    template.template = normalizeTemplateBeforeSubmit(form).template
  }
  // Managed IDs are returned by the server. A historical independent template is a content source, never overwritten.
  const managedId = original.id && original.channelConfiguration?.templateId === `stpl_${original.id}`
    ? original.channelConfiguration.templateId : undefined
  const channel = buildChannelPayload({ detailProviderId: businessRecordId(business) }, {
    channel: cloneNotificationValue(original), channelName: original.name || draft.name, channelProvider: `notifier-${draft.type}`,
  }, draft.configId, template.variableDefinitions)
  channel.state = enabled ? 'enabled' : 'disabled'
  return { channel, template: { ...template, id: managedId } }
}
