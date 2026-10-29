import dayjs from 'dayjs'
import type { NoticeTemplateVariable } from '@notify-manager-ui/api/notice-center'

export type AlarmPreviewEvent = 'trigger' | 'relieve'
type Translate = (key: string, values?: Record<string, unknown>) => string

/** 与属性通知字段约定一致的本地样例，不读取真实设备或发送通知。 */
export function alarmPreviewValues(t: Translate, event: AlarmPreviewEvent): Record<string, unknown> {
  const targetName = t('NoticeCenter.template.sample.device')
  const alarmConfigName = t('NoticeCenter.template.sample.alarm')
  const alarmTime = new Date(2026, 0, 1, 12, 0, 0).getTime()
  const propertyValue = event === 'relieve' ? 50 : 90
  return {
    message: t(`NoticeCenter.template.sample.message.${event}`, { targetName, alarmConfigName }),
    notifyTime: event === 'relieve' ? alarmTime + 60000 : alarmTime,
    'detail.targetType': 'device',
    'detail.sourceType': 'device',
    'detail.sourceName': targetName,
    'detail.targetId': 'device-001',
    'detail.targetName': targetName,
    'detail.productId': 'product-001',
    'detail.productName': t('NoticeCenter.template.sample.product'),
    'detail.alarmConfigName': alarmConfigName,
    'detail.property': 'temperature',
    'detail.propertyName': t('NoticeCenter.template.sample.property'),
    'detail.propertyValue': propertyValue,
    'detail.propertyValueText': `${propertyValue}℃`,
    'detail.propertyUnit': '℃',
    'detail.level': 4,
    'detail.levelText': t('NoticeCenter.template.sample.level'),
    'detail.event': event,
    'detail.eventText': t(`NoticeCenter.template.preview.${event}`),
    'detail.alarmTime': alarmTime,
    'detail.relieveTime': event === 'relieve' ? alarmTime + 60000 : undefined,
  }
}

export function formatPreviewValue(value: unknown, variable?: NoticeTemplateVariable & { format?: string }): string {
  if (value == null) return ''
  const format = String(variable?.format || variable?.expands?.format || '')
  if (variable?.type === 'date') {
    if (format === 'timestamp') return String(value)
    // 编辑器提供的日期格式采用 Java 标记，预览转换为 dayjs 的对应标记。
    return dayjs(Number(value)).format((format || 'yyyy-MM-dd HH:mm:ss').replace(/yyyy/g, 'YYYY').replace(/dd/g, 'DD'))
  }
  const precision = variable?.type === 'double' && /^%\.(\d+)f$/.exec(format)
  if (precision && Number.isFinite(Number(value))) return Number(value).toFixed(Math.min(Number(precision[1]), 100))
  return String(value)
}
