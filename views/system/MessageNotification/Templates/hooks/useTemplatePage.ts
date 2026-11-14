import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import type { LocationQueryRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePermission } from '@jetlinks-web/hooks'
import { onlyMessage } from '@jetlinks-web/utils'
import { useMediaQuery } from '@vueuse/core'
import { useNotificationConfigNavigation } from '@jetlinks-web-core/hooks/useNotificationConfigNavigation'
import { messageNotificationApi } from '../../../../../api/notice/messageNotification'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import {
  notificationConfigurationChange, notificationPermissions, notificationQuery,
  classifyNotificationFailure, normalizeNotificationNavigation,
} from '../../shared'
import { TemplateValidationError } from '../model'
import { buildTemplateDirectory, flattenTemplateDirectory, templateBusinessKey } from '../templateDirectoryModel'
import { useTemplateWorkspace } from '../useTemplateWorkspace'
import { useTemplateBusinessDirectory } from './useTemplateBusinessDirectory'
import { useTemplateBusinessNavigation } from './useTemplateBusinessNavigation'

const identity = (business?: NoticeChannelConfig) => business?.id || business?.providerId || business?.provider || ''
const queryText = (value: unknown) => typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : ''

/** 业务决定编辑对象，渠道决定提供商；路由只同步明确身份，不用模板列表首项猜业务。 */
export function useTemplatePage() {
  const { t } = useI18n()
  const compact = useMediaQuery('(max-width: 768px)')
  const route = useRoute()
  const router = useRouter()
  const { hasPerm: canQuery } = usePermission(ref(notificationPermissions.templates.query))
  const { hasPerm: canAdd } = usePermission(ref(notificationPermissions.templates.add))
  const { hasPerm: canUpdate } = usePermission(ref(notificationPermissions.templates.update))
  const { hasPerm: canQueryConfig } = usePermission(ref(notificationPermissions.channels.query))
  const canManage = computed(() => canQuery.value && (canAdd.value || canUpdate.value))
  const directory = useTemplateBusinessDirectory(canManage)
  const workspace = useTemplateWorkspace({ query: canQuery, add: canAdd, update: canUpdate })
  const { channelId, templates, draft, business, channels, detailState, listState, saving } = workspace
  const businessNavigation = useTemplateBusinessNavigation(computed(() => route.query), directory.businessTypes, directory.directoryState, channels)
  const configurationNavigation = useNotificationConfigNavigation(() => workspace.refreshConfigs(), 'system/MessageNotification/Channels')
  const canConfigure = computed(() => canQueryConfig.value && configurationNavigation.available.value)
  const changingBusiness = ref(false)
  const businessActionState = ref('idle')
  const selectedBusinessId = computed(() => identity(business.value))
  const businessEnabled = computed(() => !!business.value?.id && (typeof business.value.state === 'string' ? business.value.state : business.value.state?.value) !== 'disabled')
  const uploading = ref(false)
  const editing = ref(false)
  const initialized = ref(false)
  const selectionUnavailable = ref(false)
  const validationMessage = ref('')
  const confirmation = reactive({ open: false })
  const busy = computed(() => saving.value || uploading.value || changingBusiness.value)
  const navigation = computed(() => normalizeNotificationNavigation(route.query, channels.value))
  const directoryNodes = computed(() => flattenTemplateDirectory(buildTemplateDirectory(templates.value, directory.businessTypes.value,
    { other: t('messageNotification.templates.otherGroup') }, t)))
  const channelOptions = computed(() => channels.value.map(channel => ({ value: channel.id, label: channel.labelKey ? t(channel.labelKey) : channel.name || channel.id })))
  const templateOptions = computed(() => directoryNodes.value.filter(node => node.kind === 'business').map(node => ({ value: node.key, label: node.title })))
  const importOptions = computed(() => templates.value.map(item => ({ value: item.id, label: `${item.name} (${item.id})` })))
  const selectedDirectoryKey = computed(() => business.value ? templateBusinessKey(business.value) : workspace.activeKey.value)
  const selectedTemplateId = selectedDirectoryKey
  const title = computed(() => business.value?.name || draft.value?.name || t('messageNotification.templates.title'))
  const description = computed(() => String(business.value?.description || draft.value?.description || ''))
  const activeConfig = computed(() => workspace.configs.value.find(config => config.id === draft.value?.configId))
  const listFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(workspace.catalogState.value))
  const feedbackState = computed(() => businessNavigation.requested.value && !['ready', 'idle', 'loading', 'empty'].includes(businessNavigation.state.value)
    ? businessNavigation.state.value : selectionUnavailable.value ? 'unavailable' : detailState.value)
  const detailFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(feedbackState.value))
  const saveFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(workspace.saveState.value))
  const canEdit = computed(() => canQuery.value && !!draft.value && detailState.value === 'ready'
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
    if (!initialized.value || directory.directoryState.value === 'loading' || changingBusiness.value) return
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
      await router.replace({ query: selectionQuery(channel, target) })
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
    if (change?.channel) void workspace.refreshConfigs()
  })

  function selectionQuery(channel: string, selectedBusiness?: NoticeChannelConfig, templateId?: string): LocationQueryRaw {
    const query = notificationQuery({ channel, templateId }, route.query, channels.value)
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
  function changeChannel(value: string | number) {
    const next = String(value)
    if (!busy.value && next !== channelId.value) void router.replace({ query: selectionQuery(next, business.value) })
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
    workspace.createTemplate(navigation.value.configId)
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
      loadedSelection = JSON.stringify([channelId.value, identity(selected), selected ? '' : draft.value?.id || '', ''])
      await router.replace({ query: selectionQuery(channelId.value, selected, draft.value?.id || undefined) })
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
  /** 显式启停与模板保存分离；占位业务启用后只接受唯一的实际记录。 */
  async function toggleBusiness() {
    const selected = business.value
    if (!selected || !canManage.value || busy.value) return
    changingBusiness.value = true
    businessActionState.value = 'loading'
    try {
      await messageNotificationApi.setBusinessEnabled(identity(selected), !businessEnabled.value)
      await directory.reloadDirectory()
      const matches = directory.businessTypes.value.filter(item => selected.id ? item.id === selected.id : item.provider === selected.provider && !!item.id)
      if (matches.length === 1) {
        workspace.resetBusinessIdentity(matches[0], selected)
        changingBusiness.value = false
        await router.replace({ query: selectionQuery(channelId.value, matches[0]) })
      }
      businessActionState.value = directory.directoryState.value === 'ready' && matches.length !== 1 ? 'unavailable' : directory.directoryState.value
    } catch (error) { businessActionState.value = classifyNotificationFailure(error) }
    finally { changingBusiness.value = false }
  }
  async function importTemplate(value: unknown) {
    if (busy.value || !canEdit.value) return
    await workspace.importTemplate(String(value))
    editing.value = true
  }
  onBeforeRouteUpdate(() => !busy.value)
  onBeforeRouteLeave(async () => !saving.value && (!workspace.hasDirtyDrafts.value && !uploading.value || await confirmDiscard()))
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
    canManage, selectedBusiness: business, selectedBusinessId, businessEnabled, changingBusiness, businessActionState, toggleBusiness,
    businessLinkPending: businessNavigation.requested, businessLinkState: businessNavigation.state, importOptions,
    t, compact, workspace, ...workspace, ...directory, canQuery, canAdd, canEdit, canConfigure, busy, uploading,
    editing, title, description, activeConfig, selectedDirectoryKey, selectedTemplateId, templateOptions,
    validationMessage, channelOptions, listFailure, detailFailure, feedbackState, saveFailure,
    missingConfiguration, confirmation, setUploading, reload, changeChannel, selectTemplate, createTemplate,
    startEditing, save, restoreDefault, requestDiscard, goConfigure, resolveConfirmation, importTemplate,
  }
}
