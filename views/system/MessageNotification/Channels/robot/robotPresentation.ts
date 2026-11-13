import { isNotificationSecretMask, notificationSecretMask } from '../../shared'

export interface RobotConfigurationRow { id: string; name: string; webhook: string }

/** The row and its tooltip receive only a redacted URL, never the original query credentials. */
export function robotWebhookSummary(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return notificationSecretMask
    const parameters: string[] = []
    url.searchParams.forEach((token, key) => {
      const suffix = key === 'access_token' && token.length > 4 && !isNotificationSecretMask(token) ? token.slice(-4) : ''
      parameters.push(`${encodeURIComponent(key)}=…${suffix}`)
    })
    return `${url.origin}${url.pathname}${parameters.length ? `?${parameters.join('&')}` : ''}`
  } catch { return notificationSecretMask }
}
