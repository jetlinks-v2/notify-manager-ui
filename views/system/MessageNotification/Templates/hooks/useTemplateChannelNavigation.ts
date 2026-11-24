import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { dingTalkRobotChannelId, notificationChannelLabels, type NotificationChannel, type NotificationLoadState, type NotifierConfig } from '../../shared'

export interface TemplateChannelNavigationProps {
  channels: NotificationChannel[]
  value: string
  configurationStates: Readonly<Record<string, NotificationLoadState>>
  configurationsByChannel: Readonly<Record<string, readonly Pick<NotifierConfig, 'id' | 'name'>[]>>
  activeConfigId?: string
}

type ChannelTab = { key: string; id: string; label: string; configId?: string }

interface ChannelGroup {
  key: string
  label: string
  channels: NotificationChannel[]
  configurationState: NotificationLoadState
  statusText: string
}

/** Visual channel families keep the actual provider ID as the selection and route identity. */
export function useTemplateChannelNavigation(props: TemplateChannelNavigationProps, emit: (event: 'change', id: string, configId?: string) => void) {
  const { t } = useI18n()
  const { typeTitle, providerTitle } = notificationChannelLabels(t)
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
      const grouped = channel.type === 'dingTalk' || channel.type === 'weixin'
      const key = grouped ? channel.type : channel.id
      let group = result.find(item => item.key === key)
      if (!group) {
        const title = typeTitle(channel.type, channel.typeName)
        // 平铺多个同类服务商时保留提供商名称，便于区分入口。
        const needsProvider = !grouped && props.channels.some(item => item.type === channel.type && item.id !== channel.id)
        const label = needsProvider ? `${title} · ${providerTitle(channel)}` : title
        group = { key, label, channels: [], configurationState: 'idle', statusText: '' }
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
  // 配置名称允许重复，页签和路由以配置 ID 区分实例。
  const subChannels = computed(() => {
    const channels = activeGroup.value?.channels ?? []
    const tabs = channels.flatMap<ChannelTab>(channel => {
      const label = providerTitle(channel)
      const configs = props.configurationsByChannel[channel.id] ?? []
      if (!configs.length) {
        return [{ key: channel.id, id: channel.id, label }]
      }
      return configs.map(config => {
        const name = config.name.trim() || config.id
        return { key: `${channel.id}:${config.id}`, id: channel.id, configId: config.id,
          label: channel.id === dingTalkRobotChannelId ? `${label}·${name}` : name }
      })
    })
    return channels.length > 1 || tabs.some(tab => tab.configId) ? tabs : []
  })
  const activeTabKey = computed(() => subChannels.value.find(tab =>
    tab.id === props.value && (!tab.configId || tab.configId === props.activeConfigId))?.key ?? '')
  function selectGroup(key: string) {
    const group = groups.value.find(item => item.key === key)
    if (!group || group === activeGroup.value) return
    const channel = group.key === 'weixin'
      ? group.channels.find(item => item.provider === 'corpMessage') ?? group.channels[0]
      : group.channels[0]
    // 钉钉按子页签的显示顺序选择首个实例，显式传入配置 ID 固定模板选择。
    const configId = group.key === 'dingTalk' ? props.configurationsByChannel[channel.id]?.[0]?.id : undefined
    if (configId) emit('change', channel.id, configId)
    else emit('change', channel.id)
  }
  function selectChannel(key: string | number) {
    const tab = subChannels.value.find(tab => tab.key === key)
    if (tab?.configId) emit('change', tab.id, tab.configId)
    else if (tab) emit('change', tab.id)
  }
  return { t, groups, activeGroup, subChannels, activeTabKey, selectGroup, selectChannel }
}
