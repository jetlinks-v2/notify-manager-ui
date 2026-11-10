import { computed, reactive, ref, type Ref } from 'vue'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../api/notice/messageNotification'
import {
  classifyNotificationFailure, findNotificationChannel, notificationCapabilities,
  resolveNotificationChannel, withNotificationChannel,
  type NotificationLoadState, type NotificationTemplate, type NotifierConfig,
} from '../shared'
import { buildTemplatePayload, createTemplateDraft, newTemplateDraft, templateDraftFingerprint, type TemplateDraft } from './model'

interface DraftEntry { draft: TemplateDraft; baseline: string; existing: boolean }
interface WorkspaceAccess { query: Ref<boolean>; add: Ref<boolean>; update: Ref<boolean> }

/** Own real request state and in-memory drafts; stale responses cannot select a previous channel. */
export function useTemplateWorkspace(access: WorkspaceAccess, api: MessageNotificationApi = messageNotificationApi) {
  const channelId = ref('email:embedded')
  const templates = ref<NotificationTemplate[]>([])
  const configs = ref<NotifierConfig[]>([])
  const listState = ref<NotificationLoadState>('idle')
  const configState = ref<NotificationLoadState>('idle')
  const detailState = ref<NotificationLoadState>('idle')
  const saveState = ref<NotificationLoadState>('idle')
  const activeKey = ref('')
  const drafts = reactive(new Map<string, DraftEntry>())
  const saving = ref(false)
  let listRevision = 0
  let detailRevision = 0
  let configRevision = 0
  const entry = computed(() => {
    const candidate = drafts.get(activeKey.value)
    return candidate && resolveNotificationChannel(candidate.draft.type, candidate.draft.provider)?.id === channelId.value ? candidate : undefined
  })
  const draft = computed(() => entry.value?.draft)
  const dirty = computed(() => Boolean(entry.value && entry.value.baseline !== templateDraftFingerprint(entry.value.draft)))
  const hasDirtyDrafts = computed(() => [...drafts.values()].some(item => item.baseline !== templateDraftFingerprint(item.draft)))
  const canSave = computed(() => Boolean(access.query.value && detailState.value === 'ready' && entry.value && (entry.value.existing ? access.update.value : access.add.value)))

  /** Re-read choices after a channel save without touching existing template drafts. */
  async function refreshConfigs() {
    const revision = ++configRevision
    const channel = findNotificationChannel(channelId.value)
    configs.value = []
    if (!access.query.value) { configState.value = 'forbidden'; return }
    if (!channel || !notificationCapabilities.config.query) { configState.value = 'unavailable'; return }
    configState.value = 'loading'
    try {
      const result = await api.queryConfigs(withNotificationChannel({ paging: false }, channel))
      if (revision !== configRevision || !access.query.value || channelId.value !== channel.id) return
      configs.value = result.data.filter(item => resolveNotificationChannel(item.type, item.provider)?.id === channel.id)
      configState.value = configs.value.length ? 'ready' : 'empty'
    } catch (error) { if (revision === configRevision) configState.value = classifyNotificationFailure(error) }
  }

  /** Switching selection keeps each actual template ID's draft; remote detail is read once per draft. */
  async function selectTemplate(id: string) {
    const revision = ++detailRevision
    saveState.value = 'idle'
    activeKey.value = id
    if (!access.query.value) { detailState.value = 'forbidden'; return }
    if (!id) { detailState.value = 'idle'; return }
    const cached = drafts.get(id)
    if (cached) {
      detailState.value = resolveNotificationChannel(cached.draft.type, cached.draft.provider)?.id === channelId.value ? 'ready' : 'unavailable'
      return
    }
    detailState.value = 'loading'
    const requestedChannel = channelId.value
    try {
      const record = await api.getTemplate(id)
      if (revision !== detailRevision || requestedChannel !== channelId.value || !access.query.value) return
      if (record.id !== id || resolveNotificationChannel(record.type, record.provider)?.id !== requestedChannel) {
        detailState.value = 'unavailable'; return
      }
      const next = createTemplateDraft(record)
      drafts.set(id, { draft: next, baseline: templateDraftFingerprint(next), existing: true })
      detailState.value = 'ready'
    } catch (error) { if (revision === detailRevision) detailState.value = classifyNotificationFailure(error) }
  }

  /** Channel filtering uses actual type/provider terms and never a prototype business category. */
  async function loadChannel(id: string, selectedId = '') {
    const revision = ++listRevision
    ++detailRevision
    ++configRevision
    channelId.value = id
    activeKey.value = ''
    detailState.value = 'idle'
    templates.value = []
    configs.value = []
    const channel = findNotificationChannel(id)
    if (!access.query.value) { listState.value = 'forbidden'; configState.value = 'forbidden'; return }
    if (!channel || !notificationCapabilities.template.query) { listState.value = 'unavailable'; return }
    listState.value = 'loading'
    void refreshConfigs()
    try {
      const result = await api.queryTemplates(withNotificationChannel({ paging: false }, channel))
      if (revision !== listRevision || !access.query.value) return
      templates.value = result.data.filter(item => resolveNotificationChannel(item.type, item.provider)?.id === id)
      listState.value = templates.value.length ? 'ready' : 'empty'
      if (selectedId) await selectTemplate(selectedId)
    } catch (error) { if (revision === listRevision) listState.value = classifyNotificationFailure(error) }
  }

  /** New draft keys stay local; they are not used as server IDs or navigation parameters. */
  function createTemplate(configId = '') {
    const channel = findNotificationChannel(channelId.value)
    if (!channel || !access.add.value) return
    ++detailRevision
    const key = `new:${channel.id}`
    if (!drafts.has(key)) {
      const value = newTemplateDraft(channel, configId)
      drafts.set(key, { draft: value, baseline: templateDraftFingerprint(value), existing: false })
    }
    activeKey.value = key
    detailState.value = 'ready'
    saveState.value = 'idle'
  }

  /** Failed saves retain the same input object; mutation results never supply an assumed ID. */
  async function saveTemplate(): Promise<boolean> {
    const current = entry.value
    if (!current || saving.value || !canSave.value) return false
    const payload = buildTemplatePayload(current.draft)
    const savedFingerprint = templateDraftFingerprint(current.draft)
    const key = activeKey.value
    saving.value = true
    saveState.value = 'loading'
    try {
      if (current.existing && payload.id) await api.updateTemplate({ ...payload, id: payload.id })
      else await api.createTemplate(payload)
      current.baseline = savedFingerprint
      // An explicit ID is part of the submitted record; an absent response ID is never guessed.
      if (payload.id) {
        current.existing = true
        if (key !== payload.id) { drafts.set(payload.id, current); drafts.delete(key); if (activeKey.value === key) activeKey.value = payload.id }
      } else if (activeKey.value === key) {
        drafts.delete(key)
        activeKey.value = ''
        detailState.value = 'idle'
      }
      saveState.value = 'ready'
      const channel = findNotificationChannel(channelId.value)
      if (channel) {
        try {
          const records = await api.queryTemplates(withNotificationChannel({ paging: false }, channel))
          if (channelId.value === channel.id) {
            templates.value = records.data.filter(item => resolveNotificationChannel(item.type, item.provider)?.id === channel.id)
            listState.value = templates.value.length ? 'ready' : 'empty'
          }
        } catch (error) { listState.value = classifyNotificationFailure(error) }
      }
      return true
    } catch (error) { saveState.value = classifyNotificationFailure(error); return false }
    finally { saving.value = false }
  }

  /** Revert only the active draft; other template drafts remain protected by the route guard. */
  async function discardDraft() {
    const key = activeKey.value
    drafts.delete(key)
    if (key.startsWith('new:')) createTemplate()
    else await selectTemplate(key)
  }

  return { channelId, templates, configs, listState, configState, detailState, saveState, activeKey,
    draft, dirty, hasDirtyDrafts, saving, canSave, entry, loadChannel, selectTemplate, refreshConfigs,
    createTemplate, saveTemplate, discardDraft }
}
