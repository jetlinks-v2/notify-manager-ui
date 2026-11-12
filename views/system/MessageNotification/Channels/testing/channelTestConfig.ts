import type { NotificationObject } from '../../shared'

export interface ChannelTestParameter { name: string; value: string }
export interface ChannelTestSettings extends NotificationObject {
  signName?: string
  code?: string
  wxTemplateId?: string
  parameters?: ChannelTestParameter[]
}
export type ChannelTestSettingsKind = 'sms'
export interface ChannelTestSettingField { key: 'signName' | 'code' | 'wxTemplateId'; required?: boolean }

export const channelTestSettingsKinds: Readonly<Record<string, ChannelTestSettingsKind>> = {
  'sms:aliyunSms': 'sms',
}
const fields: Record<ChannelTestSettingsKind, ChannelTestSettingField[]> = {
  sms: [{ key: 'signName', required: true }, { key: 'code', required: true }],
}
export const testSettingFields = (channelId: string): ChannelTestSettingField[] => fields[channelTestSettingsKinds[channelId]] || []
export const testText = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
export function readTestSettings(value: unknown): ChannelTestSettings {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ChannelTestSettings : {}
}

/** Test-only settings never inherit a business template or its recipients. Optional empty settings remain saveable. */
export function testSettingsIssues(channelId: string, value: unknown, forSend = false): string[] {
  if (value === undefined || value === null) return forSend ? testSettingFields(channelId).filter(field => field.required).map(field => field.key) : []
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['testTemplate']
  const settings = readTestSettings(value)
  const missing = testSettingFields(channelId).filter(field => field.required && !testText(settings[field.key])).map(field => field.key as string)
  if (settings.parameters !== undefined) {
    const rows = settings.parameters
    // Recipient and routing keys cannot be replaced by vendor sample data.
    const reserved = new Set(['sendTo', 'phoneNumber', 'calledNumber', 'toUser', 'toParty', 'toTag', 'userIdList', 'departmentIdList', 'toAllUser', 'touser', 'tagid', 'url', 'miniProgramId', 'miniProgramPath', '__proto__', 'constructor', 'prototype'])
    if (!Array.isArray(rows) || rows.some(row => !row || !testText(row.name) || typeof row.value !== 'string' || !row.value.trim() || reserved.has(row.name.trim()))
      || new Set(rows.map(row => testText(row.name))).size !== rows.length) missing.push('parameters')
  }
  return missing
}
