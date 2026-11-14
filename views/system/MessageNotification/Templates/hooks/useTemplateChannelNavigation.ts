import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NotificationChannel, NotificationLoadState } from '../../shared'

interface ChannelGroup {
  key: string
  label: string
  channels: NotificationChannel[]
  configurationState: NotificationLoadState
  statusText: string
}

/** Visual channel families keep the actual provider ID as the selection and route identity. */
export function useTemplateChannelNavigation(props: { channels: NotificationChannel[]; value: string; configurationStates: Readonly<Record<string, NotificationLoadState>> }, emit: (event: 'change', id: string) => void) {
  const { t } = useI18n()
  const label = (channel: NotificationChannel) => channel.labelKey ? t(channel.labelKey) : channel.name || channel.id
  /** Only a successful empty snapshot means unconfigured; unreadable configuration remains unknown. */
  function groupState(channels: NotificationChannel[]): NotificationLoadState {
    const states = channels.map(channel => props.configurationStates[channel.id] ?? 'idle')
    if (states.includes('ready')) return 'ready'
    if (states.every(state => state === 'empty')) return 'empty'
    return states.find(state => state !== 'empty') ?? 'idle'
  }
  function statusText(state: NotificationLoadState): string {
    return t(state === 'ready' ? 'messageNotification.channels.configured'
      : state === 'empty' ? 'messageNotification.channels.unconfigured'
        : state === 'idle' || state === 'loading' ? 'messageNotification.common.loading' : `messageNotification.state.${state}`)
  }
  const groups = computed(() => {
    const result: ChannelGroup[] = []
    for (const channel of props.channels) {
      const key = ['dingTalk', 'weixin'].includes(channel.type) ? channel.type : channel.id
      let group = result.find(item => item.key === key)
      if (!group) {
        group = { key, label: key === 'dingTalk' ? t('messageNotification.templates.visual.dingTalk') : key === 'weixin' ? t('messageNotification.templates.visual.wechat') : label(channel), channels: [], configurationState: 'idle', statusText: '' }
        result.push(group)
      }
      group.channels.push(channel)
    }
    return result.map(group => {
      const configurationState = groupState(group.channels)
      return { ...group, configurationState, statusText: statusText(configurationState) }
    })
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
