import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import type { LocationQueryRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePermission } from '@jetlinks-web/hooks'
import { useMediaQuery } from '@vueuse/core'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import {
  notificationConfigurationChange, notificationPermissions, notificationQuery,
  notificationRouteNames, normalizeNotificationNavigation,
} from '../../shared'
import { TemplateValidationError } from '../model'
import { buildTemplateDirectory, flattenTemplateDirectory, templateBusinessKey } from '../templateDirectoryModel'
import { useTemplateWorkspace } from '../useTemplateWorkspace'
import { useTemplateBusinessDirectory } from './useTemplateBusinessDirectory'

const identity = (business?: NoticeChannelConfig) => business?.id || business?.provider || business?.providerId || ''
const queryText = (value: unknown) => typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : ''

/** 业务决定编辑对象，渠道决定提供商；路由只同步明确身份，不用模板列表首项猜业务。 */
export function useTemplatePage() {
  const { t } = useI18n()
  const compact = useMediaQuery('(max-width: 768px)')
  const route = useRoute()
  const router = useRouter()
  const menu = useMenuStore()
  const { hasPerm: canQuery } = usePermission(ref(notificationPermissions.templates.query))
  const { hasPerm: canAdd } = usePermission(ref(notificationPermissions.templates.add))
  const { hasPerm: canUpdate } = usePermission(ref(notificationPermissions.templates.update))
  const { hasPerm: canConfigure } = usePermission(ref(notificationPermissions.channels.query))
  const directory = useTemplateBusinessDirectory(canQuery)
  const workspace = useTemplateWorkspace({ query: canQuery, add: canAdd, update: canUpdate })
  const { channelId, templates, draft, business, channels, detailState, listState, saving } = workspace
  const uploading = ref(false)
  const editing = ref(false)
  const initialized = ref(false)
  const selectionUnavailable = ref(false)
  const validationMessage = ref('')
  const saved = ref(false)
  const confirmation = reactive({ open: false })
  const busy = computed(() => saving.value || uploading.value)
  const navigation = computed(() => normalizeNotificationNavigation(route.query, channels.value))
  const directoryNodes = computed(() => flattenTemplateDirectory(buildTemplateDirectory(templates.value, directory.businessTypes.value,
    { other: t('messageNotification.templates.otherGroup') }, t)))
  const channelOptions = computed(() => channels.value.map(channel => ({ value: channel.id, label: channel.labelKey ? t(channel.labelKey) : channel.name || channel.id })))
  const templateOptions = computed(() => directoryNodes.value.filter(node => node.kind === 'business').map(node => ({ value: node.key, label: node.title })))
  const selectedDirectoryKey = computed(() => business.value ? templateBusinessKey(business.value) : workspace.activeKey.value)
  const selectedTemplateId = selectedDirectoryKey
  const title = computed(() => business.value?.name || draft.value?.name || t('messageNotification.templates.title'))
  const description = computed(() => String(business.value?.description || draft.value?.description || ''))
  const activeConfig = computed(() => workspace.configs.value.find(config => config.id === draft.value?.configId))
  const listFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(workspace.catalogState.value))
  const detailFailure = computed(() => selectionUnavailable.value || ['unavailable', 'forbidden', 'error'].includes(detailState.value))
  const feedbackState = computed(() => selectionUnavailable.value ? 'unavailable' : detailState.value)
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
    if (!initialized.value || directory.directoryState.value === 'loading') return
    const current = ++revision
    const channel = queryText(route.query.channel) || navigation.value.channel || channels.value[0]?.id || ''
    const requestedBusiness = queryText(route.query.business)
    const requestedTemplate = navigation.value.templateId || ''
    const requestedConfig = navigation.value.configId || ''
    const businesses = directory.businessTypes.value
    const exact = businesses.find(item => item.id === requestedBusiness)
      || businesses.find(item => requestedBusiness && identity(item) === requestedBusiness)
    const bound = requestedTemplate ? businesses.find(item => item.channels?.some(binding => binding.channelConfiguration?.templateId === requestedTemplate)) : undefined
    const first = directoryNodes.value.find(node => node.kind === 'business')?.business
    const target = exact || (!requestedBusiness ? bound || (!requestedTemplate ? first : undefined) : undefined)
    const selection = JSON.stringify([channel, identity(target), target ? '' : requestedTemplate, requestedConfig])
    if (selection === loadedSelection) return
    if (loadedSelection && identity(target) !== identity(business.value) && workspace.hasDirtyDrafts.value) {
      if (!await confirmDiscard()) { if (current === revision) await router.replace({ query: acceptedQuery }); return }
      if (current !== revision) return
      if (business.value) workspace.discardBusinessDrafts()
      else await workspace.discardDraft()
    }
    const changedBusiness = identity(target) !== identity(business.value)
    loadedSelection = selection
    selectionUnavailable.value = !!requestedBusiness && !target
    validationMessage.value = ''
    saved.value = false
    if (changedBusiness) editing.value = false
    if (target) await workspace.loadBusiness(target, channel, requestedConfig)
    else await workspace.loadChannel(channel, requestedTemplate)
    if (current === revision) acceptedQuery = { ...route.query }
  }

  watch([initialized, () => route.query.channel, () => route.query.ch, () => route.query.business, () => route.query.templateId, () => route.query.configId,
    directory.businessTypes, directory.directoryState], synchronizeSelection, { immediate: true })
  watch(notificationConfigurationChange, change => {
    if (change?.channel === channelId.value) void workspace.refreshConfigs()
  })

  function selectionQuery(channel: string, selectedBusiness?: NoticeChannelConfig, templateId?: string): LocationQueryRaw {
    const query = notificationQuery({ channel, templateId }, route.query, channels.value)
    if (selectedBusiness) query.business = identity(selectedBusiness)
    else delete query.business
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
    saved.value = false
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
    await router.replace({ query: selectionQuery(channelId.value, nextBusiness, nextBusiness ? undefined : key) })
  }
  function createTemplate() {
    if (busy.value || !canAdd.value || !canQuery.value) return
    workspace.createTemplate(navigation.value.configId)
    editing.value = true
    saved.value = false
  }

  /** 保存成功只回写当前业务的真实身份和绑定，不清空目录或覆盖其他业务。 */
  async function save() {
    const current = revision
    validationMessage.value = ''
    saved.value = false
    try {
      if (!await workspace.saveTemplate()) return
      if (disposed || current !== revision) return
      const selected = business.value
      if (selected) {
        const index = directory.businessTypes.value.findIndex(item => item.id === selected.id || item.provider === selected.provider)
        if (index >= 0) directory.businessTypes.value[index] = selected
      }
      loadedSelection = JSON.stringify([channelId.value, identity(selected), selected ? '' : draft.value?.id || '', ''])
      await router.replace({ query: selectionQuery(channelId.value, selected, draft.value?.id || undefined) })
      acceptedQuery = { ...route.query }
      saved.value = true
      editing.value = false
    } catch (error) {
      validationMessage.value = error instanceof TemplateValidationError ? t(error.message) : t('messageNotification.templates.error')
    }
  }
  function restoreDefault() {
    if (busy.value || !canEdit.value || !workspace.canRestoreDefault.value) return
    workspace.restoreDefault()
    editing.value = true
    saved.value = false
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
    saved.value = false
    await workspace.discardDraft()
    editing.value = false
  }
  async function goConfigure() {
    if (busy.value || !canConfigure.value || workspace.hasDirtyDrafts.value && !await confirmDiscard()) return
    const targetChannel = channelId.value
    const targetConfig = draft.value?.configId || undefined
    if (business.value) workspace.discardBusinessDrafts()
    else await workspace.discardDraft()
    void menu.jumpPage(notificationRouteNames.channels, { query: notificationQuery({ channel: targetChannel, configId: targetConfig }, {}, channels.value) })
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
    t, compact, workspace, ...workspace, ...directory, canQuery, canAdd, canEdit, canConfigure, busy, uploading,
    editing, title, description, activeConfig, selectedDirectoryKey, selectedTemplateId, templateOptions,
    validationMessage, saved, channelOptions, listFailure, detailFailure, feedbackState, saveFailure,
    missingConfiguration, confirmation, setUploading, reload, changeChannel, selectTemplate, createTemplate,
    startEditing, save, restoreDefault, requestDiscard, goConfigure, resolveConfirmation,
  }
}
