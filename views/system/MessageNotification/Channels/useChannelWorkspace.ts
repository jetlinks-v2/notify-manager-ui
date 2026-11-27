import { computed, reactive, ref, shallowRef, type Ref } from 'vue'
import { randomString } from '@jetlinks-web/utils'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../api/notice/messageNotification'
import {
  classifyNotificationFailure, cloneNotificationValue, dingTalkRobotChannelId, findNotificationChannel, notificationChannels,
  publishNotificationConfigurationChange, resolveNotificationChannel, selectNotificationConfig, withNotificationChannel,
  type NotificationFailureKind, type NotificationLoadState, type NotificationNavigation, type NotifierConfig, type NotifierConfigPayload, type NotificationChannel,
} from '../shared'
import { channelConfigPayload, createChannelConfigDraft, validateChannelDraft, type ChannelValidationIssue } from './channelSchema'
import { channelDefaults, type ChannelDefinition } from './configuration/channelMetadata'
import { initialEmailConfiguration } from './configuration/emailSettings'
import { deleteChannelConfiguration } from './configuration/deleteChannelConfiguration'

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
  editing?: boolean
  snapshot: string
  issues: ChannelValidationIssue[]
  definition?: ChannelDefinition
  fieldFailures?: Record<string, NotificationFailureKind>
  refreshFailure?: NotificationFailureKind
}

export interface ChannelFieldChange { key: string; value: unknown; topLevel?: boolean; clearSecret?: boolean }

interface ChannelWorkspaceOptions {
  permissions: ChannelPermissions
  api?: MessageNotificationApi
  navigate?: (navigation: NotificationNavigation) => void | Promise<unknown>
  blocked?: Ref<boolean>
  canDeleteTemplates?: Ref<boolean>
  channels?: Ref<readonly NotificationChannel[]>
  loadConfigs?: (force?: boolean) => Promise<NotifierConfig[]>
  loadDefinition?: (channel: NotificationChannel) => Promise<ChannelDefinition>
  channelName?: (channel: NotificationChannel) => string
  onMutationError?: (error: unknown) => void
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
  const definition = shallowRef<ChannelDefinition>()
  const drafts = reactive(new Map<string, ChannelDraftEntry>())
  const remembered = new Map<string, { id: string } | { isNew: true }>()
  const removedBindingsByConfig = new Map<string, Set<string>>()
  let listVersion = 0
  let detailVersion = 0
  const availableChannels = computed(() => options.channels?.value ?? notificationChannels)
  const channel = computed(() => findNotificationChannel(channelId.value, availableChannels.value))
  const multipleConfigurations = computed(() => !!channel.value?.multipleConfigurations)
  const canCleanTemplates = computed(() => !!options.canDeleteTemplates?.value
    && (channelId.value === dingTalkRobotChannelId || channelId.value === 'webhook:http'))
  const entry = computed(() => drafts.get(activeKey.value))
  const selectedConfigId = ref<string>()
  const dirty = computed(() => !!entry.value && JSON.stringify(entry.value.draft) !== entry.value.snapshot)
  const hasUnsavedChanges = computed(() => [...drafts.values()].some(item => JSON.stringify(item.draft) !== item.snapshot))
  const canEdit = computed(() => !!options.permissions.query.value && !!entry.value && (entry.value.isNew ? options.permissions.add.value : options.permissions.update.value))
  // 单配置渠道直接显示表单，多配置渠道通过弹窗显式编辑。
  const editing = computed(() => !!entry.value && (!multipleConfigurations.value || entry.value.isNew || !!entry.value.editing))

  /** Editing belongs to the cached configuration, so channel switches preserve its draft and mode. */
  function startEditing() {
    if (!canEdit.value || busy.value || options.blocked?.value || !entry.value || detailState.value !== 'ready') return
    entry.value.editing = true
  }

  function cancelEditing() {
    if (!entry.value || entry.value.isNew || busy.value || options.blocked?.value) return
    resetDraft()
    entry.value.editing = false
  }

  /** A dismissed dialog discards only its own draft, including after navigation changes the active entry. */
  function discardConfig(key = activeKey.value) {
    const current = drafts.get(key)
    if (!current || busy.value || options.blocked?.value) return
    if (!current.isNew) {
      current.draft = JSON.parse(current.snapshot) as NotifierConfigPayload
      current.issues = []
      current.fieldFailures = {}
      current.editing = false
      return
    }
    drafts.delete(key)
    remembered.delete(key.split('\0')[0])
    if (activeKey.value !== key) return
    ++detailVersion
    activeKey.value = ''
    selectedConfigId.value = undefined
    detailState.value = 'idle'
    syncNavigation()
  }

  /** Keep query state shareable while excluding ephemeral draft IDs and credentials. */
  function syncNavigation() {
    return options.navigate?.({ channel: channelId.value, ...(selectedConfigId.value ? { configId: selectedConfigId.value } : {}) })
  }

  /** Resolve by explicit ID and validate its provider before exposing it in this channel's editor. */
  async function selectConfig(id?: string) {
    if (busy.value || options.blocked?.value || !channel.value || !options.permissions.query.value) return
    const selected = id && configs.value.some(item => item.id === id) ? id : undefined
    const version = ++detailVersion
    activeKey.value = selected ? `${channelId.value}\0record:${selected}` : ''
    selectedConfigId.value = selected
    if (!selected) { detailState.value = 'idle'; await syncNavigation(); return }
    remembered.set(channelId.value, { id: selected })
    if (drafts.has(activeKey.value)) { detailState.value = 'ready'; await syncNavigation(); return }
    detailState.value = 'loading'
    const expectedChannel = channelId.value
    const key = activeKey.value
    try {
      const record = await api.getConfig(selected)
      if (version !== detailVersion || channelId.value !== expectedChannel) return
      if (!record || record.id !== selected || resolveNotificationChannel(record.type, record.provider, availableChannels.value)?.id !== expectedChannel) throw new Error('invalid-config')
      const draft = createChannelConfigDraft(record, definition.value)
      drafts.set(key, { key, draft, definition: definition.value, baseline: cloneNotificationValue(record), isNew: false, snapshot: JSON.stringify(draft), issues: [] })
      detailState.value = 'ready'
    } catch (error) {
      if (version === detailVersion) detailState.value = classifyNotificationFailure(error)
    }
    // Row actions run after route watchers settle, so a new test dialog is not closed by this selection.
    if (version === detailVersion) await syncNavigation()
  }

  /** Ignore late query/detail responses after channel changes; a denied query makes no request. */
  async function activate(id: string, requestedId?: string, force = false) {
    if (busy.value || options.blocked?.value) return
    const version = ++listVersion
    ++detailVersion
    channelId.value = id
    activeKey.value = ''
    selectedConfigId.value = undefined
    configs.value = []
    detailState.value = 'idle'
    definition.value = undefined
    if (!channel.value) { state.value = 'unavailable'; return }
    if (!options.permissions.query.value) { state.value = 'forbidden'; return }
    state.value = 'loading'
    try {
      const selectedChannel = channel.value
      const [records, schema] = await Promise.all([
        options.loadConfigs ? options.loadConfigs(force) : api.queryConfigs(withNotificationChannel({ paging: false }, selectedChannel)).then(result => result.data),
        options.loadDefinition?.(selectedChannel),
      ])
      if (version !== listVersion) return
      definition.value = schema
      configs.value = records.filter(item => resolveNotificationChannel(item.type, item.provider, availableChannels.value)?.id === id)
      state.value = configs.value.length ? 'ready' : 'empty'
      const rememberedId = remembered.get(id)
      if (!requestedId && rememberedId && 'isNew' in rememberedId && drafts.has(`${id}\0new`) && (multipleConfigurations.value || !configs.value.length)) {
        activeKey.value = `${id}\0new`
        detailState.value = 'ready'
        syncNavigation()
        return
      }
      const candidate = requestedId ?? (rememberedId && 'id' in rememberedId ? rememberedId.id : undefined)
      // 未配置的单配置渠道也要展示表单，提交仍由新增权限控制。
      if (!multipleConfigurations.value && !configs.value.length && !requestedId) {
        openNewDraft(selectedChannel)
        return
      }
      // Open existing data on entry; an explicit link must never fall back to a different record.
      const selected = selectNotificationConfig(configs.value, candidate) ?? (!requestedId ? configs.value[0] : undefined)
      await selectConfig(selected?.id)
    } catch (error) {
      if (version === listVersion) state.value = classifyNotificationFailure(error)
    }
  }

  function createConfig() {
    const selectedChannel = channel.value
    if (!selectedChannel || !options.permissions.add.value || !['ready', 'empty'].includes(state.value)) return
    // 只在明确支持多配置的渠道开放新增，历史记录仍可按 ID 打开。
    if (!multipleConfigurations.value && configs.value.length) return
    openNewDraft(selectedChannel)
  }

  /** Generate identity once per draft; automatic values form its clean snapshot and survive retries. */
  function openNewDraft(selectedChannel: NotificationChannel) {
    if (!options.permissions.query.value || busy.value || options.blocked?.value) return
    ++detailVersion
    const key = `${channelId.value}\0new`
    if (!drafts.has(key)) {
      const baseName = options.channelName?.(selectedChannel) || selectedChannel.name || selectedChannel.id
      const names = new Set([...configs.value.map(item => item.name), ...[...drafts.values()].map(item => item.draft.name)])
      let name = baseName
      for (let suffix = 2; names.has(name); suffix++) name = `${baseName} (${suffix})`
      let id = randomString(32)
      while (configs.value.some(item => item.id === id) || [...drafts.values()].some(item => item.draft.id === id)) id = randomString(32)
      const defaults = channelDefaults(definition.value)
      const configuration = selectedChannel.id === 'email:embedded' ? initialEmailConfiguration(defaults, definition.value) : defaults
      const draft: NotifierConfigPayload = { id, name, type: selectedChannel.type, provider: selectedChannel.provider, configuration }
      drafts.set(key, { key, draft, definition: definition.value, isNew: true, snapshot: JSON.stringify(draft), issues: [] })
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
    if (entry.value.fieldFailures) delete entry.value.fieldFailures[key]
  }

  /** Refresh only the list after a confirmed write; retry must never replay the update. */
  async function refreshSaved() {
    const current = entry.value
    if (!current || !options.permissions.query.value) return
    const expectedChannel = channelId.value
    const version = detailVersion
    try {
      const records = options.loadConfigs ? await options.loadConfigs(true)
        : (await api.queryConfigs(withNotificationChannel({ paging: false }, channel.value!))).data
      if (version !== detailVersion || expectedChannel !== channelId.value) return
      configs.value = records.filter(item => resolveNotificationChannel(item.type, item.provider, availableChannels.value)?.id === expectedChannel)
      current.refreshFailure = undefined
    } catch (error) {
      if (version === detailVersion) current.refreshFailure = classifyNotificationFailure(error)
    }
  }

  /** Merge only this field transaction into the saved baseline; other unsaved edits never enter its payload. */
  async function saveFields(changes: ChannelFieldChange[], errorPath: string, latest?: NotifierConfig): Promise<boolean> {
    const current = entry.value
    if (!current?.baseline || current.isNew || !canEdit.value || busy.value || options.blocked?.value || !changes.length) return false
    const clearFields = changes.filter(change => change.clearSecret).map(change => change.key)
    if (clearFields.some(key => !current.definition?.optionalSecretFields?.includes(key))) return false
    if (latest && (latest.id !== current.baseline.id || dirty.value)) return false
    const baseline = latest ?? current.baseline
    const candidate = createChannelConfigDraft(baseline, current.definition)
    for (const change of changes) {
      if (change.topLevel && change.key === 'name') candidate.name = String(change.value ?? '')
      else if (!change.topLevel) candidate.configuration[change.key] = change.value
    }
    if (!clearFields.length && JSON.stringify(candidate) === JSON.stringify(createChannelConfigDraft(baseline, current.definition))) return true
    const paths = new Set(changes.map(change => change.key))
    // Validate this transaction and preservation of secrets, without blocking on unrelated legacy fields.
    const issues = validateChannelDraft(candidate, baseline, current.definition, clearFields)
      .filter(issue => paths.has(issue.path) || issue.key === 'secretRequired')
    current.issues = [...current.issues.filter(issue => !paths.has(issue.path)), ...issues]
    if (issues.length) return false
    const version = detailVersion
    busy.value = true
    current.fieldFailures ??= {}
    delete current.fieldFailures[errorPath]
    try {
      const payload = channelConfigPayload(candidate, baseline, current.definition, clearFields)
      await api.updateConfig({ ...payload, id: current.baseline.id })
      if (version !== detailVersion || !options.permissions.query.value) return true
      const saved: NotifierConfig = { ...payload, id: current.baseline.id }
      const clean = createChannelConfigDraft(saved, current.definition)
      current.baseline = saved
      current.snapshot = JSON.stringify(clean)
      if (latest) current.draft = cloneNotificationValue(clean)
      for (const change of changes) {
        if (change.topLevel && change.key === 'name') current.draft.name = clean.name
        else if (!change.topLevel) current.draft.configuration[change.key] = clean.configuration[change.key]
      }
      current.issues = current.issues.filter(issue => !paths.has(issue.path))
      publishNotificationConfigurationChange({ id: saved.id, channel: channelId.value, action: 'saved' })
      await refreshSaved()
      return true
    } catch (error) {
      if (version === detailVersion) current.fieldFailures[errorPath] = classifyNotificationFailure(error)
      return false
    } finally { busy.value = false }
  }

  /** Success is established by the write response; a later refresh failure never causes another POST. */
  async function save(): Promise<boolean> {
    const current = entry.value
    if (!current || !canEdit.value || busy.value || options.blocked?.value || (!current.isNew && !dirty.value)) return false
    if (current.isNew && !multipleConfigurations.value && configs.value.length) return false
    current.issues = validateChannelDraft(current.draft, current.baseline, current.definition)
    if (current.isNew && configs.value.some(item => item.id === current.draft.id?.trim())) current.issues.push({ path: 'id', key: 'duplicateId' })
    if (current.issues.length) return false
    const version = detailVersion
    busy.value = true
    try {
      const payload = channelConfigPayload(current.draft, current.baseline, current.definition)
      const id = payload.id!
      if (current.isNew) await api.createConfig(payload)
      else await api.updateConfig({ ...payload, id })
      // Permission loss clears the workspace while a write may still be in flight.
      if (version !== detailVersion || !options.permissions.query.value) return true
      const saved: NotifierConfig = { ...payload, id }
      // A newly created anonymous SMTP config has a known empty password, unlike a redacted server field.
      if (current.isNew && payload.type === 'email' && saved.configuration.password === undefined) saved.configuration.password = ''
      const previousKey = current.key
      current.key = `${channelId.value}\0record:${id}`
      current.isNew = false
      current.editing = false
      current.baseline = saved
      current.draft = createChannelConfigDraft(saved, current.definition)
      current.snapshot = JSON.stringify(current.draft)
      drafts.delete(previousKey)
      drafts.set(current.key, current)
      activeKey.value = current.key
      selectedConfigId.value = id
      remembered.set(channelId.value, { id })
      publishNotificationConfigurationChange({ id, channel: channelId.value, action: 'saved' })
      busy.value = false
      await activate(channelId.value, id, true)
      return true
    } catch (error) {
      if (version === detailVersion) options.onMutationError?.(error)
      return false
    } finally { busy.value = false }
  }

  /** Delete only the actual selected record; other configurations and drafts stay intact. */
  async function deleteConfig(): Promise<boolean> {
    const current = entry.value
    if (!current?.draft.id || current.isNew || busy.value || options.blocked?.value || !options.permissions.query.value || !options.permissions.delete.value) return false
    const version = detailVersion
    const id = current.draft.id
    const currentChannel = channelId.value
    busy.value = true
    try {
      if (canCleanTemplates.value) {
        const removedBindings = removedBindingsByConfig.get(id) ?? new Set<string>()
        removedBindingsByConfig.set(id, removedBindings)
        await deleteChannelConfiguration(api, id, `notifier-${current.draft.type}`, removedBindings, () =>
          version === detailVersion && channelId.value === currentChannel && options.permissions.query.value && options.permissions.delete.value && canCleanTemplates.value)
      } else {
        await api.deleteConfig(id)
      }
      removedBindingsByConfig.delete(id)
      if (version !== detailVersion || !options.permissions.query.value) return true
      drafts.delete(current.key)
      remembered.delete(channelId.value)
      activeKey.value = ''
      selectedConfigId.value = undefined
      publishNotificationConfigurationChange({ id, channel: channelId.value, action: 'deleted' })
      busy.value = false
      await activate(channelId.value, undefined, true)
      return true
    } catch (error) {
      if (version === detailVersion) options.onMutationError?.(error)
      return false
    } finally { busy.value = false }
  }

  /** Reset is explicit; cached drafts in other channels are not touched. */
  function resetDraft() {
    if (!entry.value || busy.value || options.blocked?.value) return
    entry.value.draft = JSON.parse(entry.value.snapshot) as NotifierConfigPayload
    entry.value.issues = []
    entry.value.fieldFailures = {}
  }

  /** Permission loss invalidates pending reads and releases all credential-bearing page memory. */
  function clear() {
    ++listVersion; ++detailVersion
    activeKey.value = ''; selectedConfigId.value = undefined; configs.value = []; definition.value = undefined
    drafts.clear(); remembered.clear(); removedBindingsByConfig.clear(); state.value = 'forbidden'; detailState.value = 'idle'
  }

  return { channelId, channel, multipleConfigurations, configs, state, detailState, entry, selectedConfigId, busy, dirty, hasUnsavedChanges, canEdit, canCleanTemplates, editing, startEditing, cancelEditing, discardConfig, activate, selectConfig, createConfig, changeField, save, saveFields, refreshSaved, deleteConfig, resetDraft, clear }
}
