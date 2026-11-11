// Normalized form fixtures; wire fixtures below cover the actual ConfigMetadata response shape.
const text = (id, name, required = false) => ({ id, name, valueType: { type: 'string', expands: { required } } })
const password = (id, name) => ({ id, name, valueType: { type: 'password', expands: { required: true } } })
export const channelTypes = [
  { id: 'email', name: '邮件' }, { id: 'dingTalk', name: '钉钉' }, { id: 'weixin', name: '企业微信' },
  { id: 'voice', name: '语音' }, { id: 'sms', name: '短信' }, { id: 'webhook', name: 'Webhook' },
]
export const channelProviders = {
  email: [{ id: 'embedded', name: '邮件' }],
  dingTalk: [{ id: 'dingTalkMessage', name: '工作通知' }, { id: 'dingTalkRobotWebHook', name: '群机器人' }],
  weixin: [{ id: 'corpMessage', name: '工作通知' }],
  voice: [{ id: 'aliyun', name: '阿里云语音' }],
  sms: [{ id: 'aliyunSms', name: '阿里云短信' }],
  webhook: [{ id: 'http', name: 'HTTP' }],
}
export const channelMetadata = {
  'email:embedded': { name: '邮件配置', properties: [text('host', 'SMTP 服务器'), { id: 'port', name: '端口', valueType: { type: 'int', min: 0, max: 65536 } }, text('sender', '发件人'), text('username', '用户名'), { id: 'password', name: '密码', valueType: { type: 'password' } }, { id: 'properties', name: '其他配置', valueType: { type: 'array', elementType: { type: 'object' } } }] },
  'dingTalk:dingTalkMessage': { name: '钉钉配置', properties: [text('appKey', 'AppKey', true), text('appSecret', 'AppSecret')] },
  'dingTalk:dingTalkRobotWebHook': { name: '群机器人配置', properties: [text('url', 'Webhook', true)] },
  'weixin:corpMessage': { name: '企业微信配置', properties: [text('corpId', '企业 ID', true), text('corpSecret', '企业应用密钥')] },
  'voice:aliyun': { name: '阿里云语音', properties: [text('regionId', '地域'), text('accessKeyId', 'AccessKey ID'), text('secret', 'AccessKey Secret')] },
  'sms:aliyunSms': { name: '阿里云短信', properties: [text('regionId', '地域'), text('accessKeyId', 'AccessKey ID'), text('secret', 'AccessKey Secret')] },
  'webhook:http': { name: 'HTTP 配置', properties: [text('url', '接收地址', true), { id: 'headers', name: '请求头', valueType: { type: 'array', elementType: { type: 'object' } } }] },
}
export const extensionType = { id: 'extension', name: '扩展通知' }
export const extensionProviders = [{ id: 'custom', name: '自定义服务' }, { id: 'second', name: '备用服务' }]
export const extensionMetadata = { name: '扩展通知配置', description: '填写扩展通知服务的接入参数。', properties: [
  { ...text('endpoint', '服务地址', true), description: '填写服务商提供的地址。' }, password('token', '访问凭据'),
  { id: 'enabled', name: '启用回执', valueType: { type: 'boolean', expands: { required: true, defaultValue: false } } },
  { id: 'priority', name: '优先级', valueType: { type: 'enum', elements: [{ value: 0, text: '普通' }, { value: 1, text: '紧急' }], expands: { defaultValue: 0 } } },
  { id: 'retries', name: '重试次数', valueType: { type: 'int', min: 0, max: 3, expands: { defaultValue: 0 } } },
  { id: 'options', name: '扩展选项', valueType: { type: 'object' } },
] }

// Captured structure of GET /notifier/config/sms/aliyunSms/metadata (no configuration credentials).
export const aliyunSmsWireMetadata = {
  name: '阿里云API配置', description: 'https://help.aliyun.com/document_detail/101300.html', scopes: [],
  properties: [
    { property: 'regionId', name: 'regionId', description: 'regionId', type: { name: '字符串', id: 'string', type: 'string', i18nName: '字符串' }, scopes: [] },
    { property: 'accessKeyId', name: 'accessKeyId', description: '', type: { name: '字符串', id: 'string', type: 'string', i18nName: '字符串' }, scopes: [] },
    { property: 'secret', name: 'secret', description: '', type: { name: '字符串', id: 'string', type: 'string', i18nName: '字符串' }, scopes: [] },
  ],
}

export const channelWireMetadata = Object.fromEntries(Object.entries(channelMetadata).map(([id, metadata]) => [id, {
  ...metadata, properties: metadata.properties.map(({ id: property, valueType: type, ...rest }) => ({ ...rest, property, type })),
}]))
channelWireMetadata['sms:aliyunSms'] = aliyunSmsWireMetadata
