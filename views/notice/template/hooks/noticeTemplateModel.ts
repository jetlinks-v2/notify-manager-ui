import type {
  NoticeChannelConfig,
  NoticeChannelProvider,
  NoticeTemplateEntity,
  NoticeTemplateVariable,
  NotifierConfig,
} from '@notify-manager-ui/api/notice-center'
import { getPreviewTexts } from './noticeTemplateFormModel'
import type { NoticeTemplateEditorPayload } from './noticeTemplateFormModel'

export type { NoticeTemplateEditorPayload } from './noticeTemplateFormModel'

export interface NoticeTemplateChannelNode {
  key: string
  providerName: string
  channelProvider: string
  channelName: string
  channel?: NoticeChannelConfig
  template?: NoticeTemplateEntity
  templates?: NoticeTemplateEntity[]
  notifierConfig?: NotifierConfig
  notifierConfigs?: NotifierConfig[]
  hasNotifierConfig: boolean
  configured: boolean
}

export interface NoticeTemplateAlarmNode {
  key: string
  id: string
  detailProviderId: string
  providerCode: string
  name: string
  provider: string
  raw: NoticeChannelConfig
  coveredAlarmNames: string[]
  channels: NoticeTemplateChannelNode[]
}

export interface NoticeTemplateGroup {
  key: string
  id: string
  name: string
  alarms: NoticeTemplateAlarmNode[]
}

export interface NoticeTemplateTreeNode {
  key: string
  title: string
  nodeType: 'group' | 'alarm' | 'channel'
  count?: number
  missing?: boolean
  alarmKey?: string
  channelProvider?: string
  providerId?: string
  providerCode?: string
  state?: string
  enabled?: boolean
  children?: NoticeTemplateTreeNode[]
}

export const insideMailProvider: NoticeChannelProvider = {
  id: 'inside-mail',
  name: 'Inside Mail',
  i18nName: 'NoticeCenter.channel.type.inside-mail',
}

export const getStateValue = (state: NoticeChannelConfig['state']) => {
  if (typeof state === 'string') {
    return state
  }
  return state?.value || ''
}

export const getNotifierType = (channelProvider = '') => channelProvider.replace(/^notifier-/, '')

export const configQuery = (type: string) => ({
  pageIndex: 0,
  pageSize: 50,
  terms: [{ column: 'type', termType: 'eq', value: type }],
  sorts: [{ name: 'createTime', order: 'desc' }],
})

const preferredNotifierProviderMap: Record<string, string> = {
  sms: 'aliyunSms',
  email: 'embedded',
  dingTalk: 'dingTalkMessage',
  weixin: 'corpMessage',
  voice: 'aliyun',
  webhook: 'http',
}

export const toListResult = <T>(response: any): T[] => {
  const result = response?.result
  if (Array.isArray(result)) return result as T[]
  if (Array.isArray(result?.data)) return result.data as T[]
  return []
}

export const getDisplayName = (item?: { i18nName?: string; name?: string; id?: string }) =>
  item?.i18nName || item?.name || item?.id || ''

export const isInsideMailChannel = (channelProvider?: string) => channelProvider === insideMailProvider.id
export const isExternalNotifierChannel = (channelProvider?: string) => Boolean(channelProvider?.startsWith('notifier-'))
export const needsTemplate = (channelProvider?: string) => isExternalNotifierChannel(channelProvider) && !isInsideMailChannel(channelProvider)

export const getTemplateMessage = (template?: NoticeTemplateEntity) => {
  return getPreviewTexts({
    name: template?.name || '',
    description: template?.description,
    type: template?.type,
    provider: template?.provider,
    template: template?.template || {},
    variableDefinitions: template?.variableDefinitions || [],
  } as NoticeTemplateEditorPayload).message
}

export const getTemplateSubject = (template?: NoticeTemplateEntity) => {
  return getPreviewTexts({
    name: template?.name || '',
    description: template?.description,
    type: template?.type,
    provider: template?.provider,
    template: template?.template || {},
    variableDefinitions: template?.variableDefinitions || [],
  } as NoticeTemplateEditorPayload).title
}

export const getResponseResult = <T>(response: any, fallback: T): T => {
  if (response?.result === undefined || response?.result === null) {
    return fallback
  }
  return response.result as T
}

export const normalizeProviderList = (list: NoticeChannelProvider[]) => {
  const map = new Map<string, NoticeChannelProvider>()
  list.forEach(item => {
    if (item?.id) {
      map.set(item.id, item)
    }
  })
  if (!map.has(insideMailProvider.id)) {
    map.set(insideMailProvider.id, insideMailProvider)
  }
  return Array.from(map.values())
}

export const normalizeGroupList = (
  list: NoticeChannelConfig[],
  providers: NoticeChannelProvider[],
  defaultGroupName: string,
  notifierConfigMap: Record<string, NotifierConfig[]> = {},
) => {
  const groupMap = new Map<string, NoticeTemplateGroup>()

  list.forEach(item => {
    // all-for-save 同时承载告警类型与渠道配置，这里先归一成“告警域 / 告警项 / 渠道”三层树模型。
    const typeId = item.type?.id || 'default'
    const group = groupMap.get(typeId) || {
      key: typeId,
      id: typeId,
      name: item.type?.name || defaultGroupName,
      alarms: [],
    }
    const providerCode = String(item.provider || item.providerId || item.id || typeId)
    const alarmId = item.id || item.providerId || providerCode || `${typeId}-${group.alarms.length}`
    const detailProviderId = item.id || item.providerId || ''
    const configuredChannels = item.channels || []
    const channelMap = new Map(configuredChannels.map(channel => [channel.channelProvider, channel]))
    const providerList = providers.length ? providers : [insideMailProvider]

    group.alarms.push({
      key: alarmId,
      id: alarmId,
      detailProviderId,
      providerCode,
      name: getDisplayName(item) || alarmId,
      provider: providerCode,
      raw: item,
      coveredAlarmNames: [],
      channels: providerList.map(provider => {
        const channel = channelMap.get(provider.id)
        const notifierType = getNotifierType(provider.id)
        const notifierConfigs = notifierConfigMap[notifierType] || []
        const boundNotifierId = channel?.channelConfiguration?.notifierId
        const notifierConfig = notifierConfigs.find(item => item.id === boundNotifierId)
          || notifierConfigs.find(item => item.provider === preferredNotifierProviderMap[notifierType])
          || notifierConfigs[0]
        return {
          key: `${alarmId}:${provider.id}`,
          providerName: group.name,
          channelProvider: provider.id,
          channelName: getDisplayName(provider),
          channel,
          notifierConfig,
          notifierConfigs,
          hasNotifierConfig: !needsTemplate(provider.id) || Boolean(notifierConfig?.id),
          configured: !needsTemplate(provider.id),
        }
      }),
    })

    groupMap.set(typeId, group)
  })

  const groups = Array.from(groupMap.values())
  return {
    groups: groups.map(group => ({
      ...group,
      alarms: group.alarms.map(alarm => ({
        ...alarm,
        coveredAlarmNames: group.alarms
          .filter(item => (item.detailProviderId || item.providerCode) === (alarm.detailProviderId || alarm.providerCode))
          .map(item => item.name),
      })),
    })),
    expandedKeys: groups.flatMap(group => group.alarms.map(alarm => alarm.key)),
  }
}

export const buildTreeData = (groups: NoticeTemplateGroup[]): NoticeTemplateTreeNode[] =>
  groups.flatMap(group =>
    group.alarms.map(alarm => ({
      key: alarm.key,
      title: alarm.name,
      nodeType: 'alarm',
      count: alarm.channels.length,
      missing: alarm.channels.some(channel => needsTemplate(channel.channelProvider) && !channel.configured),
      alarmKey: alarm.key,
      providerId: alarm.detailProviderId,
      providerCode: alarm.providerCode,
      state: getStateValue(alarm.raw.state) || 'enabled',
      enabled: getStateValue(alarm.raw.state) !== 'disabled',
      children: alarm.channels.map(channel => ({
        key: channel.key,
        title: channel.channelName,
        nodeType: 'channel',
        count: channel.configured ? undefined : 0,
        missing: needsTemplate(channel.channelProvider) && !channel.configured,
        alarmKey: alarm.key,
        channelProvider: channel.channelProvider,
      })),
    })),
  )

export const getTemplateCode = (
  alarm?: NoticeTemplateAlarmNode,
  channel?: NoticeTemplateChannelNode,
) => {
  if (!alarm || !channel) {
    return ''
  }
  const detailName = alarm.detailProviderId === alarm.id
    ? alarm.name
    : channel.providerName
  return `${alarm.detailProviderId || alarm.provider}_${detailName}_${channel.channelProvider}`
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

export const getBreadcrumb = (
  alarm?: NoticeTemplateAlarmNode,
  channel?: NoticeTemplateChannelNode,
) => [channel?.providerName, alarm?.name, channel?.channelName].filter(Boolean) as string[]

export const getCoveredAlarmNames = (alarm?: NoticeTemplateAlarmNode) => {
  const source = alarm?.raw
  const rawList = source?.included || source?.includes || source?.alarmTypes || source?.children
  if (Array.isArray(rawList)) {
    return rawList
      .map((item: any) => getDisplayName(item) || item?.alarmTypeName || item?.name || String(item))
      .filter(Boolean)
  }
  if (alarm?.coveredAlarmNames.length) {
    return alarm.coveredAlarmNames
  }
  return alarm?.name ? [alarm.name] : []
}

export const getUsedVariables = (
  template: NoticeTemplateEntity | undefined,
  channelVariables: NoticeTemplateVariable[],
) => {
  const merged = new Map<string, NoticeTemplateVariable>()
  const ids = new Set<string>()
  const pattern = /\$\{(\w+)\}/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(`${getTemplateSubject(template)}\n${getTemplateMessage(template)}`))) {
    ids.add(match[1])
  }

  channelVariables.forEach(item => {
    if (item?.id && ids.has(item.id)) {
      merged.set(item.id, item)
    }
  })
  ids.forEach(id => {
    if (!merged.has(id)) {
      merged.set(id, { id })
    }
  })

  return Array.from(merged.values())
}

export const getAvailableStats = (
  template: NoticeTemplateEntity | undefined,
  channel?: NoticeTemplateChannelNode,
) => {
  const stats = (template?.stats || channel?.channel?.stats) as Record<string, unknown> | undefined
  if (!stats) {
    return []
  }
  return Object.entries(stats)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({ key, value: String(value) }))
}

export const getReferencedPolicies = (
  template: NoticeTemplateEntity | undefined,
  channel?: NoticeTemplateChannelNode,
) => {
  const refs = template?.references || template?.policies || channel?.channel?.references
  if (!Array.isArray(refs)) {
    return []
  }
  return refs.map((item: any, index) => ({
    id: String(item?.id || item?.key || index),
    name: item?.name || item?.title || String(item),
    count: item?.count || item?.userCount || item?.refCount,
  }))
}

export const findFirstChannel = (nodes: NoticeTemplateTreeNode[] = []) => {
  for (const node of nodes) {
    if (node.nodeType === 'channel') {
      return node
    }
    const found = findFirstChannel(node.children)
    if (found) {
      return found
    }
  }
  return undefined
}

export const findTreeNode = (
  nodes: NoticeTemplateTreeNode[],
  key: string,
): NoticeTemplateTreeNode | undefined => {
  for (const node of nodes) {
    if (node.key === key) {
      return node
    }
    const found = findTreeNode(node.children || [], key)
    if (found) {
      return found
    }
  }
  return undefined
}
