import type { NoticeChannelConfig } from '../../../../api/notice-center'
import type { NotificationTemplate } from '../shared'

export interface TemplateDirectoryNode {
  key: string
  title: string
  kind: 'group' | 'business' | 'template'
  class?: string
  templateId?: string
  searchText: string
  selectable: boolean
  children?: TemplateDirectoryNode[]
}

/** Bind only IDs returned by the business directory and visible in the current channel. */
export function buildTemplateDirectory(
  templates: NotificationTemplate[], businessTypes: NoticeChannelConfig[],
  labels: { other: string }, translate: (key: string) => string,
): TemplateDirectoryNode[] {
  const templateMap = new Map(templates.map(item => [item.id, item]))
  const groups = new Map<string, TemplateDirectoryNode>()
  const businesses = new Map<string, { node: TemplateDirectoryNode; provider: string }[]>()
  const templateNode = (item: NotificationTemplate, key = item.id): TemplateDirectoryNode => ({
    key, title: item.name, kind: 'template', templateId: item.id,
    searchText: `${item.name} ${item.id}`, selectable: true,
  })
  businessTypes.forEach((item, index) => {
    const groupId = item.type?.id || 'other'
    const provider = item.provider || item.providerId || item.id || ''
    const key = JSON.stringify(['business', groupId, item.id || provider || index])
    const translated = item.i18nName ? translate(item.i18nName) : ''
    const title = translated && translated !== item.i18nName ? translated : item.name || provider
    const ids = [...new Set((item.channels || []).map(channel => channel.channelConfiguration?.templateId)
      .filter((id): id is string => Boolean(id && templateMap.has(id))))]
    const node: TemplateDirectoryNode = {
      key, title, kind: 'business', templateId: ids.length === 1 ? ids[0] : undefined,
      searchText: [title, provider, ...ids.map(id => `${templateMap.get(id)!.name} ${id}`)].join(' '),
      selectable: ids.length === 1,
      children: ids.length > 1 ? ids.map(id => templateNode(templateMap.get(id)!, JSON.stringify([key, id]))) : undefined,
    }
    const group = groups.get(groupId) || {
      key: JSON.stringify(['group', groupId]), title: item.type?.name || labels.other,
      kind: 'group' as const, class: 'template-directory__group',
      searchText: item.type?.name || labels.other, selectable: false, children: [],
    }
    group.children!.push(node)
    groups.set(groupId, group)
    const siblings = businesses.get(groupId) || []
    siblings.push({ node, provider })
    businesses.set(groupId, siblings)
  })
  // 原型把告警解除缩进到设备告警下；这只是已知业务的展示关系，不合并 ID、草稿或保存。
  businesses.forEach((siblings, groupId) => {
    const parent = siblings.find(item => item.provider === 'alarm-device')?.node
    const children = siblings.filter(item => item.provider === 'alarm-device-relieve').map(item => item.node)
    if (parent && children.length) {
      parent.children = [...(parent.children || []), ...children]
      groups.get(groupId)!.children = groups.get(groupId)!.children!.filter(node => !children.includes(node))
    }
  })
  return [...groups.values()]
}

/** A child match keeps its complete ancestry; a matching parent keeps its descendants. */
export function filterTemplateDirectory(nodes: TemplateDirectoryNode[], query: string): TemplateDirectoryNode[] {
  const keyword = query.trim().toLocaleLowerCase()
  if (!keyword) return nodes
  return nodes.flatMap(node => {
    if (node.searchText.toLocaleLowerCase().includes(keyword)) return [node]
    const children = filterTemplateDirectory(node.children || [], keyword)
    return children.length ? [{ ...node, children }] : []
  })
}

export function flattenTemplateDirectory(nodes: TemplateDirectoryNode[]): TemplateDirectoryNode[] {
  return nodes.flatMap(node => [node, ...flattenTemplateDirectory(node.children || [])])
}
