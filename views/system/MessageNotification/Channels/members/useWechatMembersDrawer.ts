import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WechatMembersWorkspace } from './useWechatMembers'
import type { ConditionFilterField } from '@jetlinks-web-core/components/ConditionFilter'
import { buildWechatMemberTree, wechatTreeExpandedKeys, type WechatMemberTreeNode } from './wechatMemberTree'
interface DepartmentOption { value: string; label: string; children: DepartmentOption[] }

export type WechatMemberRow = WechatMembersWorkspace['rows']['value'][number]
export interface WechatMembersDrawerModel {
  open: boolean
  state: WechatMembersWorkspace['state']['value']
  busy: boolean
  autoMatching: boolean
  error: string
  saved: boolean
  refreshRequired: boolean
  dirty: boolean
  canSave: boolean
  departments: WechatMembersWorkspace['departments']['value']
  rows: WechatMemberRow[]
  members: WechatMembersWorkspace['members']['value']
  filterTerms: WechatMembersWorkspace['filterTerms']['value']
  pendingCount: number
  canAutoMatch: boolean
  matchCount?: number
  stats: WechatMembersWorkspace['stats']['value']
  filterCounts: WechatMembersWorkspace['filterCounts']['value']
  statusFilter: WechatMembersWorkspace['statusFilter']['value']
  memberUnavailable: WechatMembersWorkspace['memberUnavailable']
}

export type WechatMembersSummaryModel = Pick<WechatMembersDrawerModel, 'state' | 'stats' | 'canAutoMatch' | 'autoMatching' | 'busy' | 'error' | 'saved' | 'refreshRequired' | 'matchCount'>

export function useWechatMembersFeedback(model: () => WechatMembersSummaryModel) {
  const { t } = useI18n()
  const failure = computed(() => {
    const error = model().error || (['error', 'forbidden', 'unavailable'].includes(model().state) ? model().state : '')
    return error ? t(['forbidden', 'error', 'unavailable'].includes(error) ? `messageNotification.state.${error}` : `messageNotification.members.error.${error}`) : ''
  })
  const canReload = computed(() => model().refreshRequired || ['error', 'unavailable'].includes(model().state))
  return { t, failure, canReload }
}

export function useWechatMembersDrawer(model: () => WechatMembersDrawerModel, assign: (userId: string, memberId?: string) => void) {
  const { t } = useI18n()
  const editingUser = ref('')
  const memberKeyword = ref('')
  const expandedKeys = ref<string[]>([])
  const searchInput = ref<{ focus: () => void }>()
  const editingRow = computed(() => model().rows.find(row => row.id === editingUser.value))
  const memberTree = computed(() => buildWechatMemberTree(model().departments, model().members, id => model().memberUnavailable(id, editingUser.value), t('messageNotification.members.ungrouped'), memberKeyword.value))
  const selectedKeys = computed(() => {
    const collect = (nodes: WechatMemberTreeNode[]): string[] => nodes.flatMap(node => node.memberId === editingRow.value?.memberId && node.kind === 'member' ? [node.key] : collect(node.children || []))
    return collect(memberTree.value)
  })
  const page = ref(1)
  const pageSize = ref(20)
  function stopEditing() { editingUser.value = '' }
  function edit(userId: string) { if (!model().busy && !model().refreshRequired) editingUser.value = userId }
  function setEditing(userId: string, open: boolean) {
    if (open) edit(userId)
    else if (editingUser.value === userId) stopEditing()
  }
  function selectMember(memberId?: string) {
    const row = editingRow.value
    if (!row) return
    // Saved bindings can only be removed through the confirmed unbind action.
    if ((memberId !== undefined || !row.binding) && !model().busy && !model().refreshRequired) assign(row.id, memberId)
    stopEditing()
  }
  function selectNode(_keys: (string | number)[], info: { node: { kind?: string; memberId?: string; disabled?: boolean } }) {
    if (info.node.kind === 'member' && info.node.memberId && !info.node.disabled) selectMember(info.node.memberId)
  }
  function expand(keys: (string | number)[]) { expandedKeys.value = keys.map(String) }
  watch([editingUser, memberKeyword], async () => {
    expandedKeys.value = wechatTreeExpandedKeys(memberTree.value, editingRow.value?.memberId, !!memberKeyword.value.trim())
    await nextTick()
    if (editingUser.value) searchInput.value?.focus()
  })
  watch(editingUser, () => { memberKeyword.value = '' })
  function paginate(current: number, size: number) { page.value = current; pageSize.value = size; stopEditing() }
  watch(() => [model().open, model().filterTerms], () => { page.value = 1; stopEditing() }, { deep: true })
  watch(() => model().rows.length, count => { page.value = Math.min(page.value, Math.max(1, Math.ceil(count / pageSize.value))) })
  watch(() => [model().state, model().busy, model().refreshRequired], stopEditing)
  const pagination = computed(() => ({ current: page.value, pageSize: pageSize.value, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], onChange: paginate }))
  const statusOptions = computed(() => (['all', 'bound', 'unbound', 'invalid'] as const).map(value => ({ value, label: `${t(`messageNotification.members.filter.${value}`)} ${model().filterCounts[value]}` })))
  const columns = computed(() => [
    { title: t('messageNotification.members.platformUser'), key: 'user', width: 200 },
    { title: t('messageNotification.members.member'), key: 'member', width: 240 },
    { title: t('messageNotification.members.method'), key: 'method', width: 160 },
    { title: t('messageNotification.members.status'), key: 'status', width: 100 },
    { title: t('messageNotification.members.actions'), key: 'actions', width: 190 },
  ])
  const departmentOptions = computed(() => {
    const map = (nodes: WechatMembersDrawerModel['departments']): DepartmentOption[] => nodes.map(node => ({ value: String(node.id), label: node.name || node.id, children: map(node.children || []) }))
    return map(model().departments)
  })
  const filterFields = computed<ConditionFilterField[]>(() => [
    ...(['member', 'platformUser', 'contact'] as const).map(dataIndex => ({ dataIndex, title: t(`messageNotification.members.${dataIndex}`), search: { type: 'string', termTypeOptions: ['like', 'nlike', 'eq', 'not'] } })),
    { dataIndex: 'department', title: t('messageNotification.members.department'), search: { type: 'tree', termTypeOptions: ['in', 'nin'], options: departmentOptions.value } },
    { dataIndex: 'mappingStatus', title: t('messageNotification.members.status'), search: { type: 'select', termTypeOptions: ['eq'], options: statusOptions.value.filter(option => option.value !== 'all').map(option => ({ value: option.value, label: t(`messageNotification.members.filter.${option.value}`) })), optionPanel: { multiple: false } } },
  ])
  const statusTones = { all: 'default', bound: 'success', unbound: 'default', invalid: 'error' } as const
  return { t, columns, filterFields, statusOptions, statusTones, editingUser, edit, setEditing, selectMember, selectNode, stopEditing, pagination, memberTree, memberKeyword, expandedKeys, selectedKeys, expand, searchInput }
}
