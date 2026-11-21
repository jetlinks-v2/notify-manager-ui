import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TreeProps } from 'ant-design-vue'
import { useWindowSize } from '@vueuse/core'
import { onlyMessage } from '@jetlinks-web/utils'
import { useAuthStore } from '@jetlinks-web-core/store/auth'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
import { useSystemStore } from '@jetlinks-web-core/store/system'
import { findNotificationChannel, resolveNotificationChannel, notificationChannelLabels, notificationNavigationTarget, notificationPermissions, notificationQuery, normalizeNotificationNavigation, type NotificationChannel, type NotificationNavigation } from '../shared'
import { useChannelWorkspace, type ChannelFieldChange } from './useChannelWorkspace'
import { useChannelCatalog } from './useChannelCatalog'
import { useChannelTest } from './testing/useChannelTest'
import { channelTestSettingsKinds } from './testing/channelTestConfig'
import { channelTestAdapters } from './testing/channelTestAdapter'
import { useWechatMembers, type MemberFilterTerm, type MemberStatusFilter } from './members/useWechatMembers'
import type { WechatMembersDrawerModel } from './members/useWechatMembersDrawer'
import { useChannelLeaveGuard } from './useChannelLeaveGuard'
import { channelHelp, channelHelpSection } from './configuration/channelHelp'
import { classifyNotificationFailure, notificationFailureMessage } from '../../../../api/notice/messageNotificationState'
import { useChannelConfigurations } from './configuration/useChannelConfigurations'
import { dingTalkWorkChannel } from './templateSetup/templateDefaults'
import { useChannelTemplateSetup } from './templateSetup/useChannelTemplateSetup'
import { wechatCorpChannel } from './wechat/templateDefaults'
import { useWorkRecipients } from './members/useWorkRecipients'
import { isWorkChannel, workRecipientsKey } from '../shared/workRecipients'
import { dingTalkMemberApi, wechatMemberApi } from '../../../../api/notice/wechatMembers'

/** Own backend directory, routing, permissions and draft effects outside rendering components. */
export function useChannelsPage() {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const system = useSystemStore()
  const { width } = useWindowSize()
  const isNarrow = computed(() => width.value < 768)
  const auth = useAuthStore()
  const menu = useMenuStore()
  // Trial permissions must react to session/role changes; usePermission with a fixed code is a snapshot.
  const permissions = {
    query: computed(() => auth.hasPermission(notificationPermissions.channels.query)),
    // Always-visible editors must react when authorization changes after the page was opened.
    add: computed(() => auth.hasPermission(notificationPermissions.channels.add)),
    update: computed(() => auth.hasPermission(notificationPermissions.channels.update)),
    delete: computed(() => auth.hasPermission(notificationPermissions.channels.delete)),
    action: computed(() => auth.hasPermission(notificationPermissions.channels.action)),
    bind: computed(() => auth.hasPermission(notificationPermissions.channels.bind)),
  }
  const canQuery = permissions.query
  const catalog = useChannelCatalog(canQuery)
  const { channelTitle, typeTitle, providerTitle } = notificationChannelLabels(t)
  const channelSearch = ref('')
  const channelTree = computed(() => catalog.types.value.map(type => {
    const items = catalog.channels.value.filter(item => item.type === type.id)
    const nested = items.length !== 1 || type.id === 'dingTalk'
    const leaf = (item: NotificationChannel) => ({ key: item.id, type: type.id, title: nested ? providerTitle(item) : typeTitle(type.id, type.name), count: catalog.count(item), multipleConfigurations: !!item.multipleConfigurations, children: [] })
    return nested ? { key: `type:${type.id}`, type: type.id, title: typeTitle(type.id, type.name), count: undefined, children: items.map(leaf) } : leaf(items[0])
  }))
  const channelOptions = computed(() => channelTree.value.flatMap(node => {
    if (node.children.length) return node.children.map(child => ({ value: child.key, label: `${node.title} · ${child.title}` }))
    return node.key === `type:${node.type}` ? [] : [{ value: node.key, label: node.title }]
  }))
  const filteredChannelTree = computed(() => {
    const keyword = channelSearch.value.trim().toLocaleLowerCase()
    return channelTree.value.flatMap(node => {
      if (!keyword || node.title.toLocaleLowerCase().includes(keyword)) return [node]
      const children = node.children.filter(child => child.title.toLocaleLowerCase().includes(keyword))
      return children.length ? [{ ...node, children }] : []
    })
  })
  const openChannelKeys = ref<string[]>(['type:dingTalk'])
  watch(channelSearch, keyword => { if (keyword.trim()) openChannelKeys.value = channelTree.value.filter(node => node.children.length).map(node => node.key) })
  const providerFeedback = computed(() => catalog.types.value.flatMap(type => {
    const status = catalog.providerStates.get(type.id)
    return status && !['ready', 'loading'].includes(status) ? [{ id: type.id, name: typeTitle(type.id, type.name), state: status }] : []
  }))
  const directoryState = catalog.state
  function navigate(navigation: NotificationNavigation) { return router.replace({ query: notificationQuery(navigation, route.query, catalog.channels.value) }) }
  const trial = useChannelTest()
  const members = useWechatMembers()
  const sending = trial.sending
  const fillingTemplates = ref(false)
  const recipientsBusy = ref(false)
  const workspaceBlocked = computed(() => sending.value || members.busy.value || fillingTemplates.value)
  const externalBusy = computed(() => workspaceBlocked.value || recipientsBusy.value)
  const workspace = useChannelWorkspace({
    permissions, navigate, blocked: workspaceBlocked, channels: catalog.channels, loadConfigs: catalog.loadConfigs,
    loadDefinition: catalog.loadDefinition, channelName: channelTitle,
    onMutationError: error => onlyMessage(notificationFailureMessage(error) || t(`messageNotification.state.${classifyNotificationFailure(error)}`), 'error'),
  })
  const { channelId, channel, multipleConfigurations, configs, state, detailState, entry, selectedConfigId, busy, dirty, hasUnsavedChanges, canEdit, editing } = workspace
  const configurationPending = ref(false)
  const operationBusy = computed(() => busy.value || externalBusy.value || configurationPending.value)
  const canFillTemplates = computed(() => canQuery.value
    && auth.hasPermission(notificationPermissions.templates.query)
    && (auth.hasPermission(notificationPermissions.templates.add) || auth.hasPermission(notificationPermissions.templates.update)))
  const workChannel = computed(() => isWorkChannel(channelId.value))
  const canManageWork = computed(() => workChannel.value && permissions.query.value && permissions.bind.value && permissions.update.value
    && auth.hasPermission(notificationPermissions.templates.query) && auth.hasPermission(notificationPermissions.templates.update)
    && !!entry.value?.baseline?.id && !entry.value.isNew && !dirty.value)
  const workRecipients = useWorkRecipients({
    config: () => entry.value?.baseline, channelId, canWrite: canManageWork, busy: recipientsBusy,
    saveSetting: (value, baseline) => workspace.saveFields([{ key: workRecipientsKey, value }], workRecipientsKey, baseline),
  })
  const templateSetup = useChannelTemplateSetup(workspace, {
    channel, permitted: canFillTemplates, blocked: operationBusy, generating: fillingTemplates, translate: t,
  })
  const configurationList = useChannelConfigurations({
    workspace, permissions, blocked: operationBusy, pending: configurationPending, test: showSend,
    prepareTemplates: templateSetup.prepareForSave,
    saved: fillSavedTemplates,
    fillTemplates: id => templateSetup.fill(id),
  })
  const canFillConfigurationTemplates = computed(() => canFillTemplates.value && permissions.update.value)
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
  const { leaveOpen, decideLeave } = useChannelLeaveGuard(computed(() => hasUnsavedChanges.value || members.dirty.value || workRecipients.groupDirty.value), operationBusy)
  // The dialog reports missing prerequisites for any supported channel.
  const trialSupported = computed(() => !!channelTestAdapters[channelId.value])
  const canTrial = computed(() => trialSupported.value && canQuery.value && permissions.action.value && !!entry.value?.baseline?.id && !entry.value?.isNew && !dirty.value && configurationVisible.value)
  const canSyncMembers = computed(() => canQuery.value && permissions.bind.value && workChannel.value && (!workRecipients.enabled.value || canManageWork.value) && !!entry.value?.baseline?.id && !entry.value?.isNew && !dirty.value)
  const memberDrawer = computed<WechatMembersDrawerModel>(() => ({
    open: members.open.value, state: members.state.value, busy: members.busy.value, autoMatching: members.autoMatching.value, error: members.error.value,
    saved: members.saved.value, refreshRequired: members.refreshRequired.value, dirty: members.dirty.value, canSave: members.canSave.value,
    departments: members.departments.value, rows: members.visibleRows.value, members: members.members.value,
    filterTerms: members.filterTerms.value,
    pendingCount: members.rows.value.filter(row => row.memberId && row.memberId !== row.binding?.thirdPartyUserId).length,
    canAutoMatch: canSyncMembers.value && !operationBusy.value && !workRecipients.open.value && (members.open.value ? members.canAutoMatch.value : members.canAutoMatchAndSave.value),
    stats: members.stats.value, filterCounts: members.filterCounts.value, statusFilter: members.statusFilter.value, matchCount: members.matchCount.value,
    memberUnavailable: members.memberUnavailable,
  }))
  const memberDiscardOpen = ref(false)
  let memberAfterDiscard: (() => void) | undefined
  function withMemberDiscard(action: () => void, dirty = members.dirty.value) {
    if (members.busy.value || recipientsBusy.value) return
    if (!dirty) { action(); return }
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
  function reloadMembers() {
    // The closed manager has only automatic suggestions; recovery must not describe a completed write as unsaved.
    if (!members.open.value && members.refreshRequired.value) { void members.reload(); return }
    withMemberDiscard(() => { void members.reload() })
  }
  function closeWorkRecipients() { withMemberDiscard(() => workRecipients.close(), workRecipients.groupDirty.value) }
  function reloadWorkRecipients() {
    withMemberDiscard(() => { void workRecipients.reload() }, workRecipients.groupDirty.value)
  }
  function memberContext(id: string) {
    return {
      configId: id, api: channelId.value === dingTalkWorkChannel ? dingTalkMemberApi : wechatMemberApi,
      permitted: () => canSyncMembers.value,
      clean: () => !dirty.value && !entry.value?.isNew && entry.value?.baseline?.id === id,
    }
  }
  async function showMembers() {
    if (!canSyncMembers.value || operationBusy.value || workRecipients.open.value || members.state.value === 'loading') return
    const id = entry.value!.baseline!.id
    await members.show(memberContext(id))
  }
  async function autoMatchMembers() {
    if (!canSyncMembers.value || operationBusy.value || workRecipients.open.value) return false
    return afterMemberWrite(members.autoMatchAndSave())
  }
  async function afterMemberWrite(write: Promise<boolean>) {
    const configId = selectedConfigId.value
    const success = await write
    if (success && configId === selectedConfigId.value && canManageWork.value) await workRecipients.retry()
    return success
  }
  function updateMemberFilters(value: MemberFilterTerm[]) { if (!members.busy.value) members.filterTerms.value = value }
  function updateMemberStatus(value: MemberStatusFilter) { members.statusFilter.value = value }
  function resetMemberFilters() { members.filterTerms.value = [] }
  const help = computed(() => channelHelp(channel.value, entry.value?.definition, t, entry.value?.draft.configuration))
  const focusedField = ref('')
  const helpFocusVersion = ref(0)
  const activeHelpSection = computed(() => channelHelpSection(help.value, focusedField.value))
  function focusField(key: string) { focusedField.value = key; helpFocusVersion.value++ }

  // Directory availability precedes route normalization; only the retired official-account link has a replacement.
  watch(canQuery, () => { workspace.clear(); void catalog.reload() }, { immediate: true })
  watch([() => route.query, catalog.state, catalog.channels, catalog.configState, externalBusy, busy], ([query]) => {
    if (!canQuery.value || catalog.state.value !== 'ready' || operationBusy.value) return
    const requestedId = Array.isArray(query.channel) ? query.channel[0] : query.channel
    // A retired provider's config ID must never be applied to the corporate account editor.
    if (requestedId === 'weixin:officialMessage' && findNotificationChannel('weixin:corpMessage', catalog.channels.value)) {
      void navigate({ channel: 'weixin:corpMessage' })
      return
    }
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
  async function save() {
    if (operationBusy.value) return
    const savedChannel = channelId.value
    const configId = entry.value?.draft.id?.trim()
    const created = !!entry.value?.isNew
    const credentialsOnly = templateSetup.model.value.saveCredentialsFirst
    if (!templateSetup.prepareForSave()) return
    if (!await workspace.save()) return
    onlyMessage(t('messageNotification.channels.saveSuccess'), 'success')
    if (configId && !credentialsOnly) await fillSavedTemplates(savedChannel, configId, created)
  }
  async function fillSavedTemplates(savedChannel: string, id: string, created: boolean) {
    if (channelId.value !== savedChannel || selectedConfigId.value !== id) return
    await templateSetup.fill(id, () => (created ? permissions.add : permissions.update).value)
  }
  function viewMessageTemplates() {
    if (!canFillTemplates.value || operationBusy.value || !selectedConfigId.value) return
    const target = notificationNavigationTarget('templates', {
      channel: channelId.value, configId: selectedConfigId.value,
    })
    void menu.jumpPage(target.name, target.options)
  }
  async function saveFields(changes: ChannelFieldChange[], errorPath: string) {
    const ok = await workspace.saveFields(changes, errorPath)
    if (ok) onlyMessage(t('messageNotification.channels.saveSuccess'), 'success')
    return ok
  }
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
      : [dingTalkWorkChannel, wechatCorpChannel].includes(channelId.value) ? 'agentId'
        : channelId.value === 'email:embedded' ? 'host' : 'url'
    pendingTestField.value = { configId: selectedConfigId.value || '', key }
    trial.close()
  }
  /** Open the complete draft after the test dialog closes; fixing a test setting never writes on blur. */
  function afterTestClosed() {
    const target = pendingTestField.value
    pendingTestField.value = undefined
    if (!target || target.configId !== selectedConfigId.value || !canEdit.value || operationBusy.value) return
    if (multipleConfigurations.value) { configurationList.editSelected(); return }
    focusField(target.key)
  }
  // External navigation can change the target while the workspace is locked by a pending send.
  watch([() => route.query.channel, () => route.query.ch, () => route.query.configId], () => trial.close(true))
  // A refreshed saved configuration invalidates the snapshot used by an open test.
  watch(() => entry.value?.baseline, () => trial.close(true))
  watch([channelId, selectedConfigId], () => { trial.close(true); members.close(true); workRecipients.close(true); decideMemberDiscard(false); focusedField.value = '' })
  watch([canQuery, permissions.bind], ([query, bind]) => { if (!query || !bind) { members.close(true); decideMemberDiscard(false) } })
  watch([canManageWork, selectedConfigId], ([allowed]) => {
    if (allowed) workRecipients.prepare()
    else workRecipients.close(true)
  })
  // A saved, readable configuration owns the summary; this read never creates suggestions or writes.
  watch([canSyncMembers, () => entry.value?.baseline, busy, detailState], () => {
    if (!canSyncMembers.value) { members.close(true); return }
    if (operationBusy.value || detailState.value !== 'ready' || members.state.value !== 'idle') return
    const id = entry.value!.baseline!.id
    void members.prepare(memberContext(id))
  })
  watch([canQuery, permissions.action], ([query, send]) => { if (!query || !send) trial.close(true) })
  onBeforeUnmount(() => { trial.close(true); members.close(true); workRecipients.close(true) })
  watch(channel, value => {
    const key = `type:${value?.type}`
    if (value && channelTree.value.some(node => node.key === key) && !openChannelKeys.value.includes(key)) openChannelKeys.value.push(key)
  })

  return {
    templateSetup, templateSetupModel: templateSetup.model, fillingTemplates, viewMessageTemplates, canFillConfigurationTemplates,
    configurationList, isRobot: configurationList.isRobot, configurationRows: configurationList.rows, configurationModal: configurationList.modal,
    configurationCanAdd: configurationList.canAdd, configurationCanDelete: permissions.delete, configurationDeleteTarget: configurationList.deleteTarget,
    t, notificationPermissions, isNarrow, channelOptions, channelSearch, filteredChannelTree, openChannelKeys, selectChannel,
    canQuery, channelId, channel, multipleConfigurations, configs, state, detailState, entry, selectedConfigId,
    busy, dirty, canEdit, editing, operationBusy, trialSupported, canTrial, leaveOpen, decideLeave,
    sending, workspace, trial, testModel: trial.model, fixTestConfiguration, afterTestClosed, refresh, save, showSend, configurationVisible,
    catalog, directoryState, providerFeedback, channelTitle, help, saveFields, focusField, activeHelpSection, helpFocusVersion,
    workChannel, canManageWork, workRecipients, closeWorkRecipients, reloadWorkRecipients,
    saveMembers: () => afterMemberWrite(members.save()), unbindMember: (id: string) => afterMemberWrite(members.unbind(id)),
    members, memberDrawer, canSyncMembers, showMembers, autoMatchMembers, closeMembers, reloadMembers, memberDiscardOpen, decideMemberDiscard, updateMemberFilters, updateMemberStatus, resetMemberFilters,
  }
}
