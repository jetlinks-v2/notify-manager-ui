import type { NoticeChannelConfig } from '@notify-manager-ui/api/notice-center'
import { alarmPreviewValues, formatPreviewValue } from '../../../../notice/template/hooks/noticeAlarmPreview'

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
