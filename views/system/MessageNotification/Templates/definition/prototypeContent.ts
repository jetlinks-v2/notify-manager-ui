import type { NotificationObject } from '../../shared'
import { prototypeText, type PrototypeMessageKey, type PrototypeTranslate } from './prototypeMessages'

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
