import type { ConditionFilterExpressionNode, ConditionFilterField, ConditionFilterTerm } from '@jetlinks-web-core/components/ConditionFilter'
import type { MemberPlatformUser, WechatDepartment, WechatMember } from '../../../../../api/notice/wechatMembers'

export const mappingStatuses = ['all', 'bound', 'unbound', 'invalid'] as const
export type MemberStatusFilter = typeof mappingStatuses[number]
export type MemberFilterTerm = ConditionFilterTerm
interface MemberFilterRow { user: MemberPlatformUser; member?: WechatMember; memberId?: string; binding?: { providerName?: string }; mappingStatus: Exclude<MemberStatusFilter, 'all'> }

export function mappingStatusField(t: (key: string) => string): ConditionFilterField {
  return { dataIndex: 'mappingStatus', title: t('messageNotification.members.status'), search: { type: 'select', termTypeOptions: ['eq'],
    options: mappingStatuses.filter(value => value !== 'all').map(value => ({ value, label: t(`messageNotification.members.filter.${value}`) })),
    optionPanel: { multiple: false } } }
}

/** Status shortcuts edit the same terms as ConditionFilter; counts ignore only status clauses. */
export function withoutMemberStatus<T extends MemberFilterTerm>(terms: T[]): T[] {
  return terms.flatMap<T>(term => {
    if (term.terms) {
      const children = withoutMemberStatus(term.terms)
      return children.length ? [{ ...term, terms: children }] : []
    }
    return term.column === 'mappingStatus' ? [] : [term]
  })
}

export function memberStatusFilter(terms: MemberFilterTerm[]): MemberStatusFilter {
  const status = terms.filter(term => term.column === 'mappingStatus')
  return status.length === 1 && status[0].termType === 'eq' && ['bound', 'unbound', 'invalid'].includes(status[0].value)
    ? status[0].value : 'all'
}

export function withMemberStatus(terms: MemberFilterTerm[], status: MemberStatusFilter): MemberFilterTerm[] {
  const rest = withoutMemberStatus(terms)
  if (status === 'all') return rest
  return [...(rest.some(term => term.type === 'or') ? [{ terms: rest.filter(isCompleteTerm) }] : rest), { column: 'mappingStatus', termType: 'eq', value: status, type: 'and' }]
}

// ConditionFilter can emit unfinished clauses while editing; only complete nodes form a group.
function isCompleteTerm(term: MemberFilterTerm): term is ConditionFilterExpressionNode {
  return (!term.type || term.type === 'and' || term.type === 'or')
    && (term.terms ? term.terms.every(isCompleteTerm) : !!term.column && !!term.termType)
}

/** Evaluate the drawer's declared text/option operators against its complete loaded snapshot. */
export function filterWechatMemberRows<T extends MemberFilterRow>(rows: T[], terms: MemberFilterTerm[], departments: WechatDepartment[]): T[] {
  const descendants = new Map<string, string[]>()
  function collect(nodes: WechatDepartment[]): string[] {
    return nodes.flatMap(node => {
      const ids = [String(node.id), ...collect(node.children || [])]
      descendants.set(String(node.id), ids)
      return ids
    })
  }
  collect(departments)
  return filterMappingRows(rows, terms, (row, column) => {
    if (column === 'member') return [row.member?.name || row.binding?.providerName, row.memberId]
    if (column === 'platformUser') return [row.user.name, row.user.username, row.user.id]
    if (column === 'contact') return [row.user.telephone, row.user.email, row.member?.mobile, row.member?.email, row.member?.bizMail]
    if (column === 'department') return row.member?.department || []
    return column === 'mappingStatus' ? [row.mappingStatus] : []
  }, (column, values) => column === 'department' ? values.flatMap(id => descendants.get(id) || [id]) : values)
}

/** 两个对应抽屉使用同一套条件运算和 AND / OR 分组，字段值由各自的目录提供。 */
export function filterMappingRows<T>(rows: T[], terms: MemberFilterTerm[], valuesFor: (row: T, column?: string) => unknown[],
  expandValues?: (column: string | undefined, values: string[]) => string[]): T[] {
  function matches(row: T, term: MemberFilterTerm): boolean {
    if (term.terms) return expression(row, term.terms)
    const values = valuesFor(row, term.column)
    const expected = (Array.isArray(term.value) ? term.value : [term.value]).filter(value => value !== undefined && value !== null).map(String)
    if (!expected.length) return true
    const options = expandValues ? expandValues(term.column, expected) : expected
    const found = values.some(value => value != null && options.some(option => ['like', 'nlike'].includes(term.termType || '')
      ? String(value).toLowerCase().includes(option.toLowerCase()) : String(value).toLowerCase() === option.toLowerCase()))
    return ['not', 'nin', 'nlike'].includes(term.termType || '') ? !found : found
  }
  function expression(row: T, nodes: MemberFilterTerm[]): boolean {
    // Match the standard expression's AND precedence within OR-separated groups.
    let accepted = false
    let group = true
    nodes.forEach((node, index) => {
      if (index && node.type === 'or') { accepted ||= group; group = true }
      group = matches(row, node) && group
    })
    return accepted || group
  }
  return rows.filter(row => expression(row, terms))
}
