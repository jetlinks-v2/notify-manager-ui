import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePermission } from '@jetlinks-web/hooks'
import { useWindowSize } from '@vueuse/core'
import { onlyMessage } from '@jetlinks-web/utils'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
import { notificationChannels, notificationNavigationTarget, notificationPermissions, notificationQuery, normalizeNotificationNavigation, type NotificationNavigation } from '../shared'
import { useChannelWorkspace } from './useChannelWorkspace'
import { useChannelSend } from './useChannelSend'
import { useChannelLeaveGuard } from './useChannelLeaveGuard'
import type { ChannelSendDrawerModel } from './useChannelSendDrawer'

/** Own routing, permissions and effects outside the channel rendering components. */
export function useChannelsPage() {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const menu = useMenuStore()
  const { width } = useWindowSize()
  const isNarrow = computed(() => width.value < 768)
  const channelOptions = computed(() => notificationChannels.map(item => ({ value: item.id, label: t(item.labelKey) })))
  const channelGroups = ['instant', 'telephone', 'integration'].map(id => ({ id, items: notificationChannels.filter(item => item.group === id) }))
  const permissions = {
    query: usePermission(notificationPermissions.channels.query).hasPerm,
    add: usePermission(notificationPermissions.channels.add).hasPerm,
    update: usePermission(notificationPermissions.channels.update).hasPerm,
    delete: usePermission(notificationPermissions.channels.delete).hasPerm,
    action: usePermission(notificationPermissions.channels.action).hasPerm,
  }
  const canQuery = permissions.query
  const canViewTemplates = usePermission(notificationPermissions.templates.query).hasPerm

  function navigate(navigation: NotificationNavigation) { void router.replace({ query: notificationQuery(navigation, route.query) }) }
  const trial = useChannelSend()
  const workspace = useChannelWorkspace({ permissions, navigate, blocked: trial.sending })
  const { channelId, channel, configs, state, detailState, entry, selectedConfigId, busy, dirty, hasUnsavedChanges, canEdit } = workspace
  const operationBusy = computed(() => busy.value || trial.sending.value)
  // 工具栏移出滚动区后，仍只在配置正文可用时展示其关联操作。
  const configurationVisible = computed(() => !!entry.value && ![state.value, detailState.value].some(value => ['loading', 'unavailable', 'forbidden', 'error'].includes(value)))
  const { leaveOpen, decideLeave } = useChannelLeaveGuard(hasUnsavedChanges, operationBusy)
  const canTrial = computed(() => canQuery.value && canViewTemplates.value && permissions.action.value && !!entry.value?.baseline?.id && !entry.value?.isNew && !dirty.value && channel.value?.id === 'email:embedded')
  const configurationOptions = computed(() => configs.value.map(item => ({ value: item.id, label: `${item.name} · ${item.id}` })))
  const sendDrawer = computed<ChannelSendDrawerModel>(() => ({
    open: trial.open.value, configId: trial.configId.value, state: trial.state.value,
    templates: trial.templates.value, selected: trial.selected.value, parameters: trial.parameters.value,
    invalidParameters: trial.invalidParameters.value, missing: trial.missing.value,
    sending: trial.sending.value, sent: trial.sent.value, error: trial.error.value, canSend: trial.canSend.value,
  }))
  let initialized = false

  // Router updates produced by this workspace do not repeat the same list/detail requests.
  watch([() => route.query, canQuery, trial.sending], ([query]) => {
    const navigation = normalizeNotificationNavigation(query)
    const requestedChannel = navigation.channel ?? (query.channel || query.ch ? '' : notificationChannels[0].id)
    if (!initialized || requestedChannel !== channelId.value || navigation.configId !== selectedConfigId.value || !canQuery.value || state.value === 'forbidden') {
      initialized = true
      void workspace.activate(requestedChannel, navigation.configId)
    }
  }, { immediate: true })

  function refresh() { void workspace.activate(channelId.value, selectedConfigId.value) }
  async function save() { if (await workspace.save()) onlyMessage(t('messageNotification.channels.saveSuccess'), 'success') }
  async function remove() { if (await workspace.deleteConfig()) onlyMessage(t('messageNotification.channels.deleteSuccess'), 'success') }
  function goTemplates() {
    if (!entry.value?.baseline?.id || !canViewTemplates.value) return
    const target = notificationNavigationTarget('templates', { channel: channelId.value, configId: entry.value.baseline.id })
    void menu.jumpPage(target.name, target.options)
  }
  function showSend() {
    if (!canTrial.value || !channel.value || !entry.value?.baseline?.id) return
    const id = entry.value.baseline.id
    void trial.show({ channel: channel.value, configId: id, permitted: () => permissions.query.value && canViewTemplates.value && permissions.action.value, clean: () => !dirty.value && !entry.value?.isNew && entry.value?.baseline?.id === id })
  }
  function updateSendParameters(value: string) { trial.parameters.value = value }

  watch([channelId, selectedConfigId], () => trial.close())

  return {
    t, notificationPermissions, isNarrow, channelOptions, channelGroups, configurationOptions,
    canQuery, canViewTemplates, channelId, channel, state, detailState, entry, selectedConfigId,
    busy, dirty, canEdit, operationBusy, canTrial, leaveOpen, decideLeave, sendDrawer,
    sending: trial.sending, workspace, trial, refresh, save, remove, goTemplates, showSend, updateSendParameters, configurationVisible,
  }
}
