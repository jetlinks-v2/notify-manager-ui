import type { NotifierConfig, NotifierConfigPayload, NotificationObject } from '../shared'
import { buildNotificationConfigPayload, createNotificationConfigDraft, isNotificationSecretMask, NotificationSecretInputRequiredError, notificationSecretsRequiringInput } from '../shared'

export interface ChannelField {
  key: string
  kind?: 'secret' | 'number' | 'url'
  required?: boolean
}

/** Field IDs follow provider metadata; SMTP options stay in properties rather than a synthetic secure flag. */
export const channelConfigFields: Record<string, ChannelField[]> = {
  'email:embedded': [{ key: 'host', required: true }, { key: 'port', kind: 'number' }, { key: 'sender' }, { key: 'username' }, { key: 'password', kind: 'secret' }],
  'dingTalk:dingTalkMessage': [{ key: 'appKey', required: true }, { key: 'appSecret', kind: 'secret', required: true }],
  'dingTalk:dingTalkRobotWebHook': [{ key: 'url', kind: 'secret', required: true }],
  'weixin:corpMessage': [{ key: 'corpId', required: true }, { key: 'corpSecret', kind: 'secret', required: true }],
  'voice:aliyun': [{ key: 'regionId' }, { key: 'accessKeyId', required: true }, { key: 'secret', kind: 'secret', required: true }],
  'sms:aliyunSms': [{ key: 'regionId' }, { key: 'accessKeyId', required: true }, { key: 'secret', kind: 'secret', required: true }],
  'webhook:http': [{ key: 'url', kind: 'url', required: true }],
}

export interface ChannelValidationIssue {
  path: string
  key: 'required' | 'duplicateId' | 'port' | 'url' | 'properties' | 'headers' | 'secretRequired'
}

function hasValue(value: unknown): boolean {
  return typeof value === 'string' ? !!value.trim() : value !== undefined && value !== null
}

/** Header values can be bearer credentials; blank their inputs just like provider passwords. */
export function createChannelConfigDraft(record: NotifierConfig): NotifierConfigPayload {
  const draft = createNotificationConfigDraft(record)
  if (record.type === 'webhook' || (typeof record.type === 'object' && record.type.value === 'webhook')) {
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
export function validateChannelDraft(draft: NotifierConfigPayload, baseline?: NotifierConfig): ChannelValidationIssue[] {
  const issues: ChannelValidationIssue[] = []
  if (!draft.id?.trim()) issues.push({ path: 'id', key: 'required' })
  if (!draft.name.trim()) issues.push({ path: 'name', key: 'required' })
  const requiredSecrets = notificationSecretsRequiringInput(draft, baseline)
  for (const field of channelConfigFields[`${draft.type}:${draft.provider}`] ?? []) {
    if (requiredSecrets.includes(field.key)) {
      issues.push({ path: field.key, key: 'secretRequired' })
      continue
    }
    const value = draft.configuration[field.key]
    if (field.required && !hasValue(value) && !(field.kind === 'secret' && hasValue(baseline?.configuration[field.key]))) {
      issues.push({ path: field.key, key: 'required' })
    }
    if (field.key === 'port' && hasValue(value) && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 65535)) {
      issues.push({ path: field.key, key: 'port' })
    }
    const url = field.key === 'url' ? (isNotificationSecretMask(value) ? undefined : value) || baseline?.configuration[field.key] : undefined
    if (hasValue(url)) {
      try {
        if (!['http:', 'https:'].includes(new URL(String(url)).protocol)) throw new Error()
      } catch { issues.push({ path: field.key, key: 'url' }) }
    }
  }
  for (const [key, nameKey] of [['properties', 'name'], ['headers', 'key']] as const) {
    const rows = draft.configuration[key]
    if (rows !== undefined && (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || !hasValue(row[nameKey]) || typeof row.value !== 'string'))) {
      issues.push({ path: key, key })
    }
  }
  const headers = draft.configuration.headers
  if (Array.isArray(headers) && headers.every(row => row && typeof row.key === 'string')) {
    if (headers.some(row => effectiveHeaderValue(row.key, row.value, baseline) === undefined)) issues.push({ path: 'headers', key: 'secretRequired' })
    if (new Set(headers.map(row => row.key.toLowerCase())).size !== headers.length) issues.push({ path: 'headers', key: 'headers' })
  }
  return issues
}

/** A safe payload is derived only after validation; extension settings are preserved by the shared mapper. */
export function channelConfigPayload(draft: NotifierConfigPayload, baseline?: NotifierConfig): NotifierConfigPayload {
  const payload = buildNotificationConfigPayload({ ...draft, id: draft.id?.trim(), name: draft.name.trim() }, baseline)
  const headers = draft.configuration.headers
  if (draft.type === 'webhook' && Array.isArray(headers)) {
    payload.configuration.headers = headers.map(row => {
      const value = effectiveHeaderValue(row.key, row.value, baseline?.id === draft.id ? baseline : undefined)
      if (value === undefined) throw new NotificationSecretInputRequiredError(['headers'])
      return { ...row, value }
    })
  }
  return payload
}

/** Required template variables must be explicit; JSON arrays/primitives are not send contexts. */
export function parseChannelSendVariables(text: string): NotificationObject | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value as NotificationObject : undefined
  } catch { return undefined }
}
