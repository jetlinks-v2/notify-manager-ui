import { notificationSecretMask, type NotificationObject } from '../../shared'
import { alarmPreviewValues } from '../../../../notice/template/hooks/noticeAlarmPreview'

type Translate = (key: string, values?: Record<string, unknown>) => string

/** 本地告警样例只解释请求格式，不依赖已保存模板，也不参与发送。 */
export function webhookRequestPreview(configuration: NotificationObject, t: Translate): string {
  const address = typeof configuration.url === 'string' ? configuration.url.trim() : ''
  const url = address && !/^https?:\/\/$/.test(address) ? address : t('messageNotification.channels.webhook.receiver')
  const headers = Array.isArray(configuration.headers) ? configuration.headers.filter(row => typeof row?.key === 'string' && row.key.trim()) : []
  const sample = alarmPreviewValues(t, 'trigger')
  const body = {
    message: sample.message,
    notifyTime: sample.notifyTime,
    detail: {
      targetId: sample['detail.targetId'], targetName: sample['detail.targetName'],
      alarmConfigName: sample['detail.alarmConfigName'], level: sample['detail.level'],
      alarmTime: sample['detail.alarmTime'],
    },
  }
  // 显示与复制共用文本，已配置请求头中的凭据始终遮蔽。
  return [
    `POST ${url}`,
    ...(!headers.some(row => row.key.trim().toLowerCase() === 'content-type') ? ['Content-Type: application/json'] : []),
    ...headers.map(row => `${row.key}: ${notificationSecretMask}`),
    '', JSON.stringify(body, null, 2),
  ].join('\n')
}
