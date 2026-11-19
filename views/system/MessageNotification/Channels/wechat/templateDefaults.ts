import type { NotificationObject } from '../../shared'

export const wechatCorpChannel = 'weixin:corpMessage'
// Keep the persisted key so existing channel configurations retain their AgentId.
export const messageTemplateDefaultsKey = 'alarmTemplateDefaults'

export function readWechatAgentId(configuration?: NotificationObject): string {
  const defaults = configuration?.[messageTemplateDefaultsKey]
  const configured = defaults && typeof defaults === 'object' && !Array.isArray(defaults)
    ? (defaults as NotificationObject).agentId : undefined
  const value = configured ?? configuration?.agentId
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

export function validWechatAgentId(agentId: string): boolean {
  return /^[1-9][0-9]{0,18}$/.test(agentId)
}
