import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import type { LocationQueryRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePermission } from '@jetlinks-web/hooks'
import { onlyMessage } from '@jetlinks-web/utils'
import { useMediaQuery } from '@vueuse/core'
import { useNotificationConfigNavigation } from '@jetlinks-web-core/hooks/useNotificationConfigNavigation'
import { useAuthStore } from '@jetlinks-web-core/store/auth'
import { messageNotificationApi } from '../../../../../api/notice/messageNotification'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import {
  notificationConfigurationChange, notificationPermissions, notificationQuery,
  classifyNotificationFailure, normalizeNotificationNavigation, usesBusinessChannelKey,
} from '../../shared'
import { TemplateValidationError } from '../model'
import { buildTemplateDirectory, flattenTemplateDirectory, templateBusinessKey } from '../templateDirectoryModel'
import { useTemplateWorkspace } from '../useTemplateWorkspace'
import { hasInsideMailChannel, useTemplateBusinessDirectory } from './useTemplateBusinessDirectory'
import { useTemplateBusinessNavigation } from './useTemplateBusinessNavigation'

const identity = (business?: NoticeChannelConfig) => business?.id || business?.providerId || business?.provider || ''
const queryText = (value: unknown) => typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : ''

/** 业务决定编辑对象，渠道决定提供商；路由只同步明确身份，不用模板列表首项猜业务。 */
export function useTemplatePage() {
  const { t } = useI18n()
  const compact = useMediaQuery('(max-width: 768px)')
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()
  const { hasPerm: canQuery } = usePermission(ref(notificationPermissions.templates.query))
  const { hasPerm: canAdd } = usePermission(ref(notificationPermissions.templates.add))
  const canUpdate = computed(() => auth.hasPermission(notificationPermissions.templates.update))
  const { hasPerm: canQueryConfig } = usePermission(ref(notificationPermissions.channels.query))
  const canManage = computed(() => canQuery.value && (canAdd.value || canUpdate.value))
  const directory = useTemplateBusinessDirectory(canManage)
  const workspace = useTemplateWorkspace({ query: canQuery, add: canAdd, update: canUpdate }, messageNotificationApi, t)
  const { channelId, templates, draft, business, channels, detailState, listState, saving } = workspace
  const businessNavigation = useTemplateBusinessNavigation(computed(() => route.query), directory.businessTypes, directory.directoryState, channels)
  const configurationNavigation = useNotificationConfigNavigation(() => workspace.refreshConfigs(), 'system/MessageNotification/Channels')
  const canConfigure = computed(() => canQueryConfig.value && configurationNavigation.available.value)
  const fillingInsideMail = ref(false)
  const businessActionState = ref('idle')
  const selectedBusinessId = computed(() => identity(business.value))
  const canFillInsideMail = computed(() => Boolean(canQuery.value && canUpdate.value && directory.insideMailChannel.value
    && business.value?.id && !hasInsideMailChannel(business.value)))
  const uploading = ref(false)
  const editing = ref(false)
  const initialized = ref(false)
  const selectionUnavailable = ref(false)
  const validationMessage = ref('')
  const confirmation = reactive({ open: false })
  const busy = computed(() => saving.value || uploading.value || fillingInsideMail.value)
  const pendingChannelRefresh = ref('')
  const navigation = computed(() => normalizeNotificationNavigation(route.query, channels.value))
  const activeConfigId = computed(() => workspace.entry.value?.businessConfigId === '' ? undefined
    : draft.value?.configId || navigation.value.configId || workspace.configurationsByChannel.value[channelId.value]?.[0]?.id)
  const directoryConfigId = computed(() => usesBusinessChannelKey(channelId.value) ? activeConfigId.value || '' : undefined)
  const directoryNodes = computed(() => flattenTemplateDirectory(buildTemplateDirectory(templates.value, directory.businessTypes.value,
    { other: t('messageNotification.templates.otherGroup') }, t, directoryConfigId.value)))
  const channelOptions = computed(() => channels.value.map(channel => ({ value: channel.id, label: channel.labelKey ? t(channel.labelKey) : channel.name || channel.id })))
  const templateOptions = computed(() => directoryNodes.value.filter(node => node.kind === 'business').map(node => ({ value: node.key, label: node.title })))
  const importOptions = computed(() => templates.value.map(item => ({ value: item.id, label: `${item.name} (${item.id})` })))
  const selectedDirectoryKey = computed(() => business.value ? templateBusinessKey(business.value) : workspace.activeKey.value)
  const selectedTemplateId = selectedDirectoryKey
  const title = computed(() => business.value?.name || draft.value?.name || t('messageNotification.templates.title'))
  const description = computed(() => String(business.value?.description || draft.value?.description || ''))
  const activeConfig = computed(() => workspace.configs.value.find(config => config.id === draft.value?.configId))
  const templateStatus = computed(() => {
    if (!draft.value) return
    if (workspace.dirty.value) return 'unsaved'
    if (workspace.isDefault.value) return 'defaultContent'
    return workspace.entry.value?.existing ? 'configured' : 'unconfigured'
  })
  const listFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(workspace.catalogState.value))
  const feedbackState = computed(() => businessNavigation.requested.value && !['ready', 'idle', 'loading', 'empty'].includes(businessNavigation.state.value)
    ? businessNavigation.state.value : selectionUnavailable.value ? 'unavailable' : detailState.value)
  const detailFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(feedbackState.value))
  const saveFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(workspace.saveState.value))
  const canEdit = computed(() => canQuery.value && !!draft.value && detailState.value === 'ready' && workspace.entry.value?.businessConfigId !== ''
    && (workspace.entry.value?.existing ? canUpdate.value : canAdd.value))
  const missingConfiguration = computed(() => !!draft.value && workspace.configState.value === 'empty')
  let confirmationResult: ((value: boolean) => void) | undefined
  let revision = 0
  let catalogRevision = 0
  let loadedSelection = ''
  let acceptedQuery: LocationQueryRaw = { ...route.query }
  let disposed = false

  watch(canQuery, async () => {
    const current = ++catalogRevision
    initialized.value = false
    await workspace.loadCatalog()
    if (current === catalogRevision) initialized.value = true
  }, { immediate: true })

  /** 显式旧 templateId 优先解析真实业务绑定；没有显式选择时取树中的首个业务。 */
  async function synchronizeSelection() {
    if (!initialized.value || directory.directoryState.value === 'loading' || fillingInsideMail.value) return
    const current = ++revision
    const requested = businessNavigation.requested.value
    const channel = requested ? businessNavigation.channel.value : queryText(route.query.channel) || navigation.value.channel || channels.value[0]?.id || ''
    const requestedTemplate = navigation.value.templateId || ''
    const requestedConfig = navigation.value.configId || ''
    const businesses = directory.businessTypes.value
    const bindings = requestedTemplate ? businesses.filter(item => item.channels?.some(binding => binding.channelConfiguration?.templateId === requestedTemplate)) : []
    const bound = bindings.length === 1 ? bindings[0] : undefined
    const first = directoryNodes.value.find(node => node.kind === 'business')?.business
    const target = requested ? businessNavigation.state.value === 'ready' ? businessNavigation.business.value : undefined
      : bound || (!requestedTemplate ? first : undefined)
    // 首个告警仅用于落地，立即固定具体记录，目录刷新或重排不会改变当前业务。
    if (target && navigation.value.businessSelection === 'first-alarm') {
      await router.replace({ query: selectionQuery(channel, target, undefined, requestedConfig) })
      return
    }
    const standaloneId = requested || bindings.length > 1 ? '' : requestedTemplate
    const selection = JSON.stringify([channel, identity(target), target ? '' : standaloneId, requestedConfig])
    selectionUnavailable.value = requested && !target && businessNavigation.state.value !== 'empty' || bindings.length > 1
    if (selection === loadedSelection) return
    if (loadedSelection && identity(target) !== identity(business.value) && workspace.hasDirtyDrafts.value) {
      if (!await confirmDiscard()) { if (current === revision) await router.replace({ query: acceptedQuery }); return }
      if (current !== revision) return
      if (business.value) workspace.discardBusinessDrafts()
      else await workspace.discardDraft()
    }
    const changedBusiness = identity(target) !== identity(business.value)
    loadedSelection = selection
    validationMessage.value = ''
    if (changedBusiness) editing.value = false
    if (target) await workspace.loadBusiness(target, channel, requestedConfig)
    else await workspace.loadChannel(channel, standaloneId)
    if (current === revision) acceptedQuery = { ...route.query }
  }

  watch([initialized, () => route.query.channel, () => route.query.ch, () => route.query.business, () => route.query.templateId, () => route.query.configId,
    () => route.query.topicProvider, () => route.query.channelProvider, () => route.query.aiAlarmType, () => route.query.visualAlarmSession, () => route.query.businessSelection,
    directory.businessTypes, directory.directoryState], synchronizeSelection, { immediate: true })
  watch(notificationConfigurationChange, change => {
    if (change?.action === 'message-templates-created') pendingChannelRefresh.value = change.channel
    else if (change?.channel) void workspace.refreshConfigs()
  })
  watch([pendingChannelRefresh, canManage, busy, workspace.hasDirtyDrafts], ([channel, allowed, locked, dirty]) => {
    if (!channel || !allowed || locked || dirty) return
    pendingChannelRefresh.value = ''
    loadedSelection = ''
    workspace.refreshUnboundTemplates(channel)
    void directory.reloadDirectory()
  })

  /** 业务切换和保存记住所选凭证，切换服务商时由新页面选择可用配置。 */
  function selectionQuery(channel: string, selectedBusiness?: NoticeChannelConfig, templateId?: string,
    configId = channel === channelId.value && usesBusinessChannelKey(channel) ? activeConfigId.value : undefined): LocationQueryRaw {
    const query = notificationQuery({ channel, templateId, configId }, route.query, channels.value)
    for (const key of ['business', 'topicProvider', 'channelProvider']) delete query[key]
    if (selectedBusiness) {
      if (route.query.topicProvider || route.query.aiAlarmType || route.query.businessSelection) query.topicProvider = identity(selectedBusiness)
      else query.business = identity(selectedBusiness)
      if (selectedBusiness.provider !== query.aiAlarmType) { delete query.aiAlarmType; delete query.visualAlarmSession }
    } else { delete query.aiAlarmType; delete query.visualAlarmSession }
    return query
  }
  function setUploading(value: boolean) { uploading.value = value }
  async function reload() {
    if (busy.value) return
    if (workspace.hasDirtyDrafts.value && !await confirmDiscard()) return
    const previousBusiness = business.value
    if (previousBusiness) workspace.discardBusinessDrafts()
    else await workspace.discardDraft()
    loadedSelection = ''
    initialized.value = false
    await Promise.all([workspace.reloadCatalog(), directory.reloadDirectory()])
    if (previousBusiness && workspace.saveOutcomeUnknown.value && directory.directoryState.value === 'ready') {
      const refreshed = directory.businessTypes.value.find(item => previousBusiness.id && item.id === previousBusiness.id)
        || directory.businessTypes.value.find(item => item.provider === previousBusiness.provider)
      if (refreshed) workspace.resetBusinessIdentity(refreshed)
    }
    initialized.value = true
  }
  function startEditing() {
    if (busy.value || !canEdit.value) return
    editing.value = true
  }
  function changeChannel(value: string | number, configId?: string) {
    const next = String(value)
    if (!busy.value && (next !== channelId.value || configId !== undefined && configId !== activeConfigId.value)) {
      void router.replace({ query: selectionQuery(next, business.value, undefined, configId || '') })
    }
  }
  function selectConfiguration(configId: string) {
    if (business.value && usesBusinessChannelKey(channelId.value)) changeChannel(channelId.value, configId)
    else if (draft.value) draft.value.configId = configId
  }
  async function selectTemplate(value: unknown) {
    if (busy.value) return
    const key = String(value)
    const node = directoryNodes.value.find(item => item.key === key)
    if (node?.kind === 'group' || key === workspace.activeKey.value) return
    const nextBusiness = node?.kind === 'business' ? node.business : undefined
    if (nextBusiness && identity(nextBusiness) === identity(business.value)) return
    if (workspace.hasDirtyDrafts.value && !await confirmDiscard()) return
    if (business.value) workspace.discardBusinessDrafts()
    else await workspace.discardDraft()
    editing.value = false
    await router.replace({ query: selectionQuery(channelId.value, nextBusiness, nextBusiness ? undefined : node?.templateId || key) })
  }
  function createTemplate() {
    if (busy.value || !canAdd.value || !canQuery.value) return
    workspace.createTemplate(activeConfigId.value)
    editing.value = true
  }

  /** 保存成功只回写当前业务的真实身份和绑定，不清空目录或覆盖其他业务。 */
  async function save() {
    const current = revision
    validationMessage.value = ''
    try {
      if (!await workspace.saveTemplate()) return
      if (disposed || current !== revision) return
      const selected = business.value
      if (selected) {
        businessNavigation.notifySaved(draft.value?.id)
        const index = directory.businessTypes.value.findIndex(item => item.id ? item.id === selected.id : item.provider === selected.provider)
        if (index >= 0) directory.businessTypes.value[index] = selected
      }
      const query = selectionQuery(channelId.value, selected, draft.value?.id || undefined)
      loadedSelection = JSON.stringify([channelId.value, identity(selected), selected ? '' : draft.value?.id || '', query.configId || ''])
      await router.replace({ query })
      acceptedQuery = { ...route.query }
      onlyMessage(t('messageNotification.templates.saved'), 'success')
      editing.value = false
    } catch (error) {
      validationMessage.value = error instanceof TemplateValidationError ? t(error.message) : t('messageNotification.templates.error')
    }
  }
  function restoreDefault() {
    if (busy.value || !canEdit.value || !workspace.canRestoreDefault.value) return
    workspace.restoreDefault()
    editing.value = true
  }
  function confirmDiscard(): Promise<boolean> {
    if (confirmation.open) return Promise.resolve(false)
    confirmation.open = true
    return new Promise(resolve => { confirmationResult = resolve })
  }
  function resolveConfirmation(value: boolean) {
    confirmation.open = false
    confirmationResult?.(value)
    confirmationResult = undefined
  }
  async function requestDiscard() {
    if (busy.value || workspace.dirty.value && !await confirmDiscard()) return
    validationMessage.value = ''
    await workspace.discardDraft()
    editing.value = false
  }
  async function goConfigure() {
    if (busy.value || !canConfigure.value) return
    configurationNavigation.open(identity(business.value), undefined, { channel: channelId.value, configId: draft.value?.configId })
  }
  async function fillInsideMail() {
    const selected = business.value
    const id = selected?.id
    if (!id || !canFillInsideMail.value || busy.value) return
    const active = () => !disposed && canQuery.value && canUpdate.value && business.value?.id === id
    fillingInsideMail.value = true
    businessActionState.value = 'loading'
    try {
      const result = await directory.fillInsideMail(id, active)
      if (!result || !active()) return
      workspace.resetBusinessIdentity(result.business, selected)
      businessActionState.value = 'ready'
      if (result.created) onlyMessage(t('messageNotification.templates.fillInsideMailSucceeded'), 'success')
    } catch (error) {
      if (active()) businessActionState.value = classifyNotificationFailure(error)
    } finally {
      fillingInsideMail.value = false
      if (businessActionState.value === 'loading') businessActionState.value = 'idle'
    }
  }
  async function importTemplate(value: unknown) {
    if (busy.value || !canEdit.value) return
    await workspace.importTemplate(String(value))
    editing.value = true
  }
  onBeforeRouteUpdate(() => !busy.value)
  onBeforeRouteLeave(async () => !saving.value && !fillingInsideMail.value
    && (!workspace.hasDirtyDrafts.value && !uploading.value || await confirmDiscard()))
  function beforeUnload(event: BeforeUnloadEvent) {
    if (workspace.hasDirtyDrafts.value || busy.value) { event.preventDefault(); event.returnValue = '' }
  }
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', beforeUnload)
  onBeforeUnmount(() => {
    disposed = true
    ++revision
    ++catalogRevision
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', beforeUnload)
    resolveConfirmation(false)
  })

  return {
    canManage, selectedBusiness: business, selectedBusinessId, businessActionState,
    businessLinkPending: businessNavigation.requested, businessLinkState: businessNavigation.state, importOptions,
    t, compact, workspace, ...workspace, ...directory, canQuery, canAdd, canEdit, canConfigure, busy, uploading,
    canFillInsideMail, fillingInsideMail, fillInsideMail,
    editing, title, description, activeConfig, activeConfigId, directoryConfigId, templateStatus, selectedDirectoryKey, selectedTemplateId, templateOptions,
    validationMessage, channelOptions, listFailure, detailFailure, feedbackState, saveFailure,
    missingConfiguration, confirmation, setUploading, reload, changeChannel, selectConfiguration, selectTemplate, createTemplate,
    startEditing, save, restoreDefault, requestDiscard, goConfigure, resolveConfirmation, importTemplate,
  }
}
