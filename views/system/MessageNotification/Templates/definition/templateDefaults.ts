import type { NoticeChannelConfig } from '@notify-manager-ui/api/notice-center'
import {
  extractVariableIds,
} from '../../../../notice/template/hooks/noticeTemplateFormModel'
import { getRecommendedVariables } from '../../../../notice/template/hooks/noticeTemplateModel'
import { cloneNotificationValue, type NotificationChannel, type NotificationObject, type NotificationTemplate, type NotificationVariable } from '../../shared'
import { alarmPreviewValues, formatPreviewValue } from '../../../../notice/template/hooks/noticeAlarmPreview'

/**
 * 通知默认模板的唯一维护入口：默认文案、业务正文、预览样例与真实渠道字段适配。
 * 修改已有业务的默认内容只在此文件维护；已保存模板由后端读取，不在这里覆盖。
 * 预览样例只用于展示，不写入模板正文或保存变量的默认值。
 */

export type PrototypeTranslate = (key: string, params?: Record<string, unknown>) => string

/** 默认文案是新模板的数据；生成后不会随界面语言重写已保存内容。 */
export const prototypeDefaultMessages = {
  alarmTitle: '{level}告警：{name}',
  alarmSubject: '【{level}告警】{name}{target}',
  relieveTitle: '告警已解除：{name}',
  relieveSubject: '【告警解除】{name}{target}',
  alarmIntro: '设备产生了一条{level}告警，请及时处理。',
  relieveIntro: '一条{level}告警已解除。',
  complianceIntro: '视频 AI 识别到一条{level}合规告警，请及时核实。',
  securityIntro: '视频 AI 识别到一条{level}安全告警，请立即处理。',
  recovered: '{device} 已恢复正常',
  alarmName: '告警名称：{value}',
  device: '设备：{value}',
  channel: '通道：{value}',
  value: '告警值：{value}',
  currentValue: '当前值：{value}',
  alarmTime: '告警时间：{value}',
  relieveTime: '解除时间：{value}',
  sceneTitle: '「{scene}」已执行',
  sceneSubject: '【场景联动】{title}',
  sceneIntro: '场景「{scene}」已执行，这个场景设置了通知你。',
  triggerType: '触发方式：{value}',
  bulletinSubject: '【{kind}】{title}',
  footer: '这封邮件由系统自动发送，请勿直接回复。不想再收到这类邮件，可以在个人中心的通知设置里关掉。',
  alarmSms: '{level}告警：{device} {name}，{time}，请及时处理。',
  alarmVoice: '您好，这里是告警通知。{device} 发生{level}告警：{name}，请及时处理。',
  relieveSms: '告警解除：{device} {name}已恢复正常。',
  relieveVoice: '您好，这里是告警通知。{device} 的{name}告警已解除。',
  complianceSms: '{level}告警：{name}，{time}，请及时核实。',
  complianceVoice: '您好，这里是告警通知。{name}，请及时核实。',
  securitySms: '{level}告警：{name}，{time}，请立即处理。',
  securityVoice: '您好，这里是告警通知。{name}，请立即处理。',
  sceneSms: '场景「{scene}」已执行。',
  sceneVoice: '您好，这里是场景通知。场景{scene}已执行。',
  bulletinSms: '平台公告：{title}，详情请登录平台查看。',
  bulletinVoice: '您好，这里是公告通知：{title}。详情请登录平台查看。',
} as const

export type PrototypeMessageKey = keyof typeof prototypeDefaultMessages

/** 缺失翻译时使用原型中文；参数是实际变量 token，不把演示值写入文案。 */
export function prototypeText(key: PrototypeMessageKey, params: Record<string, unknown> = {}, translate?: PrototypeTranslate): string {
  const path = `messageNotification.templates.defaults.${key}`
  const translated = translate?.(path, params)
  if (translated && translated !== path) return translated
  return prototypeDefaultMessages[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

export const prototypeBusinessNames = {
  'alarm-device': '设备告警',
  'alarm-device-relieve': '设备告警解除',
  aiComplianceAlarm: '合规告警',
  aiSecurityAlarm: '安全告警',
  scene: '场景联动',
  SystemBulletin: '系统公告',
} as const

export type PrototypeBusiness = keyof typeof prototypeBusinessNames
export type PrototypeTokens = Partial<Record<'name' | 'level' | 'device' | 'deviceId' | 'product' | 'value' | 'time' | 'relieveTime' | 'channel' | 'scene' | 'trigger' | 'title' | 'summary' | 'kind', string>>

export interface PrototypeContent {
  title: string
  subject: string
  email: string
  body: string
  markdown: string
  sms: string
  voice: string
  playTimes: number
  webhook: NotificationObject
}

function presentFields(fields: NotificationObject): NotificationObject {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
}

/** 按原型段落结构组装文案，只保留后端已确认的变量和语义。 */
export function buildPrototypeContent(business: PrototypeBusiness, token: PrototypeTokens, translate?: PrototypeTranslate): PrototypeContent {
  const text = (key: PrototypeMessageKey, params: Record<string, unknown> = {}) => prototypeText(key, params, translate)
  const field = (key: PrototypeMessageKey, value: string | undefined) => value ? text(key, { value }) : ''
  const lines = (...values: (string | false | undefined)[]) => values.filter(Boolean).join('\n')
  const email = (intro: string, details: string) => [intro, details, text('footer')].filter(Boolean).join('\n\n')
  const kind = prototypeBusinessNames[business]

  if (business === 'scene') {
    const title = text('sceneTitle', { scene: token.scene })
    const intro = text('sceneIntro', { scene: token.scene })
    const details = field('triggerType', token.trigger)
    return {
      title, subject: text('sceneSubject', { title }), email: email(intro, details),
      body: lines(intro, details), markdown: lines(intro, details),
      sms: text('sceneSms', { scene: token.scene }), voice: text('sceneVoice', { scene: token.scene }), playTimes: 1,
      webhook: presentFields({ type: kind, scene: token.scene, trigger: token.trigger }),
    }
  }

  if (business === 'SystemBulletin') {
    const title = token.title || ''
    const body = token.summary || ''
    return {
      title, subject: text('bulletinSubject', { kind: token.kind, title }), email: email(body, ''),
      body: lines(token.kind, body), markdown: lines(token.kind ? `**${token.kind}**` : '', body),
      sms: text('bulletinSms', { title }), voice: text('bulletinVoice', { title }), playTimes: 1,
      webhook: presentFields({ type: kind, title, kind: token.kind, summary: token.summary }),
    }
  }

  const relieve = business === 'alarm-device-relieve'
  const device = business === 'alarm-device' || relieve
  const title = text(relieve ? 'relieveTitle' : 'alarmTitle', { level: token.level, name: token.name })
  const target = device ? token.device : token.channel
  const subject = text(relieve ? 'relieveSubject' : 'alarmSubject', {
    level: token.level, name: token.name, target: target ? ` - ${target}` : '',
  })
  const introKey = relieve ? 'relieveIntro' : device ? 'alarmIntro' : business === 'aiComplianceAlarm' ? 'complianceIntro' : 'securityIntro'
  const intro = text(introKey, { level: token.level })
  const details = lines(
    field('alarmName', token.name),
    field(device ? 'device' : 'channel', target ? target + (device && token.product ? `（${token.product}）` : '') : undefined),
    !relieve && field('value', token.value),
    field('alarmTime', token.time), relieve && field('relieveTime', token.relieveTime),
  )
  const recovered = relieve && token.device ? text('recovered', { device: token.device }) : ''
  const body = lines(recovered || intro, !relieve && device && field('device', token.device), !device && field('channel', token.channel), !relieve && field('currentValue', token.value),
    field(relieve ? 'relieveTime' : 'alarmTime', relieve ? token.relieveTime : token.time))
  const smsKey = relieve ? 'relieveSms' : device ? 'alarmSms' : business === 'aiComplianceAlarm' ? 'complianceSms' : 'securitySms'
  const voiceKey = relieve ? 'relieveVoice' : device ? 'alarmVoice' : business === 'aiComplianceAlarm' ? 'complianceVoice' : 'securityVoice'
  const deviceFields = presentFields({ id: token.deviceId, name: token.device, ...(!relieve ? { product: token.product } : {}) })
  return {
    title, subject, email: email(intro, details), body, markdown: body,
    sms: text(smsKey, { ...token, time: token.time }), voice: text(voiceKey, token), playTimes: business === 'alarm-device' || business === 'aiSecurityAlarm' ? 2 : 1,
    webhook: presentFields({
      type: kind, name: token.name, level: token.level,
      ...(device && Object.keys(deviceFields).length ? { device: deviceFields } : {}),
      ...(!device ? { channel: token.channel } : {}),
      ...(relieve ? { alarmTime: token.time, recoverTime: token.relieveTime } : { value: token.value, time: token.time }),
    }),
  }
}

const sampleMessages: Record<string, string> = {
  'NoticeCenter.template.sample.device': '温度设备 A',
  'NoticeCenter.template.sample.product': '环境监测产品',
  'NoticeCenter.template.sample.property': '温度',
  'NoticeCenter.template.sample.alarm': '温度过高',
  'NoticeCenter.template.sample.level': '一般',
  'NoticeCenter.template.sample.message.trigger': '[{targetName}]发生告警:[{alarmConfigName}]!',
  'NoticeCenter.template.sample.message.relieve': '[{targetName}]告警已解除:[{alarmConfigName}]!',
  'NoticeCenter.template.preview.trigger': '触发告警',
  'NoticeCenter.template.preview.relieve': '解除告警',
}

function sampleText(key: string, params: Record<string, unknown> = {}): string {
  return (sampleMessages[key] || key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

/** 样例只交给预览渲染，永不进入默认模板、变量 defaultValue 或保存 payload。 */
export function prototypePreviewExamples(business?: NoticeChannelConfig): Record<string, string> {
  const code = business?.provider
  const values = alarmPreviewValues(sampleText, code === 'alarm-device-relieve' ? 'relieve' : 'trigger')
  let selected: Record<string, unknown>
  if (code === 'alarm-device' || code === 'alarm-device-relieve') selected = values
  else if (code === 'aiComplianceAlarm' || code === 'aiSecurityAlarm') {
    const security = code === 'aiSecurityAlarm'
    selected = {
      message: security ? 'AI 安全告警：明火识别' : 'AI 合规告警：收银台离岗', notifyTime: values.notifyTime,
      'detail.alarmConfigName': security ? '明火识别' : '收银台离岗', 'detail.level': 4, 'detail.alarmTime': values['detail.alarmTime'],
      ...(!security ? { 'detail.mediaChannelName': '收银台 · 通道 03' } : {}),
    }
  } else if (code === 'scene') selected = {
    message: '场景 闭店后有人进入 已执行', notifyTime: values.notifyTime,
    'detail.sceneName': '闭店后有人进入', 'detail.triggerType': '自动',
  }
  else if (code === 'SystemBulletin') selected = {
    message: '平台升级期间，设备接入、数据上报与告警不中断。', notifyTime: values.notifyTime,
    'detail.title': '平台升级通知', 'detail.summary': '平台升级期间，设备接入、数据上报与告警不中断。', 'detail.type': '维护',
  }
  else selected = { message: '通知正文示例', notifyTime: values.notifyTime }
  return Object.fromEntries(Object.entries(selected).filter(([, value]) => value !== undefined).map(([id, value]) => [
    id, formatPreviewValue(value, /(?:^notifyTime$|\.(?:alarmTime|relieveTime)$)/.test(id) ? { id, type: 'date', format: 'yyyy-MM-dd HH:mm:ss' } : undefined),
  ]))
}

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
