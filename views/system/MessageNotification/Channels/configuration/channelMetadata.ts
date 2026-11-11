import type { NotificationConfigMetadata, NotificationConfigProperty, NotificationChannel, NotificationObject } from '../../shared'
import { cloneNotificationValue } from '../../shared'
import { channelConfigFields, type ChannelField } from '../channelSchema'

export interface ChannelDefinition {
  metadata: NotificationConfigMetadata
  fields: ChannelField[]
  secretFields: string[]
  optionalSecretFields?: readonly string[]
}

/** Presentation hints never add fields absent from the selected provider's metadata. */
function fieldGroup(channel: NotificationChannel, key: string): string {
  if (!channelConfigFields[channel.id]) return 'configuration'
  if (channel.id === 'email:embedded') return ['host', 'port', 'properties'].includes(key) ? 'server' : ['sender', 'username', 'password'].includes(key) ? 'account' : 'configuration'
  if (channel.type === 'webhook') return key === 'headers' ? 'headers' : 'connection'
  if (channel.id === 'dingTalk:dingTalkRobotWebHook') return 'connection'
  return ['dingTalk', 'weixin', 'sms', 'voice'].includes(channel.type) ? 'credentials' : 'configuration'
}

/** Backend fields are authoritative; known providers contribute labels, grouping and secret semantics. */
export function channelDefinition(channel: NotificationChannel, metadata: NotificationConfigMetadata): ChannelDefinition {
  const known = channelConfigFields[channel.id] ?? []
  const fields = metadata.properties.map<ChannelField>(property => {
    const hint = known.find(field => field.key === property.id)
    const rules = { ...property.expands, ...property.valueType.expands }
    // Providers may describe known credential IDs as strings (e.g. WeChat officialMessage.secret).
    const secret = property.valueType.type === 'password' || channel.secretFields.includes(property.id)
      || ['password', 'secret', 'appSecret', 'corpSecret'].includes(property.id)
    return {
      key: property.id,
      kind: secret ? 'secret' : hint?.kind,
      required: rules.required === true || rules.required === 'true' || !!hint?.required,
      property,
      options: hint?.options,
      group: fieldGroup(channel, property.id),
      defaultValue: rules.defaultValue,
    }
  })
  if (channel.id === 'email:embedded') {
    const order = ['host', 'port', 'properties', 'username', 'password', 'sender']
    fields.sort((left, right) => (order.includes(left.key) ? order.indexOf(left.key) : order.length) - (order.includes(right.key) ? order.indexOf(right.key) : order.length))
  }
  return {
    metadata, fields, secretFields: fields.filter(field => field.kind === 'secret').map(field => field.key),
    // Only advertised, optional fields can be cleared; old servers must not appear to support signing.
    optionalSecretFields: fields.filter(field => field.kind === 'secret' && !field.required && channel.optionalSecretFields?.includes(field.key)).map(field => field.key),
  }
}

/** Defaults belong to the draft snapshot so opening an empty form does not make it dirty. */
export function channelDefaults(definition?: ChannelDefinition): NotificationObject {
  const result: NotificationObject = {}
  for (const field of definition?.fields ?? []) {
    if (field.defaultValue !== undefined && field.kind !== 'secret') result[field.key] = cloneNotificationValue(field.defaultValue)
  }
  return result
}

/** Preserve false and zero defaults; metadata constraints may be on the property or value type. */
export function propertyRules(property?: NotificationConfigProperty): NotificationObject {
  return { ...property?.expands, ...property?.valueType.expands }
}
