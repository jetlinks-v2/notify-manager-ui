import {
  cloneNotificationValue, notificationEnumValue, resolveNotificationChannel,
  type NotificationAttachment, type NotificationObject, type NotificationTemplate,
  type NotificationTemplatePayload, type NotificationVariable, type NotificationChannel,
} from '../shared'
import { getByPath, normalizeTemplateBeforeSubmit } from '../../../notice/template/hooks/noticeTemplateFormModel'

export interface TemplateDraft {
  id: string
  name: string
  configId: string
  type: string
  provider: string
  description: string
  subject: string
  text: string
  sendTo: string[]
  attachments: NotificationAttachment[]
  variables: NotificationVariable[]
  extraTemplate: NotificationObject
  templateJson: string
}

export class TemplateValidationError extends Error {
  constructor(readonly key: string) { super(`messageNotification.templates.${key}`) }
}

/** Copy actual template fields and preserve provider extension fields during editing. */
export function createTemplateDraft(record: NotificationTemplate): TemplateDraft {
  const content = cloneNotificationValue(record.template ?? {})
  return {
    id: record.id, name: record.name, configId: record.configId ?? '',
    type: notificationEnumValue(record.type), provider: notificationEnumValue(record.provider),
    description: record.description ?? '', subject: stringValue(content.subject), text: stringValue(content.text === undefined ? content.message : content.text),
    sendTo: Array.isArray(content.sendTo) ? content.sendTo.map(String) : [],
    attachments: Array.isArray(content.attachments) ? content.attachments.map(item => ({ ...cloneNotificationValue(item), name: stringValue(item.name), location: stringValue(item.location) })) : [],
    variables: cloneNotificationValue(record.variableDefinitions ?? []), extraTemplate: content,
    templateJson: JSON.stringify(content, null, 2),
  }
}

/** A new draft belongs to one verified provider and never inherits another record's values. */
export function newTemplateDraft(channel: NotificationChannel, configId = ''): TemplateDraft {
  return createTemplateDraft({ id: '', name: '', configId, type: channel.type, provider: channel.provider, template: {} })
}

export function stringValue(value: unknown): string { return typeof value === 'string' ? value : '' }
export function isEmailDraft(draft: TemplateDraft): boolean { return draft.type === 'email' && draft.provider === 'embedded' }

/** Accept only JSON objects; a provider payload must not accidentally become an array or string. */
export function parseTemplateObject(text: string): NotificationObject {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new TemplateValidationError('invalidJson') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TemplateValidationError('invalidJson')
  return value as NotificationObject
}

/** FileManager also accepts opaque platform IDs; do not interpret them as relative browser URLs. */
export function isTemplateAttachmentId(value: string): boolean {
  return Boolean(value) && /^[^:/\\\s${}]+$/u.test(value)
}

/** Match supported resource kinds without enabling arbitrary executable URL schemes in the UI. */
export function validAttachmentLocation(value: string): boolean {
  const source = value.trim()
  return /^https?:\/\/[^\s]+$/i.test(source) || /^\/(?!\/)[^\s]+$/.test(source)
    || /^\$\{[^{}]+\}$/.test(source) || isTemplateAttachmentId(source)
    || /^data:[^,\s]*;base64,[A-Za-z0-9+/\s]*={0,2}$/i.test(source)
}

/** Give core the original file ID so its download helper applies the platform file URL resolver. */
export function attachmentToUploadFile(attachment: NotificationAttachment, index: number) {
  const location = attachment.location
  const directUrl = /^https?:\/\//i.test(location) || /^\/(?!\/)/.test(location) || /^data:[^,]*;base64,/.test(location)
  return {
    uid: `saved-${index}`, name: attachment.name, status: 'done' as const,
    ...(directUrl ? { url: location } : {}),
    ...(isTemplateAttachmentId(location) ? { response: { success: true, result: { id: location } } } : {}),
  }
}

/** Apply existing provider conversions without leaking editor aliases or discarding extension fields. */
function normalizeProviderContent(draft: TemplateDraft, content: NotificationObject): NotificationObject {
  if (!resolveNotificationChannel(draft.type, draft.provider)) return content
  const source = cloneNotificationValue(content)
  if (isEmailDraft(draft)) source.message = draft.text
  if (draft.type === 'sms' && draft.provider === 'aliyunSms') {
    if (!stringValue(source.code).trim()) throw new TemplateValidationError('smsTemplateRequired')
    if (!stringValue(source.signName).trim()) throw new TemplateValidationError('smsSignRequired')
  }
  if (draft.type === 'voice' && draft.provider === 'aliyun') {
    if (source.templateCode === undefined) source.templateCode = source.ttsCode
    if (!stringValue(source.templateCode).trim()) throw new TemplateValidationError('voiceTemplateRequired')
    if (source.ttsmessage === undefined) source.ttsmessage = source.message
  }
  if (draft.type === 'dingTalk' && draft.provider === 'dingTalkRobotWebHook') {
    const messageType = stringValue(source.messageType) || 'markdown'
    source.messageType = messageType
    if (source.message === undefined) source.message = getByPath(source, messageType === 'text' ? ['text', 'content'] : [messageType, 'text'])
  }
  const result = normalizeTemplateBeforeSubmit({
    name: draft.name, type: draft.type, provider: draft.provider, template: source,
    // 这里只复用内容归一化，保存时仍保留原变量定义的额外元数据与真实默认值。
    variableDefinitions: draft.variables,
  }).template
  if (isEmailDraft(draft) || draft.provider === 'dingTalkRobotWebHook') delete result.message
  return result
}

/** Validate against the supplied backend catalog; omission retains the original verified catalog. */
export function buildTemplatePayload(draft: TemplateDraft, allowedChannels?: readonly NotificationChannel[]): NotificationTemplatePayload {
  if (!draft.name.trim()) throw new TemplateValidationError('nameRequired')
  if (!resolveNotificationChannel(draft.type, draft.provider, allowedChannels)) throw new TemplateValidationError('unsupportedProvider')
  const ids = draft.variables.map(variable => variable.id.trim())
  if (ids.some(id => !id || /[${}\s]/.test(id)) || new Set(ids).size !== ids.length) throw new TemplateValidationError('invalidVariables')
  let content: NotificationObject
  if (isEmailDraft(draft)) {
    if (!draft.subject.trim() || !draft.text.trim()) throw new TemplateValidationError('contentRequired')
    if (draft.subject.length > 255 || draft.text.length > 5120) throw new TemplateValidationError('contentLimit')
    // Preserve unchanged stored resources (including server-enabled filesystem paths); only new references need local validation.
    const storedAttachments = Array.isArray(draft.extraTemplate.attachments) ? draft.extraTemplate.attachments : []
    if (draft.attachments.some(item => {
      const unchanged = storedAttachments.some(stored => stored.name === item.name && stringValue(stored.location) === item.location)
      // A named attachment may receive its location at send time.
      return !item.name.trim() || !unchanged && item.location.trim() && !validAttachmentLocation(item.location)
    })) throw new TemplateValidationError('invalidAttachment')
    const names = draft.attachments.map(item => item.name.trim())
    if (new Set(names).size !== names.length) throw new TemplateValidationError('duplicateAttachment')
    content = { ...cloneNotificationValue(draft.extraTemplate), subject: draft.subject, text: draft.text,
      sendTo: draft.sendTo.map(value => value.trim()).filter(Boolean), attachments: cloneNotificationValue(draft.attachments) }
  } else content = parseTemplateObject(draft.templateJson)
  return {
    ...(draft.id.trim() ? { id: draft.id.trim() } : {}), name: draft.name.trim(),
    type: draft.type, provider: draft.provider, configId: draft.configId || '',
    description: draft.description, template: normalizeProviderContent(draft, content),
    variableDefinitions: cloneNotificationValue(draft.variables).map(variable => ({ ...variable, id: variable.id.trim() })),
  }
}

/** Replace the selected text, retaining the next caret position for keyboard-friendly insertion. */
export function insertTemplateVariable(text: string, id: string, start: number, end = start) {
  const from = Math.max(0, Math.min(text.length, start))
  const to = Math.max(from, Math.min(text.length, end))
  const token = '${' + id + '}'
  return { text: text.slice(0, from) + token + text.slice(to), caret: from + token.length }
}

/** Preview performs literal example substitution only, without evaluating expressions or HTML. */
export function previewTemplateText(text: string, examples: Record<string, string>): string {
  return text.replace(/\$\{([^{}]+)\}/g, (token, id: string) => Object.hasOwn(examples, id) ? examples[id] : token)
}

/** Keep upload failures out of saved attachments; only a completed platform response is a reference. */
export interface TemplateUploadFile { name: string; status?: string; url?: string; response?: unknown }
export function attachmentFromUpload(file: TemplateUploadFile, resolveUrl: (file: TemplateUploadFile) => string | undefined): NotificationAttachment | undefined {
  if (file.status !== 'done') return
  const response = file.response as { success?: boolean } | undefined
  if (response?.success === false) return
  const location = resolveUrl(file)
  return location && validAttachmentLocation(location) ? { name: file.name, location } : undefined
}

/** A value comparison includes unsaved invalid JSON, so route guards cannot lose unfinished edits. */
export function templateDraftFingerprint(draft: TemplateDraft): string { return JSON.stringify(draft) }
