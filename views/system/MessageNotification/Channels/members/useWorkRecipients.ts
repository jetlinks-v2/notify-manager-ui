import { computed, reactive, ref, shallowRef, type Ref } from 'vue'
import { messageNotificationApi as api } from '../../../../../api/notice/messageNotification'
import { loadGroupRecipients } from '../../../../../api/notice/workRecipients'
import { dingTalkMemberApi, loadMemberPlatformUsers, wechatMemberApi } from '../../../../../api/notice/wechatMembers'
import { classifyNotificationFailure, NotificationRequestError, type NotificationLoadState, type NotifierConfig } from '../../shared'
import {
  assertWorkConfig, emptyWorkRecipients, isWorkChannel, readWorkRecipients, uniqueNamePairs, workRecipientsEmpty, workRecipientsKey,
  type DirectoryItem, type GroupRecipientKind, type RecipientPair, type WorkChannelId, type WorkRecipients,
} from '../../shared/workRecipients'
import type { WechatMembersSummaryModel } from './useWechatMembersDrawer'
import { previewRecipientTemplates, syncRecipientTemplates, type RecipientTemplatePreview } from './syncWorkRecipients'

interface RecipientEditorOptions {
  channelId: Ref<string>
  config: () => NotifierConfig | undefined
  canWrite: Ref<boolean>
  busy: Ref<boolean>
  saveSetting: (value: WorkRecipients, config: NotifierConfig) => Promise<boolean>
}

type DraftGroups = Pick<WorkRecipients, 'departments' | 'tags'>
const groupField = { department: 'departments', tag: 'tags' } as const
const signature = (value: WorkRecipients | undefined) => JSON.stringify(value)
const displayName = (item: DirectoryItem) => item.path || item.name || item.id
type GroupDirectory = Awaited<ReturnType<typeof loadGroupRecipients>>
const groupKinds = ['department', 'tag'] as const
const emptyDirectory: GroupDirectory = { platform: [], external: [] }

export function useWorkRecipients(options: RecipientEditorOptions) {
  const open = ref(false)
  const kind = ref<GroupRecipientKind>('department')
  const keyword = ref('')
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')
  const failed = ref<string[]>([])
  const saved = ref(false)
  const automaticKind = ref<GroupRecipientKind>()
  const matchCounts = reactive<Partial<Record<GroupRecipientKind, number>>>({})
  const directories = reactive<Partial<Record<GroupRecipientKind, GroupDirectory>>>({})
  const states = reactive<Record<GroupRecipientKind, NotificationLoadState>>({ department: 'idle', tag: 'idle' })
  const directoryRequests = new Map<GroupRecipientKind, Promise<GroupDirectory | undefined>>()
  const recipientNames = ref<Record<'user' | GroupRecipientKind, Map<string, string>>>({
    user: new Map(), department: new Map(), tag: new Map(),
  })
  const platform = computed(() => directories[kind.value]?.platform ?? emptyDirectory.platform)
  const external = computed(() => directories[kind.value]?.external ?? emptyDirectory.external)
  const matchCount = computed(() => matchCounts[kind.value])
  const draft = ref<DraftGroups>(emptyWorkRecipients())
  const original = shallowRef<WorkRecipients>()
  const firstSync = shallowRef<{ recipients: WorkRecipients; rows: RecipientTemplatePreview[] }>()
  const busy = options.busy
  let request = 0

  const enabled = computed(() => Object.hasOwn(options.config()?.configuration ?? {}, workRecipientsKey))
  const empty = computed(() => {
    const channelId = options.channelId.value
    const config = options.config()
    if (!config || !isWorkChannel(channelId)) return false
    try {
      const recipients = readWorkRecipients(config.configuration)
      return Boolean(recipients && workRecipientsEmpty(recipients, channelId))
    } catch { return false }
  })
  const kinds = computed<readonly GroupRecipientKind[]>(() => options.channelId.value === 'weixin:corpMessage' ? groupKinds : ['department'])
  const storedGroups = computed(() => {
    const config = options.config()
    try { return config ? readWorkRecipients(config.configuration) : undefined }
    catch { return undefined }
  })
  const summaries = computed(() => Object.fromEntries(groupKinds.map(next => {
    const directory = directories[next]
    const bindings = storedGroups.value?.[groupField[next]] ?? []
    const platformIds = new Set(directory?.platform.map(item => item.id))
    const externalIds = new Set(directory?.external.map(item => item.id))
    const total = new Set([...platformIds, ...bindings.map(pair => pair.platformId)]).size
    const bound = bindings.filter(pair => platformIds.has(pair.platformId) && externalIds.has(pair.externalId)).length
    const invalid = bindings.length - bound
    const unbound = total - bindings.length
    const summary: WechatMembersSummaryModel = {
      state: states[next], stats: { total, bound, unbound, invalid },
      canAutoMatch: states[next] === 'ready' && options.canWrite.value && !busy.value && !open.value && Boolean(unbound && externalIds.size),
      autoMatching: automaticKind.value === next, busy: busy.value, error: '', refreshRequired: false,
      saved: false, matchCount: open.value ? undefined : matchCounts[next],
    }
    return [next, summary]
  })) as Record<GroupRecipientKind, WechatMembersSummaryModel>)
  const groupDirty = computed(() => JSON.stringify(draft.value.departments) !== JSON.stringify(original.value?.departments ?? [])
    || JSON.stringify(draft.value.tags) !== JSON.stringify(original.value?.tags ?? []))
  const activePairs = computed(() => draft.value[groupField[kind.value]])
  const rows = computed(() => {
    const selected = new Map(activePairs.value.map(pair => [pair.platformId, pair.externalId]))
    const seen = new Set(platform.value.map(item => item.id))
    const items = [...platform.value, ...activePairs.value.filter(pair => !seen.has(pair.platformId)).map(pair => ({ id: pair.platformId, path: pair.platformId }))]
    const term = keyword.value.trim().toLocaleLowerCase()
    return items.flatMap(item => {
      const externalId = selected.get(item.id)
      const target = external.value.find(candidate => candidate.id === externalId)
      const name = displayName(item)
      if (term && ![name, target ? displayName(target) : externalId].some(value => value?.toLocaleLowerCase().includes(term))) return []
      return [{ id: item.id, name, externalId, externalName: target ? displayName(target) : externalId,
        invalid: Boolean(externalId && (!target || !seen.has(item.id))), available: seen.has(item.id) }]
    })
  })
  const externalOptions = computed(() => external.value.map(item => ({
    value: item.id,
    label: `${displayName(item)} · ${item.id}`,
    assignedTo: activePairs.value.find(pair => pair.externalId === item.id)?.platformId,
  })))
  const canSave = computed(() => options.canWrite.value && !busy.value && loaded.value && (groupDirty.value || !enabled.value))

  function target() {
    const config = options.config()
    const channelId = options.channelId.value
    if (!config || !isWorkChannel(channelId) || !options.canWrite.value) return
    return { id: config.id, channelId }
  }
  function isCurrent(id: string, channelId: WorkChannelId) {
    return options.config()?.id === id && options.channelId.value === channelId && options.canWrite.value
  }
  function readDirectory(next: GroupRecipientKind, refresh = false): Promise<GroupDirectory | undefined> {
    const current = target()
    if (!current || !kinds.value.includes(next)) return Promise.resolve(undefined)
    const pending = directoryRequests.get(next)
    if (pending) return pending
    if (!refresh && directories[next]) return Promise.resolve(directories[next])
    states[next] = 'loading'
    const active = () => directoryRequests.get(next) === operation && isCurrent(current.id, current.channelId)
    const operation = loadGroupRecipients(current.id, current.channelId, next).then(directory => {
      if (!active()) return
      directories[next] = directory
      recipientNames.value[next] = new Map(directory.external.map(item => [item.id, displayName(item)]))
      states[next] = directory.platform.length ? 'ready' : 'empty'
      return directory
    }).catch(failure => {
      if (active()) states[next] = classifyNotificationFailure(failure)
      return undefined
    }).finally(() => {
      if (directoryRequests.get(next) === operation) directoryRequests.delete(next)
    })
    directoryRequests.set(next, operation)
    return operation
  }
  function prepare() {
    for (const next of kinds.value) {
      if (states[next] === 'idle') void readDirectory(next)
    }
  }
  async function load(next: GroupRecipientKind, refresh = false) {
    const current = target()
    if (!current || busy.value || !kinds.value.includes(next)) return
    kind.value = next
    keyword.value = ''
    error.value = ''
    delete matchCounts[next]
    const ticket = ++request
    const active = () => ticket === request && isCurrent(current.id, current.channelId)
    loaded.value = false
    loading.value = true
    try {
      const [config, directory] = await Promise.all([api.getConfig(current.id), readDirectory(next, refresh)])
      if (!active()) return
      if (!directory) { error.value = states[next]; return }
      assertWorkConfig(config, current.id, current.channelId)
      original.value = readWorkRecipients(config.configuration)
      draft.value = { departments: original.value?.departments ?? [], tags: original.value?.tags ?? [] }
      loaded.value = true
    } catch (failure) {
      if (active()) error.value = classifyNotificationFailure(failure)
    } finally {
      if (ticket === request) loading.value = false
    }
  }
  function show(next: GroupRecipientKind) {
    if (!target() || busy.value || !kinds.value.includes(next)) return
    open.value = true
    return load(next)
  }
  function close(force = false) {
    if (busy.value && !force) return
    ++request
    open.value = false
    loading.value = false
    loaded.value = false
    keyword.value = ''
    error.value = ''
    firstSync.value = undefined
    original.value = undefined
    draft.value = emptyWorkRecipients()
    if (force) {
      failed.value = []
      saved.value = false
      recipientNames.value = { user: new Map(), department: new Map(), tag: new Map() }
      directoryRequests.clear()
      for (const next of groupKinds) {
        delete directories[next]
        delete matchCounts[next]
        states[next] = 'idle'
      }
    }
  }
  function assign(platformId: string, externalId?: string) {
    if (!options.canWrite.value || busy.value || loading.value) return
    if (externalId && (!platform.value.some(item => item.id === platformId)
      || !external.value.some(item => item.id === externalId)
      || activePairs.value.some(pair => pair.externalId === externalId && pair.platformId !== platformId))) return
    error.value = ''
    const remaining = activePairs.value.filter(pair => pair.platformId !== platformId)
    draft.value[groupField[kind.value]] = externalId ? [...remaining, { platformId, externalId }] : remaining
  }
  function autoMatch() {
    if (!options.canWrite.value || busy.value || !loaded.value) return
    const pairs = uniqueNamePairs(platform.value, external.value, activePairs.value)
    draft.value[groupField[kind.value]] = [...activePairs.value, ...pairs]
    matchCounts[kind.value] = pairs.length
  }
  async function withCurrent(action: (current: NonNullable<ReturnType<typeof target>>, active: () => boolean,
    recipients: WorkRecipients | undefined, memberIds: string[], config: NotifierConfig) => Promise<void>) {
    const current = target()
    if (!current || busy.value) return
    const ticket = ++request
    const active = () => ticket === request && isCurrent(current.id, current.channelId)
    busy.value = true
    error.value = ''
    saved.value = false
    try {
      const memberApi = current.channelId === 'weixin:corpMessage' ? wechatMemberApi : dingTalkMemberApi
      const [config, bindings, users, members] = await Promise.all([
        api.getConfig(current.id), memberApi.bindings(current.id), loadMemberPlatformUsers(memberApi, active), memberApi.members(current.id),
      ])
      if (!active()) return
      assertWorkConfig(config, current.id, current.channelId)
      const recipients = readWorkRecipients(config.configuration)
      const visibleUsers = new Set(users.map(user => user.id))
      const directoryMembers = new Map(members.map(member => [member.id, displayName(member)]))
      recipientNames.value.user = directoryMembers
      const previouslySynced = new Set(recipients?.memberIds)
      // A narrower operator view cannot enroll unseen users or silently remove previously synced ones.
      const memberIds = [...new Set(bindings.flatMap(({ userId, thirdPartyUserId }) =>
        directoryMembers.has(thirdPartyUserId) && (visibleUsers.has(userId) || previouslySynced.has(thirdPartyUserId))
          ? [thirdPartyUserId] : []))].sort()
      await action(current, active, recipients, memberIds, config)
    } catch (failure) {
      if (active()) error.value = classifyNotificationFailure(failure)
    } finally { busy.value = false }
  }
  async function persist(current: NonNullable<ReturnType<typeof target>>, active: () => boolean,
    recipients: WorkRecipients, latest: WorkRecipients | undefined, config: NotifierConfig) {
    if (signature(latest) !== signature(recipients)) {
      if (!await options.saveSetting(recipients, config)) throw new NotificationRequestError('error')
    }
    if (!active()) return
    const stored = await api.getConfig(current.id)
    if (!active()) return
    assertWorkConfig(stored, current.id, current.channelId)
    const confirmed = readWorkRecipients(stored.configuration)
    if (!confirmed || signature(confirmed) !== signature(recipients)) throw new NotificationRequestError('error')
    original.value = confirmed
    draft.value = { departments: confirmed.departments, tags: confirmed.tags }
    firstSync.value = undefined
    open.value = false
    const pending = await syncRecipientTemplates(api, current.id, current.channelId, confirmed, active, async () => {
      const latest = await api.getConfig(current.id)
      assertWorkConfig(latest, current.id, current.channelId)
      if (signature(readWorkRecipients(latest.configuration)) !== signature(confirmed)) throw new NotificationRequestError('error')
    })
    if (active()) {
      failed.value = pending
      saved.value = !pending.length
    }
  }
  async function autoMatchAndSave(next: GroupRecipientKind) {
    const directory = directories[next]
    if (!directory || !summaries.value[next].canAutoMatch) return
    automaticKind.value = next
    try {
      await withCurrent(async (current, active, latest, memberIds, config) => {
        const group = groupField[next]
        const existing = latest?.[group] ?? []
        const matches = uniqueNamePairs(directory.platform, directory.external, existing)
        matchCounts[next] = matches.length
        if (!matches.length) return
        const recipients = { ...(latest ?? emptyWorkRecipients()), [group]: [...existing, ...matches], memberIds }
        await saveOrPreview(current, active, recipients, latest, config)
      })
    } finally { automaticKind.value = undefined }
  }
  async function requestSave() {
    if (!canSave.value) return
    await withCurrent(async (current, active, latest, memberIds, config) => {
      if (signature(latest) !== signature(original.value)) { error.value = 'conflict'; return }
      const recipients = { ...draft.value, memberIds }
      await saveOrPreview(current, active, recipients, latest, config)
    })
  }
  async function saveOrPreview(current: NonNullable<ReturnType<typeof target>>, active: () => boolean,
    recipients: WorkRecipients, latest: WorkRecipients | undefined, config: NotifierConfig) {
    if (latest) {
      await persist(current, active, recipients, latest, config)
      return
    }
    if (workRecipientsEmpty(recipients, current.channelId)) { error.value = 'empty'; return }
    const rows = await previewRecipientTemplates(api, current.id, current.channelId, recipients)
    if (active()) firstSync.value = { recipients, rows }
  }
  async function confirmFirstSync() {
    const preview = firstSync.value
    if (!preview) return
    await withCurrent(async (current, active, latest, memberIds, config) => {
      if (latest || JSON.stringify(memberIds) !== JSON.stringify(preview.recipients.memberIds)) {
        error.value = 'conflict'; firstSync.value = undefined; return
      }
      const rows = await previewRecipientTemplates(api, current.id, current.channelId, preview.recipients)
      if (!active()) return
      if (JSON.stringify(rows) !== JSON.stringify(preview.rows)) { firstSync.value = { ...preview, rows }; return }
      await persist(current, active, preview.recipients, latest, config)
    })
  }
  function retry() {
    return withCurrent(async (current, active, latest, memberIds, config) => {
      await saveOrPreview(current, active, { ...(latest ?? emptyWorkRecipients()), memberIds }, latest, config)
    })
  }
  return { open, kind, keyword, loading, loaded, busy, error, failed, saved, matchCount, rows, externalOptions, recipientNames,
    canSave, enabled, empty, groupDirty, kinds, summaries, firstSync, prepare, show, close, reload: () => load(kind.value, true),
    refreshGroup: (next: GroupRecipientKind) => readDirectory(next, true), assign, autoMatch, autoMatchAndSave, requestSave, confirmFirstSync, retry }
}
