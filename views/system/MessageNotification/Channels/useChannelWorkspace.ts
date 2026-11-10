import { computed, reactive, ref, shallowRef, type Ref } from 'vue'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../api/notice/messageNotification'
import {
  classifyNotificationFailure, cloneNotificationValue, findNotificationChannel,
  publishNotificationConfigurationChange, resolveNotificationChannel, selectNotificationConfig, withNotificationChannel,
  type NotificationFailureKind, type NotificationLoadState, type NotificationNavigation, type NotifierConfig, type NotifierConfigPayload,
} from '../shared'
import { channelConfigPayload, createChannelConfigDraft, validateChannelDraft, type ChannelValidationIssue } from './channelSchema'

export interface ChannelPermissions {
  query: Ref<boolean>
  add: Ref<boolean>
  update: Ref<boolean>
  delete: Ref<boolean>
  action: Ref<boolean>
}

export interface ChannelDraftEntry {
  key: string
  draft: NotifierConfigPayload
  baseline?: NotifierConfig
  isNew: boolean
  snapshot: string
  issues: ChannelValidationIssue[]
  failure?: NotificationFailureKind
}

interface ChannelWorkspaceOptions {
  permissions: ChannelPermissions
  api?: MessageNotificationApi
  navigate?: (navigation: NotificationNavigation) => void
  blocked?: Ref<boolean>
}

/** Owns provider-scoped queries and in-memory drafts; switching never writes or discards a draft. */
export function useChannelWorkspace(options: ChannelWorkspaceOptions) {
  const api = options.api ?? messageNotificationApi
  const channelId = ref('')
  const configs = shallowRef<NotifierConfig[]>([])
  const state = ref<NotificationLoadState>('idle')
  const detailState = ref<NotificationLoadState>('idle')
  const busy = ref(false)
  const activeKey = ref('')
  const drafts = reactive(new Map<string, ChannelDraftEntry>())
  const remembered = new Map<string, { id: string } | { isNew: true }>()
  let listVersion = 0
  let detailVersion = 0
  const channel = computed(() => findNotificationChannel(channelId.value))
  const entry = computed(() => drafts.get(activeKey.value))
  const selectedConfigId = ref<string>()
  const dirty = computed(() => !!entry.value && JSON.stringify(entry.value.draft) !== entry.value.snapshot)
  const hasUnsavedChanges = computed(() => [...drafts.values()].some(item => JSON.stringify(item.draft) !== item.snapshot))
  const canEdit = computed(() => !!options.permissions.query.value && !!entry.value && (entry.value.isNew ? options.permissions.add.value : options.permissions.update.value))

  /** Keep query state shareable while excluding ephemeral draft IDs and credentials. */
  function syncNavigation() {
    options.navigate?.({ channel: channelId.value, ...(selectedConfigId.value ? { configId: selectedConfigId.value } : {}) })
  }

  /** Resolve by explicit ID and validate its provider before exposing it in this channel's editor. */
  async function selectConfig(id?: string) {
    if (busy.value || options.blocked?.value || !channel.value || !options.permissions.query.value) return
    const selected = id && configs.value.some(item => item.id === id) ? id : undefined
    const version = ++detailVersion
    activeKey.value = selected ? `${channelId.value}\0record:${selected}` : ''
    selectedConfigId.value = selected
    if (!selected) { detailState.value = 'idle'; syncNavigation(); return }
    remembered.set(channelId.value, { id: selected })
    if (drafts.has(activeKey.value)) { detailState.value = 'ready'; syncNavigation(); return }
    detailState.value = 'loading'
    const expectedChannel = channelId.value
    const key = activeKey.value
    try {
      const record = await api.getConfig(selected)
      if (version !== detailVersion || channelId.value !== expectedChannel) return
      if (!record || record.id !== selected || resolveNotificationChannel(record.type, record.provider)?.id !== expectedChannel) throw new Error('invalid-config')
      const draft = createChannelConfigDraft(record)
      drafts.set(key, { key, draft, baseline: cloneNotificationValue(record), isNew: false, snapshot: JSON.stringify(draft), issues: [] })
      detailState.value = 'ready'
    } catch (error) {
      if (version === detailVersion) detailState.value = classifyNotificationFailure(error)
    }
    if (version === detailVersion) syncNavigation()
  }

  /** Ignore late query/detail responses after channel changes; a denied query makes no request. */
  async function activate(id: string, requestedId?: string) {
    if (busy.value || options.blocked?.value) return
    const version = ++listVersion
    ++detailVersion
    channelId.value = id
    activeKey.value = ''
    selectedConfigId.value = undefined
    configs.value = []
    detailState.value = 'idle'
    if (!channel.value) { state.value = 'unavailable'; return }
    if (!options.permissions.query.value) { state.value = 'forbidden'; return }
    state.value = 'loading'
    try {
      const result = await api.queryConfigs(withNotificationChannel({ paging: false }, channel.value))
      if (version !== listVersion) return
      configs.value = result.data.filter(item => resolveNotificationChannel(item.type, item.provider)?.id === id)
      state.value = configs.value.length ? 'ready' : 'empty'
      const rememberedId = remembered.get(id)
      if (!requestedId && rememberedId && 'isNew' in rememberedId && drafts.has(`${id}\0new`)) {
        activeKey.value = `${id}\0new`
        detailState.value = 'ready'
        syncNavigation()
        return
      }
      const candidate = requestedId ?? (rememberedId && 'id' in rememberedId ? rememberedId.id : undefined)
      await selectConfig(selectNotificationConfig(configs.value, candidate)?.id)
    } catch (error) {
      if (version === listVersion) state.value = classifyNotificationFailure(error)
    }
  }

  /** An explicit new ID avoids guessing the identifier from an unknown mutation response. */
  function createConfig() {
    if (busy.value || options.blocked?.value || !channel.value || !options.permissions.add.value || !['ready', 'empty'].includes(state.value)) return
    ++detailVersion
    const key = `${channelId.value}\0new`
    if (!drafts.has(key)) {
      const draft: NotifierConfigPayload = { id: '', name: '', type: channel.value.type, provider: channel.value.provider, configuration: {} }
      drafts.set(key, { key, draft, isNew: true, snapshot: JSON.stringify(draft), issues: [] })
    }
    activeKey.value = key
    selectedConfigId.value = undefined
    remembered.set(channelId.value, { isNew: true })
    detailState.value = 'ready'
    syncNavigation()
  }

  /** A field edit affects only its selected draft; it never sends a background save. */
  function changeField(key: string, value: unknown, topLevel = false) {
    if (!canEdit.value || busy.value || options.blocked?.value || !entry.value) return
    if (topLevel && (key === 'name' || (key === 'id' && entry.value.isNew))) entry.value.draft[key] = String(value ?? '')
    else if (!topLevel) entry.value.draft.configuration[key] = value
    entry.value.issues = entry.value.issues.filter(issue => issue.path !== key)
    entry.value.failure = undefined
  }

  /** Success is established by the write response; a later refresh failure never causes another POST. */
  async function save(): Promise<boolean> {
    const current = entry.value
    if (!current || !canEdit.value || busy.value || options.blocked?.value || !dirty.value) return false
    current.issues = validateChannelDraft(current.draft, current.baseline)
    if (current.isNew && configs.value.some(item => item.id === current.draft.id?.trim())) current.issues.push({ path: 'id', key: 'duplicateId' })
    if (current.issues.length) return false
    busy.value = true
    current.failure = undefined
    try {
      const payload = channelConfigPayload(current.draft, current.baseline)
      const id = payload.id!
      if (current.isNew) await api.createConfig(payload)
      else await api.updateConfig({ ...payload, id })
      const saved: NotifierConfig = { ...payload, id }
      // A newly created anonymous SMTP config has a known empty password, unlike a redacted server field.
      if (current.isNew && payload.type === 'email' && saved.configuration.password === undefined) saved.configuration.password = ''
      const previousKey = current.key
      current.key = `${channelId.value}\0record:${id}`
      current.isNew = false
      current.baseline = saved
      current.draft = createChannelConfigDraft(saved)
      current.snapshot = JSON.stringify(current.draft)
      drafts.delete(previousKey)
      drafts.set(current.key, current)
      activeKey.value = current.key
      selectedConfigId.value = id
      remembered.set(channelId.value, { id })
      publishNotificationConfigurationChange({ id, channel: channelId.value, action: 'saved' })
      busy.value = false
      await activate(channelId.value, id)
      return true
    } catch (error) {
      current.failure = classifyNotificationFailure(error)
      return false
    } finally { busy.value = false }
  }

  /** Delete only the actual selected record; other configurations and drafts stay intact. */
  async function deleteConfig(): Promise<boolean> {
    const current = entry.value
    if (!current?.draft.id || current.isNew || busy.value || options.blocked?.value || !options.permissions.query.value || !options.permissions.delete.value) return false
    busy.value = true
    try {
      await api.deleteConfig(current.draft.id)
      const id = current.draft.id
      drafts.delete(current.key)
      remembered.delete(channelId.value)
      activeKey.value = ''
      selectedConfigId.value = undefined
      publishNotificationConfigurationChange({ id, channel: channelId.value, action: 'deleted' })
      busy.value = false
      await activate(channelId.value)
      return true
    } catch (error) {
      current.failure = classifyNotificationFailure(error)
      return false
    } finally { busy.value = false }
  }

  /** Reset is explicit; cached drafts in other channels are not touched. */
  function resetDraft() {
    if (!entry.value || busy.value || options.blocked?.value) return
    entry.value.draft = JSON.parse(entry.value.snapshot) as NotifierConfigPayload
    entry.value.issues = []
    entry.value.failure = undefined
  }

  return { channelId, channel, configs, state, detailState, entry, selectedConfigId, busy, dirty, hasUnsavedChanges, canEdit, activate, selectConfig, createConfig, changeField, save, deleteConfig, resetDraft }
}
