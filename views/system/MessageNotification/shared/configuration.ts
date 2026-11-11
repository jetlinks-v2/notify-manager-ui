import type { NotifierConfig, NotifierConfigPayload, NotificationObject } from '../../../../api/notice/messageNotificationTypes'
import { notificationEnumValue, resolveNotificationChannel } from './catalog'

export const notificationSecretMask = '••••••••'

export interface NotificationSecretPolicy {
  optionalFields?: readonly string[]
  /** Explicit UI intent only; this list never becomes part of the API payload. */
  clearFields?: readonly string[]
}

function defaultSecretPolicy(draft: NotifierConfigPayload): NotificationSecretPolicy {
  return { optionalFields: resolveNotificationChannel(draft.type, draft.provider)?.optionalSecretFields }
}

function explicitlyCleared(key: string, policy: NotificationSecretPolicy): boolean {
  return !!policy.optionalFields?.includes(key) && !!policy.clearFields?.includes(key)
}

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
export function createNotificationConfigDraft(record: NotifierConfig, secretFields = resolveNotificationChannel(record.type, record.provider)?.secretFields ?? []): NotifierConfigPayload {
  const configuration = cloneNotificationValue(record.configuration ?? {})
  for (const key of secretFields) configuration[key] = ''
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
export function notificationSecretsRequiringInput(draft: NotifierConfigPayload, baseline?: NotifierConfig, secretFields = resolveNotificationChannel(draft.type, draft.provider)?.secretFields ?? [], policy = defaultSecretPolicy(draft)): string[] {
  if (!baseline || baseline.id !== draft.id || notificationEnumValue(baseline.type) !== draft.type || notificationEnumValue(baseline.provider) !== draft.provider) return []
  return secretFields.filter(key => {
    if (explicitlyCleared(key, policy)) return false
    const original = baseline.configuration?.[key]
    // An absent optional credential is valid; a masked credential still represents an unknown saved value.
    const unknownOriginal = isNotificationSecretMask(original)
      || ((original === undefined || original === null) && !policy.optionalFields?.includes(key))
    return unknownOriginal && retainedSecret(draft.configuration[key], undefined) === undefined
  })
}

/** Preserve known secrets; require re-entry if an update could replace a masked/missing saved secret. */
export function buildNotificationConfigPayload(draft: NotifierConfigPayload, baseline?: NotifierConfig, secretFields = resolveNotificationChannel(draft.type, draft.provider)?.secretFields ?? [], policy = defaultSecretPolicy(draft)): NotifierConfigPayload {
  // Never merge another record/provider's credentials into a new or navigated draft.
  const previous = baseline?.id === draft.id
    && notificationEnumValue(baseline?.type) === draft.type
    && notificationEnumValue(baseline?.provider) === draft.provider ? baseline : undefined
  // PATCH may replace the nested map; omission is not proof that the server retains a secret.
  const requiredSecrets = notificationSecretsRequiringInput(draft, previous, secretFields, policy)
  if (requiredSecrets.length) throw new NotificationSecretInputRequiredError(requiredSecrets)
  const configuration: NotificationObject = {
    ...cloneNotificationValue(previous?.configuration ?? {}),
    ...cloneNotificationValue(draft.configuration),
  }
  for (const key of secretFields) {
    if (explicitlyCleared(key, policy)) {
      configuration[key] = ''
      continue
    }
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
