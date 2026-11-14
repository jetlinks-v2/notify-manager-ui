import { computed, reactive, ref, shallowRef } from 'vue'
import { wechatMemberApi, loadMemberPlatformUsers, type WechatMemberApi, type WechatDepartment, type WechatMember, type MemberPlatformUser, type WechatMemberBinding } from '../../../../../api/notice/wechatMembers'
import { classifyNotificationFailure, type NotificationLoadState } from '../../shared'
import { bindingSignature, matchWechatMembers, memberBindingChanges } from './wechatMemberMatching'

interface MemberContext { configId: string; permitted: () => boolean; clean: () => boolean }
export type MemberStatusFilter = 'all' | 'bound' | 'unbound' | 'invalid'

/** Own the drawer's request lifetime and preview; no binding is written during sync/matching. */
export function useWechatMembers(api: WechatMemberApi = wechatMemberApi) {
  const open = ref(false)
  const configId = ref('')
  const state = ref<NotificationLoadState>('idle')
  const error = ref('')
  const busy = ref(false)
  const saved = ref(false)
  const refreshRequired = ref(false)
  const departments = shallowRef<WechatDepartment[]>([])
  const members = shallowRef<WechatMember[]>([])
  const users = shallowRef<MemberPlatformUser[]>([])
  const bindings = shallowRef<WechatMemberBinding[]>([])
  const assignments = reactive(new Map<string, string>())
  const manual = reactive(new Set<string>())
  const departmentId = ref('')
  const search = ref('')
  const statusFilter = ref<MemberStatusFilter>('unbound')
  const matchCount = ref<number | undefined>()
  let context: MemberContext | undefined
  let version = 0
  const allowed = () => !!context?.permitted() && !!context.clean()
  const matches = computed(() => matchWechatMembers(members.value, users.value, bindings.value))
  const changes = computed(() => memberBindingChanges(members.value, bindings.value, assignments))
  const dirty = computed(() => changes.value.length > 0)
  const canSave = computed(() => open.value && state.value === 'ready' && dirty.value && allowed() && !busy.value && !refreshRequired.value)
  // Keep orphaned bindings visible so unavailable counterparts can still be explicitly unbound.
  const rows = computed(() => [...members.value, ...bindings.value
    .filter(binding => !members.value.some(member => member.id === binding.thirdPartyUserId))
    .map(binding => ({ id: binding.thirdPartyUserId, name: binding.providerName } as WechatMember))].map(member => {
    const binding = bindings.value.find(item => item.thirdPartyUserId === member.id)
    const userId = assignments.get(member.id)
    const match = matches.value.get(member.id)
    const memberAvailable = members.value.some(item => item.id === member.id)
    const mappingStatus = !binding ? 'unbound' : !memberAvailable || !users.value.some(user => user.id === binding.userId) ? 'invalid' : 'bound'
    const status = manual.has(member.id) && userId !== binding?.userId ? 'manual' : binding ? 'bound' : userId ? 'automatic' : match?.state === 'automatic' ? 'unmatched' : match?.state || 'unmatched'
    const user = users.value.find(item => item.id === userId)
    return { ...member, binding, userId, user, status, mappingStatus, memberAvailable }
  }))
  const stats = computed(() => ({
    total: rows.value.length,
    bound: rows.value.filter(row => row.mappingStatus === 'bound').length,
    unbound: rows.value.filter(row => row.mappingStatus === 'unbound').length,
    invalid: rows.value.filter(row => row.mappingStatus === 'invalid').length,
  }))
  const searchedRows = computed(() => {
    const ids = new Set<string>()
    function collect(nodes: WechatDepartment[], inside = false) {
      nodes.forEach(node => {
        const selected = inside || String(node.id) === departmentId.value
        if (selected) ids.add(String(node.id))
        collect(node.children || [], selected)
      })
    }
    collect(departments.value)
    const keyword = search.value.trim().toLowerCase()
    return rows.value.filter(row => (!departmentId.value || row.department?.some(id => ids.has(String(id))))
      && (!keyword || [row.name, row.id, row.mobile, row.email, row.bizMail, row.user?.name, row.user?.username].some(value => value?.toLowerCase().includes(keyword))))
  })
  const filterCounts = computed(() => ({ all: searchedRows.value.length,
    bound: searchedRows.value.filter(row => row.mappingStatus === 'bound').length,
    unbound: searchedRows.value.filter(row => row.mappingStatus === 'unbound').length,
    invalid: searchedRows.value.filter(row => row.mappingStatus === 'invalid').length,
  }))
  const visibleRows = computed(() => searchedRows.value.filter(row => statusFilter.value === 'all' || row.mappingStatus === statusFilter.value))
  const canAutoMatch = computed(() => state.value === 'ready' && allowed() && !busy.value && !refreshRequired.value
    && members.value.some(member => !assignments.has(member.id) && !manual.has(member.id)))

  function resetAssignments() {
    assignments.clear()
    manual.clear()
    bindings.value.forEach(binding => assignments.set(binding.thirdPartyUserId, binding.userId))
    matchCount.value = undefined
  }
  /** Explicit matching only fills untouched, unassigned rows; manual choices and saved bindings win. */
  function autoMatch() {
    if (!canAutoMatch.value) return
    let count = 0
    matches.value.forEach((match, id) => {
      if (match.userId && !assignments.has(id) && !manual.has(id) && !userUnavailable(match.userId, id)) {
        assignments.set(id, match.userId)
        count++
      }
    })
    matchCount.value = count
    saved.value = false
    error.value = ''
    statusFilter.value = 'unbound'
  }
  function userUnavailable(userId: string, memberId: string): boolean {
    // Saved assignments remain reserved even while another row has a pending edit.
    return bindings.value.some(binding => binding.userId === userId && binding.thirdPartyUserId !== memberId)
      || [...assignments].some(([id, assigned]) => assigned === userId && id !== memberId)
  }
  function assign(memberId: string, userId?: string) {
    if (!open.value || state.value !== 'ready' || !allowed() || busy.value || refreshRequired.value || !members.value.some(member => member.id === memberId)) return
    if (userId && (!users.value.some(user => user.id === userId) || userUnavailable(userId, memberId))) { error.value = 'duplicate'; return }
    const existing = bindings.value.find(binding => binding.thirdPartyUserId === memberId)
    if (!userId && existing) assignments.set(memberId, existing.userId)
    else if (userId) assignments.set(memberId, userId)
    else assignments.delete(memberId)
    manual.add(memberId)
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
    open.value = true
    departmentId.value = ''
    search.value = ''
    statusFilter.value = 'unbound'
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
      const binding = latest.find(item => item.thirdPartyUserId === id)
      if (binding) assignments.set(id, binding.userId)
      else assignments.delete(id)
      manual.delete(id)
    })
    refreshRequired.value = false
    saved.value = true
    matchCount.value = undefined
  }
  async function save(): Promise<boolean> {
    if (!canSave.value) return false
    const ticket = version
    const payload = changes.value
    busy.value = true
    error.value = ''
    saved.value = false
    try {
      if (!await unchanged(ticket)) return false
      if (payload.some(change => userUnavailable(change.userId, change.thirdPartyUserId))) { error.value = 'duplicate'; return false }
      await api.bind(configId.value, payload)
      if (ticket !== version || !allowed()) return false
      await refreshBindings(ticket, payload.map(change => change.thirdPartyUserId))
      return ticket === version && saved.value
    } catch (failure) {
      if (ticket === version) error.value = refreshRequired.value ? 'refresh' : classifyNotificationFailure(failure)
      return false
    } finally { if (ticket === version) busy.value = false }
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
      await refreshBindings(ticket, [binding.thirdPartyUserId])
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
    error.value = ''; saved.value = false; busy.value = false; refreshRequired.value = false; matchCount.value = undefined
  }
  return { open, configId, state, error, busy, saved, refreshRequired, departments, members, users, bindings, assignments, departmentId, search, statusFilter, matchCount, stats, filterCounts, rows, visibleRows, dirty, canSave, canAutoMatch, autoMatch, userUnavailable, assign, reload, prepare, show, save, unbind, close }
}
export type WechatMembersWorkspace = ReturnType<typeof useWechatMembers>
