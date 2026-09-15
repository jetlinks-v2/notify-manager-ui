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

const alarmVariables: NoticeTemplateVariable[] = [
  { id: 'targetType', name: '告警类型' },
  { id: 'alarmConfigName', name: '告警名称' },
  { id: 'targetName', name: '告警目标名称' },
  { id: 'level', name: '告警级别' },
  { id: 'alarmTime', name: '告警时间' },
  { id: 'sourceType', name: '告警源类型' },
  { id: 'sourceName', name: '告警源名称' },
]

const recommendedVariablesByProvider: Record<string, NoticeTemplateVariable[]> = {
  'alarm-device': [
    ...alarmVariables.filter(item => item.id !== 'targetName'),
    { id: 'targetId', name: '设备ID' },
    { id: 'targetName', name: '设备名称' },
  ],
  'alarm-product': [
    ...alarmVariables.filter(item => item.id !== 'targetName'),
    { id: 'targetId', name: '产品ID' },
    { id: 'targetName', name: '产品名称' },
  ],
  'alarm-org': [
    ...alarmVariables.filter(item => item.id !== 'targetName'),
    { id: 'targetId', name: '组织ID' },
    { id: 'targetName', name: '组织名称' },
  ],
  'alarm-collector': [
    ...alarmVariables.filter(item => item.id !== 'targetName'),
    { id: 'targetId', name: '采集器ID' },
    { id: 'targetName', name: '采集器名称' },
  ],
  'alarm-other': alarmVariables,
  scene: [
    { id: 'sceneId', name: '场景ID' },
    { id: 'sceneName', name: '场景名称' },
    { id: 'triggerType', name: '触发类型' },
  ],
  'system-event': [
    { id: 'level', name: '级别' },
    { id: 'code', name: '错误码' },
    { id: 'timestamp', name: '时间戳' },
  ],
  'device-transparent-codec': [
    { id: 'level', name: '级别' },
    { id: 'code', name: '错误码' },
    { id: 'timestamp', name: '时间戳' },
  ],
}

export const toListResult = <T>(response: any): T[] => {
  const result = response?.result
  if (Array.isArray(result)) return result as T[]
  if (Array.isArray(result?.data)) return result.data as T[]
  return []
}

/**
 * 将订阅 provider 声明的 detail 字段转换为模板可直接插入的变量。
 *
 * 通知发送上下文将 provider 返回的字段统一放入 detail 对象，保留已有前缀以避免重复转换。
 */
export const normalizeDetailVariables = (variables: NoticeTemplateVariable[]): NoticeTemplateVariable[] => {
  const mapped = new Map<string, NoticeTemplateVariable>()

  variables.forEach(variable => {
    if (!variable?.id) {
      return
    }
    const id = variable.id.startsWith('detail.') ? variable.id : `detail.${variable.id}`
    mapped.set(id, { ...variable, id })
  })

  return Array.from(mapped.values())
}

/**
 * 返回通知类型约定的固定推荐变量，避免微服务集群的 provider 元数据未透传时推荐区域为空。
 */
export const getRecommendedVariables = (providerCode?: string): NoticeTemplateVariable[] =>
  normalizeDetailVariables(recommendedVariablesByProvider[providerCode || ''] || [])
    .map(variable => ({
      ...variable,
      expands: { ...variable.expands, recommended: true },
    }))

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
  const pattern = /\$\{([^}]+)\}/g
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
