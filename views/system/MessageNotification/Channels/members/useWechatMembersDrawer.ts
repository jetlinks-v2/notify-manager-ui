import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WechatMembersWorkspace } from './useWechatMembers'
interface DepartmentOption { value: string; title: string; children: DepartmentOption[] }

export type WechatMemberRow = WechatMembersWorkspace['rows']['value'][number]
export interface WechatMembersDrawerModel {
  open: boolean
  state: WechatMembersWorkspace['state']['value']
  busy: boolean
  error: string
  saved: boolean
  refreshRequired: boolean
  dirty: boolean
  canSave: boolean
  departments: WechatMembersWorkspace['departments']['value']
  rows: WechatMemberRow[]
  users: WechatMembersWorkspace['users']['value']
  departmentId: string
  search: string
  pendingCount: number
  canAutoMatch: boolean
  matchCount?: number
  stats: WechatMembersWorkspace['stats']['value']
  filterCounts: WechatMembersWorkspace['filterCounts']['value']
  statusFilter: WechatMembersWorkspace['statusFilter']['value']
  userUnavailable: WechatMembersWorkspace['userUnavailable']
}

export function useWechatMembersDrawer(model: () => WechatMembersDrawerModel) {
  const { t } = useI18n()
  const editingMember = ref('')
  const page = ref(1)
  const pageSize = ref(20)
  function stopEditing() { editingMember.value = '' }
  function edit(memberId: string) { if (!model().busy && !model().refreshRequired) editingMember.value = memberId }
  function paginate(current: number, size: number) { page.value = current; pageSize.value = size; stopEditing() }
  watch(() => [model().open, model().search, model().departmentId, model().statusFilter], () => { page.value = 1; stopEditing() })
  watch(() => model().rows.length, count => { page.value = Math.min(page.value, Math.max(1, Math.ceil(count / pageSize.value))) })
  watch(() => [model().state, model().refreshRequired], stopEditing)
  const pagination = computed(() => ({ current: page.value, pageSize: pageSize.value, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], onChange: paginate }))
  const statusOptions = computed(() => (['all', 'bound', 'unbound', 'invalid'] as const).map(value => ({ value, label: `${t(`messageNotification.members.filter.${value}`)} ${model().filterCounts[value]}` })))
  const columns = computed(() => [
    { title: t('messageNotification.members.member'), key: 'member', width: 150 },
    { title: t('messageNotification.members.contact'), key: 'contact', width: 200 },
    { title: t('messageNotification.members.platformUser'), key: 'user', width: 190 },
    { title: t('messageNotification.members.method'), key: 'method', width: 160 },
    { title: t('messageNotification.members.status'), key: 'status', width: 100 },
    { title: t('messageNotification.members.actions'), key: 'actions', width: 190 },
  ])
  const departmentOptions = computed(() => {
    const map = (nodes: WechatMembersDrawerModel['departments']): DepartmentOption[] => nodes.map(node => ({ value: String(node.id), title: node.name || node.id, children: map(node.children || []) }))
    return map(model().departments)
  })
  function userOptions(memberId: string, selectedUserId?: string) {
    const options = model().users.map(user => ({ value: user.id, label: `${user.name || user.id}${user.username ? ` (${user.username})` : ''}`, disabled: model().userUnavailable(user.id, memberId) }))
    if (selectedUserId && !options.some(option => option.value === selectedUserId)) options.unshift({ value: selectedUserId, label: selectedUserId, disabled: true })
    return options
  }
  const failure = computed(() => model().error && t(['forbidden', 'error', 'unavailable'].includes(model().error) ? `messageNotification.state.${model().error}` : `messageNotification.members.error.${model().error}`))
  return { t, columns, departmentOptions, userOptions, failure, statusOptions, editingMember, edit, stopEditing, pagination }
}
