import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import { extractVariableIds, robotMessageTypeOptions } from '../../../../notice/template/hooks/noticeTemplateFormModel'
import { createPrototypeTemplate, prototypeAvailableVariables, type PrototypeTranslate } from '../../Templates/definition/templateDefaults'
import { buildTemplatePayload, createTemplateDraft } from '../../Templates/model'
import type { NotificationChannel, NotificationObject, NotificationVariable } from '../../shared'
import { readWechatAgentId, validWechatAgentId, wechatCorpChannel } from '../wechat/templateDefaults'

export const emailChannel = 'email:embedded'
export const dingTalkWorkChannel = 'dingTalk:dingTalkMessage'
export const dingTalkRobotChannel = 'dingTalk:dingTalkRobotWebHook'
export const webhookChannel = 'webhook:http'
export const channelTemplateDefaultsKey = 'messageTemplateDefaults'

export function supportsTemplateSetup(channel?: string): boolean {
  return !!channel && [wechatCorpChannel, emailChannel, dingTalkWorkChannel, dingTalkRobotChannel, webhookChannel].includes(channel)
}

const initialValues = {
  agentId: '', message: '${message}', messageType: 'markdown', title: '${topic}', messageUrl: '',
}
export type TemplateSetupValues = typeof initialValues
export type TemplateSetupKey = 'agentId' | 'messageType' | 'messageUrl'

export interface TemplateSetupField {
  key: TemplateSetupKey
  labelKey: string
  editor?: 'select' | 'custom'
  maxLength?: number
}

export const templateSetupMessageTypes = robotMessageTypeOptions.map(option => ({ value: String(option.value), label: option.label || String(option.value) }))

/** 返回渠道表单需要用户填写的模板参数。 */
export function templateSetupFields(channel: string, values: TemplateSetupValues): TemplateSetupField[] {
  switch (channel) {
    case wechatCorpChannel:
      return [{ key: 'agentId', labelKey: 'NoticeCenter.template.field.agentId', editor: 'custom', maxLength: 19 }]
    case dingTalkRobotChannel: {
      const fields: TemplateSetupField[] = [{ key: 'messageType', labelKey: 'NoticeCenter.template.field.messageType', editor: 'select' }]
      if (values.messageType === 'link') fields.push({ key: 'messageUrl', labelKey: 'NoticeCenter.template.field.messageUrl' })
      return fields
    }
    default:
      return []
  }
}

export function savedTemplateDefaults(value: unknown): NotificationObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as NotificationObject : {}
}

/** 读取可编辑的模板参数，群机器人标题和正文始终使用通用通知变量。 */
export function readTemplateSetup(channel: string, configuration?: NotificationObject): TemplateSetupValues {
  const stored = savedTemplateDefaults(configuration?.[channelTemplateDefaultsKey])
  const values = { ...initialValues }
  const messageType = stored.messageType
  if (channel === dingTalkRobotChannel && typeof messageType === 'string') values.messageType = messageType
  for (const { key } of templateSetupFields(channel, values)) {
    if (typeof stored[key] === 'string') values[key] = stored[key]
  }
  if (channel === wechatCorpChannel) values.agentId = readWechatAgentId(configuration)
  if (channel === dingTalkWorkChannel) {
    const agentId = configuration?.agentId
    values.agentId = typeof agentId === 'string' || typeof agentId === 'number' ? String(agentId).trim() : ''
  }
  return values
}

function isHttpLink(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value.trim()).protocol) } catch { return false }
}

export function templateSetupIssues(channel: string, values: TemplateSetupValues): Partial<Record<TemplateSetupKey, string>> {
  const required = 'messageNotification.channels.validation.required'
  const issues: Partial<Record<TemplateSetupKey, string>> = {}
  for (const { key } of templateSetupFields(channel, values)) {
    if (!values[key].trim()) issues[key] = required
  }
  if (channel === wechatCorpChannel && !validWechatAgentId(values.agentId)) {
    issues.agentId = 'messageNotification.channels.templateSetup.agentRequired'
  }
  if (channel === dingTalkWorkChannel && !values.agentId) issues.agentId = required
  if (channel === dingTalkRobotChannel) {
    if (!templateSetupMessageTypes.some(option => option.value === values.messageType)) {
      issues.messageType = 'messageNotification.channels.validation.invalidValue'
    }
    if (values.messageType === 'link' && values.messageUrl.trim() && !isHttpLink(values.messageUrl)) {
      issues.messageUrl = 'messageNotification.channels.validation.url'
    }
  }
  return issues
}

function templateContent(channel: string, values: TemplateSetupValues, prototype?: NotificationObject): NotificationObject {
  switch (channel) {
    case emailChannel:
      return prototype ?? { subject: '${topic}', text: '${message}' }
    case dingTalkRobotChannel: {
      const { messageType, message, title, messageUrl } = values
      if (messageType === 'text') return { messageType, text: { content: message } }
      return { messageType, [messageType]: { title: title.trim(), text: message, ...(messageType === 'link' ? { messageUrl: messageUrl.trim() } : {}) } }
    }
    case webhookChannel:
      return prototype ?? { contextAsBody: false, body: JSON.stringify({ message: '${message}' }) }
    default:
      return { ...(prototype ?? { message: '${message}' }), agentId: values.agentId }
  }
}

/** Channel defaults stay editable on their generated templates. Store the provider's normal payload shape. */
export function createChannelMessageTemplate(business: NoticeChannelConfig, channel: NotificationChannel, configId: string,
  values: TemplateSetupValues, translate: PrototypeTranslate) {
  const prototype = createPrototypeTemplate(business, channel, [], translate)
  const template = templateContent(channel.id, values, prototype?.template)
  const definitions = new Map<string, NotificationVariable>([...prototypeAvailableVariables(business, [], translate),
    { id: 'message', name: translate('NoticeCenter.template.variable.recommend.message'), type: 'string' },
    { id: 'topic', name: translate('messageNotification.channels.templateSetup.topic'), type: 'string' },
    ...(prototype?.variableDefinitions || []),
  ].map(variable => [variable.id, variable]))
  const variableDefinitions = extractVariableIds(JSON.stringify(template)).map(id => definitions.get(id) || { id, name: id, type: 'string' })
  return buildTemplatePayload(createTemplateDraft({
    id: '', name: prototype?.name || `${business.name || business.provider} · ${channel.name || translate(channel.labelKey)}`,
    configId, type: channel.type, provider: channel.provider, template, variableDefinitions,
  }), [channel])
}
