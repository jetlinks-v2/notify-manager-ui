import type { NoticeProviderTemplateInfo, NoticeTemplateEntity } from '@notify-manager-ui/api/notice-center'
import {
  getStateValue,
  needsTemplate,
} from './noticeTemplateModel'
import type { NoticeTemplateGroup } from './noticeTemplateModel'

export const applyProviderTemplateInfo = (
  groups: NoticeTemplateGroup[],
  providerId: string,
  detail?: NoticeProviderTemplateInfo,
) => {
  if (!detail) {
    return groups
  }
  const templateMap = new Map<string, { channel: NonNullable<NoticeProviderTemplateInfo['channels'][number]['channel']>; templates: NoticeTemplateEntity[] }>()
  ;(detail.channels || [])
    .filter(item => item.channel?.channelProvider)
    .forEach(item => {
      const channelProvider = item.channel.channelProvider as string
      const existing = templateMap.get(channelProvider)
      templateMap.set(channelProvider, {
        channel: item.channel,
        templates: [
          ...(existing?.templates || []),
          ...(item.template ? [item.template] : []),
        ],
      })
    })

  return groups.map(group => ({
    ...group,
    alarms: group.alarms.map(alarm => {
      if (alarm.detailProviderId !== providerId) {
        return alarm
      }
      return {
        ...alarm,
        raw: detail.provider || alarm.raw,
        channels: alarm.channels.map(channel => {
          const matched = templateMap.get(channel.channelProvider)
          if (!matched) {
            return channel
          }
          const notifierId = matched.channel.channelConfiguration?.notifierId
          const boundNotifierConfig = channel.notifierConfigs?.find(item => item.id === notifierId)
          const template = boundNotifierConfig?.provider
            ? matched.templates.find(item => item.provider === boundNotifierConfig.provider) || matched.templates[0]
            : matched.templates[0]
          const templateNotifierConfig = template?.provider
            ? channel.notifierConfigs?.find(item => item.provider === template.provider)
            : undefined
          const notifierConfig = templateNotifierConfig || boundNotifierConfig || channel.notifierConfig
          return {
            ...channel,
            channel: matched.channel,
            notifierConfig,
            template,
            templates: matched.templates,
            hasNotifierConfig: !needsTemplate(channel.channelProvider)
              || Boolean(templateNotifierConfig?.id)
              || Boolean(template?.configId)
              || (!template && Boolean(notifierConfig?.id)),
            configured: !needsTemplate(channel.channelProvider) || Boolean(template?.id),
            enabled: getStateValue(matched.channel.state) !== 'disabled',
          }
        }),
      }
    }),
  }))
}
