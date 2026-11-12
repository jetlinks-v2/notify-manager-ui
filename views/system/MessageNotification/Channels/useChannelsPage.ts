import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TreeProps } from 'ant-design-vue'
import { usePermission } from '@jetlinks-web/hooks'
import { useWindowSize } from '@vueuse/core'
import { onlyMessage } from '@jetlinks-web/utils'
import { useAuthStore } from '@jetlinks-web-core/store/auth'
import { useSystemStore } from '@jetlinks-web-core/store/system'
import { findNotificationChannel, resolveNotificationChannel, notificationPermissions, notificationQuery, normalizeNotificationNavigation, type NotificationChannel, type NotificationNavigation } from '../shared'
import { useChannelWorkspace, type ChannelFieldChange } from './useChannelWorkspace'
import { useChannelCatalog } from './useChannelCatalog'
import { useChannelTest } from './testing/useChannelTest'
import { channelTestSettingsKinds } from './testing/channelTestConfig'
import { channelTestAdapters } from './testing/channelTestAdapter'
import { useWechatMembers, type MemberStatusFilter } from './members/useWechatMembers'
import type { WechatMembersDrawerModel } from './members/useWechatMembersDrawer'
import { useChannelLeaveGuard } from './useChannelLeaveGuard'
import { channelHelp, channelHelpStep } from './configuration/channelHelp'
import { classifyNotificationFailure, notificationFailureMessage } from '../../../../api/notice/messageNotificationState'
import { useWebhookPreview } from './webhook/useWebhookPreview'

/** Own backend directory, routing, permissions and draft effects outside rendering components. */
export function useChannelsPage() {
  const { t, te } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const system = useSystemStore()
  const configurationPanel = ref<{ editField: (key: string) => void }>()
  const { width } = useWindowSize()
  const isNarrow = computed(() => width.value < 768)
  const auth = useAuthStore()
  // Trial permissions must react to session/role changes; usePermission with a fixed code is a snapshot.
  const permissions = {
    query: computed(() => auth.hasPermission(notificationPermissions.channels.query)),
    add: usePermission(notificationPermissions.channels.add).hasPerm,
    update: usePermission(notificationPermissions.channels.update).hasPerm,
    delete: usePermission(notificationPermissions.channels.delete).hasPerm,
    action: computed(() => auth.hasPermission(notificationPermissions.channels.action)),
    bind: usePermission(notificationPermissions.channels.bind).hasPerm,
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
  const members = useWechatMembers()
  const sending = trial.sending
  const externalBusy = computed(() => sending.value || members.busy.value)
  const workspace = useChannelWorkspace({
    permissions, navigate, blocked: externalBusy, channels: catalog.channels, loadConfigs: catalog.loadConfigs,
    loadDefinition: catalog.loadDefinition, channelName: channelTitle,
    onMutationError: error => onlyMessage(notificationFailureMessage(error) || t(`messageNotification.state.${classifyNotificationFailure(error)}`), 'error'),
  })
  const { channelId, channel, multipleConfigurations, configs, state, detailState, entry, selectedConfigId, busy, dirty, hasUnsavedChanges, canEdit } = workspace
  const operationBusy = computed(() => busy.value || externalBusy.value)
  const deleteOpen = ref(false)
  const clearChannelName = computed(() => {
    if (!channel.value) return ''
    if (!findNotificationChannel(channelId.value) || ['weixin:corpMessage', 'dingTalk:dingTalkRobotWebHook'].includes(channelId.value)) return channelTitle(channel.value)
    // The confirmation names the notification method, matching personal settings rather than the vendor.
    return t(`messageNotification.records.type.${channel.value.type}`)
  })
  const clearMessage = computed(() => {
    const id = channelId.value
    if (id === 'dingTalk:dingTalkRobotWebHook') return t('messageNotification.channels.clearRobotMessage')
    if (id === 'webhook:http') return t('messageNotification.channels.clearWebhookMessage')
    if (!channel.value || !['email:embedded', 'sms:aliyunSms', 'voice:aliyun', 'dingTalk:dingTalkMessage', 'weixin:corpMessage'].includes(id)) return t('messageNotification.channels.confirmDelete')
    // Legacy installations may have several configurations; clearing one cannot disable the whole channel.
    const impact = t(configs.value.length > 1 ? 'messageNotification.channels.clearSharedMessage' : 'messageNotification.channels.clearNotificationMessage', { channel: clearChannelName.value })
    return ['dingTalk:dingTalkMessage', 'weixin:corpMessage'].includes(id)
      ? `${impact} ${t('messageNotification.channels.clearMembersMessage')}` : impact
  })
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
  const webhookPreviewModel = useWebhookPreview(entry, t)
  const { leaveOpen, decideLeave } = useChannelLeaveGuard(computed(() => hasUnsavedChanges.value || members.dirty.value), operationBusy)
  const trialSupported = computed(() => !!channelTestAdapters[channelId.value])
  const canTrial = computed(() => trialSupported.value && canQuery.value && permissions.action.value && !!entry.value?.baseline?.id && !entry.value?.isNew && !dirty.value && configurationVisible.value)
  const canSyncMembers = computed(() => canQuery.value && permissions.bind.value && channelId.value === 'weixin:corpMessage' && !!entry.value?.baseline?.id && !entry.value?.isNew && !dirty.value)
  const configurationOptions = computed(() => configs.value.map(item => ({ value: item.id, label: `${item.name} · ${item.id}` })))
  const memberDrawer = computed<WechatMembersDrawerModel>(() => ({
    open: members.open.value, state: members.state.value, busy: members.busy.value, error: members.error.value,
    saved: members.saved.value, refreshRequired: members.refreshRequired.value, dirty: members.dirty.value, canSave: members.canSave.value,
    departments: members.departments.value, rows: members.visibleRows.value, users: members.users.value,
    departmentId: members.departmentId.value, search: members.search.value,
    pendingCount: members.rows.value.filter(row => row.userId && row.userId !== row.binding?.userId).length,
    canAutoMatch: canSyncMembers.value && !operationBusy.value && members.canAutoMatch.value,
    stats: members.stats.value, filterCounts: members.filterCounts.value, statusFilter: members.statusFilter.value, matchCount: members.matchCount.value,
    userUnavailable: members.userUnavailable,
  }))
  const memberDiscardOpen = ref(false)
  let memberAfterDiscard: (() => void) | undefined
  function withMemberDiscard(action: () => void) {
    if (members.busy.value) return
    if (!members.dirty.value) { action(); return }
    memberAfterDiscard = action
    memberDiscardOpen.value = true
  }
  function decideMemberDiscard(discard: boolean) {
    memberDiscardOpen.value = false
    const action = memberAfterDiscard
    memberAfterDiscard = undefined
    if (discard) action?.()
  }
  function closeMembers() { withMemberDiscard(() => members.close()) }
  function reloadMembers() { withMemberDiscard(() => { void members.reload() }) }
  async function showMembers(automatic = false) {
    if (!canSyncMembers.value || operationBusy.value || members.state.value === 'loading') return
    const id = entry.value!.baseline!.id
    await members.show({ configId: id, permitted: () => canQuery.value && permissions.bind.value, clean: () => !dirty.value && !entry.value?.isNew && entry.value?.baseline?.id === id })
    if (automatic && members.open.value && members.configId.value === id) members.autoMatch()
  }
  function updateMemberDepartment(value: string) { members.departmentId.value = value }
  function updateMemberSearch(value: string) { members.search.value = value }
  function updateMemberStatus(value: MemberStatusFilter) { members.statusFilter.value = value }
  function resetMemberFilters() { members.departmentId.value = ''; members.search.value = ''; members.statusFilter.value = 'all' }
  const helpChoices = reactive(new Map<string, boolean>())
  const helpOpen = computed(() => helpChoices.get(channelId.value) ?? true)
  const help = computed(() => channelHelp(channel.value, entry.value?.definition, t))
  const focusedField = ref('')
  const activeHelpStep = computed(() => channelHelpStep(channel.value, entry.value?.definition, focusedField.value))
  function focusField(key: string) { focusedField.value = key }
  function toggleHelp(value = !helpOpen.value) { helpChoices.set(channelId.value, value) }

  // Directory availability precedes route normalization; unknown links never silently select another provider.
  watch(canQuery, () => { workspace.clear(); void catalog.reload() }, { immediate: true })
  watch([() => route.query, catalog.state, catalog.channels, catalog.configState, externalBusy, busy], ([query]) => {
    if (!canQuery.value || catalog.state.value !== 'ready' || operationBusy.value) return
    const navigation = normalizeNotificationNavigation(query, catalog.channels.value)
    // 个人中心只有真实通知器 ID 时，由当前权限内的配置确定提供商，不猜成同类型首项。
    const configOnly = !!navigation.configId && !query.channel && !query.ch
    if (configOnly) {
      if (catalog.configState.value === 'idle') void catalog.loadConfigs().catch(() => undefined)
      if (['idle', 'loading'].includes(catalog.configState.value)) { state.value = 'loading'; return }
      if (catalog.configState.value !== 'ready') { state.value = catalog.configState.value; return }
    }
    const linkedConfig = catalog.configs.value.find(config => config.id === navigation.configId)
    const linkedChannel = linkedConfig && resolveNotificationChannel(linkedConfig.type, linkedConfig.provider, catalog.channels.value)?.id
    const requestedChannel = navigation.channel ?? (query.channel || query.ch ? '' : navigation.configId ? linkedChannel || '' : catalog.channels.value[0]?.id || '')
    if (configOnly || requestedChannel !== channelId.value || navigation.configId !== selectedConfigId.value || ['idle', 'forbidden'].includes(state.value)) {
      void workspace.activate(requestedChannel, navigation.configId)
    }
  }, { immediate: true })

  /** Retry the failed boundary; successful writes refresh only reads, never replay mutations. */
  async function refresh() {
    if (operationBusy.value) return
    if (!['ready', 'empty'].includes(catalog.state.value)) { await catalog.reload(); return }
    if (route.query.configId && !route.query.channel && !route.query.ch && catalog.configState.value !== 'ready') {
      await catalog.loadConfigs(true).catch(() => undefined)
      return
    }
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
    if (sending.value) return
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
  // External navigation can change the target while the workspace is locked by a pending send.
  watch([() => route.query.channel, () => route.query.ch, () => route.query.configId], () => trial.close(true))
  // A refreshed saved configuration invalidates the snapshot used by an open test.
  watch(() => entry.value?.baseline, () => trial.close(true))
  watch([channelId, selectedConfigId], () => { trial.close(true); members.close(true); decideMemberDiscard(false); deleteOpen.value = false; focusedField.value = '' })
  watch([canQuery, permissions.bind], ([query, bind]) => { if (!query || !bind) { members.close(true); decideMemberDiscard(false) } })
  // A saved, readable configuration owns the summary; this read never creates suggestions or writes.
  watch([canSyncMembers, () => entry.value?.baseline, busy, detailState], () => {
    if (!canSyncMembers.value) { members.close(true); return }
    if (operationBusy.value || detailState.value !== 'ready' || members.state.value !== 'idle') return
    const id = entry.value!.baseline!.id
    void members.prepare({ configId: id, permitted: () => canQuery.value && permissions.bind.value, clean: () => !dirty.value && !entry.value?.isNew && entry.value?.baseline?.id === id })
  })
  watch([canQuery, permissions.action], ([query, send]) => { if (!query || !send) trial.close(true) })
  onBeforeUnmount(() => { trial.close(true); members.close(true) })
  watch(channel, value => {
    const key = `type:${value?.type}`
    if (value && channelTree.value.some(node => node.key === key) && !openChannelKeys.value.includes(key)) openChannelKeys.value.push(key)
  })

  return {
    webhookPreviewModel,
    t, notificationPermissions, isNarrow, channelOptions, channelSearch, filteredChannelTree, openChannelKeys, selectChannel, configurationOptions,
    canQuery, channelId, channel, multipleConfigurations, configs, state, detailState, entry, selectedConfigId,
    busy, dirty, canEdit, operationBusy, trialSupported, canTrial, leaveOpen, decideLeave, configurationPanel,
    sending, workspace, trial, testModel: trial.model, fixTestConfiguration, afterTestClosed, refresh, save, remove, showSend, configurationVisible,
    catalog, directoryState, providerFeedback, channelTitle, help, helpOpen, toggleHelp, saveFields, focusField, activeHelpStep, deleteOpen, clearChannelName, clearMessage, requestRemove,
    members, memberDrawer, canSyncMembers, showMembers, closeMembers, reloadMembers, memberDiscardOpen, decideMemberDiscard, updateMemberDepartment, updateMemberSearch, updateMemberStatus, resetMemberFilters,
  }
}
