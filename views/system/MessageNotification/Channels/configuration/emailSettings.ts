import type { EmailProperty, NotificationObject } from '../../shared'
import type { ChannelDefinition } from './channelMetadata'

export type EmailEncryption = 'ssl' | 'starttls' | 'none'
export const emailPresets = [
  { id: 'tencent', host: 'smtp.exmail.qq.com', port: 465, encryption: 'ssl' },
  { id: 'aliyun', host: 'smtp.qiye.aliyun.com', port: 465, encryption: 'ssl' },
  { id: 'netease', host: 'smtp.qiye.163.com', port: 465, encryption: 'ssl' },
  { id: 'exchange', host: 'smtp.office365.com', port: 587, encryption: 'starttls' },
] as const

/** JavaMail properties are authoritative; the legacy ssl flag only supplies missing defaults. */
export function emailEncryption(configuration: NotificationObject): EmailEncryption {
  const rows = Array.isArray(configuration.properties) ? configuration.properties as EmailProperty[] : []
  const ssl = rows.find(row => row.name === 'mail.smtp.ssl.enable')?.value ?? (configuration.ssl === true ? 'true' : 'false')
  if (ssl === 'true') return 'ssl'
  return rows.find(row => row.name === 'mail.smtp.starttls.enable')?.value === 'true' ? 'starttls' : 'none'
}

/** Update only transport encryption keys; custom JavaMail settings and their descriptions survive. */
export function emailEncryptionProperties(configuration: NotificationObject, encryption: EmailEncryption): EmailProperty[] {
  const rows: EmailProperty[] = Array.isArray(configuration.properties) ? configuration.properties.map(row => ({ ...row })) : []
  const values = {
    'mail.smtp.ssl.enable': String(encryption === 'ssl'),
    'mail.smtp.starttls.enable': String(encryption === 'starttls'),
    'mail.smtp.starttls.required': String(encryption === 'starttls'),
  }
  for (const [name, value] of Object.entries(values)) {
    const index = rows.findIndex(row => row.name === name)
    if (index === -1) rows.push({ name, value })
    else rows[index] = { ...rows[index], value }
  }
  return rows
}

/** Only the old standard port follows an encryption change; custom ports remain intentional. */
export function emailEncryptionChanges(configuration: NotificationObject, encryption: EmailEncryption): NotificationObject {
  const ports: Record<EmailEncryption, number> = { ssl: 465, starttls: 587, none: 25 }
  const oldEncryption = emailEncryption(configuration)
  return { properties: emailEncryptionProperties(configuration, encryption),
    ...(Number(configuration.port) === ports[oldEncryption] ? { port: ports[encryption] } : {}) }
}

/** The first SMTP form uses the prototype's SSL/465 suggestion only when metadata exposes its fields. */
export function initialEmailConfiguration(defaults: NotificationObject, definition?: ChannelDefinition): NotificationObject {
  if (!definition?.fields.some(field => field.key === 'properties') || !definition.fields.some(field => field.key === 'port')) return defaults
  return { ...defaults, port: defaults.port ?? 465, properties: defaults.properties ?? emailEncryptionProperties(defaults, 'ssl') }
}
