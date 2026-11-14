import type { NotificationConfigMetadata, NotificationConfigProperty, NotificationValueType } from './messageNotificationTypes'
import { NotificationRequestError } from './messageNotificationState'

/** HttpWebHookNotifierProvider inherits null metadata; fields follow HttpWebHookProperties exactly. */
export const httpWebhookConfigMetadata: NotificationConfigMetadata = {
  properties: [
    { id: 'url', valueType: { type: 'string', expands: { required: true } } },
    { id: 'headers', valueType: { type: 'array', elementType: { type: 'object', properties: [
      { id: 'key', valueType: { type: 'string' } },
      { id: 'value', valueType: { type: 'password' } },
    ] } } },
  ],
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NotificationRequestError('error')
  return value as Record<string, unknown>
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new NotificationRequestError('error')
  return value
}

/** ConfigMetadata uses property/type; property metadata uses id/valueType, including nested objects. */
function property(value: unknown): NotificationConfigProperty {
  const source = object(value)
  const { property: configId, type: configType, ...rest } = source
  return {
    ...rest,
    id: identifier(source.id ?? configId),
    valueType: valueType(source.valueType ?? configType),
  }
}

/** Preserve enum values, constraints, defaults and vendor extensions while adapting nested fields. */
function valueType(value: unknown): NotificationValueType {
  const source = object(value)
  const result: NotificationValueType = { ...source, type: identifier(source.type) }
  if (source.properties !== undefined) result.properties = properties(source.properties)
  if (source.elementType !== undefined) result.elementType = valueType(source.elementType)
  return result
}

function properties(value: unknown): NotificationConfigProperty[] {
  if (!Array.isArray(value)) throw new NotificationRequestError('error')
  return value.map(property)
}

/** Normalize at the HTTP boundary so every provider uses the same form and validation contract. */
export function normalizeNotificationConfigMetadata(value: unknown): NotificationConfigMetadata {
  const source = object(value)
  return { ...source, properties: properties(source.properties) }
}
