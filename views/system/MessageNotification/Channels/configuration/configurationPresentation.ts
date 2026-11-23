import { isNotificationSecretMask, notificationSecretMask } from '../../shared'

export interface ChannelConfigurationRow { id: string; name: string; address: string }
export type ChannelConfigurationAction = 'edit' | 'test' | 'fill' | 'delete'

/** Webhook 列表展示接口返回的完整接收地址，钉钉机器人地址继续按凭证规则脱敏。 */
export function configurationAddress(value: unknown, isRobot: boolean): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return notificationSecretMask
    if (!isRobot) return value.trim()
    const parameters: string[] = []
    url.searchParams.forEach((token, key) => {
      const suffix = key === 'access_token' && token.length > 4 && !isNotificationSecretMask(token) ? token.slice(-4) : ''
      parameters.push(`${encodeURIComponent(key)}=…${suffix}`)
    })
    return `${url.origin}${url.pathname}${parameters.length ? `?${parameters.join('&')}` : ''}`
  } catch { return notificationSecretMask }
}
