import type { NotificationPage } from './messageNotificationTypes'

export type NotificationFailureKind = 'unavailable' | 'forbidden' | 'error'
export type NotificationLoadState = 'idle' | 'loading' | 'ready' | 'empty' | NotificationFailureKind

/** Keep failure categories in page state; never convert a failed response to an empty dataset. */
export class NotificationRequestError extends Error {
  readonly kind: NotificationFailureKind
  readonly original: unknown

  constructor(kind: NotificationFailureKind, original?: unknown) {
    super(`messageNotification.state.${kind}`)
    this.name = 'NotificationRequestError'
    this.kind = kind
    this.original = original
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

/** Preserve server explanations through checked(), without exposing generic Axios or wrapper messages. */
export function notificationFailureMessage(error: unknown): string | undefined {
  const value = objectValue(error instanceof NotificationRequestError ? error.original : error)
  const response = objectValue(value?.response)
  const data = objectValue(response?.data) ?? objectValue(value?.data) ?? response ?? value
  const message = data?.message
  return typeof message === 'string' && message.trim() && !(data instanceof Error) ? message : undefined
}

/** Accept the platform's rejected Axios error and resolved unsuccessful response shapes. */
export function classifyNotificationFailure(error: unknown): NotificationFailureKind {
  if (error instanceof NotificationRequestError) return error.kind
  const value = objectValue(error)
  const response = objectValue(value?.response)
  const data = objectValue(response?.data) ?? objectValue(value?.data)
  const status = Number(response?.status ?? data?.status ?? value?.status ?? value?.code)
  if (status === 401 || status === 403) return 'forbidden'
  if (status === 405 || status === 501) return 'unavailable'
  return 'error'
}

/** Validate query results without manufacturing totals or hiding malformed successful responses. */
export function normalizeNotificationPage<T>(value: NotificationPage<T> | T[]): NotificationPage<T> {
  if (Array.isArray(value)) return { data: value }
  if (!value || !Array.isArray(value.data)) throw new NotificationRequestError('error', value)
  return {
    data: value.data,
    ...(typeof value.total === 'number' && Number.isFinite(value.total) ? { total: value.total } : {}),
    ...(typeof value.pageIndex === 'number' ? { pageIndex: value.pageIndex } : {}),
    ...(typeof value.pageSize === 'number' ? { pageSize: value.pageSize } : {}),
  }
}
