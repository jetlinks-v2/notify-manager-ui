import { computed, getCurrentScope, onScopeDispose, reactive, ref, type Ref } from 'vue'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../api/notice/messageNotification'
import type { NoticeChannelConfig, NoticeChannelTemplateItem } from '../../../../api/notice-center'
import {
  classifyNotificationFailure, cloneNotificationValue, findNotificationChannel, notificationEnumValue,
  NotificationRequestError, withNotificationChannel,
  type NotificationLoadState, type NotificationTemplate, type NotificationVariable,
} from '../shared'
import { buildTemplatePayload, createTemplateDraft, newTemplateDraft, templateDraftFingerprint, type TemplateDraft } from './model'
import { createPrototypeTemplate, hasPrototypeTemplate, prototypeAvailableVariables } from './definition/templateDefaults'
import { useTemplateCatalog } from './hooks/useTemplateCatalog'
import {
  buildBusinessTemplateItem, businessDraftKey, businessIdentity, channelProviderFor,
  hasDefiniteSaveRejection, mergeSavedBusiness, readBusinessTemplate, restoreBusinessDefaultDraft, type TemplateDraftEntry,
} from './workspace/businessTemplates'

interface WorkspaceAccess { query: Ref<boolean>; add: Ref<boolean>; update: Ref<boolean> }

/** Own business/provider drafts and legacy standalone links; late responses never replace the current selection. */
export function useTemplateWorkspace(access: WorkspaceAccess, api: MessageNotificationApi = messageNotificationApi) {
  const channelId = ref('email:embedded')
  const templates = ref<NotificationTemplate[]>([])
  const business = ref<NoticeChannelConfig>()
  const catalog = useTemplateCatalog(access.query, channelId, api)
  const { channels, catalogState, configs, configState, metadata, metadataState } = catalog
  const listState = ref<NotificationLoadState>('idle')
  const detailState = ref<NotificationLoadState>('idle')
  const saveState = ref<NotificationLoadState>('idle')
  const activeKey = ref('')
  const drafts = reactive(new Map<string, TemplateDraftEntry>())
  const variables = new Map<string, NotificationVariable[]>()
  const variablePools = reactive(new Map<string, NotificationVariable[]>())
  const variablesRequests = new Map<string, Promise<NotificationVariable[]>>()
  const savedIdentities = new Map<string, NoticeChannelConfig>()
  const uncertainBusinesses = reactive(new Set<string>())
  const templateLists = new Map<string, NotificationTemplate[]>()
  const templateListStates = new Map<string, NotificationLoadState>()
  const templateListRequests = new Map<string, Promise<void>>()
  const saving = ref(false)
  let listRevision = 0
  let detailRevision = 0
  let listEpoch = 0
  let variableRevision = 0
  const currentChannel = computed(() => findNotificationChannel(channelId.value, channels.value))
  const entry = computed(() => {
    const candidate = drafts.get(activeKey.value)
    return access.query.value && candidate && `${candidate.draft.type}:${candidate.draft.provider}` === channelId.value
      ? candidate : undefined
  })
  const draft = computed(() => entry.value?.draft)
  const entryDirty = (item: TemplateDraftEntry) => item.baseline !== templateDraftFingerprint(item.draft) || item.enabled !== item.baselineEnabled
  const dirty = computed(() => Boolean(entry.value && entryDirty(entry.value)))
  const hasDirtyDrafts = computed(() => [...drafts.values()].some(entryDirty))
  const saveOutcomeUnknown = computed(() => Boolean(business.value && uncertainBusinesses.has(businessIdentity(business.value))))
  const availableVariables = computed<NotificationVariable[]>(() => {
    const selected = business.value
    const values = selected ? prototypeAvailableVariables(selected, variablePools.get(businessIdentity(selected)) || []) : []
    const merged = new Map(values.map(value => [value.id, cloneNotificationValue(value)]))
    // Stored and currently edited definitions own their metadata; the insertion pool never becomes saved declarations by itself.
    for (const value of draft.value?.variables || []) merged.set(value.id, cloneNotificationValue(value))
    return [...merged.values()]
  })
  const isDefault = computed(() => Boolean(entry.value?.prototype && !entry.value.existing))
  const hasContent = computed(() => Boolean(entry.value?.existing || entry.value?.prototype
    || draft.value?.subject.trim() || draft.value?.text.trim()
    || draft.value && draft.value.templateJson.trim() !== '{}' && draft.value.templateJson.trim() !== ''))
  const canRestoreDefault = computed(() => Boolean(business.value && currentChannel.value && entry.value
    && hasPrototypeTemplate(business.value, currentChannel.value) && !saving.value
    && (entry.value.existing ? access.update.value : access.add.value)))
  const canSave = computed(() => Boolean(access.query.value && detailState.value === 'ready' && entry.value && !saveOutcomeUnknown.value
    && (entry.value.existing ? access.update.value : access.add.value)
    && configState.value === 'ready' && configs.value.some(config => config.id === draft.value?.configId)))
  const channelEnabled = computed({ get: () => entry.value?.enabled ?? true, set: value => {
    if (business.value && entry.value && canSave.value && !saving.value) entry.value.enabled = value
  } })

  /** Build the dynamic directory and shared config snapshot without touching in-memory drafts. */
  async function loadCatalog() {
    await Promise.all([catalog.loadCatalog(), catalog.loadConfigs()])
  }

  /** Explicit reload refreshes backend choices and bindings while leaving user drafts untouched. */
  async function reloadCatalog() {
    ++listRevision; ++detailRevision
    catalog.clear()
    ++listEpoch; ++variableRevision
    variables.clear(); variablePools.clear(); variablesRequests.clear()
    templateLists.clear(); templateListStates.clear(); templateListRequests.clear()
    templates.value = []; listState.value = 'idle'
    await loadCatalog()
    const channel = currentChannel.value
    if (channel) await loadTemplates(channel.id)
  }

  /** One exact-provider template list supplies directory bindings; single-channel detail remains the editor's source of truth. */
  function loadTemplates(id: string, force = false): Promise<void> {
    const channel = catalog.requireChannel(id)
    const cachedState = templateListStates.get(id)
    if (!force && (cachedState === 'ready' || cachedState === 'empty')) {
      if (channelId.value === id) { templates.value = templateLists.get(id) || []; listState.value = cachedState }
      return Promise.resolve()
    }
    const pending = templateListRequests.get(id)
    if (pending) return pending
    const epoch = listEpoch
    if (channelId.value === id) { templates.value = templateLists.get(id) || []; listState.value = 'loading' }
    templateListStates.set(id, 'loading')
    const request = api.queryTemplates(withNotificationChannel({ paging: false }, channel)).then(result => {
      if (epoch !== listEpoch || !access.query.value) return
      const records = result.data.filter(value => notificationEnumValue(value.type) === channel.type && notificationEnumValue(value.provider) === channel.provider)
      const state = records.length ? 'ready' : 'empty'
      templateLists.set(id, records); templateListStates.set(id, state)
      if (channelId.value === id) { templates.value = records; listState.value = state }
    }).catch(error => {
      if (epoch !== listEpoch) return
      const state = classifyNotificationFailure(error)
      templateListStates.set(id, state)
      if (channelId.value === id) listState.value = state
    }).finally(() => { if (templateListRequests.get(id) === request) templateListRequests.delete(id) })
    templateListRequests.set(id, request)
    return request
  }

  /** Deep links initialize only unbound drafts; unavailable explicit IDs stay unmatched instead of choosing another config. */
  function selectDraftConfig(current: TemplateDraftEntry | undefined, requestedConfigId?: string) {
    if (current && !current.existing && !current.draft.configId) {
      const configId = requestedConfigId || (configs.value.length === 1 ? configs.value[0].id : '')
      if (!configId) return
      current.draft.configId = configId
      current.baselineDraft.configId = current.draft.configId
      current.baseline = templateDraftFingerprint(current.baselineDraft)
    }
  }

  async function refreshConfigs() {
    await catalog.loadConfigs(true)
    selectDraftConfig(entry.value)
  }

  /** Cache variables by actual topic identity; a rejected request is never an empty successful schema. */
  function loadBusinessVariables(selected: NoticeChannelConfig): Promise<NotificationVariable[]> {
    if (!selected.id) return Promise.resolve([])
    const identity = businessIdentity(selected)
    const cached = variables.get(identity)
    if (cached) return Promise.resolve(cached)
    const pending = variablesRequests.get(identity)
    if (pending) return pending
    const version = variableRevision
    const request = api.queryBusinessVariables(selected.id).then(result => {
      if (version === variableRevision && access.query.value) { variables.set(identity, result); variablePools.set(identity, result) }
      return result
    }).finally(() => { if (variablesRequests.get(identity) === request) variablesRequests.delete(identity) })
    variablesRequests.set(identity, request)
    return request
  }

  /** A baseline is a value snapshot, so cancelling preserves a real template or its unsaved prototype. */
  function draftEntry(value: TemplateDraft, existing: boolean, rest: Partial<TemplateDraftEntry> = {}): TemplateDraftEntry {
    const enabled = rest.businessIdentity ? (typeof rest.channel?.state === 'string' ? rest.channel.state : rest.channel?.state?.value) !== 'disabled' : undefined
    return { draft: value, baseline: templateDraftFingerprint(value), baselineDraft: cloneNotificationValue(value), existing, enabled, baselineEnabled: enabled, ...rest }
  }

  /** Query the one backend channel before applying a prototype for a verified absence of stored content. */
  async function loadBusiness(selected: NoticeChannelConfig, id: string, requestedConfigId?: string) {
    const revision = ++detailRevision
    ++listRevision
    const resolved = savedIdentities.get(businessIdentity(selected)) || selected
    business.value = cloneNotificationValue(resolved)
    channelId.value = id
    activeKey.value = ''
    templates.value = templateLists.get(id) || []
    saveState.value = 'idle'
    detailState.value = 'loading'
    listState.value = templateListStates.get(id) || 'idle'
    if (!access.query.value) { catalog.clear(); listState.value = detailState.value = 'forbidden'; return }
    try {
      await loadCatalog()
      if (revision !== detailRevision || !access.query.value) return
      const channel = catalog.requireChannel(id)
      void loadTemplates(id)
      await catalog.loadMetadata(channel)
      if (revision !== detailRevision || !access.query.value) return
      const key = businessDraftKey(resolved, id)
      activeKey.value = key
      const cached = drafts.get(key)
      if (cached) {
        selectDraftConfig(cached, requestedConfigId)
        detailState.value = 'ready'
        return
      }
      const [item, fields] = await Promise.all([
        resolved.id ? api.getBusinessTemplate(resolved.id, channelProviderFor(channel)) : Promise.resolve(undefined),
        loadBusinessVariables(resolved),
      ])
      if (revision !== detailRevision || !access.query.value) return
      const stored = readBusinessTemplate(resolved, channel, item)
      const prototype = createPrototypeTemplate(resolved, channel, fields)
      const value = stored.template ? createTemplateDraft(stored.template)
        : prototype ? createTemplateDraft(prototype) : newTemplateDraft(channel)
      if (!stored.template && !value.name) value.name = resolved.name || channel.name || channel.type
      const next = draftEntry(value, Boolean(stored.template), {
        businessIdentity: businessIdentity(resolved), channel: cloneNotificationValue(stored.channel || {}), prototype,
      })
      selectDraftConfig(next, requestedConfigId)
      drafts.set(key, next)
      detailState.value = 'ready'
    } catch (error) {
      if (revision === detailRevision) {
        activeKey.value = ''; detailState.value = classifyNotificationFailure(error)
        if (!currentChannel.value) listState.value = detailState.value
      }
    }
  }

  /** Explicit template IDs keep their independent storage semantics and never fall back to business defaults. */
  async function selectTemplate(id: string) {
    const revision = ++detailRevision
    business.value = undefined
    saveState.value = 'idle'
    activeKey.value = id
    if (!access.query.value) { detailState.value = 'forbidden'; return }
    if (!id) { detailState.value = 'idle'; return }
    const cached = drafts.get(id)
    if (cached) { detailState.value = `${cached.draft.type}:${cached.draft.provider}` === channelId.value ? 'ready' : 'unavailable'; return }
    detailState.value = 'loading'
    const requestedChannel = channelId.value
    try {
      const record = await api.getTemplate(id)
      if (revision !== detailRevision || requestedChannel !== channelId.value || !access.query.value) return
      if (!record || record.id !== id || `${notificationEnumValue(record.type)}:${notificationEnumValue(record.provider)}` !== requestedChannel) {
        detailState.value = 'unavailable'; return
      }
      drafts.set(id, draftEntry(createTemplateDraft(record), true))
      detailState.value = 'ready'
    } catch (error) { if (revision === detailRevision) detailState.value = classifyNotificationFailure(error) }
  }

  async function loadChannel(id: string, selectedId = '') {
    const revision = ++listRevision
    ++detailRevision
    business.value = undefined
    channelId.value = id
    activeKey.value = ''
    detailState.value = 'idle'
    templates.value = templateLists.get(id) || []
    if (!access.query.value) { catalog.clear(); listState.value = 'forbidden'; return }
    listState.value = 'loading'
    try {
      await loadCatalog()
      if (revision !== listRevision || !access.query.value) return
      const channel = catalog.requireChannel(id)
      await Promise.all([catalog.loadMetadata(channel), loadTemplates(id)])
      if (revision !== listRevision || !access.query.value) return
      if (selectedId) await selectTemplate(selectedId)
    } catch (error) { if (revision === listRevision) listState.value = classifyNotificationFailure(error) }
  }

  /** Standalone new drafts remain local and are never submitted as invented template IDs. */
  function createTemplate(configId = '') {
    const channel = currentChannel.value
    if (!channel || !access.add.value) return
    ++detailRevision
    business.value = undefined
    const key = `new:${channel.id}`
    if (!drafts.has(key)) drafts.set(key, draftEntry(newTemplateDraft(channel, configId), false))
    activeKey.value = key
    detailState.value = 'ready'
    saveState.value = 'idle'
  }

  /** The returned persisted ID migrates every channel draft for this business, including unsaved sibling vendors. */
  function resetBusinessIdentity(updated: NoticeChannelConfig, previous = business.value) {
    if (!previous) { business.value = cloneNotificationValue(updated); return }
    const previousIdentity = businessIdentity(previous)
    const nextIdentity = businessIdentity(updated)
    const selected = business.value && businessIdentity(business.value) === previousIdentity
    uncertainBusinesses.delete(previousIdentity); uncertainBusinesses.delete(nextIdentity)
    for (const [alias, value] of savedIdentities) {
      if (businessIdentity(value) === previousIdentity) savedIdentities.set(alias, cloneNotificationValue(updated))
    }
    savedIdentities.set(previousIdentity, cloneNotificationValue(updated))
    savedIdentities.set(nextIdentity, cloneNotificationValue(updated))
    for (const [key, item] of [...drafts]) {
      if (item.businessIdentity !== previousIdentity) continue
      item.businessIdentity = nextIdentity
      if (item.channel) item.channel.providerId = updated.id
      if (previousIdentity !== nextIdentity) {
        const nextKey = businessDraftKey(updated, `${item.draft.type}:${item.draft.provider}`)
        drafts.set(nextKey, item); drafts.delete(key)
        if (activeKey.value === key) activeKey.value = nextKey
      }
    }
    const cachedVariables = variables.get(previousIdentity)
    if (cachedVariables) { variables.set(nextIdentity, cachedVariables); variablePools.set(nextIdentity, cachedVariables) }
    if (selected) business.value = cloneNotificationValue(updated)
  }

  /** Apply only a verified successful response; preserve text entered while the request was pending. */
  function applySavedBusiness(current: TemplateDraftEntry, item: NoticeChannelTemplateItem, submitted: string,
    selected = business.value, channel = currentChannel.value, submittedEnabled = current.enabled) {
    if (!selected || !channel) throw new NotificationRequestError('error', item)
    const stored = readBusinessTemplate(selected, channel, item)
    if (!stored.template) throw new NotificationRequestError('error', item)
    const savedDraft = createTemplateDraft(stored.template)
    if (templateDraftFingerprint(current.draft) === submitted) current.draft = savedDraft
    else current.draft.id = savedDraft.id
    current.baselineDraft = cloneNotificationValue(savedDraft)
    current.baseline = templateDraftFingerprint(savedDraft)
    current.existing = true
    current.baselineEnabled = (typeof item.channel.state === 'string' ? item.channel.state : item.channel.state?.value) !== 'disabled'
    if (current.enabled === submittedEnabled) current.enabled = current.baselineEnabled
    current.channel = cloneNotificationValue(item.channel)
    ++listEpoch
    templateListRequests.clear()
    // Upsert into the channel-wide directory snapshot; do not hide other business templates after saving one row.
    for (const [id, records] of templateLists) {
      const next = records.filter(value => value.id !== stored.template?.id)
      if (id === channel.id) next.push(stored.template)
      templateLists.set(id, next)
      templateListStates.set(id, next.length ? 'ready' : 'empty')
    }
    if (!templateLists.has(channel.id)) templateLists.set(channel.id, [stored.template])
    templateListStates.set(channel.id, 'ready')
    if (channelId.value === channel.id) {
      templates.value = templateLists.get(channel.id) || []
      listState.value = templates.value.length ? 'ready' : 'empty'
    }
    // Saving another vendor replaces the same backend channelProvider; retained drafts must follow the new channel settings.
    for (const other of drafts.values()) {
      if (other === current || other.businessIdentity !== current.businessIdentity || other.draft.type !== channel.type) continue
      other.channel = cloneNotificationValue(item.channel)
      if (other.enabled === other.baselineEnabled) other.enabled = current.baselineEnabled
      other.baselineEnabled = current.baselineEnabled
      other.existing = false
      other.draft.id = ''; other.baselineDraft.id = ''
      other.baseline = templateDraftFingerprint(other.baselineDraft)
    }
  }

  /** Existing topics use the single-channel transaction; first save creates one explicitly disabled topic, without enable. */
  async function saveBusiness(current: TemplateDraftEntry, payload: ReturnType<typeof buildTemplatePayload>, fingerprint: string) {
    const selected = business.value
    const channel = currentChannel.value
    if (!selected?.provider || !channel) throw new NotificationRequestError('error')
    const item = buildBusinessTemplateItem(selected, channel, current, payload)
    const submittedEnabled = current.enabled
    if (selected.id) {
      const saved = await api.saveBusinessTemplate(selected.id, channelProviderFor(channel), item)
      if (!readBusinessTemplate(selected, channel, saved).template) throw new NotificationRequestError('error', saved)
      const updated = mergeSavedBusiness(selected, saved.channel)
      resetBusinessIdentity(updated, selected)
      applySavedBusiness(current, saved, fingerprint, updated, channel, submittedEnabled)
    } else {
      const response = await api.saveBusinessTemplates(selected.provider, {
        provider: { ...cloneNotificationValue(selected), id: undefined, channels: undefined, state: 'disabled' }, channels: [item],
      })
      const saved = response.channels.find(value => value.channel.channelProvider === channelProviderFor(channel))
      if (!response.provider?.id || !saved?.template) throw new NotificationRequestError('error', response)
      const updated = mergeSavedBusiness(selected, saved.channel, response.provider)
      if (!readBusinessTemplate(updated, channel, saved).template) throw new NotificationRequestError('error', response)
      resetBusinessIdentity(updated, selected)
      applySavedBusiness(current, saved, fingerprint, updated, channel, submittedEnabled)
    }
  }

  /** Failed writes retain the original draft; no automatic retry can duplicate an uncertain first topic creation. */
  async function saveTemplate(): Promise<boolean> {
    const current = entry.value
    if (!current || saving.value || !canSave.value) return false
    const payload = buildTemplatePayload(current.draft, channels.value)
    const fingerprint = templateDraftFingerprint(current.draft)
    const firstBusiness = business.value && !business.value.id ? businessIdentity(business.value) : undefined
    const key = activeKey.value
    const revision = detailRevision
    saving.value = true
    saveState.value = 'loading'
    try {
      if (business.value) await saveBusiness(current, payload, fingerprint)
      else {
        if (current.existing && payload.id) await api.updateTemplate({ ...payload, id: payload.id })
        else await api.createTemplate(payload)
        current.baseline = fingerprint
        current.baselineDraft = cloneNotificationValue(current.draft)
        if (payload.id) current.existing = true
        else if (activeKey.value === key) { drafts.delete(key); activeKey.value = ''; detailState.value = 'idle' }
        if (currentChannel.value) await loadTemplates(currentChannel.value.id, true)
      }
      if (revision === detailRevision) saveState.value = 'ready'
      return true
    } catch (error) {
      if (firstBusiness && !hasDefiniteSaveRejection(error)) uncertainBusinesses.add(firstBusiness)
      if (revision === detailRevision) saveState.value = classifyNotificationFailure(error)
      return false
    }
    finally { saving.value = false }
  }

  /** Restore prototype contents while retaining the actual template/config IDs and channel authorization fields. */
  function restoreDefault() {
    const current = entry.value
    const selected = business.value
    const channel = currentChannel.value
    if (!current || !selected || !channel || !canRestoreDefault.value) return
    const prototype = createPrototypeTemplate(selected, channel, variables.get(businessIdentity(selected)) || [])
    if (!prototype) return
    current.prototype = prototype
    current.draft = restoreBusinessDefaultDraft(current.draft, prototype)
  }

  /** 历史独立模板仅提供内容，保存目标仍是当前业务渠道的模板身份。 */
  async function importTemplate(id: string) {
    const current = entry.value
    if (!business.value || !current || !canSave.value || saving.value) return
    const revision = ++detailRevision
    const channel = currentChannel.value
    try {
      const record = await api.getTemplate(id)
      if (revision !== detailRevision || current !== entry.value || !canSave.value) return
      if (record.id !== id || notificationEnumValue(record.type) !== channel?.type || notificationEnumValue(record.provider) !== channel?.provider) {
        throw new NotificationRequestError('error', record)
      }
      current.draft = createTemplateDraft({ ...record, id: current.draft.id })
      saveState.value = 'idle'
    } catch (error) { if (revision === detailRevision) saveState.value = classifyNotificationFailure(error) }
  }

  /** Cancel restores the current baseline without disturbing this business's other channel drafts. */
  async function discardDraft() {
    const current = entry.value
    if (!current) return
    if (business.value || current.existing) {
      current.draft = cloneNotificationValue(current.baselineDraft)
      current.enabled = current.baselineEnabled
    }
    else { drafts.delete(activeKey.value); activeKey.value = ''; detailState.value = 'idle' }
  }

  /** Called only after the page confirms leaving a business; discard all of that business's provider drafts. */
  function discardBusinessDrafts() {
    if (!business.value) return
    const identity = businessIdentity(business.value)
    for (const [key, current] of drafts) if (current.businessIdentity === identity) drafts.delete(key)
    variables.delete(identity)
    variablePools.delete(identity)
    ++variableRevision
    ++detailRevision
    activeKey.value = ''
    detailState.value = 'idle'
  }

  if (getCurrentScope()) onScopeDispose(() => { ++listRevision; ++detailRevision; ++listEpoch; ++variableRevision; catalog.clear(); variables.clear(); variablePools.clear(); variablesRequests.clear() })

  return { channelId, currentChannel, channels, catalogState, metadata, metadataState, business, templates,
    configs, listState, configState, detailState, saveState, activeKey, draft, dirty, hasDirtyDrafts, saving,
    canSave, entry, isDefault, hasContent, availableVariables, canRestoreDefault, saveOutcomeUnknown, loadCatalog, reloadCatalog, loadBusiness, loadChannel,
    selectTemplate, refreshConfigs, createTemplate, saveTemplate, discardDraft, discardBusinessDrafts,
    restoreDefault, resetBusinessIdentity, channelEnabled, importTemplate }
}
