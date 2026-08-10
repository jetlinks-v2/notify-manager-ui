import type { NoticeTemplateEntity, NoticeTemplateVariable } from '@notify-manager-ui/api/notice-center'
import type { NoticeTemplateChannelNode } from './noticeTemplateModel'

export type NoticeTemplateType = 'dingTalk' | 'weixin' | 'email' | 'voice' | 'sms' | 'webhook'
export type NoticeTemplateProvider =
  | 'dingTalkMessage'
  | 'dingTalkRobotWebHook'
  | 'corpMessage'
  | 'officialMessage'
  | 'embedded'
  | 'aliyun'
  | 'aliyunSms'
  | 'http'

export type NoticeVariableDefinition = NoticeTemplateVariable & {
  id: string
  name?: string
  type?: 'string' | 'date' | 'double' | string
  format?: string
}

export type NoticeTemplateAttachment = {
  id?: string
  name?: string
  location?: string
}

export interface NoticeTemplateEditorPayload {
  name: string
  description?: string
  type?: string
  provider?: string
  configId?: string
  template: NoticeTemplateData
  variableDefinitions: NoticeVariableDefinition[]
}

export type NoticeTemplateData = Record<string, unknown>

export type NoticeTemplateFieldKind =
  | 'input'
  | 'textarea'
  | 'select'
  | 'remoteSelect'
  | 'treeSelect'
  | 'tags'
  | 'number'
  | 'radio'
  | 'attachments'
  | 'monaco'
  | 'readonly'

export type NoticeTemplateFieldOption = {
  labelKey?: string
  label?: string
  value: unknown
  raw?: unknown
  children?: NoticeTemplateFieldOption[]
}

export type NoticeTemplateFieldSchema = {
  key: string
  path: string[]
  labelKey: string
  placeholderKey?: string
  tooltipKey?: string
  kind: NoticeTemplateFieldKind
  required?: boolean
  disabled?: boolean
  hidden?: boolean
  loading?: boolean
  showSearch?: boolean
  copyable?: boolean
  rows?: number
  min?: number
  max?: number
  maxLength?: number
  validator?: 'phone'
  options?: NoticeTemplateFieldOption[]
}

export type NoticeTemplateFormContext = {
  type: NoticeTemplateType | ''
  provider: NoticeTemplateProvider | ''
}

export type NoticeTemplateResolvedForm = NoticeTemplateFormContext & {
  payload: NoticeTemplateEditorPayload
}

export const channelTypeMap: Record<string, NoticeTemplateType> = {
  'notifier-sms': 'sms',
  'notifier-email': 'email',
  'notifier-dingTalk': 'dingTalk',
  'notifier-weixin': 'weixin',
  'notifier-voice': 'voice',
  'notifier-webhook': 'webhook',
}

const fallbackProviderMap: Record<NoticeTemplateType, NoticeTemplateProvider> = {
  sms: 'aliyunSms',
  email: 'embedded',
  dingTalk: 'dingTalkMessage',
  weixin: 'corpMessage',
  voice: 'aliyun',
  webhook: 'http',
}

export const robotMessageTypeOptions: NoticeTemplateFieldOption[] = [
  { label: 'markdown', value: 'markdown' },
  { label: 'text', value: 'text' },
  { label: 'link', value: 'link' },
]

export const voiceTemplateTypeOptions: NoticeTemplateFieldOption[] = [
  { labelKey: 'NoticeCenter.template.option.voiceType.voice', value: 'voice' },
  { labelKey: 'NoticeCenter.template.option.voiceType.tts', value: 'tts' },
]

export const dingTalkProviderOptions: NoticeTemplateFieldOption[] = [
  { labelKey: 'NoticeCenter.channel.credential.provider.dingTalkMessage', value: 'dingTalkMessage' },
  { labelKey: 'NoticeCenter.channel.credential.provider.dingTalkRobotWebHook', value: 'dingTalkRobotWebHook' },
]

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const asRecord = (value: unknown): NoticeTemplateData =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as NoticeTemplateData
    : {}

const asText = (value: unknown) => {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value)
    if (text) {
      return text
    }
  }
  return ''
}

export const getByPath = (source: NoticeTemplateData | undefined, path: string[]) =>
  path.reduce<unknown>((target, key) => asRecord(target)[key], source)

export const setByPath = (source: NoticeTemplateData, path: string[], value: unknown) => {
  const lastKey = path[path.length - 1]
  const parent = path.slice(0, -1).reduce<NoticeTemplateData>((target, key) => {
    if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
      target[key] = {}
    }
    return target[key] as NoticeTemplateData
  }, source)
  parent[lastKey] = value
}

export const applyTemplateFieldChange = (
  payload: NoticeTemplateEditorPayload,
  field: NoticeTemplateFieldSchema,
  value: unknown,
) => {
  if (field.key === 'provider') {
    applyTemplateProviderChange(payload, String(value) as NoticeTemplateProvider)
    return
  }
  setByPath(payload.template, field.path, value)
  if (field.key === 'templateType' && value !== 'tts') {
    setByPath(payload.template, ['ttsmessage'], undefined)
    setByPath(payload.template, ['message'], undefined)
  }
  if (field.key === 'contextAsBody' && value === true) {
    setByPath(payload.template, ['body'], undefined)
  }
}

export const applyTemplateProviderChange = (
  payload: NoticeTemplateEditorPayload,
  provider: NoticeTemplateProvider,
  configId?: string,
  template?: NoticeTemplateEntity,
) => {
  const nextDefaults = getDefaultTemplate(payload.type || '', provider)
  const sourceTemplate = clone(template?.template || {})
  const preview = getPreviewTexts(payload)

  payload.provider = provider
  payload.configId = configId || template?.configId
  payload.name = template?.name || payload.name
  payload.description = template?.description || payload.description
  payload.template = {
    ...nextDefaults,
    ...(template ? sourceTemplate : { message: preview.message }),
  }
  payload.variableDefinitions = normalizeVariableDefinitions(template?.variableDefinitions || payload.variableDefinitions)
}

const getDefaultTemplate = (type: string, provider: string): NoticeTemplateData => {
  if (type === 'dingTalk' && provider === 'dingTalkRobotWebHook') {
    return {
      messageType: 'markdown',
      message: '',
      markdown: { title: '', text: '' },
      link: { title: '', picUrl: '', messageUrl: '', text: '' },
      text: { content: '' },
    }
  }
  if (type === 'dingTalk') {
    return {
      agentId: '',
      departmentIdList: '',
      userIdList: '',
      message: '',
    }
  }
  if (type === 'weixin' && provider === 'officialMessage') {
    return {
      toTag: '',
      templateId: '',
      templateCode: '',
      url: '',
      miniProgramAppId: '',
      miniProgramPagePath: '',
      message: '',
    }
  }
  if (type === 'weixin') {
    return {
      agentId: '',
      toParty: '',
      toUser: '',
      toUserName: '',
      toTag: '',
      message: '',
    }
  }
  if (type === 'email') {
    return {
      subject: '',
      sendTo: [],
      attachments: [],
      message: '',
      text: '',
    }
  }
  if (type === 'voice') {
    return {
      templateType: 'tts',
      templateCode: '',
      ttsCode: '',
      ttsmessage: '',
      message: '',
      playTimes: 1,
      calledShowNumbers: '',
      calledNumber: '',
    }
  }
  if (type === 'sms') {
    return {
      code: '',
      message: '',
      phoneNumber: '',
      signName: '',
    }
  }
  if (type === 'webhook') {
    return {
      contextAsBody: true,
      body: '',
    }
  }
  return { message: '' }
}

export const resolveTemplateContext = (
  channel?: NoticeTemplateChannelNode,
  template?: NoticeTemplateEntity,
): NoticeTemplateFormContext => {
  const type = (template?.type || channelTypeMap[channel?.channelProvider || ''] || '') as NoticeTemplateType | ''
  const provider = (
    template?.provider
    || channel?.notifierConfig?.provider
    || (type ? fallbackProviderMap[type] : '')
    || ''
  ) as NoticeTemplateProvider | ''

  return { type, provider }
}

export const resolveTemplateConfigId = (
  channel: NoticeTemplateChannelNode | undefined,
  provider: string | undefined,
  template?: NoticeTemplateEntity,
) =>
  (template?.provider === provider ? template?.configId : undefined)
  || channel?.notifierConfigs?.find(item => item.provider === provider)?.id
  || (channel?.notifierConfig?.provider === provider ? channel?.notifierConfig?.id : undefined)

export const resolveTemplateForm = (
  channel: NoticeTemplateChannelNode | undefined,
  template: NoticeTemplateEntity | undefined,
  fallbackName: string,
): NoticeTemplateResolvedForm => {
  const context = resolveTemplateContext(channel, template)
  const defaults = getDefaultTemplate(context.type, context.provider)
  const sourceTemplate = clone(template?.template || {})
  if (context.type === 'voice' && sourceTemplate.ttsmessage === undefined) {
    sourceTemplate.ttsmessage = sourceTemplate.message
  }
  if (context.provider === 'dingTalkRobotWebHook') {
    // 兼容已保存的钉钉机器人结构：正文可能落在 text.content / markdown.text / link.text。
    const messageType = String(sourceTemplate.messageType || defaults.messageType || 'markdown')
    const nestedMessage = firstText(
      sourceTemplate.message,
      messageType === 'text' ? getByPath(sourceTemplate, ['text', 'content']) : undefined,
      messageType === 'markdown' ? getByPath(sourceTemplate, ['markdown', 'text']) : undefined,
      messageType === 'link' ? getByPath(sourceTemplate, ['link', 'text']) : undefined,
      getByPath(sourceTemplate, ['text', 'content']),
      getByPath(sourceTemplate, ['markdown', 'text']),
      getByPath(sourceTemplate, ['link', 'text']),
    )
    sourceTemplate.messageType = messageType
    sourceTemplate.message = nestedMessage
  }

  return {
    ...context,
    payload: {
      name: template?.name || fallbackName,
      description: template?.description || '',
      type: context.type,
      provider: context.provider,
      configId: resolveTemplateConfigId(channel, context.provider, template),
      template: {
        ...defaults,
        ...sourceTemplate,
      },
      variableDefinitions: normalizeVariableDefinitions(template?.variableDefinitions || []),
    },
  }
}

export const normalizeVariableDefinitions = (
  variables: NoticeTemplateVariable[],
): NoticeVariableDefinition[] =>
  variables
    .filter(item => item?.id)
    .map(item => ({
      ...item,
      id: item.id,
      name: item.name || '',
      type: item.type || 'string',
      format: String((item as NoticeVariableDefinition).format || item.expands?.format || '%s'),
    }))

export const normalizeTemplateBeforeSubmit = (
  input: NoticeTemplateEditorPayload,
): NoticeTemplateEditorPayload => {
  const template = clone(input.template || {})
  const type = input.type
  const provider = input.provider

  if (type === 'email') {
    template.text = template.message
  }

  if (provider === 'aliyun') {
    template.ttsCode = template.templateCode
    template.message = template.ttsmessage
    delete template.ttsmessage
  }

  if (provider === 'dingTalkRobotWebHook') {
    if (template.messageType === 'text') {
      template.text = { ...asRecord(template.text), content: template.message }
      delete template.markdown
      delete template.link
    }
    if (template.messageType === 'markdown') {
      template.markdown = { ...asRecord(template.markdown), text: template.message }
      delete template.link
      delete template.text
    }
    if (template.messageType === 'link') {
      template.link = { ...asRecord(template.link), text: template.message }
      delete template.markdown
      delete template.text
    }
  }

  if (type === 'webhook' && template.contextAsBody) {
    template.body = undefined
  }

  return {
    ...input,
    template,
    variableDefinitions: normalizeVariableDefinitions(input.variableDefinitions),
  }
}

export const variableToken = (id: string) => `\${${id}}`

export const extractVariableIds = (text: string) => {
  const ids = new Set<string>()
  const pattern = /\$\{([^}]+)\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    ids.add(match[1])
  }
  return Array.from(ids)
}

export const getVariableSourceText = (payload?: NoticeTemplateEditorPayload) => {
  const template = payload?.template || {}
  return [
    getByPath(template, ['message']),
    getByPath(template, ['markdown', 'title']),
    getByPath(template, ['link', 'title']),
    getByPath(template, ['subject']),
    getByPath(template, ['ttsmessage']),
    getByPath(template, ['body']),
  ].map(asText).filter(Boolean).join('\n')
}

export const syncVariableDefinitions = (
  payload: NoticeTemplateEditorPayload,
): NoticeVariableDefinition[] => {
  const ids = extractVariableIds(getVariableSourceText(payload))
  const existingMap = new Map(payload.variableDefinitions.map(item => [item.id, item]))
  return ids.map(id => existingMap.get(id) || {
    id,
    name: '',
    type: 'string',
    format: '%s',
  })
}

export const getPreviewTexts = (payload?: NoticeTemplateEditorPayload) => {
  const template = payload?.template || {}
  const title = firstText(
    getByPath(template, ['subject']),
    getByPath(template, ['markdown', 'title']),
    getByPath(template, ['link', 'title']),
  )
  const message = firstText(
    getByPath(template, ['message']),
    getByPath(template, ['ttsmessage']),
    getByPath(template, ['body']),
    getByPath(template, ['text', 'content']),
    getByPath(template, ['markdown', 'text']),
    getByPath(template, ['link', 'text']),
    getByPath(template, ['text']),
  )
  return { title, message }
}

export const getTemplateFieldSchemas = (
  context: NoticeTemplateFormContext,
  payload: NoticeTemplateEditorPayload,
): NoticeTemplateFieldSchema[] => {
  const { type, provider } = context
  const dingTalkProviderField: NoticeTemplateFieldSchema = {
    key: 'provider',
    path: ['provider'],
    labelKey: 'NoticeCenter.channel.credential.field.providerType',
    kind: 'radio',
    required: true,
    options: dingTalkProviderOptions,
  }

  if (type === 'dingTalk' && provider === 'dingTalkRobotWebHook') {
    const messageType = String(payload.template.messageType || 'markdown')
    const fields: NoticeTemplateFieldSchema[] = [
      dingTalkProviderField,
      {
        key: 'messageType',
        path: ['messageType'],
        labelKey: 'NoticeCenter.template.field.messageType',
        placeholderKey: 'NoticeCenter.template.placeholder.messageType',
        kind: 'select',
        required: true,
        options: robotMessageTypeOptions,
      },
    ]
    if (messageType === 'markdown') {
      fields.push({
        key: 'markdownTitle',
        path: ['markdown', 'title'],
        labelKey: 'NoticeCenter.template.field.title',
        placeholderKey: 'NoticeCenter.template.placeholder.title',
        kind: 'input',
        required: true,
        copyable: true,
      })
    }
    if (messageType === 'link') {
      fields.push(
        {
          key: 'linkTitle',
          path: ['link', 'title'],
          labelKey: 'NoticeCenter.template.field.title',
          placeholderKey: 'NoticeCenter.template.placeholder.title',
          kind: 'input',
          required: true,
          copyable: true,
        },
        {
          key: 'picUrl',
          path: ['link', 'picUrl'],
          labelKey: 'NoticeCenter.template.field.picUrl',
          placeholderKey: 'NoticeCenter.template.placeholder.picUrl',
          kind: 'input',
        },
        {
          key: 'messageUrl',
          path: ['link', 'messageUrl'],
          labelKey: 'NoticeCenter.template.field.messageUrl',
          placeholderKey: 'NoticeCenter.template.placeholder.messageUrl',
          kind: 'input',
        },
      )
    }
    fields.push({
      key: 'message',
      path: ['message'],
      labelKey: 'NoticeCenter.template.field.content',
      placeholderKey: 'NoticeCenter.template.placeholder.content',
      kind: 'textarea',
      required: true,
      copyable: true,
      rows: 6,
    })
    return fields
  }

  if (type === 'dingTalk') {
    return [
      dingTalkProviderField,
      {
        key: 'agentId',
        path: ['agentId'],
        labelKey: 'NoticeCenter.template.field.agentId',
        placeholderKey: 'NoticeCenter.template.placeholder.agentId',
        kind: 'input',
        required: true,
      },
      {
        key: 'departmentIdList',
        path: ['departmentIdList'],
        labelKey: 'NoticeCenter.template.field.departmentIdList',
        placeholderKey: 'NoticeCenter.template.placeholder.departmentIdList',
        kind: 'input',
      },
      {
        key: 'userIdList',
        path: ['userIdList'],
        labelKey: 'NoticeCenter.template.field.userIdList',
        placeholderKey: 'NoticeCenter.template.placeholder.userIdList',
        kind: 'input',
      },
      messageField(),
    ]
  }

  if (type === 'weixin' && provider === 'officialMessage') {
    return [
      {
        key: 'toTag',
        path: ['toTag'],
        labelKey: 'NoticeCenter.template.field.toTag',
        placeholderKey: 'NoticeCenter.template.placeholder.toTag',
        kind: 'input',
      },
      {
        key: 'templateId',
        path: ['templateId'],
        labelKey: 'NoticeCenter.template.field.wechatTemplate',
        placeholderKey: 'NoticeCenter.template.placeholder.wechatTemplate',
        kind: 'input',
      },
      {
        key: 'templateCode',
        path: ['templateCode'],
        labelKey: 'NoticeCenter.template.field.wechatTemplateCode',
        placeholderKey: 'NoticeCenter.template.placeholder.wechatTemplateCode',
        kind: 'input',
      },
      {
        key: 'url',
        path: ['url'],
        labelKey: 'NoticeCenter.template.field.jumpUrl',
        placeholderKey: 'NoticeCenter.template.placeholder.jumpUrl',
        kind: 'input',
      },
      {
        key: 'miniProgramAppId',
        path: ['miniProgramAppId'],
        labelKey: 'NoticeCenter.template.field.miniProgramAppId',
        placeholderKey: 'NoticeCenter.template.placeholder.miniProgramAppId',
        kind: 'input',
      },
      {
        key: 'miniProgramPagePath',
        path: ['miniProgramPagePath'],
        labelKey: 'NoticeCenter.template.field.miniProgramPagePath',
        placeholderKey: 'NoticeCenter.template.placeholder.miniProgramPagePath',
        kind: 'input',
      },
      messageField(),
    ]
  }

  if (type === 'weixin') {
    return [
      {
        key: 'agentId',
        path: ['agentId'],
        labelKey: 'NoticeCenter.template.field.agentId',
        placeholderKey: 'NoticeCenter.template.placeholder.agentId',
        kind: 'input',
        required: true,
      },
      {
        key: 'toParty',
        path: ['toParty'],
        labelKey: 'NoticeCenter.template.field.toParty',
        placeholderKey: 'NoticeCenter.template.placeholder.toParty',
        kind: 'input',
      },
      {
        key: 'toUser',
        path: ['toUser'],
        labelKey: 'NoticeCenter.template.field.toUser',
        placeholderKey: 'NoticeCenter.template.placeholder.toUser',
        kind: 'input',
      },
      {
        key: 'toUserName',
        path: ['toUserName'],
        labelKey: 'NoticeCenter.template.field.toUserName',
        placeholderKey: 'NoticeCenter.template.placeholder.toUserName',
        kind: 'input',
      },
      {
        key: 'toTag',
        path: ['toTag'],
        labelKey: 'NoticeCenter.template.field.toTag',
        placeholderKey: 'NoticeCenter.template.placeholder.toTag',
        kind: 'input',
      },
      messageField(),
    ]
  }

  if (type === 'email') {
    return [
      {
        key: 'subject',
        path: ['subject'],
        labelKey: 'NoticeCenter.template.field.subject',
        placeholderKey: 'NoticeCenter.template.placeholder.subject',
        kind: 'input',
        required: true,
        copyable: true,
      },
      {
        key: 'sendTo',
        path: ['sendTo'],
        labelKey: 'NoticeCenter.template.field.sendTo',
        placeholderKey: 'NoticeCenter.template.placeholder.sendTo',
        kind: 'tags',
      },
      {
        key: 'attachments',
        path: ['attachments'],
        labelKey: 'NoticeCenter.template.field.attachments',
        kind: 'attachments',
      },
      messageField(),
    ]
  }

  if (type === 'voice') {
    const fields: NoticeTemplateFieldSchema[] = [
      {
        key: 'templateType',
        path: ['templateType'],
        labelKey: 'NoticeCenter.template.field.templateType',
        placeholderKey: 'NoticeCenter.template.placeholder.templateType',
        kind: 'select',
        required: true,
        options: voiceTemplateTypeOptions,
      },
      {
        key: 'templateCode',
        path: ['templateCode'],
        labelKey: String(payload.template.templateType) === 'voice'
          ? 'NoticeCenter.template.field.voiceCode'
          : 'NoticeCenter.template.field.voiceTemplateCode',
        placeholderKey: 'NoticeCenter.template.placeholder.templateCode',
        kind: 'input',
        required: true,
      },
      {
        key: 'calledNumber',
        path: ['calledNumber'],
        labelKey: 'NoticeCenter.template.field.calledNumber',
        placeholderKey: 'NoticeCenter.template.placeholder.calledNumber',
        kind: 'input',
      },
      {
        key: 'calledShowNumbers',
        path: ['calledShowNumbers'],
        labelKey: 'NoticeCenter.template.field.calledShowNumbers',
        placeholderKey: 'NoticeCenter.template.placeholder.calledShowNumbers',
        kind: 'input',
      },
      {
        key: 'playTimes',
        path: ['playTimes'],
        labelKey: 'NoticeCenter.template.field.playTimes',
        placeholderKey: 'NoticeCenter.template.placeholder.playTimes',
        kind: 'number',
        min: 1,
        max: 3,
      },
    ]
    if (payload.template.templateType === 'tts') {
      fields.push({
        key: 'ttsmessage',
        path: ['ttsmessage'],
        labelKey: 'NoticeCenter.template.field.content',
        placeholderKey: 'NoticeCenter.template.placeholder.content',
        kind: 'textarea',
        copyable: true,
        rows: 6,
      })
    }
    return fields
  }

  if (type === 'sms') {
    return [
      {
        key: 'code',
        path: ['code'],
        labelKey: 'NoticeCenter.template.field.smsTemplate',
        placeholderKey: 'NoticeCenter.template.placeholder.smsTemplate',
        kind: 'input',
        required: true,
      },
      {
        key: 'phoneNumber',
        path: ['phoneNumber'],
        labelKey: 'NoticeCenter.template.field.phoneNumber',
        placeholderKey: 'NoticeCenter.template.placeholder.phoneNumberInput',
        kind: 'input',
        maxLength: 11,
        validator: 'phone',
      },
      {
        key: 'signName',
        path: ['signName'],
        labelKey: 'NoticeCenter.template.field.signName',
        placeholderKey: 'NoticeCenter.template.placeholder.signName',
        kind: 'input',
        required: true,
      },
      {
        key: 'message',
        path: ['message'],
        labelKey: 'NoticeCenter.template.field.content',
        placeholderKey: 'NoticeCenter.template.placeholder.content',
        kind: 'textarea',
        disabled: true,
        rows: 6,
      },
    ]
  }

  if (type === 'webhook') {
    const fields: NoticeTemplateFieldSchema[] = [
      {
        key: 'contextAsBody',
        path: ['contextAsBody'],
        labelKey: 'NoticeCenter.template.field.bodyMode',
        kind: 'radio',
        options: [
          { labelKey: 'NoticeCenter.template.option.bodyMode.context', value: true },
          { labelKey: 'NoticeCenter.template.option.bodyMode.custom', value: false },
        ],
      },
    ]
    if (!payload.template.contextAsBody) {
      fields.push({
        key: 'body',
        path: ['body'],
        labelKey: 'NoticeCenter.template.field.body',
        placeholderKey: 'NoticeCenter.template.placeholder.body',
        kind: 'monaco',
        copyable: true,
      })
    }
    return fields
  }

  return [messageField()]
}

const messageField = (): NoticeTemplateFieldSchema => ({
  key: 'message',
  path: ['message'],
  labelKey: 'NoticeCenter.template.field.content',
  placeholderKey: 'NoticeCenter.template.placeholder.content',
  kind: 'textarea',
  required: true,
  copyable: true,
  rows: 6,
})
