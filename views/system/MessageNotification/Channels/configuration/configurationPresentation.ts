import { isNotificationSecretMask, notificationSecretMask } from '../../shared'

export interface ChannelConfigurationRow { id: string; name: string; address: string }
export type ChannelConfigurationAction = 'edit' | 'test' | 'fill' | 'delete'

/** Webhook 的路径也可能包含凭据，列表仅显示来源地址。钉钉机器人保留固定路径和令牌末四位。 */
export function configurationAddressSummary(value: unknown, isRobot: boolean): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return notificationSecretMask
    if (!isRobot) return url.origin
    const parameters: string[] = []
    url.searchParams.forEach((token, key) => {
      const suffix = key === 'access_token' && token.length > 4 && !isNotificationSecretMask(token) ? token.slice(-4) : ''
      parameters.push(`${encodeURIComponent(key)}=…${suffix}`)
    })
    return `${url.origin}${url.pathname}${parameters.length ? `?${parameters.join('&')}` : ''}`
  } catch { return notificationSecretMask }
}
