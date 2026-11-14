import type { NotificationObject, NotificationTemplatePayload } from '../../../../api/notice/messageNotificationTypes'
import { getRecommendedVariables } from '../../../notice/template/hooks/noticeTemplateModel'
import { alarmPreviewValues, formatPreviewValue } from '../../../notice/template/hooks/noticeAlarmPreview'

type Translate = (key: string, values?: Record<string, unknown>) => string
export interface BuiltinEmailTemplate {
  key: string
  label: string
  payload: NotificationTemplatePayload
  examples: Record<string, string>
  samples: NotificationObject
}

// Keys are registered business providers, not persisted template IDs or guessed subject bindings.
const providers = ['alarm-device', 'alarm-device-relieve', 'alarm-product', 'alarm-org', 'alarm-collector', 'alarm-other', 'aiComplianceAlarm', 'aiSecurityAlarm', 'scene', 'system-event'] as const

/** Shared defaults for the template editor and channel trial; examples never become variable defaults. */
export function builtinEmailTemplates(t: Translate): BuiltinEmailTemplate[] {
  return providers.map(key => {
    const label = t(`messageNotification.builtin.${key}`)
    const alarm = key.startsWith('alarm-') || key.startsWith('ai')
    const relieve = key === 'alarm-device-relieve'
    const ids = alarm
      ? ['detail.alarmConfigName', 'detail.targetName', 'detail.level', 'detail.alarmTime', ...(relieve ? ['detail.relieveTime'] : []), 'message']
      : key === 'scene' ? ['detail.sceneName', 'message', 'notifyTime'] : ['message', 'notifyTime']
    const variables = getRecommendedVariables(key, t).filter(variable => ids.includes(variable.id))
      .map(variable => ({ ...variable, format: variable.type === 'date' ? String(variable.expands?.format || 'yyyy-MM-dd HH:mm:ss') : undefined }))
    const subject = alarm ? `${label} · \${detail.alarmConfigName}` : key === 'scene' ? `${label} · \${detail.sceneName}` : label
    const text = variables.map(variable => `${variable.name || variable.id}：\${${variable.id}}`).join('\n')
      + '\n\n' + t('messageNotification.builtin.footer')
    const samples: NotificationObject = {
      ...alarmPreviewValues(t, relieve ? 'relieve' : 'trigger'),
      'detail.sceneName': t('messageNotification.builtin.sceneSample'),
    }
    if (!alarm) samples.message = t(`messageNotification.builtin.${key === 'scene' ? 'sceneMessage' : 'systemMessage'}`)
    const examples = Object.fromEntries(variables.map(variable => [variable.id, formatPreviewValue(samples[variable.id], variable)]))
    return { key, label, examples, samples, payload: {
      name: label, type: 'email', provider: 'embedded',
      template: { subject, text, sendTo: [], attachments: [] }, variableDefinitions: variables,
    } }
  })
}

/** Preview and trial share formatted sample values, with nested detail paths retained for rendering. */
export function builtinEmailContext(template: BuiltinEmailTemplate, recipient: string): NotificationObject {
  const detail: NotificationObject = {}
  const context: NotificationObject = { detail, sendTo: [recipient] }
  for (const key of Object.keys(template.examples)) {
    const value = template.samples[key]
    if (key.startsWith('detail.')) detail[key.slice('detail.'.length)] = value
    else context[key] = value
  }
  return context
}
