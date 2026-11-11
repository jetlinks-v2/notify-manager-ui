import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TreeProps } from 'ant-design-vue'
import { usePermission } from '@jetlinks-web/hooks'
import { useWindowSize } from '@vueuse/core'
import { onlyMessage } from '@jetlinks-web/utils'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
import { findNotificationChannel, notificationNavigationTarget, notificationPermissions, notificationQuery, normalizeNotificationNavigation, type NotificationChannel, type NotificationNavigation } from '../shared'
import { useChannelWorkspace, type ChannelFieldChange } from './useChannelWorkspace'
import { useChannelCatalog } from './useChannelCatalog'
import { useChannelSend } from './useChannelSend'
import { useChannelLeaveGuard } from './useChannelLeaveGuard'
import { channelHelp, channelHelpStep } from './configuration/channelHelp'
import type { ChannelSendDrawerModel } from './useChannelSendDrawer'

/** Own backend directory, routing, permissions and draft effects outside rendering components. */
export function useChannelsPage() {
  const { t, te } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const menu = useMenuStore()
  const { width } = useWindowSize()
  const isNarrow = computed(() => width.value < 768)
  const permissions = {
    query: usePermission(notificationPermissions.channels.query).hasPerm,
    add: usePermission(notificationPermissions.channels.add).hasPerm,
    update: usePermission(notificationPermissions.channels.update).hasPerm,
    delete: usePermission(notificationPermissions.channels.delete).hasPerm,
    action: usePermission(notificationPermissions.channels.action).hasPerm,
  }
  const canQuery = permissions.query
  const canViewTemplates = usePermission(notificationPermissions.templates.query).hasPerm
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
  const trial = useChannelSend()
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
  const canManageTemplates = computed(() => canViewTemplates.value && !!findNotificationChannel(channelId.value))
  const canTrial = computed(() => canQuery.value && canViewTemplates.value && permissions.action.value && !!entry.value?.baseline?.id && !entry.value?.isNew && !dirty.value && channel.value?.id === 'email:embedded')
  const configurationOptions = computed(() => configs.value.map(item => ({ value: item.id, label: `${item.name} · ${item.id}` })))
  const sendDrawer = computed<ChannelSendDrawerModel>(() => ({
    open: trial.open.value, configId: trial.configId.value, state: trial.state.value,
    templates: trial.templates.value, selected: trial.selected.value, parameters: trial.parameters.value,
    invalidParameters: trial.invalidParameters.value, missing: trial.missing.value,
    sending: trial.sending.value, sent: trial.sent.value, error: trial.error.value, canSend: trial.canSend.value,
  }))
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
  function goTemplates() {
    if (!entry.value?.baseline?.id || !canManageTemplates.value) return
    const target = notificationNavigationTarget('templates', { channel: channelId.value, configId: entry.value.baseline.id })
    void menu.jumpPage(target.name, target.options)
  }
  function showSend() {
    if (!canTrial.value || !channel.value || !entry.value?.baseline?.id) return
    const id = entry.value.baseline.id
    void trial.show({ channel: channel.value, configId: id, permitted: () => permissions.query.value && canViewTemplates.value && permissions.action.value, clean: () => !dirty.value && !entry.value?.isNew && entry.value?.baseline?.id === id })
  }
  function updateSendParameters(value: string) { trial.parameters.value = value }
  watch([channelId, selectedConfigId], () => { trial.close(); deleteOpen.value = false; focusedField.value = '' })
  watch(channel, value => {
    const key = `type:${value?.type}`
    if (value && channelTree.value.some(node => node.key === key) && !openChannelKeys.value.includes(key)) openChannelKeys.value.push(key)
  })

  return {
    t, notificationPermissions, isNarrow, channelOptions, channelSearch, filteredChannelTree, openChannelKeys, selectChannel, configurationOptions,
    canQuery, canViewTemplates, canManageTemplates, channelId, channel, multipleConfigurations, configs, state, detailState, entry, selectedConfigId,
    busy, dirty, canEdit, operationBusy, canTrial, leaveOpen, decideLeave, sendDrawer,
    sending: trial.sending, workspace, trial, refresh, save, remove, goTemplates, showSend, updateSendParameters, configurationVisible,
    catalog, directoryState, providerFeedback, channelTitle, help, helpOpen, toggleHelp, saveFields, focusField, activeHelpStep, deleteOpen, requestRemove,
  }
}
