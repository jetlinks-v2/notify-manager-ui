import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePermission } from '@jetlinks-web/hooks'
import { useMediaQuery } from '@vueuse/core'
import {
  notificationChannels, notificationConfigurationChange, notificationPermissions,
  normalizeNotificationNavigation, notificationQuery,
} from '../../shared'
import { TemplateValidationError } from '../model'
import { useTemplateWorkspace } from '../useTemplateWorkspace'
import { useTemplateBusinessDirectory } from './useTemplateBusinessDirectory'

/** Coordinate routing and browser lifecycle outside the presentational page. */
export function useTemplatePage() {
  const { t } = useI18n()
  const compact = useMediaQuery('(max-width: 768px)')
  const route = useRoute()
  const router = useRouter()
  const { hasPerm: canQuery } = usePermission(ref(notificationPermissions.templates.query))
  const { hasPerm: canAdd } = usePermission(ref(notificationPermissions.templates.add))
  const { hasPerm: canUpdate } = usePermission(ref(notificationPermissions.templates.update))
  const businessDirectory = useTemplateBusinessDirectory(canQuery)
  const workspace = useTemplateWorkspace({ query: canQuery, add: canAdd, update: canUpdate })
  const { channelId, templates, configs, listState, draft, hasDirtyDrafts, saving } = workspace
  const uploading = ref(false)
  const editing = ref(false)
  const busy = computed(() => saving.value || uploading.value)
  const validationMessage = ref('')
  const saved = ref(false)
  const navigation = computed(() => normalizeNotificationNavigation(route.query))
  const channelOptions = computed(() => notificationChannels.map(channel => ({ value: channel.id, label: t(channel.labelKey) })))
  const templateOptions = computed(() => templates.value.map(template => ({ value: template.id, label: `${template.name} (${template.id})` })))
  const selectedTemplateId = computed(() => workspace.activeKey.value.startsWith('new:') ? undefined : workspace.activeKey.value || undefined)
  const title = computed(() => draft.value?.name || t(workspace.entry.value?.existing === false ? 'messageNotification.templates.create' : 'messageNotification.templates.title'))
  const listFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(listState.value))
  const detailFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(workspace.detailState.value))
  const saveFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(workspace.saveState.value))
  const confirmation = reactive({ open: false })
  let confirmResult: ((value: boolean) => void) | undefined
  let loadedChannel = ''

  /** Query and selection are routed; unfinished values remain in per-ID memory. */
  watch([() => navigation.value.channel, () => navigation.value.templateId, canQuery], async ([id, templateId]) => {
    validationMessage.value = ''
    saved.value = false
    const channel = typeof id === 'string' ? id : 'email:embedded'
    if (loadedChannel !== channel || listState.value === 'idle' || !canQuery.value || listState.value === 'forbidden') {
      loadedChannel = channel
      await workspace.loadChannel(channel, typeof templateId === 'string' ? templateId : '')
      // 自动预览当前渠道的首条真实记录；显式深链和加载期间的新选择始终优先。
      if (!templateId && !navigation.value.templateId && channelId.value === channel && !workspace.activeKey.value
        && listState.value === 'ready' && templates.value[0]) selectTemplate(templates.value[0].id)
    } else await workspace.selectTemplate(typeof templateId === 'string' ? templateId : '')
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
    void workspace.loadChannel(channelId.value, workspace.activeKey.value || navigation.value.templateId)
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
    if (!busy.value) void router.replace({ query: notificationQuery({ ...navigation.value, channel: channelId.value, templateId: String(value) }, route.query) })
  }
  async function createTemplate() {
    if (busy.value || !canAdd.value || !canQuery.value) return
    await router.replace({ query: notificationQuery({ channel: channelId.value, configId: navigation.value.configId }, route.query) })
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
        await router.replace({ query: notificationQuery({ channel: channelId.value, templateId: draft.value?.id || undefined, configId: draft.value?.configId || undefined }, route.query) })
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
    t, compact, workspace, ...workspace, ...businessDirectory, canQuery, canAdd, busy, uploading, editing, title, startEditing, validationMessage,
    saved, channelOptions, templateOptions, selectedTemplateId, listFailure, detailFailure,
    saveFailure, confirmation, setUploading, reload, changeChannel, selectTemplate,
    createTemplate, save, requestDiscard, resolveConfirmation,
  }
}
