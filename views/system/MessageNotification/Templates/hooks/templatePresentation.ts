import type { NotificationObject, NotifierConfig } from '../../shared'
import { notificationEnumValue } from '../../shared'
import { isWorkChannel, workChannelRecipients } from '../../shared/workRecipients'
import {
  getTemplateFieldSchemas, resolveTemplateForm, type NoticeTemplateEditorPayload, type NoticeTemplateFormContext,
} from '../../../../notice/template/hooks/noticeTemplateFormModel'
import type { TemplateDraft } from '../model'

const knownProviders = new Set([
  'email:embedded', 'dingTalk:dingTalkMessage', 'dingTalk:dingTalkRobotWebHook',
  'weixin:corpMessage', 'voice:aliyun', 'sms:aliyunSms', 'webhook:http',
])

/** Only verified provider pairs use the existing specialized fields and message presentation. */
export function hasKnownTemplatePresentation(draft: Pick<TemplateDraft, 'type' | 'provider'>): boolean {
  return knownProviders.has(`${draft.type}:${draft.provider}`)
}

/** 旧语音模板只保存 ttsCode，表单和变量列表共同读取实际显示的模板编号。 */
export function resolveProviderTemplateForm(draft: TemplateDraft, content: NotificationObject) {
  const template = { ...content }
  if (draft.type === 'voice' && draft.provider === 'aliyun' && template.templateCode === undefined && template.ttsCode !== undefined) {
    template.templateCode = template.ttsCode
  }
  return resolveTemplateForm(undefined, {
    id: draft.id, name: draft.name, type: draft.type, provider: draft.provider,
    configId: draft.configId, template, variableDefinitions: draft.variables,
  }, draft.name)
}

/** 表单与变量提取共用当前消息模式的字段，工作通知的收件范围由渠道管理。 */
export function templateContentFields(context: NoticeTemplateFormContext, form: NoticeTemplateEditorPayload) {
  const channel = `${context.type}:${context.provider}`
  const excluded = new Set<string>(['provider'])
  if (isWorkChannel(channel)) {
    for (const key of Object.values(workChannelRecipients[channel])) excluded.add(key)
    excluded.add('toAllUser')
  }
  return getTemplateFieldSchemas(context, form).filter(field => !excluded.has(field.key) && field.kind !== 'attachments')
}

/** Invalid JSON remains the user's draft; callers must not replace it with an empty template. */
export function readPresentationTemplate(draft: TemplateDraft): { valid: boolean; template: NotificationObject } {
  try {
    const value: unknown = JSON.parse(draft.templateJson)
    if (value && typeof value === 'object' && !Array.isArray(value)) return { valid: true, template: value as NotificationObject }
  } catch { /* Keep an unfinished JSON edit visible until it is valid again. */ }
  return { valid: false, template: {} }
}

/** A similarly named configuration from another provider never becomes an editor choice or sender. */
export function matchesTemplateConfiguration(draft: TemplateDraft, config?: NotifierConfig): boolean {
  return Boolean(config && notificationEnumValue(config.type) === draft.type && notificationEnumValue(config.provider) === draft.provider)
}

/** Unknown provider fields remain visible without exposing authentication-shaped extension values. */
export function safePreviewStructure(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safePreviewStructure)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key, /password|secret|credential|access.?key|api.?key|token|authorization|cookie|headers/i.test(key) ? '••••••••' : safePreviewStructure(item),
  ]))
}
