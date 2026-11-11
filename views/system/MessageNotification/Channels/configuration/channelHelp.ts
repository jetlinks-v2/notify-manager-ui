import type { NotificationChannel } from '../../shared'
import type { ChannelDefinition } from './channelMetadata'

export interface ChannelHelpModel {
  description: string
  steps: { title: string; description: string }[]
  questions: { title: string; description: string }[]
}

const guides: Record<string, { kind: string; steps: number; questions: number }> = {
  'email:embedded': { kind: 'email', steps: 3, questions: 2 },
  'dingTalk:dingTalkMessage': { kind: 'dingTalk', steps: 3, questions: 1 },
  'dingTalk:dingTalkRobotWebHook': { kind: 'robot', steps: 2, questions: 1 },
  'weixin:corpMessage': { kind: 'weixin', steps: 3, questions: 1 },
  'weixin:officialMessage': { kind: 'official', steps: 3, questions: 0 },
  'sms:aliyunSms': { kind: 'sms', steps: 3, questions: 1 },
  'voice:aliyun': { kind: 'voice', steps: 3, questions: 1 },
  'webhook:http': { kind: 'webhook', steps: 2, questions: 1 },
}

/** Map an active business field to a real guide step; unknown providers use their metadata descriptions. */
export function channelHelpStep(channel: NotificationChannel | undefined, definition: ChannelDefinition | undefined, fieldKey: string): number | undefined {
  if (!channel || !fieldKey || fieldKey === 'name') return undefined
  const key = fieldKey.startsWith('config:') ? fieldKey.slice(7) : fieldKey
  if (!guides[channel.id]) {
    const index = (definition?.fields ?? []).filter(field => field.property?.description).findIndex(field => field.key === key)
    return index < 0 ? undefined : index
  }
  if (channel.id === 'email:embedded') return ['username', 'password', 'sender'].includes(key) ? 2 : 1
  if (channel.id === 'webhook:http') return key === 'headers' ? 1 : 0
  if (channel.id === 'dingTalk:dingTalkRobotWebHook') return key === 'secret' ? 1 : 0
  if (channel.id === 'weixin:officialMessage') return key === 'appId' ? 1 : key === 'secret' ? 2 : undefined
  return 1
}

/** Guide content follows supported provider contracts; new providers keep their own metadata descriptions. */
export function channelHelp(channel: NotificationChannel | undefined, definition: ChannelDefinition | undefined, t: (key: string) => string): ChannelHelpModel {
  const guide = channel && guides[channel.id]
  if (!guide) return {
    description: definition?.metadata.description || channel?.description || t('messageNotification.channels.guidance.generic'),
    steps: (definition?.fields ?? []).filter(field => field.property?.description).map(field => ({ title: field.property?.name || field.key, description: field.property!.description! })),
    questions: [],
  }
  const prefix = `messageNotification.channels.guidance.${guide.kind}`
  const items = (kind: string, count: number) => Array.from({ length: count }, (_, index) => ({ title: t(`${prefix}.${kind}.${index}.title`), description: t(`${prefix}.${kind}.${index}.description`) }))
  return { description: t(`${prefix}.description`), steps: items('steps', guide.steps), questions: items('questions', guide.questions) }
}
