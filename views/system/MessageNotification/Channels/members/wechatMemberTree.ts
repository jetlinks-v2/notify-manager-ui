import type { WechatDepartment, WechatMember } from '../../../../../api/notice/wechatMembers'

export interface WechatMemberTreeNode {
  key: string
  title: string
  kind: 'department' | 'member'
  selectable: boolean
  disabled?: boolean
  memberId?: string
  description?: string
  count?: number
  children?: WechatMemberTreeNode[]
}

/** Department aliases share a member ID; only presentation keys include the department path. */
export function buildWechatMemberTree(departments: WechatDepartment[], members: WechatMember[], unavailable: (id: string) => boolean, ungrouped: string, keyword = ''): WechatMemberTreeNode[] {
  const query = keyword.trim().toLowerCase()
  const known = new Set<string>()
  const collectDepartments = (nodes: WechatDepartment[]) => nodes.forEach(node => { known.add(String(node.id)); collectDepartments(node.children || []) })
  collectDepartments(departments)
  const groups = new Map<string, WechatMember[]>()
  const unassigned: WechatMember[] = []
  for (const member of new Map(members.map(member => [member.id, member])).values()) {
    const ids = [...new Set((member.department || []).map(String))].filter(id => known.has(id))
    if (!ids.length) unassigned.push(member)
    ids.forEach(id => { if (!groups.has(id)) groups.set(id, []); groups.get(id)!.push(member) })
  }
  const memberNodes = (items: WechatMember[], path: string[], parentMatches: boolean): WechatMemberTreeNode[] => items
    .filter(member => parentMatches || [member.name, member.id, member.mobile, member.email, member.bizMail].some(value => String(value || '').toLowerCase().includes(query)))
    .map(member => ({ key: JSON.stringify(['member', ...path, member.id]), title: member.name || member.id, kind: 'member', memberId: member.id,
      description: member.mobile || member.email || member.bizMail || member.id, selectable: true, disabled: unavailable(member.id) }))
  const memberIds = (nodes: WechatMemberTreeNode[]): string[] => nodes.flatMap(node => node.memberId ? [node.memberId] : memberIds(node.children || []))
  function departmentNodes(nodes: WechatDepartment[], path: string[] = [], parentMatches = !query): WechatMemberTreeNode[] {
    return nodes.flatMap(node => {
      const id = String(node.id)
      const currentPath = [...path, id]
      const title = node.name || id
      const matched = parentMatches || title.toLowerCase().includes(query)
      const children = [...departmentNodes(node.children || [], currentPath, matched), ...memberNodes(groups.get(id) || [], currentPath, matched)]
      return children.length ? [{ key: JSON.stringify(['department', ...currentPath]), title, kind: 'department', selectable: false, count: new Set(memberIds(children)).size, children }] : []
    })
  }
  const tree = departmentNodes(departments)
  const children = memberNodes(unassigned, [], !query || ungrouped.toLowerCase().includes(query))
  if (children.length) tree.push({ key: 'ungrouped', title: ungrouped, kind: 'department', selectable: false, count: children.length, children })
  return tree
}

/** Searches reveal ancestors; reopening a selection reveals every alias of the selected member. */
export function wechatTreeExpandedKeys(nodes: WechatMemberTreeNode[], memberId?: string, searching = false): string[] {
  const keys: string[] = []
  function visit(nodes: WechatMemberTreeNode[], root = false): boolean {
    let selected = false
    for (const node of nodes) {
      const contains = node.kind === 'member' ? node.memberId === memberId : visit(node.children || [])
      if (node.kind === 'department' && (root || contains || searching)) keys.push(node.key)
      selected ||= contains
    }
    return selected
  }
  visit(nodes, true)
  return keys
}
