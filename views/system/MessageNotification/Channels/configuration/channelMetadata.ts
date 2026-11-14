import type { NotificationConfigMetadata, NotificationConfigProperty, NotificationChannel, NotificationObject } from '../../shared'
import { cloneNotificationValue } from '../../shared'
import { channelConfigFields, type ChannelField } from '../channelSchema'
import { channelTestSettingsKinds } from '../testing/channelTestConfig'

export interface ChannelDefinition {
  metadata: NotificationConfigMetadata
  fields: ChannelField[]
  secretFields: string[]
  optionalSecretFields?: readonly string[]
}

/** Group provider fields using the supported channel contract. */
function fieldGroup(channel: NotificationChannel, key: string): string {
  if (key === 'testTemplate' && channelTestSettingsKinds[channel.id]) return 'test'
  if (!channelConfigFields[channel.id]) return 'configuration'
  if (channel.id === 'email:embedded') return ['host', 'port', 'properties'].includes(key) ? 'server' : ['sender', 'username', 'password'].includes(key) ? 'account' : 'configuration'
  if (channel.type === 'webhook') return key === 'headers' ? 'headers' : 'connection'
  if (channel.id === 'dingTalk:dingTalkRobotWebHook') return 'connection'
  return ['dingTalk', 'weixin', 'sms', 'voice'].includes(channel.type) ? 'credentials' : 'configuration'
}

/** Preserve backend extensions and add the explicitly supported channel fields, labels and secret semantics. */
export function channelDefinition(channel: NotificationChannel, metadata: NotificationConfigMetadata): ChannelDefinition {
  const known = channelConfigFields[channel.id] ?? []
  // AgentId is part of the channel contract; older running services may still return two-field metadata.
  const properties: NotificationConfigProperty[] = ['weixin:corpMessage', 'dingTalk:dingTalkMessage'].includes(channel.id) && !metadata.properties.some(property => property.id === 'agentId')
    ? [...metadata.properties, { id: 'agentId', name: 'AgentId', valueType: { type: 'string' } }] : metadata.properties
  // Test settings are preserved by the existing configuration map, without changing business template defaults.
  const testProperties: NotificationConfigProperty[] = channelTestSettingsKinds[channel.id] && !properties.some(property => property.id === 'testTemplate')
    ? [...properties, { id: 'testTemplate', name: 'testTemplate', valueType: { type: 'object' } }] : properties
  const fields = testProperties.map<ChannelField>(property => {
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
  if (['email:embedded', 'weixin:corpMessage'].includes(channel.id)) {
    const order = channel.id === 'weixin:corpMessage' ? ['corpId', 'agentId', 'corpSecret'] : ['host', 'port', 'properties', 'username', 'password', 'sender']
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
