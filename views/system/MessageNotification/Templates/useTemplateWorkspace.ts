import { computed, getCurrentScope, onScopeDispose, reactive, ref, type Ref } from 'vue'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../api/notice/messageNotification'
import type { NoticeChannelConfig, NoticeChannelTemplateItem } from '../../../../api/notice-center'
import {
  classifyNotificationFailure, cloneNotificationValue, dingTalkRobotChannelId, findNotificationChannel, notificationEnumValue, usesBusinessChannelKey,
  NotificationRequestError, withNotificationChannel,
  type NotificationLoadState, type NotificationTemplate, type NotificationVariable,
} from '../shared'
import { buildTemplatePayload, createTemplateDraft, newTemplateDraft, templateDraftFingerprint, type TemplateDraft } from './model'
import { createPrototypeTemplate, hasPrototypeTemplate, prototypeAvailableVariables, type PrototypeTranslate } from './definition/templateDefaults'
import { filterUnsupportedRecommendedVariables, mergeTemplateVariableDeclarations } from '../../../notice/template/hooks/noticeTemplateModel'
import { applyWorkRecipients, assertWorkConfig, emptyWorkRecipients, isWorkChannel, readWorkRecipients,
  workRecipientContent, type WorkRecipients } from '../shared/workRecipients'
import { useTemplateCatalog } from './hooks/useTemplateCatalog'
import {
  bindingConfigId, buildBusinessTemplateItem, businessChannelBindings, businessChannelKey, businessDraftKey, businessIdentity, channelProviderFor,
  hasDefiniteSaveRejection, loadBusinessTemplateForConfig, mergeSavedBusiness, readBusinessTemplate, readSavedBusinessTemplate,
  restoreBusinessDefaultDraft, type TemplateDraftEntry,
} from './workspace/businessTemplates'

interface WorkspaceAccess { query: Ref<boolean>; add: Ref<boolean>; update: Ref<boolean> }

/** Own business/provider drafts and legacy standalone links; late responses never replace the current selection. */
export function useTemplateWorkspace(access: WorkspaceAccess, api: MessageNotificationApi = messageNotificationApi, translate?: PrototypeTranslate) {
  const channelId = ref('email:embedded')
  const templates = ref<NotificationTemplate[]>([])
  const business = ref<NoticeChannelConfig>()
  const catalog = useTemplateCatalog(access.query, channelId, api)
  const { channels, catalogState, configs, configurationsByChannel, configState, channelConfigurationStates, metadata, metadataState } = catalog
  const listState = ref<NotificationLoadState>('idle')
  const detailState = ref<NotificationLoadState>('idle')
  const saveState = ref<NotificationLoadState>('idle')
  const changingChannelState = ref(false)
  const channelActionState = ref<NotificationLoadState>('idle')
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
  const channelStateTarget = computed(() => {
    const providerId = business.value?.id
    const saved = entry.value
    const channel = saved?.channel
    const templateId = saved?.baselineDraft.id
    const configId = saved?.baselineDraft.configId
    if (detailState.value !== 'ready' || !saved?.existing || !providerId || !channel?.id || channel.providerId !== providerId
      || !templateId || !configId || channel.channelConfiguration?.templateId !== templateId) return
    const state = typeof channel.state === 'string' ? channel.state : channel.state?.value
    return { providerId, channel, channelId: channel.id, templateId, configId, enabled: state === 'enabled' }
  })
  const channelActionFailure = computed(() => ['error', 'forbidden', 'unavailable'].includes(channelActionState.value))
  const canToggleChannel = computed(() => !!channelStateTarget.value && access.update.value && !channelActionFailure.value)
  const entryDirty = (item: TemplateDraftEntry) => item.baseline !== templateDraftFingerprint(item.draft)
  const dirty = computed(() => Boolean(entry.value && entryDirty(entry.value)))
  const hasDirtyDrafts = computed(() => [...drafts.values()].some(entryDirty))
  const saveOutcomeUnknown = computed(() => Boolean(business.value && uncertainBusinesses.has(businessIdentity(business.value))))
  const availableVariables = computed<NotificationVariable[]>(() => {
    const selected = business.value
    const values = selected ? prototypeAvailableVariables(selected, variablePools.get(businessIdentity(selected)) || [], translate) : []
    // 推荐元数据只补全缺失项，不把可用变量池自动写入已保存声明。
    return filterUnsupportedRecommendedVariables(selected?.provider,
      mergeTemplateVariableDeclarations(values, draft.value?.variables || [], Boolean(selected)),
    ).map(cloneNotificationValue)
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
    && (entry.value.businessConfigId === undefined || entry.value.businessConfigId === draft.value?.configId)
    && configState.value === 'ready' && configs.value.some(config => config.id === draft.value?.configId)))
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
      if (epoch !== listEpoch || templateListRequests.get(id) !== request || !access.query.value) return
      const records = result.data.filter(value => notificationEnumValue(value.type) === channel.type && notificationEnumValue(value.provider) === channel.provider)
      const state = records.length ? 'ready' : 'empty'
      templateLists.set(id, records); templateListStates.set(id, state)
      if (channelId.value === id) { templates.value = records; listState.value = state }
    }).catch(error => {
      if (epoch !== listEpoch || templateListRequests.get(id) !== request) return
      const state = classifyNotificationFailure(error)
      templateListStates.set(id, state)
      if (channelId.value === id) listState.value = state
    }).finally(() => { if (templateListRequests.get(id) === request) templateListRequests.delete(id) })
    templateListRequests.set(id, request)
    return request
  }

  /** 使用旧版单通道的草稿可以原地选择配置，具名模板通过重新选择实例加载。 */
  function selectDraftConfig(current: TemplateDraftEntry | undefined, requestedConfigId?: string) {
    if (!current || current.existing || current.businessConfigId !== undefined || current.draft.configId) return
    const configId = requestedConfigId || (configs.value.length === 1 ? configs.value[0]?.id : undefined)
    if (!configId || configId === current.draft.configId) return
    current.draft.configId = configId
    current.baselineDraft.configId = configId
    current.baseline = templateDraftFingerprint(current.baselineDraft)
  }

  async function refreshConfigs() {
    await catalog.loadConfigs(true)
    const current = entry.value
    const selected = business.value
    if (selected && current?.businessConfigId === '' && configs.value.length) {
      await loadBusiness(selected, channelId.value)
    } else {
      selectDraftConfig(current)
    }
  }

  /** A new binding invalidates only previously unbound, untouched drafts for its channel. */
  function refreshUnboundTemplates(id: string) {
    if (channelId.value === id) ++detailRevision
    for (const [key, item] of drafts) {
      if (item.businessIdentity && !item.existing && !entryDirty(item)
        && `${item.draft.type}:${item.draft.provider}` === id) drafts.delete(key)
    }
    templateListStates.delete(id)
    templateListRequests.delete(id)
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
    return { draft: value, baseline: templateDraftFingerprint(value), baselineDraft: cloneNotificationValue(value), existing, ...rest }
  }

  /** 凭证也是业务模板的选择身份，每个实例拥有独立草稿和保存基线。 */
  async function loadBusiness(selected: NoticeChannelConfig, id: string, requestedConfigId?: string) {
    const revision = ++detailRevision
    ++listRevision
    const resolved = savedIdentities.get(businessIdentity(selected)) || selected
    business.value = cloneNotificationValue(resolved)
    channelId.value = id
    activeKey.value = ''
    templates.value = templateLists.get(id) || []
    saveState.value = 'idle'
    channelActionState.value = 'idle'
    detailState.value = 'loading'
    listState.value = templateListStates.get(id) || 'idle'
    if (!access.query.value) { catalog.clear(); listState.value = detailState.value = 'forbidden'; return }
    try {
      await loadCatalog()
      if (revision !== detailRevision || !access.query.value) return
      const channel = catalog.requireChannel(id)
      const keyed = usesBusinessChannelKey(id)
      const listRequest = loadTemplates(id)
      await Promise.all([catalog.loadMetadata(channel), keyed ? listRequest : undefined])
      if (revision !== detailRevision || !access.query.value) return
      const records = templateLists.get(id) ?? []
      // 群机器人配置确认为空时加载默认预览。工作通知也使用 notifier-dingTalk，绑定可能指向另一类配置。
      const emptyRobot = id === dingTalkRobotChannelId && configState.value === 'empty'
      let configId = keyed ? '' : undefined
      if (keyed && !emptyRobot) {
        const knownConfigIds = businessChannelBindings(resolved, channel)
          .map(binding => bindingConfigId(binding, records) || businessChannelKey(binding))
        if (requestedConfigId && !knownConfigIds.includes(requestedConfigId) && !configs.value.some(config => config.id === requestedConfigId)) {
          detailState.value = 'unavailable'
          return
        }
        configId = requestedConfigId || knownConfigIds.find(candidate => configs.value.some(config => config.id === candidate))
          || configs.value[0]?.id || knownConfigIds.find(Boolean) || ''
      }
      const key = businessDraftKey(resolved, id, configId)
      activeKey.value = key
      const cached = drafts.get(key)
      if (cached) {
        selectDraftConfig(cached, requestedConfigId)
        detailState.value = 'ready'
        return
      }
      const [stored, fields] = await Promise.all([
        keyed ? loadBusinessTemplateForConfig(api, resolved, channel, configId || '', records)
          : (resolved.id ? api.getBusinessTemplate(resolved.id, channelProviderFor(channel)) : Promise.resolve(undefined))
            .then(item => readBusinessTemplate(resolved, channel, item)),
        loadBusinessVariables(resolved),
      ])
      if (revision !== detailRevision || !access.query.value) return
      const prototype = createPrototypeTemplate(resolved, channel, fields, translate)
      const value = stored.template ? createTemplateDraft(stored.template)
        : prototype ? createTemplateDraft(prototype) : newTemplateDraft(channel)
      if (!stored.template && !value.name) value.name = resolved.name || channel.name || channel.type
      if (configId !== undefined) value.configId = configId
      const next = draftEntry(value, Boolean(stored.template), {
        businessIdentity: businessIdentity(resolved), businessConfigId: configId,
        channel: stored.channel && cloneNotificationValue(stored.channel), prototype,
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

  /** 只接收当前详情的响应，保留草稿及路由中的凭证选择。 */
  async function toggleChannel(): Promise<boolean> {
    const target = channelStateTarget.value
    if (!target || !canToggleChannel.value || changingChannelState.value) return false
    const revision = detailRevision
    changingChannelState.value = true
    channelActionState.value = 'loading'
    const active = () => revision === detailRevision && access.query.value
    try {
      const state = await api.updateBusinessChannelState(target.providerId, target.channelId, {
        templateId: target.templateId, configId: target.configId, state: target.enabled ? 'disabled' : 'enabled',
      })
      if (!active()) return false
      target.channel.state = state
      channelActionState.value = 'ready'
      return true
    } catch (error) {
      if (active()) channelActionState.value = classifyNotificationFailure(error)
      return false
    } finally {
      changingChannelState.value = false
    }
  }

  /** Explicit template IDs keep their independent storage semantics and never fall back to business defaults. */
  async function selectTemplate(id: string) {
    const revision = ++detailRevision
    business.value = undefined
    saveState.value = 'idle'
    channelActionState.value = 'idle'
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
    channelActionState.value = 'idle'
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
    const key = channel.multipleConfigurations && configId ? `new:${channel.id}:${configId}` : `new:${channel.id}`
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
        const nextKey = businessDraftKey(updated, `${item.draft.type}:${item.draft.provider}`, item.businessConfigId)
        drafts.set(nextKey, item); drafts.delete(key)
        if (activeKey.value === key) activeKey.value = nextKey
      }
    }
    const cachedVariables = variables.get(previousIdentity)
    if (cachedVariables) { variables.set(nextIdentity, cachedVariables); variablePools.set(nextIdentity, cachedVariables) }
    if (selected) business.value = cloneNotificationValue(updated)
  }

  /** Apply only a verified successful response; preserve text entered while the request was pending. */
  function applySavedBusiness(current: TemplateDraftEntry, item: NoticeChannelTemplateItem, stored: NotificationTemplate,
    submitted: string, channelId: string) {
    const savedDraft = createTemplateDraft(stored)
    if (templateDraftFingerprint(current.draft) === submitted) current.draft = savedDraft
    else current.draft.id = savedDraft.id
    current.baselineDraft = cloneNotificationValue(savedDraft)
    current.baseline = templateDraftFingerprint(savedDraft)
    current.existing = true
    current.channel = cloneNotificationValue(item.channel)
    ++listEpoch
    templateListRequests.clear()
    // Upsert into the channel-wide directory snapshot; do not hide other business templates after saving one row.
    for (const [id, records] of templateLists) {
      const next = records.filter(value => value.id !== stored.id)
      if (id === channelId) next.push(stored)
      templateLists.set(id, next)
      templateListStates.set(id, next.length ? 'ready' : 'empty')
    }
    if (!templateLists.has(channelId)) templateLists.set(channelId, [stored])
    templateListStates.set(channelId, 'ready')
    if (currentChannel.value?.id === channelId) {
      templates.value = templateLists.get(channelId) || []
      listState.value = templates.value.length ? 'ready' : 'empty'
    }
    if (usesBusinessChannelKey(channelId)) return
    // 其他类型沿用默认单通道模型，同类型的旧草稿需同步实际绑定信息。
    for (const other of drafts.values()) {
      if (other === current || other.businessIdentity !== current.businessIdentity || other.draft.type !== stored.type) continue
      other.channel = cloneNotificationValue(item.channel)
      other.existing = false
      other.draft.id = ''; other.baselineDraft.id = ''
      other.baseline = templateDraftFingerprint(other.baselineDraft)
    }
  }

  /** First save includes the supported built-in channel alongside the edited template. */
  async function saveBusiness(current: TemplateDraftEntry, payload: ReturnType<typeof buildTemplatePayload>, fingerprint: string,
    insideMail?: NoticeChannelConfig, recipients?: WorkRecipients) {
    const selected = business.value
    const channel = currentChannel.value
    if (!selected?.provider || !channel) throw new NotificationRequestError('error')
    const base = buildBusinessTemplateItem(selected, channel, current, payload)
    const item = recipients && isWorkChannel(channel.id) ? applyWorkRecipients(base, channel.id, recipients) : base
    let saved: NoticeChannelTemplateItem
    let updated: NoticeChannelConfig
    if (selected.id) {
      saved = await api.saveBusinessTemplate(selected.id, channelProviderFor(channel), item)
      updated = mergeSavedBusiness(selected, saved.channel)
    } else {
      const response = await api.saveBusinessTemplates(selected.provider, {
        provider: { ...cloneNotificationValue(selected), id: undefined, channels: undefined, state: 'enabled' },
        channels: insideMail ? [item, { channel: insideMail }] : [item],
      })
      const matched = response.channels.find(value => value.channel.channelProvider === channelProviderFor(channel)
        && businessChannelKey(value.channel) === businessChannelKey(item.channel))
      if (!response.provider?.id || !matched?.template) throw new NotificationRequestError('error', response)
      saved = matched
      updated = response.channels.reduce<NoticeChannelConfig>(
        (business, { channel }) => mergeSavedBusiness(business, channel),
        { ...cloneNotificationValue(selected), ...response.provider, channels: selected.channels },
      )
    }
    const stored = readSavedBusinessTemplate(updated, channel, item, saved)
    resetBusinessIdentity(updated, selected)
    applySavedBusiness(current, saved, stored, fingerprint, channel.id)
  }

  /** Failed writes retain the original draft; no automatic retry can duplicate an uncertain first topic creation. */
  async function saveTemplate(): Promise<boolean> {
    const current = entry.value
    if (!current || saving.value || !canSave.value) return false
    const submitted = cloneNotificationValue(current.draft)
    const payload = buildTemplatePayload(submitted, channels.value, { baseline: current.baselineDraft, available: availableVariables.value })
    const fingerprint = templateDraftFingerprint(submitted)
    const firstBusiness = business.value && !business.value.id ? businessIdentity(business.value) : undefined
    const key = activeKey.value
    const revision = detailRevision
    saving.value = true
    saveState.value = 'loading'
    let writing = false
    try {
      const insideMail = firstBusiness ? await api.queryInsideMailChannel() : undefined
      const id = `${payload.type}:${payload.provider}`
      let recipients: WorkRecipients | undefined
      if (isWorkChannel(id) && payload.configId) {
        const config = await api.getConfig(payload.configId)
        assertWorkConfig(config, payload.configId, id)
        recipients = readWorkRecipients(config.configuration)
        if (recipients || current.baselineDraft.configId && current.baselineDraft.configId !== payload.configId) {
          payload.template = workRecipientContent(id, payload.template, recipients ?? emptyWorkRecipients())
        }
      }
      if ((firstBusiness || isWorkChannel(id)) && (revision !== detailRevision || !canSave.value || current.draft.configId !== payload.configId)) {
        if (revision === detailRevision) saveState.value = 'idle'
        return false
      }
      writing = true
      if (business.value) await saveBusiness(current, payload, fingerprint, insideMail, recipients)
      else {
        if (current.existing && payload.id) await api.updateTemplate({ ...payload, id: payload.id })
        else await api.createTemplate(payload)
        // 保存时补齐的变量声明也进入独立模板的基线，再次编辑直接回显本次保存的格式。
        const stored = isWorkChannel(id) ? createTemplateDraft({ ...payload, id: payload.id || '' })
          : { ...submitted, variables: payload.variableDefinitions ?? [] }
        if (templateDraftFingerprint(current.draft) === fingerprint) current.draft = stored
        current.baseline = templateDraftFingerprint(stored)
        current.baselineDraft = cloneNotificationValue(stored)
        if (payload.id) current.existing = true
        else if (activeKey.value === key) { drafts.delete(key); activeKey.value = ''; detailState.value = 'idle' }
        if (currentChannel.value) await loadTemplates(currentChannel.value.id, true)
      }
      if (revision === detailRevision) saveState.value = 'ready'
      return true
    } catch (error) {
      if (firstBusiness && writing && !hasDefiniteSaveRejection(error)) uncertainBusinesses.add(firstBusiness)
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
    const prototype = createPrototypeTemplate(selected, channel, variables.get(businessIdentity(selected)) || [], translate)
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
      current.draft = createTemplateDraft({ ...record, id: current.draft.id, configId: current.businessConfigId ?? record.configId })
      saveState.value = 'idle'
    } catch (error) { if (revision === detailRevision) saveState.value = classifyNotificationFailure(error) }
  }

  /** Cancel restores the current baseline without disturbing this business's other channel drafts. */
  async function discardDraft() {
    const current = entry.value
    if (!current) return
    if (business.value || current.existing) current.draft = cloneNotificationValue(current.baselineDraft)
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
    configs, configurationsByChannel, listState, configState, channelConfigurationStates, detailState, saveState, activeKey, draft, dirty, hasDirtyDrafts, saving,
    channelStateTarget, channelActionFailure, canToggleChannel, changingChannelState, toggleChannel,
    canSave, entry, isDefault, hasContent, availableVariables, canRestoreDefault, saveOutcomeUnknown, loadCatalog, reloadCatalog, loadBusiness, loadChannel,
    selectTemplate, refreshConfigs, refreshUnboundTemplates, createTemplate, saveTemplate, discardDraft, discardBusinessDrafts,
    restoreDefault, resetBusinessIdentity, importTemplate }
}
