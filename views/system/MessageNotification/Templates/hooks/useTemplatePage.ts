import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePermission } from '@jetlinks-web/hooks'
import { useMediaQuery } from '@vueuse/core'
import { useNotificationConfigNavigation } from '@jetlinks-web-core/hooks/useNotificationConfigNavigation'
import { messageNotificationApi } from '../../../../../api/notice/messageNotification'
import { businessIdentity, businessRecordId } from '../businessTemplateModel'
import { classifyNotificationFailure } from '../../shared'
import {
  notificationChannels, notificationConfigurationChange, notificationPermissions,
  normalizeNotificationNavigation, notificationQuery,
} from '../../shared'
import { TemplateValidationError } from '../model'
import { useTemplateWorkspace } from '../useTemplateWorkspace'
import { useTemplateBusinessDirectory } from './useTemplateBusinessDirectory'
import { useTemplateBusinessNavigation } from './useTemplateBusinessNavigation'

/** Coordinate routing and browser lifecycle outside the presentational page. */
export function useTemplatePage() {
  const { t } = useI18n()
  const compact = useMediaQuery('(max-width: 768px)')
  const route = useRoute()
  const router = useRouter()
  const { hasPerm: canQuery } = usePermission(ref(notificationPermissions.templates.query))
  const { hasPerm: canAdd } = usePermission(ref(notificationPermissions.templates.add))
  const { hasPerm: canUpdate } = usePermission(ref(notificationPermissions.templates.update))
  const canManage = computed(() => canQuery.value && (canAdd.value || canUpdate.value))
  const businessDirectory = useTemplateBusinessDirectory(canManage)
  const businessNavigation = useTemplateBusinessNavigation(computed(() => route.query), businessDirectory.businessTypes, businessDirectory.directoryState)
  const workspace = useTemplateWorkspace({ query: canQuery, add: canAdd, update: canUpdate })
  const { channelId, templates, configs, listState, draft, hasDirtyDrafts, saving } = workspace
  const configurationNavigation = useNotificationConfigNavigation(() => workspace.refreshConfigs(), 'system/MessageNotification/Channels')
  const changingBusiness = ref(false)
  const businessActionState = ref('idle')
  const selectedBusiness = computed(() => businessNavigation.business.value)
  const selectedBusinessId = computed(() => selectedBusiness.value ? businessIdentity(selectedBusiness.value) : '')
  const businessEnabled = computed(() => !!selectedBusiness.value && !!businessRecordId(selectedBusiness.value) && (typeof selectedBusiness.value.state === 'string' ? selectedBusiness.value.state : selectedBusiness.value.state?.value) !== 'disabled')
  const businessOptions = computed(() => businessDirectory.businessTypes.value.map(item => ({ value: businessIdentity(item), label: `${item.name || item.provider} (${businessIdentity(item)})` })))
  const uploading = ref(false)
  const editing = ref(false)
  const busy = computed(() => saving.value || uploading.value || changingBusiness.value)
  const validationMessage = ref('')
  const saved = ref(false)
  const navigation = computed(() => normalizeNotificationNavigation(route.query))
  const channelOptions = computed(() => notificationChannels.map(channel => ({ value: channel.id, label: t(channel.labelKey) })))
  const templateOptions = computed(() => templates.value.map(template => ({ value: template.id, label: `${template.name} (${template.id})` })))
  const selectedTemplateId = computed(() => workspace.activeKey.value.startsWith('new:') ? undefined : workspace.activeKey.value || undefined)
  const title = computed(() => selectedBusiness.value?.name || draft.value?.name || t(workspace.entry.value?.existing === false ? 'messageNotification.templates.create' : 'messageNotification.templates.title'))
  const listFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(listState.value))
  const detailFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(workspace.detailState.value))
  const saveFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(workspace.saveState.value))
  const confirmation = reactive({ open: false })
  let confirmResult: ((value: boolean) => void) | undefined
  let loadedChannel = ''

  /** Route context owns selection; changing vendors keeps the concrete business and its cached drafts. */
  watch([navigation, canQuery, canManage, businessNavigation.business, businessNavigation.state, businessNavigation.channel], async () => {
    validationMessage.value = ''
    saved.value = false
    // 首项选择只用于落地；立即固定实际业务身份，刷新目录不再改变编辑对象。
    if (navigation.value.businessSelection === 'first-alarm' && businessNavigation.state.value === 'ready' && selectedBusiness.value) {
      await router.replace({ query: notificationQuery({ channel: businessNavigation.channel.value }, { ...route.query, topicProvider: businessIdentity(selectedBusiness.value) }) })
      return
    }
    const id = businessNavigation.requested.value ? businessNavigation.channel.value : navigation.value.channel || 'email:embedded'
    const templateId = businessNavigation.requested.value ? '' : navigation.value.templateId || ''
    const reloadList = loadedChannel !== id || ['idle', 'forbidden'].includes(listState.value) || !canQuery.value
    loadedChannel = id
    const load = reloadList ? workspace.loadChannel(id, templateId) : workspace.selectTemplate(templateId)
    await workspace.binding.selectBusiness(businessNavigation.state.value === 'ready' ? selectedBusiness.value : undefined, id)
    await load
    if (!businessNavigation.requested.value && !templateId && !navigation.value.templateId && channelId.value === id
      && !workspace.activeKey.value && listState.value === 'ready' && templates.value[0]) selectTemplate(templates.value[0].id)
  }, { immediate: true })

  // 新建和未保存草稿继续编辑，首次查看已保存模板时只展示预览。
  watch([workspace.activeKey, workspace.detailState], () => {
    editing.value = workspace.detailState.value === 'ready' && (!workspace.entry.value?.existing || workspace.dirty.value)
  })

  watch(notificationConfigurationChange, change => {
    if (change?.channel === channelId.value) void workspace.refreshConfigs()
  })

  function setUploading(value: boolean) { uploading.value = value }
  function reload() {
    if (busy.value) return
    void businessDirectory.reloadDirectory()
    void workspace.loadChannel(channelId.value, workspace.managed.value ? '' : navigation.value.templateId)
    void workspace.binding.selectBusiness(selectedBusiness.value, channelId.value, true)
  }
  function startEditing() {
    if (busy.value || !workspace.canSave.value) return
    saved.value = false
    editing.value = true
  }
  function changeChannel(value: string | number) {
    if (!busy.value && String(value) !== channelId.value) void router.replace({ query: notificationQuery({ channel: String(value) }, route.query) })
  }
  function selectTemplate(value: unknown) {
    if (busy.value) return
    const query = { ...route.query }
    for (const key of ['topicProvider', 'channelProvider', 'aiAlarmType', 'visualAlarmSession']) delete query[key]
    void router.replace({ query: notificationQuery({ channel: channelId.value, templateId: String(value) }, query) })
  }
  function selectBusiness(value: unknown) {
    if (!busy.value) void router.replace({ query: notificationQuery({ channel: channelId.value }, { ...route.query, topicProvider: String(value) }) })
  }
  async function toggleBusiness() {
    const business = selectedBusiness.value
    if (!business || !canManage.value || busy.value) return
    const wasEnabled = businessEnabled.value
    changingBusiness.value = true
    businessActionState.value = 'loading'
    try {
      await messageNotificationApi.setBusinessEnabled(businessIdentity(business), !wasEnabled)
      await businessDirectory.reloadDirectory()
      // Enabling a placeholder returns void; select only the unambiguous persisted record from the refreshed directory.
      const candidates = businessDirectory.businessTypes.value.filter(item => businessRecordId(business)
        ? businessRecordId(item) === businessRecordId(business) : item.provider === business.provider && !!businessRecordId(item))
      if (candidates.length === 1) await router.replace({ query: notificationQuery({ channel: channelId.value }, { ...route.query, topicProvider: businessIdentity(candidates[0]) }) })
      businessActionState.value = businessDirectory.directoryState.value === 'ready' ? 'ready' : businessDirectory.directoryState.value
    } catch (error) { businessActionState.value = classifyNotificationFailure(error) }
    finally { changingBusiness.value = false }
  }
  function openConfiguration() {
    if (workspace.configState.value !== 'empty' || busy.value) return
    configurationNavigation.open(selectedBusinessId.value, undefined, { channel: channelId.value })
  }
  async function importTemplate(value: unknown) {
    if (busy.value) return
    await workspace.binding.importTemplate(String(value))
    editing.value = true
  }
  async function createTemplate() {
    if (busy.value || !canAdd.value || !canQuery.value) return
    const query = { ...route.query }
    for (const key of ['topicProvider', 'channelProvider', 'aiAlarmType', 'visualAlarmSession']) delete query[key]
    await router.replace({ query: notificationQuery({ channel: channelId.value, configId: navigation.value.configId }, query) })
    await nextTick()
    const selectedConfig = configs.value.find(config => config.id === navigation.value.configId)
    workspace.createTemplate(selectedConfig?.id)
    editing.value = true
    saved.value = false
  }

  /** Failed saves leave the editor intact; only verified success clears its dirty state. */
  async function save() {
    validationMessage.value = ''
    saved.value = false
    try {
      if (await workspace.saveTemplate()) {
        businessNavigation.notifySaved(draft.value?.id)
        if (workspace.managed.value) await businessDirectory.reloadDirectory()
        else await router.replace({ query: notificationQuery({ channel: channelId.value, templateId: draft.value?.id || undefined, configId: draft.value?.configId || undefined }, route.query) })
        saved.value = true
        editing.value = false
      }
    } catch (error) {
      validationMessage.value = error instanceof TemplateValidationError ? t(error.message) : t('messageNotification.templates.error')
    }
  }

  function confirmDiscard(): Promise<boolean> {
    confirmation.open = true
    return new Promise(resolve => { confirmResult = resolve })
  }
  function resolveConfirmation(value: boolean) {
    confirmation.open = false
    confirmResult?.(value)
    confirmResult = undefined
  }
  /** 取消只丢弃当前草稿；没有修改时直接返回预览，其他 ID 的草稿仍保留。 */
  async function requestDiscard() {
    if (busy.value) return
    const key = workspace.activeKey.value
    if (workspace.dirty.value && !await confirmDiscard()) return
    if (key !== workspace.activeKey.value || busy.value) return
    validationMessage.value = ''
    saved.value = false
    if (workspace.dirty.value || !workspace.entry.value?.existing) await workspace.discardDraft()
    editing.value = false
  }
  onBeforeRouteLeave(async () => !hasDirtyDrafts.value && !uploading.value || await confirmDiscard())
  function beforeUnload(event: BeforeUnloadEvent) {
    if (hasDirtyDrafts.value || uploading.value) { event.preventDefault(); event.returnValue = '' }
  }
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', beforeUnload)
  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', beforeUnload)
    resolveConfirmation(false)
  })

  return {
    canManage, selectedBusiness, selectedBusinessId, businessEnabled, businessOptions, selectBusiness, toggleBusiness, changingBusiness, businessActionState,
    channelEnabled: workspace.binding.channelEnabled, importTemplate, openConfiguration, canConfigure: configurationNavigation.available,
    businessLinkPending: businessNavigation.requested, businessLinkState: businessNavigation.state,
    t, compact, workspace, ...workspace, ...businessDirectory, canQuery, canAdd, busy, uploading, editing, title, startEditing, validationMessage,
    saved, channelOptions, templateOptions, selectedTemplateId, listFailure, detailFailure,
    saveFailure, confirmation, setUploading, reload, changeChannel, selectTemplate,
    createTemplate, save, requestDiscard, resolveConfirmation,
  }
}
