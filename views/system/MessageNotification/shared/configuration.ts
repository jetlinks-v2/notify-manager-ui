import type { NotifierConfig, NotifierConfigPayload, NotificationObject } from '../../../../api/notice/messageNotificationTypes'
import { notificationEnumValue, resolveNotificationChannel } from './catalog'

export const notificationSecretMask = '••••••••'

export class NotificationSecretInputRequiredError extends Error {
  readonly fields: string[]

  constructor(fields: string[]) {
    super('messageNotification.validation.secretRequired')
    this.name = 'NotificationSecretInputRequiredError'
    this.fields = fields
  }
}

/** Detect both complete masks and masked token fragments in confidential webhook URLs. */
export function isNotificationSecretMask(value: unknown): boolean {
  return typeof value === 'string' && /[*•●·﹡＊]{3,}/u.test(value)
}

/** DTOs contain JSON values only; clone so nested editing never mutates a saved baseline. */
export function cloneNotificationValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Keep secret inputs empty even if the backend returned clear text; the baseline stays in memory. */
export function createNotificationConfigDraft(record: NotifierConfig): NotifierConfigPayload {
  const configuration = cloneNotificationValue(record.configuration ?? {})
  const channel = resolveNotificationChannel(record.type, record.provider)
  for (const key of channel?.secretFields ?? []) configuration[key] = ''
  return {
    id: record.id,
    name: record.name,
    type: notificationEnumValue(record.type),
    provider: notificationEnumValue(record.provider),
    configuration,
  }
}

function retainedSecret(input: unknown, previous: unknown): unknown {
  const value = typeof input === 'string' && input.trim() && !isNotificationSecretMask(input) ? input : previous
  return typeof value === 'string' && value.trim() && !isNotificationSecretMask(value) ? value : undefined
}

/** Missing/masked saved values cannot be safely merged without verified backend secret preservation. */
export function notificationSecretsRequiringInput(draft: NotifierConfigPayload, baseline?: NotifierConfig): string[] {
  if (!baseline || baseline.id !== draft.id) return []
  const channel = resolveNotificationChannel(draft.type, draft.provider)
  return (channel?.secretFields ?? []).filter(key => {
    const original = baseline.configuration?.[key]
    const unknownOriginal = original === undefined || original === null || isNotificationSecretMask(original)
    return unknownOriginal && retainedSecret(draft.configuration[key], undefined) === undefined
  })
}

/** Preserve known secrets; require re-entry if an update could replace a masked/missing saved secret. */
export function buildNotificationConfigPayload(draft: NotifierConfigPayload, baseline?: NotifierConfig): NotifierConfigPayload {
  // Never merge another record/provider's credentials into a new or navigated draft.
  const previous = baseline?.id === draft.id
    && notificationEnumValue(baseline?.type) === draft.type
    && notificationEnumValue(baseline?.provider) === draft.provider ? baseline : undefined
  // PATCH may replace the nested map; omission is not proof that the server retains a secret.
  const requiredSecrets = notificationSecretsRequiringInput(draft, previous)
  if (requiredSecrets.length) throw new NotificationSecretInputRequiredError(requiredSecrets)
  const configuration: NotificationObject = {
    ...cloneNotificationValue(previous?.configuration ?? {}),
    ...cloneNotificationValue(draft.configuration),
  }
  const channel = resolveNotificationChannel(draft.type, draft.provider)
  for (const key of channel?.secretFields ?? []) {
    const value = retainedSecret(draft.configuration[key], previous?.configuration?.[key])
    if (value === undefined) delete configuration[key]
    else configuration[key] = value
  }
  const receiptKey = retainedSecret(draft.receiptKey, previous?.receiptKey)
  return {
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name,
    type: draft.type,
    provider: draft.provider,
    configuration,
    ...(typeof receiptKey === 'string' ? { receiptKey } : {}),
  }
}
