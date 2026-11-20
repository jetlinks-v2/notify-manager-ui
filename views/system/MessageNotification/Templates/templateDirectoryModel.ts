import type { NoticeChannelConfig } from '../../../../api/notice-center'
import type { NotificationTemplate } from '../shared'

export interface TemplateDirectoryNode {
  key: string
  title: string
  kind: 'group' | 'business' | 'template'
  class?: string
  templateId?: string
  hasTemplate?: boolean
  business?: NoticeChannelConfig
  searchText: string
  selectable: boolean
  children?: TemplateDirectoryNode[]
}

const displayGroups = [
  ['iot', ['alarm-device', 'alarm-device-relieve', 'scene', 'device-transparent-codec']],
  ['video', ['aiComplianceAlarm', 'aiSecurityAlarm']],
  ['system', ['SystemBulletin', 'system-event']],
] as const
const businessDisplay = new Map<string, { groupId: string; order: number }>(
  displayGroups.flatMap(([groupId, providers]) => providers.map((provider, order) => [provider, { groupId, order }] as const)),
)

/** 业务身份独立于当前渠道模板，未保存的业务也能成为选中对象。 */
export function templateBusinessKey(item: NoticeChannelConfig, index = 0): string {
  return JSON.stringify(['business', item.type?.id || 'other', item.id || item.provider || item.providerId || index])
}

/** 目录仅保留分类和可选叶节点两级，模板绑定仍只采用当前渠道内的真实 ID。 */
export function buildTemplateDirectory(
  templates: NotificationTemplate[], businessTypes: NoticeChannelConfig[],
  labels: { other: string }, translate: (key: string) => string,
): TemplateDirectoryNode[] {
  if (!businessTypes.length) return []
  const templateMap = new Map(templates.map(item => [item.id, item]))
  // 按固定顺序预置分类。扩展分类使用独立的 key，避免与页面分类的 ID 冲突。
  const groups = new Map<string, TemplateDirectoryNode>(displayGroups.map(([id]) => {
    const key = JSON.stringify(['group', id])
    const title = translate(`messageNotification.templates.groups.${id}`)
    return [key, {
      key, title, searchText: title,
      kind: 'group', class: 'template-directory__group', selectable: false, children: [],
    }]
  }))
  // 已知业务按组内顺序排列。扩展业务和同类的多条记录保留接口顺序及源索引。
  const ordered = businessTypes.map((item, index) => {
    const provider = item.provider || item.providerId || item.id || ''
    return { item, index, provider, display: businessDisplay.get(provider) }
  }).sort((left, right) => (left.display?.order ?? businessDisplay.size) - (right.display?.order ?? businessDisplay.size))
  for (const { item, index, provider, display } of ordered) {
    const groupKey = display ? JSON.stringify(['group', display.groupId])
      : JSON.stringify(['backend-group', item.type?.id || 'other'])
    const key = templateBusinessKey(item, index)
    const translated = item.i18nName ? translate(item.i18nName) : ''
    const title = translated && translated !== item.i18nName ? translated : item.name || provider
    const ids = [...new Set((item.channels || []).map(channel => channel.channelConfiguration?.templateId)
      .filter((id): id is string => Boolean(id && templateMap.has(id))))]
    const node: TemplateDirectoryNode = {
      key, title, kind: 'business', business: item, templateId: ids.length === 1 ? ids[0] : undefined, hasTemplate: ids.length > 0,
      searchText: [title, provider, ...ids.map(id => `${templateMap.get(id)!.name} ${id}`)].join(' '),
      selectable: true,
    }
    const group = groups.get(groupKey) || {
      key: groupKey, title: item.type?.name || labels.other,
      kind: 'group' as const, class: 'template-directory__group',
      searchText: item.type?.name || labels.other, selectable: false, children: [],
    }
    group.children!.push(node)
    // 多绑定模板与业务并列，保留旧节点 key 和选择入口；标题补上业务上下文以区分同名模板。
    if (ids.length > 1) group.children!.push(...ids.map((id): TemplateDirectoryNode => {
      const template = templateMap.get(id)!
      return {
        key: JSON.stringify([key, id]), title: `${title} · ${template.name}`, kind: 'template', templateId: id,
        searchText: `${title} ${provider} ${template.name} ${id}`, selectable: true,
      }
    }))
    groups.set(groupKey, group)
  }
  return [...groups.values()].filter(group => group.children?.length)
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
