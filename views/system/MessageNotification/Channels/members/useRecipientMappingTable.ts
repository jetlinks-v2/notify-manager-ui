import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConditionFilterField } from '@jetlinks-web-core/components/ConditionFilter'
import type { WorkRecipientsWorkspace } from './useWorkRecipients'
import { filterMappingRows, mappingStatusField, withoutMemberStatus, withMemberStatus, type MemberFilterTerm, type MemberStatusFilter } from './wechatMemberFilters'

type MappingRow = WorkRecipientsWorkspace['rows']['value'][number]
type TreeNode<T> = T & { children?: TreeNode<T>[] }

/** 组织和通讯录都通过父 ID 构树，同名兄弟或不同分支的同名节点仍能独立操作。 */
function asTree<T extends { id: string; parentId?: string }>(rows: T[]): TreeNode<T>[] {
  const nodes = new Map<string, TreeNode<T>>(rows.map(row => [row.id, { ...row }]))
  const roots: TreeNode<T>[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent && parent !== node) (parent.children ??= []).push(node)
    else roots.push(node)
  }
  return roots
}

function filterRows(rows: MappingRow[], terms: MemberFilterTerm[]) {
  return filterMappingRows(rows, terms, (row, field) => {
    if (field === 'platform') return [row.label, row.id]
    if (field === 'external') return [row.externalLabel, row.externalName, row.externalId]
    return field === 'mappingStatus' ? [row.mappingStatus] : []
  })
}

export function useRecipientMappingTable(work: WorkRecipientsWorkspace) {
  const { t } = useI18n()
  const terms = ref<MemberFilterTerm[]>([])
  const editingId = ref('')
  const page = ref(1)
  const expanded = ref<string[]>([])
  const collapsedMatches = ref<string[]>([])
  const isDepartment = computed(() => work.kind.value === 'department')
  const platformTitle = computed(() => t(`messageNotification.recipients.${work.kind.value}Platform`))
  const externalTitle = computed(() => t(`messageNotification.recipients.${work.kind.value}External`))
  const chooseLabel = computed(() => t(isDepartment.value ? 'messageNotification.recipients.chooseDepartment' : 'messageNotification.recipients.chooseTag'))
  const unbindTitle = computed(() => t(isDepartment.value ? 'messageNotification.recipients.confirmDepartmentUnbind' : 'messageNotification.recipients.confirmTagUnbind'))
  const ready = computed(() => work.loaded.value && !work.busy.value && work.error.value !== 'conflict')
  const fields = computed<ConditionFilterField[]>(() => [
    { dataIndex: 'platform', title: platformTitle.value, search: { type: 'string', termTypeOptions: ['like', 'nlike', 'eq', 'not'] } },
    { dataIndex: 'external', title: externalTitle.value, search: { type: 'string', termTypeOptions: ['like', 'nlike', 'eq', 'not'] } },
    mappingStatusField(t),
  ])
  const columns = computed(() => [
    { dataIndex: 'label', title: platformTitle.value, width: '30%', scopedSlots: !isDepartment.value },
    { dataIndex: 'external', title: externalTitle.value, scopedSlots: true },
    { dataIndex: 'status', title: t('messageNotification.members.status'), width: 112, scopedSlots: true },
    { dataIndex: 'action', title: t('messageNotification.members.actions'), width: 180, scopedSlots: true },
  ])
  const counts = computed(() => {
    const matched = filterRows(work.rows.value, withoutMemberStatus(terms.value))
    const result = { all: matched.length, bound: 0, unbound: 0, invalid: 0 }
    for (const row of matched) result[row.mappingStatus]++
    return result
  })
  const duplicateRoleNames = computed(() => {
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const row of work.rows.value) {
      if (seen.has(row.label)) duplicates.add(row.label)
      seen.add(row.label)
    }
    return duplicates
  })
  const tableRows = computed<TreeNode<MappingRow & { contextOnly?: boolean }>[]>(() => {
    const rows = work.rows.value
    const matches = filterRows(rows, terms.value)
    if (!isDepartment.value) return matches
    const matched = new Set(matches.map(row => row.id))
    const parents = new Map(rows.map(row => [row.id, row.parentId]))
    const visible = new Set<string>()
    // 补全命中行的祖先用于展开和定位，祖先不计入命中数。
    for (const id of matched) {
      let current: string | undefined = id
      while (current && !visible.has(current)) {
        visible.add(current)
        current = parents.get(current)
      }
    }
    return asTree(rows.filter(row => visible.has(row.id)).map(row => ({ ...row, contextOnly: !matched.has(row.id) })))
  })
  const branchKeys = computed(() => {
    const collect = (nodes: typeof tableRows.value): string[] => nodes.flatMap(node => node.children?.length ? [node.id, ...collect(node.children)] : [])
    return collect(tableRows.value)
  })
  const expandedKeys = computed({
    get: () => terms.value.length ? branchKeys.value.filter(key => !collapsedMatches.value.includes(key)) : expanded.value,
    set: (keys: string[]) => {
      if (terms.value.length) collapsedMatches.value = branchKeys.value.filter(key => !keys.includes(key))
      else expanded.value = keys
    },
  })
  const pagination = computed(() => ({
    current: page.value, pageSize: isDepartment.value ? Math.max(tableRows.value.length, 1) : 15,
    hideOnSinglePage: true, showSizeChanger: false,
    onChange: (value: number) => { page.value = value; editingId.value = '' },
  }))
  const pickerProps = computed(() => {
    const options = work.externalOptions.value.map(option => ({
      id: option.value, value: option.value, parentId: option.parentId, title: `${option.title} · ${option.value}`,
      label: option.label, disabled: !!option.assignedTo && option.assignedTo !== editingId.value,
    }))
    return isDepartment.value
      ? { treeData: asTree(options), treeNodeFilterProp: 'label', treeNodeLabelProp: 'title', treeDefaultExpandAll: true }
      : { options, optionFilterProp: 'label' }
  })
  function setStatus(value: MemberStatusFilter) { terms.value = withMemberStatus(terms.value, value) }
  function closePicker(id: string) {
    // 旧行失焦后的关闭事件可能晚于下一行打开。
    if (editingId.value === id) editingId.value = ''
  }
  function choose(id: string, value: string) {
    work.assign(id, value)
    closePicker(id)
  }
  watch(terms, () => { page.value = 1; collapsedMatches.value = []; editingId.value = '' }, { deep: true })
  watch(() => work.loaded.value, loaded => {
    page.value = 1
    if (loaded && isDepartment.value) expanded.value = tableRows.value.filter(row => row.children?.length).map(row => row.id)
  }, { immediate: true })
  watch(ready, () => { editingId.value = '' })
  return { t, terms, ready, isDepartment, fields, counts, columns, tableRows, expandedKeys, pagination,
    editingId, duplicateRoleNames, pickerProps, chooseLabel, unbindTitle, choose, closePicker, setStatus }
}
