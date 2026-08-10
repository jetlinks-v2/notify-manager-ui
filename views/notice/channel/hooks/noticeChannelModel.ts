import type {
  NoticeChannelConfig,
  NoticeChannelProvider,
  NoticeMetadataProperty,
  NoticeProviderTemplateInfo,
  NoticeTemplateEntity,
  NotifierConfig,
  NotifierProviderInfo,
  SendNotifierInlineTestPayload,
} from '@notify-manager-ui/api/notice-center'

export type ChannelStatus = 'builtin' | 'configured' | 'unconfigured'

export interface NoticeChannelItem {
  id: string
  name: string
  type: string
  icon: string
  provider?: string
  providerName?: string
  providerOptions?: NotifierProviderInfo[]
  config?: NotifierConfig
  template?: NoticeTemplateEntity | null
  topic?: NoticeChannelConfig
  channel?: NoticeChannelConfig
  metadata: NoticeMetadataProperty[]
  status: ChannelStatus
}

export interface NotifierDraft {
  id?: string
  name: string
  description?: string
  provider: string
  configuration: Record<string, unknown>
}

type CredentialField = NoticeMetadataProperty & {
  defaultValue?: unknown
  required?: boolean
  maxLength?: number
  pattern?: 'email'
  group?: 'emailServer'
}

const aliyunRegionElements: NonNullable<NoticeMetadataProperty['valueType']>['elements'] = [
  { value: 'cn-qingdao', label: 'NoticeCenter.channel.credential.region.cnQingdao' },
  { value: 'cn-beijing', label: 'NoticeCenter.channel.credential.region.cnBeijing' },
  { value: 'cn-zhangjiakou', label: 'NoticeCenter.channel.credential.region.cnZhangjiakou' },
  { value: 'cn-huhehaote', label: 'NoticeCenter.channel.credential.region.cnHuhehaote' },
  { value: 'cn-wulanchabu', label: 'NoticeCenter.channel.credential.region.cnWulanchabu' },
  { value: 'cn-hangzhou', label: 'NoticeCenter.channel.credential.region.cnHangzhou' },
  { value: 'cn-shanghai', label: 'NoticeCenter.channel.credential.region.cnShanghai' },
  { value: 'cn-nanjing', label: 'NoticeCenter.channel.credential.region.cnNanjing' },
  { value: 'cn-fuzhou', label: 'NoticeCenter.channel.credential.region.cnFuzhou' },
  { value: 'cn-shenzhen', label: 'NoticeCenter.channel.credential.region.cnShenzhen' },
  { value: 'cn-heyuan', label: 'NoticeCenter.channel.credential.region.cnHeyuan' },
  { value: 'cn-guangzhou', label: 'NoticeCenter.channel.credential.region.cnGuangzhou' },
  { value: 'cn-chengdu', label: 'NoticeCenter.channel.credential.region.cnChengdu' },
  { value: 'cn-hongkong', label: 'NoticeCenter.channel.credential.region.cnHongkong' },
  { value: 'ap-southeast-1', label: 'NoticeCenter.channel.credential.region.apSoutheast1' },
  { value: 'ap-southeast-2', label: 'NoticeCenter.channel.credential.region.apSoutheast2' },
  { value: 'ap-southeast-3', label: 'NoticeCenter.channel.credential.region.apSoutheast3' },
  { value: 'ap-southeast-5', label: 'NoticeCenter.channel.credential.region.apSoutheast5' },
  { value: 'ap-southeast-6', label: 'NoticeCenter.channel.credential.region.apSoutheast6' },
  { value: 'ap-southeast-7', label: 'NoticeCenter.channel.credential.region.apSoutheast7' },
  { value: 'ap-south-1', label: 'NoticeCenter.channel.credential.region.apSouth1' },
  { value: 'ap-northeast-1', label: 'NoticeCenter.channel.credential.region.apNortheast1' },
  { value: 'ap-northeast-2', label: 'NoticeCenter.channel.credential.region.apNortheast2' },
  { value: 'us-west-1', label: 'NoticeCenter.channel.credential.region.usWest1' },
  { value: 'us-east-1', label: 'NoticeCenter.channel.credential.region.usEast1' },
  { value: 'eu-central-1', label: 'NoticeCenter.channel.credential.region.euCentral1' },
  { value: 'eu-west-1', label: 'NoticeCenter.channel.credential.region.euWest1' },
  { value: 'me-east-1', label: 'NoticeCenter.channel.credential.region.meEast1' },
]

export type NoticeCredentialProperty = NoticeMetadataProperty & {
  defaultValue?: unknown
  required?: boolean
  maxLength?: number
  pattern?: 'email'
  group?: 'emailServer'
}

export const insideMailProvider: NoticeChannelProvider = {
  id: 'inside-mail',
  name: 'Inside Mail',
  i18nName: 'NoticeCenter.channel.type.inside-mail',
}

const channelTypeMap: Record<string, string> = {
  'notifier-sms': 'sms',
  'notifier-email': 'email',
  'notifier-dingTalk': 'dingTalk',
  'notifier-weixin': 'weixin',
  'notifier-voice': 'voice',
  'notifier-webhook': 'webhook',
  'inside-mail': 'inside-mail',
}

const fallbackProviderMap: Record<string, string> = {
  sms: 'aliyunSms',
  email: 'embedded',
  dingTalk: 'dingTalkMessage',
  weixin: 'corpMessage',
  voice: 'aliyun',
  webhook: 'http',
}

const providerDisplayMap: Record<string, string> = {
  aliyunSms: 'NoticeCenter.channel.provider.aliyunSms',
  aliyun: 'NoticeCenter.channel.provider.aliyunVoice',
  embedded: 'NoticeCenter.channel.provider.embeddedSmtp',
  dingTalkMessage: 'NoticeCenter.channel.provider.dingTalkMessage',
  dingTalkRobotWebHook: 'NoticeCenter.channel.provider.dingTalkRobotWebHook',
  corpMessage: 'NoticeCenter.channel.provider.corpMessage',
  officialMessage: 'NoticeCenter.channel.provider.officialMessage',
  http: 'WebHook',
}

const channelProviderDisplayMap: Record<string, Record<string, string>> = {
  sms: {
    aliyunSms: 'NoticeCenter.channel.provider.aliyunSms',
  },
  voice: {
    aliyun: 'NoticeCenter.channel.provider.aliyunVoice',
  },
}

const iconMap: Record<string, string> = {
  sms: 'MessageOutlined',
  email: 'MailOutlined',
  dingTalk: 'DingdingOutlined',
  weixin: 'WechatOutlined',
  voice: 'PhoneOutlined',
  webhook: 'ApiOutlined',
  'inside-mail': 'InboxOutlined',
}

const excludedCredentialFields = new Set(['type', 'name', 'description', 'provider'])

// The channel page only edits provider credentials; entity fields are kept out of the rendered schema.
const credentialFieldMap: Record<string, Record<string, CredentialField[]>> = {
  dingTalk: {
    dingTalkMessage: [
      {
        id: 'appKey',
        name: 'NoticeCenter.channel.credential.field.appKey',
        description: 'NoticeCenter.channel.credential.description.appKey',
        valueType: { type: 'string', expands: { maxLength: 64 } },
        required: true,
        maxLength: 64,
      },
      {
        id: 'appSecret',
        name: 'NoticeCenter.channel.credential.field.appSecret',
        description: 'NoticeCenter.channel.credential.description.appSecret',
        valueType: { type: 'password', expands: { maxLength: 64 } },
        required: true,
        maxLength: 64,
      },
    ],
    dingTalkRobotWebHook: [
      {
        id: 'url',
        name: 'NoticeCenter.channel.credential.field.webhook',
        description: 'NoticeCenter.channel.credential.description.webhookUrl',
        valueType: { type: 'string' },
        required: true,
      },
    ],
  },
  weixin: {
    corpMessage: [
      {
        id: 'corpId',
        name: 'NoticeCenter.channel.credential.field.corpId',
        description: 'NoticeCenter.channel.credential.description.corpId',
        valueType: { type: 'string', expands: { maxLength: 64 } },
        required: true,
        maxLength: 64,
      },
      {
        id: 'corpSecret',
        name: 'NoticeCenter.channel.credential.field.corpSecret',
        description: 'NoticeCenter.channel.credential.description.corpSecret',
        valueType: { type: 'password', expands: { maxLength: 64 } },
        required: true,
        maxLength: 64,
      },
    ],
  },
  email: {
    embedded: [
      {
        id: 'host',
        name: 'NoticeCenter.channel.credential.field.host',
        description: 'NoticeCenter.channel.credential.description.host',
        valueType: { type: 'string' },
        required: true,
        group: 'emailServer',
      },
      {
        id: 'port',
        name: 'NoticeCenter.channel.credential.field.port',
        description: 'NoticeCenter.channel.credential.description.port',
        valueType: { type: 'int' },
        defaultValue: 25,
        required: true,
        group: 'emailServer',
      },
      {
        id: 'ssl',
        name: 'NoticeCenter.channel.credential.field.ssl',
        description: 'NoticeCenter.channel.credential.description.ssl',
        valueType: { type: 'boolean', trueValue: true, falseValue: false },
        defaultValue: false,
        group: 'emailServer',
      },
      {
        id: 'sender',
        name: 'NoticeCenter.channel.credential.field.sender',
        description: 'NoticeCenter.channel.credential.description.sender',
        valueType: { type: 'string' },
        required: true,
        pattern: 'email',
      },
      {
        id: 'username',
        name: 'NoticeCenter.channel.credential.field.username',
        description: 'NoticeCenter.channel.credential.description.username',
        valueType: { type: 'string', expands: { maxLength: 64 } },
        required: true,
        maxLength: 64,
      },
      {
        id: 'password',
        name: 'NoticeCenter.channel.credential.field.password',
        description: 'NoticeCenter.channel.credential.description.password',
        valueType: { type: 'password', expands: { maxLength: 64 } },
        required: true,
        maxLength: 64,
      },
    ],
  },
  voice: {
    aliyun: [
      {
        id: 'regionId',
        name: 'NoticeCenter.channel.credential.field.regionId',
        description: 'NoticeCenter.channel.credential.description.regionId',
        valueType: { type: 'enum', elements: aliyunRegionElements },
        required: true,
      },
      {
        id: 'accessKeyId',
        name: 'NoticeCenter.channel.credential.field.accessKeyId',
        description: 'NoticeCenter.channel.credential.description.accessKeyId',
        valueType: { type: 'string', expands: { maxLength: 64 } },
        required: true,
        maxLength: 64,
      },
      {
        id: 'secret',
        name: 'NoticeCenter.channel.credential.field.secret',
        description: 'NoticeCenter.channel.credential.description.secret',
        valueType: { type: 'password', expands: { maxLength: 64 } },
        required: true,
        maxLength: 64,
      },
    ],
  },
  sms: {
    aliyunSms: [
      {
        id: 'regionId',
        name: 'NoticeCenter.channel.credential.field.regionId',
        description: 'NoticeCenter.channel.credential.description.regionId',
        valueType: { type: 'enum', elements: aliyunRegionElements },
        required: true,
      },
      {
        id: 'accessKeyId',
        name: 'NoticeCenter.channel.credential.field.accessKeyId',
        description: 'NoticeCenter.channel.credential.description.accessKeyId',
        valueType: { type: 'string', expands: { maxLength: 64 } },
        required: true,
        maxLength: 64,
      },
      {
        id: 'secret',
        name: 'NoticeCenter.channel.credential.field.secret',
        description: 'NoticeCenter.channel.credential.description.secret',
        valueType: { type: 'password', expands: { maxLength: 64 } },
        required: true,
        maxLength: 64,
      },
    ],
  },
  webhook: {
    http: [
      {
        id: 'url',
        name: 'NoticeCenter.channel.credential.field.webhook',
        description: 'NoticeCenter.channel.credential.description.webhookUrl',
        valueType: { type: 'string' },
        required: true,
      },
      // {
      //   id: 'headers',
      //   name: 'NoticeCenter.channel.credential.field.headers',
      //   description: 'NoticeCenter.channel.credential.description.headers',
      //   valueType: { type: 'array' },
      //   defaultValue: [],
      //   required: true,
      // },
    ],
  },
}

export const getResponseResult = <T>(response: any, fallback: T): T => {
  if (response?.result === undefined || response?.result === null) {
    return fallback
  }
  return response.result as T
}

export const toListResult = <T>(response: any): T[] => {
  const result = response?.result
  if (Array.isArray(result)) return result as T[]
  if (Array.isArray(result?.data)) return result.data as T[]
  return []
}

export const getDisplayName = (item?: { i18nName?: string; name?: string; id?: string }) =>
  item?.i18nName || item?.name || item?.id || ''

export const normalizeProviders = (list: NoticeChannelProvider[]) => {
  const map = new Map<string, NoticeChannelProvider>()
  list.forEach(item => {
    if (item?.id) map.set(item.id, item)
  })
  if (!map.has(insideMailProvider.id)) map.set(insideMailProvider.id, insideMailProvider)
  return Array.from(map.values())
}

export const getNotifierType = (channelProvider = '') =>
  channelTypeMap[channelProvider] || channelProvider.replace(/^notifier-/, '')

export const isInsideMail = (channelProvider?: string) => channelProvider === insideMailProvider.id

export const isExternalChannel = (channelProvider?: string) =>
  Boolean(channelProvider?.startsWith('notifier-'))

export const getFallbackProvider = (type: string) => fallbackProviderMap[type] || ''

export const getChannelIcon = (type: string) => iconMap[type] || 'NotificationOutlined'

export const getProviderName = (
  provider?: NotifierProviderInfo,
  fallback?: string,
  type?: string,
) => {
  const providerId = provider?.id || fallback || ''

  // 语音服务的后端 provider name 可能是通用厂商名，展示时保留渠道语义。
  return channelProviderDisplayMap[type || '']?.[providerId]
    || provider?.name
    || providerDisplayMap[providerId]
    || provider?.id
    || fallback
    || ''
}

export const getMetadataProperties = (metadata?: { properties?: NoticeMetadataProperty[] }) =>
  Array.isArray(metadata?.properties)
    ? metadata.properties.filter(item => item?.id)
    : []

const getCredentialDefinition = (type: string, provider: string) =>
  credentialFieldMap[type]?.[provider] || []

const resolveCredentialValueType = (
  local: CredentialField,
  backend?: NoticeMetadataProperty,
) => {
  if (local.valueType?.type === 'enum') return local.valueType

  return backend?.valueType || local.valueType
}

export const resolveCredentialProperties = (
  type: string,
  provider: string,
  backendProperties: NoticeMetadataProperty[],
) => {
  const backendMap = new Map(
    backendProperties
      .filter(item => item?.id && !excludedCredentialFields.has(item.id))
      .map(item => [item.id, item]),
  )

  const localDefinition = getCredentialDefinition(type, provider)

  if (!localDefinition.length) {
    // 新增服务商可能只由后端 metadata 描述，前端无固定字段定义时直接沿用接口字段。
    return backendProperties
      .filter(item => item?.id && !excludedCredentialFields.has(item.id))
      .map<NoticeCredentialProperty>(item => ({
        ...item,
        valueType: item.valueType || { type: 'string' },
      }))
  }

  return localDefinition
    .filter(item => !excludedCredentialFields.has(item.id))
    .map<NoticeCredentialProperty>(item => ({
      ...item,
      ...backendMap.get(item.id),
      valueType: resolveCredentialValueType(item, backendMap.get(item.id)),
      expands: {
        ...(item.expands || {}),
        ...(backendMap.get(item.id)?.expands || {}),
      },
    }))
}

export const normalizeMetadataItem = (item: NoticeMetadataProperty) => ({
  ...item,
  valueType: item.valueType || { type: 'string' },
})

export const normalizeCredentialDefaults = (
  type: string,
  provider: string,
  configuration: Record<string, unknown> = {},
  backendProperties: NoticeMetadataProperty[] = [],
) => {
  const nextConfiguration: Record<string, unknown> = {}
  const localDefinition = getCredentialDefinition(type, provider)
  const properties = localDefinition.length
    ? localDefinition
    : backendProperties.filter(item => item?.id && !excludedCredentialFields.has(item.id))

  properties.forEach(item => {
    const value = configuration[item.id]
    nextConfiguration[item.id] = value === undefined ? item.defaultValue : value
  })

  return nextConfiguration
}

export const getCredentialDefaults = (type: string, provider: string) =>
  normalizeCredentialDefaults(type, provider)

export const createDraft = (
  channel: NoticeChannelItem | undefined,
  provider: string,
): NotifierDraft => {
  const draftProvider = channel?.config?.provider || provider

  return {
    id: channel?.config?.id,
    name: channel?.config?.name || channel?.name || '',
    description: channel?.config?.description || '',
    provider: draftProvider,
    configuration: normalizeCredentialDefaults(
      channel?.type || '',
      draftProvider,
      channel?.config?.configuration || {},
      channel?.metadata || [],
    ),
  }
}

export const buildConfigPayload = (
  channel: NoticeChannelItem,
  draft: NotifierDraft,
): NotifierConfig => ({
  ...(channel.config || {}),
  id: draft.id,
  name: draft.name,
  description: draft.description,
  type: channel.type,
  provider: draft.provider,
  configuration: normalizeCredentialDefaults(
    channel.type,
    draft.provider,
    draft.configuration,
    channel.metadata,
  ),
})

const getConfigValue = (
  configuration: Record<string, unknown> | undefined,
  keys: string[],
) => keys
  .map(key => configuration?.[key])
  .find(value => value !== undefined && value !== null && value !== '')

const buildTestTemplateBody = (
  channel: NoticeChannelItem,
  subject: string,
  preview: string,
) => {
  const configuration = channel.config?.configuration
  if (channel.type === 'sms') {
    return {
      text: preview,
      message: preview,
      phoneNumber: '${phoneNumber}',
      signName: getConfigValue(configuration, ['signName', 'sign', 'signature']) || 'JetLinks',
      code: getConfigValue(configuration, ['code', 'templateCode', 'templateId']) || 'CHANNEL_TEST',
    }
  }
  if (channel.type === 'email') {
    return { subject, title: subject, text: preview, message: preview, sendTo: ['${sendTo}'] }
  }
  return { title: subject, text: preview, message: preview }
}

export const buildInlineTestPayload = (
  channel: NoticeChannelItem,
  subject: string,
  preview: string,
  receiver: { email?: string; telephone?: string } = {},
  params: Record<string, unknown> = {},
): SendNotifierInlineTestPayload => ({
  template: {
    name: subject,
    type: channel.type,
    provider: channel.provider || channel.config?.provider,
    template: buildTestTemplateBody(channel, subject, preview),
  },
  context: {
    code: 'CHANNEL_TEST',
    message: preview,
    detail: preview,
    topic: subject,
    notifyTime: Date.now(),
    sendTo: receiver.email,
    phoneNumber: receiver.telephone,
    calledNumber: receiver.telephone,
    ...params,
  },
})

export const findBoundChannel = (
  topics: NoticeChannelConfig[],
  providerId: string,
) => topics
  .flatMap(topic => (topic.channels || []).map(channel => ({ topic, channel })))
  .find(item => item.channel.channelProvider === providerId)

export const findTemplateInfo = (
  detail: NoticeProviderTemplateInfo | undefined,
  providerId: string,
) => detail?.channels?.find(item => item.channel?.channelProvider === providerId)
