import { computed, nextTick, reactive, ref, shallowRef } from 'vue'
import { wechatMemberApi, loadMemberPlatformUsers, type WechatMemberApi, type WechatDepartment, type WechatMember, type MemberPlatformUser, type WechatMemberBinding } from '../../../../../api/notice/wechatMembers'
import { classifyNotificationFailure, type NotificationLoadState } from '../../shared'
import { bindingSignature, matchWechatMembers, memberBindingChanges } from './wechatMemberMatching'
import { filterWechatMemberRows, memberStatusFilter, withMemberStatus, withoutMemberStatus, type MemberFilterTerm, type MemberStatusFilter } from './wechatMemberFilters'

interface MemberContext { configId: string; permitted: () => boolean; clean: () => boolean }
export type { MemberFilterTerm, MemberStatusFilter } from './wechatMemberFilters'

/** Own member snapshots, drawer previews and the channel's explicit match-and-save operation. */
export function useWechatMembers(api: WechatMemberApi = wechatMemberApi) {
  const open = ref(false)
  const configId = ref('')
  const state = ref<NotificationLoadState>('idle')
  const error = ref('')
  const busy = ref(false)
  const autoMatching = ref(false)
  const saved = ref(false)
  const refreshRequired = ref(false)
  const departments = shallowRef<WechatDepartment[]>([])
  const members = shallowRef<WechatMember[]>([])
  const users = shallowRef<MemberPlatformUser[]>([])
  const bindings = shallowRef<WechatMemberBinding[]>([])
  const assignments = reactive(new Map<string, string>())
  const manual = reactive(new Set<string>())
  const filterTerms = ref<MemberFilterTerm[]>([])
  const statusFilter = computed({ get: () => memberStatusFilter(filterTerms.value), set: (value: MemberStatusFilter) => { filterTerms.value = withMemberStatus(filterTerms.value, value) } })
  const matchCount = ref<number | undefined>()
  let context: MemberContext | undefined
  let version = 0
  const allowed = () => !!context?.permitted() && !!context.clean()
  const matches = computed(() => matchWechatMembers(members.value, users.value, bindings.value))
  const changes = computed(() => memberBindingChanges(members.value, bindings.value, assignments))
  const dirty = computed(() => changes.value.length > 0)
  const canSave = computed(() => open.value && state.value === 'ready' && dirty.value && allowed() && !busy.value && !refreshRequired.value)
  // Keep orphaned bindings visible so unavailable counterparts can still be explicitly unbound.
  const rows = computed(() => [...users.value, ...bindings.value
    .filter(binding => !users.value.some(user => user.id === binding.userId))
    .map(binding => ({ id: binding.userId } as MemberPlatformUser))].map(user => {
    const binding = bindings.value.find(item => item.userId === user.id)
    const memberId = assignments.get(user.id)
    const member = members.value.find(item => item.id === memberId)
    const userAvailable = users.value.some(item => item.id === user.id)
    const memberAvailable = !!member
    // Status reflects persisted validity until saving; draft replacements remain visible in the current filter.
    const mappingStatus: Exclude<MemberStatusFilter, 'all'> = !binding ? 'unbound' : !userAvailable || !members.value.some(item => item.id === binding.thirdPartyUserId) ? 'invalid' : 'bound'
    const status = memberId !== binding?.thirdPartyUserId ? manual.has(user.id) ? 'manual' : 'automatic' : binding ? 'bound' : 'unmatched'
    return { id: user.id, user, binding, memberId, member, status, mappingStatus, memberAvailable, userAvailable }
  }))
  const stats = computed(() => ({
    total: rows.value.length,
    bound: rows.value.filter(row => row.mappingStatus === 'bound').length,
    unbound: rows.value.filter(row => row.mappingStatus === 'unbound').length,
    invalid: rows.value.filter(row => row.mappingStatus === 'invalid').length,
  }))
  const searchedRows = computed(() => filterWechatMemberRows(rows.value, withoutMemberStatus(filterTerms.value), departments.value))
  const filterCounts = computed(() => ({ all: searchedRows.value.length,
    bound: searchedRows.value.filter(row => row.mappingStatus === 'bound').length,
    unbound: searchedRows.value.filter(row => row.mappingStatus === 'unbound').length,
    invalid: searchedRows.value.filter(row => row.mappingStatus === 'invalid').length,
  }))
  const visibleRows = computed(() => filterWechatMemberRows(rows.value, filterTerms.value, departments.value))
  const canAutoMatch = computed(() => state.value === 'ready' && allowed() && !busy.value && !refreshRequired.value
    && members.value.length > 0 && users.value.some(user => !assignments.has(user.id) && !manual.has(user.id)))
  const canAutoMatchAndSave = computed(() => !open.value && state.value === 'ready' && allowed() && !busy.value && !refreshRequired.value && (canAutoMatch.value || dirty.value))

  function resetAssignments() {
    assignments.clear()
    manual.clear()
    bindings.value.forEach(binding => assignments.set(binding.userId, binding.thirdPartyUserId))
    matchCount.value = undefined
  }
  /** Explicit matching only fills untouched, unassigned rows; manual choices and saved bindings win. */
  function autoMatch() {
    if (!canAutoMatch.value) return
    applyMatches()
  }
  function applyMatches() {
    let count = 0
    matches.value.forEach((match, id) => {
      if (match.userId && !assignments.has(match.userId) && !manual.has(match.userId) && !memberUnavailable(id, match.userId)) {
        assignments.set(match.userId, id)
        count++
      }
    })
    matchCount.value = count
    saved.value = false
    error.value = ''
    statusFilter.value = 'unbound'
  }
  function memberUnavailable(memberId: string, userId: string): boolean {
    // Saved assignments remain reserved even while another row has a pending edit.
    return bindings.value.some(binding => binding.thirdPartyUserId === memberId && binding.userId !== userId)
      || [...assignments].some(([id, assigned]) => assigned === memberId && id !== userId)
  }
  function assign(userId: string, memberId?: string) {
    if (!open.value || state.value !== 'ready' || !allowed() || busy.value || refreshRequired.value || !users.value.some(user => user.id === userId)) return
    if (memberId && (!members.value.some(member => member.id === memberId) || memberUnavailable(memberId, userId))) { error.value = 'duplicate'; return }
    const existing = bindings.value.find(binding => binding.userId === userId)
    if (!memberId && existing) assignments.set(userId, existing.thirdPartyUserId)
    else if (memberId) assignments.set(userId, memberId)
    else assignments.delete(userId)
    manual.add(userId)
    saved.value = false
    error.value = ''
  }
  async function reload() {
    if (!context || busy.value || !allowed()) return
    const ticket = ++version
    const id = configId.value
    const active = () => ticket === version && allowed()
    state.value = 'loading'
    error.value = ''
    saved.value = false
    try {
      const [nextDepartments, nextMembers, nextUsers, nextBindings] = await Promise.all([
        api.departments(id), api.members(id), loadMemberPlatformUsers(api, active), api.bindings(id),
      ])
      if (!active()) return
      departments.value = nextDepartments
      members.value = [...new Map(nextMembers.map(member => [member.id, member])).values()]
      users.value = nextUsers
      bindings.value = nextBindings
      resetAssignments()
      refreshRequired.value = false
      state.value = rows.value.length ? 'ready' : 'empty'
    } catch (failure) { if (active()) state.value = classifyNotificationFailure(failure) }
  }
  /** Load the channel summary without opening the manager or producing match suggestions. */
  async function prepare(next: MemberContext) {
    if (busy.value) return
    if (configId.value && configId.value !== next.configId) close(true)
    context = next
    configId.value = next.configId
    if (!allowed()) { state.value = 'forbidden'; return }
    await reload()
  }
  async function show(next: MemberContext) {
    if (busy.value || state.value === 'loading') return
    const reuse = configId.value === next.configId && ['ready', 'empty'].includes(state.value)
    if (!reuse) close(true)
    context = next
    configId.value = next.configId
    filterTerms.value = []
    open.value = true
    if (!allowed()) { state.value = 'forbidden'; return }
    if (!reuse) await reload()
  }

  async function unchanged(ticket: number): Promise<boolean> {
    const latest = await api.bindings(configId.value)
    if (ticket !== version || !allowed()) return false
    if (bindingSignature(latest) !== bindingSignature(bindings.value)) {
      error.value = 'conflict'
      refreshRequired.value = true
      return false
    }
    return true
  }

  /** Re-read after mutations; a failed post-write read must never replay a successful write. */
  async function refreshBindings(ticket: number, changedIds: string[]) {
    refreshRequired.value = true
    const latest = await api.bindings(configId.value)
    if (ticket !== version || !allowed()) return
    bindings.value = latest
    changedIds.forEach(id => {
      const binding = latest.find(item => item.userId === id)
      if (binding) assignments.set(id, binding.thirdPartyUserId)
      else assignments.delete(id)
      manual.delete(id)
    })
    refreshRequired.value = false
    saved.value = true
    matchCount.value = undefined
  }
  async function save(): Promise<boolean> {
    if (!canSave.value) return false
    return saveChanges(false)
  }
  async function autoMatchAndSave(): Promise<boolean> {
    if (!canAutoMatchAndSave.value) return false
    return saveChanges(true)
  }
  async function saveChanges(matchFirst: boolean): Promise<boolean> {
    const ticket = version
    busy.value = true
    autoMatching.value = matchFirst
    error.value = ''
    saved.value = false
    try {
      // Publish loading before matching; keep the same lock through conflict check, write and readback.
      if (matchFirst) {
        await nextTick()
        if (ticket !== version || !allowed()) return false
        applyMatches()
      }
      const payload = changes.value
      if (!payload.length) return false
      if (!await unchanged(ticket)) return false
      if (payload.some(change => memberUnavailable(change.thirdPartyUserId, change.userId))) { error.value = 'duplicate'; return false }
      await api.bind(configId.value, payload)
      if (ticket !== version || !allowed()) return false
      await refreshBindings(ticket, payload.map(change => change.userId))
      return ticket === version && saved.value
    } catch (failure) {
      if (ticket === version) error.value = refreshRequired.value ? 'refresh' : classifyNotificationFailure(failure)
      return false
    } finally { if (ticket === version) { busy.value = false; autoMatching.value = false } }
  }
  async function unbind(bindingId: string): Promise<boolean> {
    const binding = bindings.value.find(item => item.id === bindingId)
    if (!binding || !allowed() || busy.value || refreshRequired.value) return false
    const ticket = version
    busy.value = true
    error.value = ''
    saved.value = false
    try {
      if (!await unchanged(ticket)) return false
      await api.unbind(bindingId)
      if (ticket !== version || !allowed()) return false
      await refreshBindings(ticket, [binding.userId])
      return ticket === version && saved.value
    } catch (failure) {
      if (ticket === version) error.value = refreshRequired.value ? 'refresh' : classifyNotificationFailure(failure)
      return false
    } finally { if (ticket === version) busy.value = false }
  }
  function close(force = false) {
    if (busy.value && !force) return
    ++version
    open.value = false
    // Closing discards the preview but preserves a loaded summary; switching config fully resets it.
    if (!force) {
      resetAssignments()
      if (state.value === 'loading') state.value = 'idle'
      error.value = ''; saved.value = false
      return
    }
    context = undefined
    configId.value = ''
    state.value = 'idle'
    assignments.clear()
    manual.clear()
    members.value = []; users.value = []; bindings.value = []; departments.value = []
    error.value = ''; saved.value = false; busy.value = false; autoMatching.value = false; refreshRequired.value = false; matchCount.value = undefined
  }
  return { open, configId, state, error, busy, autoMatching, saved, refreshRequired, departments, members, users, bindings, assignments, filterTerms, statusFilter, matchCount, stats, filterCounts, rows, visibleRows, dirty, canSave, canAutoMatch, canAutoMatchAndSave, autoMatch, autoMatchAndSave, memberUnavailable, assign, reload, prepare, show, save, unbind, close }
}
export type WechatMembersWorkspace = ReturnType<typeof useWechatMembers>
