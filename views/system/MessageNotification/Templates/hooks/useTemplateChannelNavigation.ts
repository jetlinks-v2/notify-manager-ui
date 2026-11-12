import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NotificationChannel } from '../../shared'

/** Visual channel families keep the actual provider ID as the selection and route identity. */
export function useTemplateChannelNavigation(props: { channels: NotificationChannel[]; value: string }, emit: (event: 'change', id: string) => void) {
  const { t } = useI18n()
  const label = (channel: NotificationChannel) => channel.labelKey ? t(channel.labelKey) : channel.name || channel.id
  const groups = computed(() => {
    const result: { key: string; label: string; channels: NotificationChannel[] }[] = []
    for (const channel of props.channels) {
      const key = ['dingTalk', 'weixin'].includes(channel.type) ? channel.type : channel.id
      let group = result.find(item => item.key === key)
      if (!group) {
        group = { key, label: key === 'dingTalk' ? t('messageNotification.templates.visual.dingTalk') : key === 'weixin' ? t('messageNotification.templates.visual.wechat') : label(channel), channels: [] }
        result.push(group)
      }
      group.channels.push(channel)
    }
    return result
  })
  const activeGroup = computed(() => groups.value.find(item => item.channels.some(channel => channel.id === props.value)))
  const subChannels = computed(() => activeGroup.value && activeGroup.value.channels.length > 1 ? activeGroup.value.channels.map(channel => ({
    id: channel.id, label: channel.provider === 'dingTalkMessage' || channel.provider === 'corpMessage' ? t('messageNotification.templates.visual.workNotification')
      : channel.provider === 'dingTalkRobotWebHook' ? t('messageNotification.templates.visual.groupMessage') : label(channel),
  })) : [])
  function selectGroup(key: string) {
    const group = groups.value.find(item => item.key === key)
    if (group && group !== activeGroup.value) emit('change', group.channels.find(item => item.provider === 'dingTalkMessage' || item.provider === 'corpMessage')?.id || group.channels[0].id)
  }
  function selectChannel(key: string | number) { emit('change', String(key)) }
  return { t, groups, activeGroup, subChannels, selectGroup, selectChannel }
}
