import type { NoticeChannelConfig } from '@notify-manager-ui/api/notice-center'
import {
  extractVariableIds,
} from '../../../../notice/template/hooks/noticeTemplateFormModel'
import { getRecommendedVariables } from '../../../../notice/template/hooks/noticeTemplateModel'
import { cloneNotificationValue, type NotificationChannel, type NotificationObject, type NotificationTemplate, type NotificationVariable } from '../../shared'
import { buildPrototypeContent, prototypeBusinessNames, type PrototypeBusiness, type PrototypeTokens } from './prototypeContent'
import type { PrototypeTranslate } from './prototypeMessages'

export { prototypePreviewExamples } from './prototypePreviewExamples'
export { prototypeDefaultMessages, type PrototypeTranslate } from './prototypeMessages'

const channels: Record<string, string> = {
  'email:embedded': '邮件',
  'dingTalk:dingTalkMessage': '钉钉工作通知',
  'dingTalk:dingTalkRobotWebHook': '钉钉群消息',
  'weixin:corpMessage': '企业微信工作通知',
  'voice:aliyun': '语音',
  'sms:aliyunSms': '短信',
  'webhook:http': 'Webhook',
}

const variableNames: Record<string, string> = {
  message: '通知正文', notifyTime: '发送时间',
  'detail.alarmConfigName': '告警名称', 'detail.level': '告警级别', 'detail.levelText': '级别名称',
  'detail.targetName': '设备名称', 'detail.targetId': '设备 ID', 'detail.productName': '产品名称',
  'detail.propertyValue': '属性原始值', 'detail.propertyValueText': '属性显示值', 'detail.propertyUnit': '属性单位',
  'detail.alarmTime': '告警时间', 'detail.relieveTime': '解除时间', 'detail.mediaChannelName': '通道名称',
  'detail.sceneName': '场景名称', 'detail.triggerType': '触发方式',
  'detail.title': '公告标题', 'detail.summary': '公告摘要', 'detail.type': '公告类型',
}

function businessCode(business: NoticeChannelConfig): PrototypeBusiness | undefined {
  const code = business.provider || ''
  return Object.hasOwn(prototypeBusinessNames, code) ? code as PrototypeBusiness : undefined
}

/** 只按业务和渠道的真实标识匹配；显示名称、排序和相似 provider 均不参与推断。 */
export function hasPrototypeTemplate(business: NoticeChannelConfig, channel: NotificationChannel): boolean {
  return Boolean(businessCode(business) && Object.hasOwn(channels, `${channel.type}:${channel.provider}`))
}

function availableVariables(code: PrototypeBusiness, variables: NotificationVariable[], translate?: PrototypeTranslate): Map<string, NotificationVariable> {
  const recommended = getRecommendedVariables(code, key => translate?.(key) || key)
  const entries = new Map<string, NotificationVariable>()
  // 未持久化的主题无法调用变量接口，沿用已核实的推荐字段，不依赖先启用业务。
  for (const variable of recommended) {
    entries.set(variable.id, {
      ...variable,
      name: variable.name && variable.name !== variable.i18nName ? variable.name : variableNames[variable.id] || variable.id,
    })
  }
  if (code === 'SystemBulletin') {
    for (const id of ['title', 'summary', 'type']) entries.set(`detail.${id}`, { id: `detail.${id}`, name: variableNames[`detail.${id}`], type: 'string' })
  }
  for (const variable of variables) entries.set(variable.id, { ...entries.get(variable.id), ...cloneNotificationValue(variable) })
  return entries
}

/** 未持久化的已知业务复用确证推荐字段；未知业务只展示后端声明，不扩展默认匹配。 */
export function prototypeAvailableVariables(business: NoticeChannelConfig, variables: NotificationVariable[], translate?: PrototypeTranslate): NotificationVariable[] {
  const code = businessCode(business)
  return code ? [...availableVariables(code, variables, translate).values()] : cloneNotificationValue(variables)
}

function mappedTokens(code: PrototypeBusiness, variables: Map<string, NotificationVariable>): PrototypeTokens {
  const token = (...ids: string[]) => {
    const id = ids.find(value => variables.has(value))
    return id ? '${' + id + '}' : undefined
  }
  if (code === 'scene') return { scene: token('detail.sceneName'), trigger: token('detail.triggerType') }
  if (code === 'SystemBulletin') return { title: token('detail.title'), summary: token('detail.summary'), kind: token('detail.type') }
  const common: PrototypeTokens = { name: token('detail.alarmConfigName'), level: token('detail.level'), time: token('detail.alarmTime') }
  if (code === 'aiComplianceAlarm') return { ...common, channel: token('detail.mediaChannelName') }
  // 安全告警复判不能稳定提供通道、空间字段，不因元数据残留而重新引入。
  if (code === 'aiSecurityAlarm') return common
  return {
    ...common, level: token('detail.levelText', 'detail.level'), device: token('detail.targetName'), deviceId: token('detail.targetId'),
    product: token('detail.productName'), value: token('detail.propertyValueText', 'detail.propertyValue'),
    ...(code === 'alarm-device-relieve' ? { relieveTime: token('detail.relieveTime') } : {}),
  }
}

/** 原型只提供内容；服务商账号、签名和审核模板编号必须来自真实渠道配置。 */
export function createPrototypeTemplate(
  business: NoticeChannelConfig,
  channel: NotificationChannel,
  variables: NotificationVariable[],
  translate?: PrototypeTranslate,
): NotificationTemplate | undefined {
  const code = businessCode(business)
  if (!code || !hasPrototypeTemplate(business, channel)) return
  const available = availableVariables(code, variables, translate)
  const content = buildPrototypeContent(code, mappedTokens(code, available), translate)
  let template: NotificationObject
  if (channel.type === 'email') template = { subject: content.subject, text: content.email, sendTo: [], attachments: [] }
  else if (channel.provider === 'dingTalkRobotWebHook') template = {
    messageType: 'markdown', markdown: { title: content.title, text: `#### ${content.title}\n${content.markdown}` },
  }
  else if (channel.type === 'dingTalk' || channel.type === 'weixin') template = { agentId: '', message: `${content.title}\n${content.body}` }
  else if (channel.type === 'sms') template = { code: '', signName: '', message: content.sms }
  else if (channel.type === 'voice') template = { templateType: 'tts', templateCode: '', ttsCode: '', message: content.voice, playTimes: content.playTimes }
  else template = { contextAsBody: false, body: JSON.stringify(content.webhook, null, 2) }
  const used = new Set(extractVariableIds(JSON.stringify(template)))
  const definitions = [...available.values()].filter(variable => used.has(variable.id)).map(variable => {
    const definition = cloneNotificationValue(variable)
    delete definition.defaultValue
    if (!definition.format && definition.expands?.format) definition.format = String(definition.expands.format)
    return definition
  })
  const label = translate?.(channel.labelKey)
  return {
    id: '', name: `${business.name || prototypeBusinessNames[code]} · ${channel.name || (label && label !== channel.labelKey ? label : channels[`${channel.type}:${channel.provider}`])}`,
    type: channel.type, provider: channel.provider, template, variableDefinitions: definitions,
  }
}
