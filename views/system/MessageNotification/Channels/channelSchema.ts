import type { NotifierConfig, NotifierConfigPayload, NotificationObject, NotificationConfigProperty } from '../shared'
import { buildNotificationConfigPayload, createNotificationConfigDraft, isNotificationSecretMask, NotificationSecretInputRequiredError, notificationSecretsRequiringInput, notificationEnumValue, resolveNotificationChannel } from '../shared'
import type { ChannelDefinition } from './configuration/channelMetadata'
import { aliyunRegionElements } from '../../../notice/channel/hooks/noticeChannelModel'

export interface ChannelField {
  key: string
  kind?: 'secret' | 'number' | 'url'
  required?: boolean
  property?: NotificationConfigProperty
  options?: NotificationConfigProperty['valueType']['elements']
  group?: string
  defaultValue?: unknown
}

/** Field IDs follow provider metadata; SMTP options stay in properties rather than a synthetic secure flag. */
export const channelConfigFields: Record<string, ChannelField[]> = {
  'email:embedded': [{ key: 'host', required: true }, { key: 'port', kind: 'number' }, { key: 'sender' }, { key: 'username' }, { key: 'password', kind: 'secret' }],
  'dingTalk:dingTalkMessage': [{ key: 'appKey', required: true }, { key: 'appSecret', kind: 'secret', required: true }],
  'dingTalk:dingTalkRobotWebHook': [{ key: 'url', kind: 'secret', required: true }, { key: 'secret', kind: 'secret' }],
  'weixin:corpMessage': [{ key: 'corpId', required: true }, { key: 'corpSecret', kind: 'secret', required: true }],
  'voice:aliyun': [{ key: 'regionId', options: aliyunRegionElements }, { key: 'accessKeyId', required: true }, { key: 'secret', kind: 'secret', required: true }],
  'sms:aliyunSms': [{ key: 'regionId', options: aliyunRegionElements }, { key: 'accessKeyId', required: true }, { key: 'secret', kind: 'secret', required: true }],
  'webhook:http': [{ key: 'url', kind: 'url', required: true }],
}

export interface ChannelValidationIssue {
  path: string
  key: 'required' | 'duplicateId' | 'port' | 'url' | 'properties' | 'headers' | 'secretRequired' | 'invalidValue'
}

function hasValue(value: unknown): boolean {
  return typeof value === 'string' ? !!value.trim() : value !== undefined && value !== null
}

/** Header values can be bearer credentials; blank their inputs just like provider passwords. */
export function createChannelConfigDraft(record: NotifierConfig, definition?: ChannelDefinition): NotifierConfigPayload {
  const draft = createNotificationConfigDraft(record, definition?.secretFields)
  if (notificationEnumValue(record.type) === 'webhook' && notificationEnumValue(record.provider) === 'http') {
    const headers = draft.configuration.headers
    if (Array.isArray(headers)) draft.configuration.headers = headers.map(row => row && typeof row === 'object' ? { ...row, value: '' } : row)
  }
  return draft
}

function savedHeaderValue(key: string, baseline?: NotifierConfig): unknown {
  const headers = baseline?.configuration.headers
  return Array.isArray(headers) ? headers.find(row => row && typeof row.key === 'string' && row.key.toLowerCase() === key.toLowerCase())?.value : undefined
}

function effectiveHeaderValue(key: string, value: unknown, baseline?: NotifierConfig): string | undefined {
  const saved = savedHeaderValue(key, baseline)
  const candidate = hasValue(value) && !isNotificationSecretMask(value) ? value : saved
  return typeof candidate === 'string' && candidate.trim() && !isNotificationSecretMask(candidate) ? candidate : undefined
}

/** Validate local input before writing; known baseline secrets count as values without exposing them. */
export function validateChannelDraft(draft: NotifierConfigPayload, baseline?: NotifierConfig, definition?: ChannelDefinition, clearFields: readonly string[] = []): ChannelValidationIssue[] {
  const issues: ChannelValidationIssue[] = []
  if (!draft.id?.trim()) issues.push({ path: 'id', key: 'required' })
  if (!draft.name.trim()) issues.push({ path: 'name', key: 'required' })
  const requiredSecrets = notificationSecretsRequiringInput(draft, baseline, definition?.secretFields, secretPolicy(draft, definition, clearFields))
  for (const field of definition?.fields ?? channelConfigFields[`${draft.type}:${draft.provider}`] ?? []) {
    if (requiredSecrets.includes(field.key)) {
      issues.push({ path: field.key, key: 'secretRequired' })
      continue
    }
    const value = draft.configuration[field.key]
    if (field.required && !hasValue(value) && !(field.kind === 'secret' && hasValue(baseline?.configuration[field.key]))) {
      issues.push({ path: field.key, key: 'required' })
    }
    if (field.key === 'port' && field.kind === 'number' && hasValue(value) && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 65535)) {
      issues.push({ path: field.key, key: 'port' })
    }
    const isHttpUrl = field.kind === 'url' || (draft.type === 'dingTalk' && draft.provider === 'dingTalkRobotWebHook' && field.key === 'url')
    const url = isHttpUrl ? (isNotificationSecretMask(value) ? undefined : value) || baseline?.configuration[field.key] : undefined
    if (hasValue(url)) {
      try {
        if (!['http:', 'https:'].includes(new URL(String(url)).protocol)) throw new Error()
      } catch { issues.push({ path: field.key, key: 'url' }) }
    }
    if (hasValue(value) && field.property && !validMetadataValue(value, field.property)) issues.push({ path: field.key, key: 'invalidValue' })
  }
  const pairFields: ['properties' | 'headers', 'name' | 'key'][] = draft.type === 'email' && draft.provider === 'embedded' ? [['properties', 'name']] : draft.type === 'webhook' && draft.provider === 'http' ? [['headers', 'key']] : []
  for (const [key, nameKey] of pairFields) {
    const rows = draft.configuration[key]
    if (rows !== undefined && (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || !hasValue(row[nameKey]) || typeof row.value !== 'string'))) {
      issues.push({ path: key, key })
    }
  }
  const headers = draft.type === 'webhook' && draft.provider === 'http' ? draft.configuration.headers : undefined
  if (Array.isArray(headers) && headers.every(row => row && typeof row.key === 'string')) {
    if (headers.some(row => effectiveHeaderValue(row.key, row.value, baseline) === undefined)) issues.push({ path: 'headers', key: 'secretRequired' })
    if (new Set(headers.map(row => row.key.toLowerCase())).size !== headers.length) issues.push({ path: 'headers', key: 'headers' })
  }
  return issues
}

/** A safe payload is derived only after validation; extension settings are preserved by the shared mapper. */
export function channelConfigPayload(draft: NotifierConfigPayload, baseline?: NotifierConfig, definition?: ChannelDefinition, clearFields: readonly string[] = []): NotifierConfigPayload {
  const payload = buildNotificationConfigPayload({ ...draft, id: draft.id?.trim(), name: draft.name.trim() }, baseline, definition?.secretFields, secretPolicy(draft, definition, clearFields))
  const headers = draft.configuration.headers
  if (draft.type === 'webhook' && draft.provider === 'http' && Array.isArray(headers)) {
    payload.configuration.headers = headers.map(row => {
      const value = effectiveHeaderValue(row.key, row.value, baseline?.id === draft.id ? baseline : undefined)
      if (value === undefined) throw new NotificationSecretInputRequiredError(['headers'])
      return { ...row, value }
    })
  }
  return payload
}

function secretPolicy(draft: NotifierConfigPayload, definition: ChannelDefinition | undefined, clearFields: readonly string[]) {
  return { optionalFields: definition ? definition.optionalSecretFields : resolveNotificationChannel(draft.type, draft.provider)?.optionalSecretFields, clearFields }
}

/** Metadata validation is independent from control rendering, including false/zero and JSON values. */
function validMetadataValue(value: unknown, property: NotificationConfigProperty): boolean {
  const type = property.valueType
  const rules = { ...property.expands, ...type.expands }
  if (['int', 'long', 'float', 'double'].includes(type.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false
    if (['int', 'long'].includes(type.type) && !Number.isInteger(value)) return false
    if (type.min !== undefined && value < type.min || type.max !== undefined && value > type.max) return false
  }
  if (type.type === 'boolean' && value !== (type.trueValue ?? true) && value !== (type.falseValue ?? false)) return false
  if (type.type === 'enum' && type.elements?.length && !type.elements.some(item => item.value === value)) return false
  if (type.type === 'array' && !Array.isArray(value)) return false
  if (type.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) return false
  return !(typeof value === 'string' && typeof rules.maxLength === 'number' && value.length > rules.maxLength)
}

/** Required template variables must be explicit; JSON arrays/primitives are not send contexts. */
export function parseChannelSendVariables(text: string): NotificationObject | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value as NotificationObject : undefined
  } catch { return undefined }
}
