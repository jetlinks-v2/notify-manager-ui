import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TreeProps } from 'ant-design-vue'
import { usePermission } from '@jetlinks-web/hooks'
import { useWindowSize } from '@vueuse/core'
import { onlyMessage } from '@jetlinks-web/utils'
import { useAuthStore } from '@jetlinks-web-core/store/auth'
import { useSystemStore } from '@jetlinks-web-core/store/system'
import { findNotificationChannel, notificationPermissions, notificationQuery, normalizeNotificationNavigation, type NotificationChannel, type NotificationNavigation } from '../shared'
import { useChannelWorkspace, type ChannelFieldChange } from './useChannelWorkspace'
import { useChannelCatalog } from './useChannelCatalog'
import { useChannelTest } from './testing/useChannelTest'
import { channelTestSettingsKinds } from './testing/channelTestConfig'
import { channelTestAdapters } from './testing/channelTestAdapter'
import { useChannelLeaveGuard } from './useChannelLeaveGuard'
import { channelHelp, channelHelpStep } from './configuration/channelHelp'

/** Own backend directory, routing, permissions and draft effects outside rendering components. */
export function useChannelsPage() {
  const { t, te } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const system = useSystemStore()
  const configurationPanel = ref<{ editField: (key: string) => void }>()
  const auth = useAuthStore()
  const { width } = useWindowSize()
  const isNarrow = computed(() => width.value < 768)
  // Trial permissions follow changes to the current session and role.
  const permissions = {
    query: computed(() => auth.hasPermission(notificationPermissions.channels.query)),
    add: usePermission(notificationPermissions.channels.add).hasPerm,
    update: usePermission(notificationPermissions.channels.update).hasPerm,
    delete: usePermission(notificationPermissions.channels.delete).hasPerm,
    action: computed(() => auth.hasPermission(notificationPermissions.channels.action)),
  }
  const canQuery = permissions.query
  const catalog = useChannelCatalog(canQuery)
  const channelTitle = (item: NotificationChannel) => item.labelKey ? t(item.labelKey) : item.name || item.id
  const channelOptions = computed(() => catalog.channels.value.map(item => ({ value: item.id, label: channelTitle(item) })))
  const typeTitle = (id: string, name?: string) => te(`NoticeCenter.channel.type.${id}`) ? t(`NoticeCenter.channel.type.${id}`) : name || id
  const providerTitle = (item: NotificationChannel) => item.id === 'dingTalk:dingTalkRobotWebHook'
    ? t('messageNotification.channels.groupRobot') : ['dingTalk:dingTalkMessage', 'weixin:corpMessage'].includes(item.id)
      ? t('messageNotification.channels.workNotification') : item.providerName || channelTitle(item)
  const channelSearch = ref('')
  const channelTree = computed(() => catalog.types.value.map(type => {
    const items = catalog.channels.value.filter(item => item.type === type.id)
    const nested = items.length !== 1 || ['dingTalk', 'weixin'].includes(type.id)
    const leaf = (item: NotificationChannel) => ({ key: item.id, type: type.id, title: nested ? providerTitle(item) : typeTitle(type.id, type.name), count: catalog.count(item), multipleConfigurations: !!item.multipleConfigurations, children: [] })
    return nested ? { key: `type:${type.id}`, type: type.id, title: typeTitle(type.id, type.name), count: undefined, children: items.map(leaf) } : leaf(items[0])
  }))
  const filteredChannelTree = computed(() => {
    const keyword = channelSearch.value.trim().toLocaleLowerCase()
    return channelTree.value.flatMap(node => {
      if (!keyword || node.title.toLocaleLowerCase().includes(keyword)) return [node]
      const children = node.children.filter(child => child.title.toLocaleLowerCase().includes(keyword))
      return children.length ? [{ ...node, children }] : []
    })
  })
  const openChannelKeys = ref<string[]>(['type:dingTalk', 'type:weixin'])
  watch(channelSearch, keyword => { if (keyword.trim()) openChannelKeys.value = channelTree.value.filter(node => node.children.length).map(node => node.key) })
  const providerFeedback = computed(() => catalog.types.value.flatMap(type => {
    const status = catalog.providerStates.get(type.id)
    return status && !['ready', 'loading'].includes(status) ? [{ id: type.id, name: typeTitle(type.id, type.name), state: status }] : []
  }))
  const directoryState = catalog.state
  function navigate(navigation: NotificationNavigation) { void router.replace({ query: notificationQuery(navigation, route.query, catalog.channels.value) }) }
  const trial = useChannelTest()
  const workspace = useChannelWorkspace({ permissions, navigate, blocked: trial.sending, channels: catalog.channels, loadConfigs: catalog.loadConfigs, loadDefinition: catalog.loadDefinition, channelName: channelTitle })
  const { channelId, channel, multipleConfigurations, configs, state, detailState, entry, selectedConfigId, busy, dirty, hasUnsavedChanges, canEdit } = workspace
  const operationBusy = computed(() => busy.value || trial.sending.value)
  const deleteOpen = ref(false)
  function requestRemove() { if (!operationBusy.value && permissions.delete.value && entry.value && !entry.value.isNew) deleteOpen.value = true }
  const selectChannel: TreeProps['onSelect'] = (_keys, { node }) => {
    if (operationBusy.value) return
    const key = String(node.key)
    if (findNotificationChannel(key, catalog.channels.value)) {
      if (key !== channelId.value) void workspace.activate(key)
    } else {
      openChannelKeys.value = openChannelKeys.value.includes(key) ? openChannelKeys.value.filter(item => item !== key) : [...openChannelKeys.value, key]
    }
  }
  const configurationVisible = computed(() => !!entry.value && ![state.value, detailState.value].some(value => ['loading', 'unavailable', 'forbidden', 'error'].includes(value)))
  const { leaveOpen, decideLeave } = useChannelLeaveGuard(hasUnsavedChanges, operationBusy)
  const trialSupported = computed(() => !!channelTestAdapters[channelId.value])
  const canTrial = computed(() => trialSupported.value && canQuery.value && permissions.action.value && !!entry.value?.baseline?.id && !entry.value?.isNew && !dirty.value && configurationVisible.value)
  const configurationOptions = computed(() => configs.value.map(item => ({ value: item.id, label: `${item.name} · ${item.id}` })))
  const helpChoices = reactive(new Map<string, boolean>())
  const helpOpen = computed(() => helpChoices.get(channelId.value) ?? !!entry.value?.isNew)
  const help = computed(() => channelHelp(channel.value, entry.value?.definition, t))
  const focusedField = ref('')
  const activeHelpStep = computed(() => channelHelpStep(channel.value, entry.value?.definition, focusedField.value))
  function focusField(key: string) { focusedField.value = key }
  function toggleHelp(value = !helpOpen.value) { helpChoices.set(channelId.value, value) }

  // Directory availability precedes route normalization; unknown links never silently select another provider.
  watch(canQuery, () => { workspace.clear(); void catalog.reload() }, { immediate: true })
  watch([() => route.query, catalog.state, catalog.channels, trial.sending, busy], ([query]) => {
    if (!canQuery.value || catalog.state.value !== 'ready' || trial.sending.value || busy.value) return
    const navigation = normalizeNotificationNavigation(query, catalog.channels.value)
    const requestedChannel = navigation.channel ?? (query.channel || query.ch ? '' : catalog.channels.value[0]?.id || '')
    if (requestedChannel !== channelId.value || navigation.configId !== selectedConfigId.value || ['idle', 'forbidden'].includes(state.value)) {
      void workspace.activate(requestedChannel, navigation.configId)
    }
  }, { immediate: true })

  /** Retry the failed boundary; successful writes refresh only reads, never replay mutations. */
  async function refresh() {
    if (operationBusy.value) return
    if (!['ready', 'empty'].includes(catalog.state.value)) { await catalog.reload(); return }
    await workspace.activate(channelId.value, selectedConfigId.value, true)
  }
  async function save() { if (await workspace.save()) onlyMessage(t('messageNotification.channels.saveSuccess'), 'success') }
  async function saveFields(changes: ChannelFieldChange[], errorPath: string) {
    const ok = await workspace.saveFields(changes, errorPath)
    if (ok) onlyMessage(t('messageNotification.channels.saveSuccess'), 'success')
    return ok
  }
  async function remove() { deleteOpen.value = false; if (await workspace.deleteConfig()) onlyMessage(t('messageNotification.channels.deleteSuccess'), 'success') }
  function showSend() {
    if (!canTrial.value || !channel.value || !entry.value?.baseline?.id) return
    const id = entry.value.baseline.id
    trial.show({ config: entry.value.baseline, channelName: channelTitle(channel.value), systemName: system.layout.title,
      permitted: () => canQuery.value && permissions.action.value,
      clean: () => !dirty.value && !entry.value?.isNew && entry.value?.baseline?.id === id && !busy.value })
  }
  const pendingTestField = ref<{ configId: string; key: string }>()
  function fixTestConfiguration() {
    if (trial.sending.value) return
    const key = channelTestSettingsKinds[channelId.value] ? 'testTemplate'
      : ['weixin:corpMessage', 'dingTalk:dingTalkMessage'].includes(channelId.value) ? 'agentId'
        : channelId.value === 'email:embedded' ? 'host' : 'url'
    pendingTestField.value = { configId: selectedConfigId.value || '', key }
    trial.close()
  }
  /** Wait for modal focus restoration before opening an inline editor, which otherwise blurs and closes. */
  async function afterTestClosed() {
    const target = pendingTestField.value
    pendingTestField.value = undefined
    if (!target || target.configId !== selectedConfigId.value || !canEdit.value || operationBusy.value) return
    helpChoices.set(channelId.value, true)
    focusedField.value = target.key
    await nextTick()
    configurationPanel.value?.editField(`config:${target.key}`)
  }
  // Navigation, saved configuration and permission changes invalidate the active send snapshot.
  watch([() => route.query.channel, () => route.query.ch, () => route.query.configId], () => trial.close(true))
  watch(() => entry.value?.baseline, () => trial.close(true))
  watch([channelId, selectedConfigId], () => { trial.close(true); deleteOpen.value = false; focusedField.value = '' })
  watch([canQuery, permissions.action], ([query, send]) => { if (!query || !send) trial.close(true) })
  onBeforeUnmount(() => trial.close(true))
  watch(channel, value => {
    const key = `type:${value?.type}`
    if (value && channelTree.value.some(node => node.key === key) && !openChannelKeys.value.includes(key)) openChannelKeys.value.push(key)
  })

  return {
    t, notificationPermissions, isNarrow, channelOptions, channelSearch, filteredChannelTree, openChannelKeys, selectChannel, configurationOptions,
    canQuery, channelId, channel, multipleConfigurations, configs, state, detailState, entry, selectedConfigId,
    busy, dirty, canEdit, operationBusy, trialSupported, canTrial, leaveOpen, decideLeave, configurationPanel,
    sending: trial.sending, workspace, trial, testModel: trial.model, fixTestConfiguration, afterTestClosed, refresh, save, remove, showSend, configurationVisible,
    catalog, directoryState, providerFeedback, channelTitle, help, helpOpen, toggleHelp, saveFields, focusField, activeHelpStep, deleteOpen, requestRemove,
  }
}
