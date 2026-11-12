import { createApp, defineComponent, h, reactive } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { createPinia } from 'pinia'
import { useAuthStore } from '@jetlinks-web-core/store/auth'
import { useSystemStore } from '@jetlinks-web-core/store/system'
import { trialRecords, officialWireMetadata } from './trialFixtures.mjs'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
import AntDesign from 'ant-design-vue'
import { AIcon, BadgeStatus, ProTable, PermissionButton, ConfigProvider } from '@jetlinks-web/components'
import { usePermissionContext } from '@jetlinks-web/hooks'
import { request as notificationRequest } from '@jetlinks-web/core'
import i18n from '@jetlinks-web-core/locales'
import FullPage from '@jetlinks-web-core/layout/FullPage.vue'
import ContentPanel from '@jetlinks-web-core/components/ContentPanel/index.vue'
import SwitchGroup from '@jetlinks-web-core/components/SwitchGroup'
import TableActions, { TableActionsItem } from '@jetlinks-web-core/components/TableActions'
import CloudEmpty from '@jetlinks-web-core/components/CloudEmpty/index.vue'
import JlDrawerShell from '@jetlinks-web-core/components/JlDrawerShell/index.vue'
import KvGrid from '@jetlinks-web-core/components/KvGrid/index.vue'
import CodeBlock from '@jetlinks-web-core/components/CodeBlock/index.vue'
import EqualHeightColumns from '@jetlinks-web-core/components/EqualHeightColumns/index.vue'
import DetailHeader from '@jetlinks-web-core/components/DetailHeader/index.vue'
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import StatusPill from '@jetlinks-web-core/components/StatusPill/index.vue'
import StickyActionBar from '@jetlinks-web-core/components/StickyActionBar/index.vue'
import JlConfirmDialog from '@jetlinks-web-core/components/JlConfirmDialog/index.vue'
import FileUpload from '@jetlinks-web-core/components/Upload/File/index.vue'
import Records from '../../views/system/MessageNotification/Records/index.vue'
import { notificationHistoryAdapterKey } from '../../views/system/MessageNotification/Records/recordQuery'
import { messageNotificationApi } from '../../api/notice/messageNotification'
import { wechatMemberApi } from '../../api/notice/wechatMembers'
import fixtures from './fixtures.mjs'
import templateDirectoryFixture from '../messageNotificationTemplateDirectoryFixture.mjs'
import { channelTypes, channelProviders, channelWireMetadata, extensionType, extensionProviders, extensionMetadata } from '../messageNotificationChannelFixtures.mjs'
import { normalizeNotificationConfigMetadata } from '../../api/notice/notificationConfigMetadata'
import MetadataValueItem from '@jetlinks-web-core/components/MetadataValueItem/index.vue'
import MonacoEditor from '@jetlinks-web-core/components/MonacoEditor/monacoEditor.vue'
import '@jetlinks-web-core/style.css'
import 'ant-design-vue/dist/reset.css'
import '@jetlinks-web-core/style/components.less'

const clone = value => JSON.parse(JSON.stringify(value))
const calls = []
const failures = new Set()
const deniedPermissions = reactive(new Set())
const flags = new URLSearchParams(location.search)
// Keep loading feedback observable without contacting a real notification service.
const writeDelay = Math.min(5000, Math.max(0, Number(flags.get('writeDelay')) || 0))
for (const operation of flags.getAll('fail')) failures.add(operation)
const configs = flags.has('fresh') ? [] : clone(fixtures.configs)
const templates = clone(fixtures.templates)
if (flags.has('unifiedTests')) {
  configs.splice(0, configs.length, ...clone(trialRecords))
  if (flags.has('missingTestSettings')) for (const config of configs) { delete config.configuration.testTemplate; delete config.configuration.agentId }
}

if (flags.has('robotSigning')) {
  configs.push(...['one', 'two', 'unsigned', 'masked'].map(id => ({
    id: `robot-${id}`, name: `robot-${id}`, type: 'dingTalk', provider: 'dingTalkRobotWebHook',
    configuration: { url: `https://fixture.example.test/robot/${id}`, ...(id === 'unsigned' ? {} : { secret: id === 'masked' ? '********' : `SECfixture-${id}` }) },
  })))
}
// Isolated saved records for checking each channel's clear-confirmation copy.
if (flags.has('clearMessages')) {
  configs.splice(0, configs.length, ...Object.keys(channelWireMetadata).map(id => {
    const [type, provider] = id.split(':')
    return { id: `clear-${type}-${provider}`, name: id, type, provider, configuration: {} }
  }))
}

const memberBindings = [{ id: 'binding-existing', userId: 'platform-existing', thirdPartyUserId: 'corp-existing', providerName: '已有对应成员' }]
const platformMembers = [
  { id: 'platform-existing', name: '已对应账号', username: 'existing' },
  { id: 'platform-phone', name: '手机号对应账号', username: 'phone', telephone: '13800138000' },
  { id: 'platform-email', name: '邮箱对应账号', username: 'email', email: 'member@example.test' },
  { id: 'platform-manual', name: '手动对应账号', username: 'manual' },
  { id: 'platform-other', name: '其他平台账号', username: 'other' },
]
const corporateMembers = [
  { id: 'corp-existing', name: '已有对应成员', department: ['team'] },
  { id: 'corp-phone', name: '手机号匹配成员', mobile: '138 0013 8000', department: ['team'] },
  { id: 'corp-email', name: '邮箱匹配成员', email: 'MEMBER@example.test', department: ['other'] },
  { id: 'corp-manual', name: '待手动匹配成员', department: ['team'] },
]
if (flags.has('wechat')) {
  configs.push({ id: 'corp-fixture', name: '企微隔离配置', type: 'weixin', provider: 'corpMessage', configuration: { corpId: 'fixture-corp', agentId: '1000002', corpSecret: 'fixture-only-secret' } })
  templates.push({ id: 'corp-template', name: '企业微信测试模板', type: 'weixin', provider: 'corpMessage', configId: 'corp-fixture', template: { message: '隔离测试 ${message}' }, variableDefinitions: [{ id: 'message', name: '消息内容', type: 'string', required: true }, { id: 'toUser', name: '企微成员 ID', type: 'string' }] })
}
const businessTypes = clone(flags.get('directory') === 'tree' ? templateDirectoryFixture.businessTypes : [])
if (flags.get('directory') === 'tree') templates.push(...clone(templateDirectoryFixture.templates))
const emailImageFixture = new URL('./email-image.png', import.meta.url).href
if (flags.has('emailImages')) {
  const email = templates.find(item => item.id === 'template-relieve')
  if (email) email.variableDefinitions = [...(email.variableDefinitions || []), { id: 'imageUrl', name: '图片地址', type: 'string', defaultValue: emailImageFixture }]
}
const businessWorkspace = flags.has('templateWorkspace')
if (businessWorkspace) {
  if (!businessTypes.length) businessTypes.push(...clone(templateDirectoryFixture.businessTypes))
  businessTypes.push({ provider: 'SystemBulletin', name: '系统公告', type: { id: 'other', name: '其他' }, state: 'disabled', channels: [] })
  if (!templates.some(item => item.id === 'template-relieve')) templates.push(...clone(templateDirectoryFixture.templates))
  for (const template of templates) {
    if (['template-relieve', 'template-maintenance'].includes(template.id)) template.configId = 'smtp-primary'
  }
  for (const business of businessTypes) business.state ??= 'disabled'
  if (!flags.has('fresh')) {
    for (const [type, provider, name] of [
      ['dingTalk', 'dingTalkMessage', '钉钉工作通知'], ['dingTalk', 'dingTalkRobotWebHook', '钉钉机器人'],
      ['weixin', 'corpMessage', '企业微信'], ['voice', 'aliyun', '语音'], ['sms', 'aliyunSms', '短信'],
      ['webhook', 'http', 'Webhook'], ['extension', 'custom', '扩展通知'],
    ]) configs.push({ id: `fixture-config-${provider}`, name, type, provider, configuration: {} })
  }
  const device = businessTypes.find(item => item.provider === 'alarm-device')
  const contents = [
    ['dingTalk', 'dingTalkMessage', { agentId: '42', message: '设备 ${detail.targetName} 产生告警：${detail.alarmConfigName}' }],
    ['weixin', 'corpMessage', { agentId: '42', message: '请检查设备 ${detail.targetName}，告警：${detail.alarmConfigName}' }],
    ['voice', 'aliyun', { templateType: 'tts', templateCode: 'TTS_FIXTURE', message: '设备 ${detail.targetName} 告警，请及时处理。', playTimes: 2 }],
    ['sms', 'aliyunSms', { code: 'SMS_FIXTURE', signName: '测试签名', message: '设备 ${detail.targetName} 发生告警：${detail.alarmConfigName}' }],
    ['webhook', 'http', { contextAsBody: false, body: '{"device":"${detail.targetName}","alarm":"${detail.alarmConfigName}"}' }],
  ]
  for (const [type, provider, content] of contents) {
    const id = `fixture-template-${provider}`
    templates.push({ id, name: `设备告警 · ${type}`, type, provider, configId: `fixture-config-${provider}`, template: content,
      variableDefinitions: [{ id: 'detail.targetName', name: '设备名称' }, { id: 'detail.alarmConfigName', name: '告警名称' }] })
    device.channels.push({ id: `fixture-channel-${type}`, providerId: device.id, channelProvider: `notifier-${type}`, state: 'enabled',
      channelConfiguration: { notifierId: `fixture-config-${provider}`, templateId: id, variables: {} } })
  }
}
const histories = clone(fixtures.history)
if (flags.get('history') === 'missing') histories.splice(0, histories.length, { id: 'history-missing', state: 'error' })
if (flags.get('history') === 'long') {
  histories[0].notifyMessage = `${'设备 B 温度告警发送失败：当前温度已超出阈值，请及时检查设备运行状态。'.repeat(8)}\n第二行历史发送内容仍完整保留。`
}
if (flags.get('history') === 'pages') {
  const failed = histories.find(row => row.state === 'error')
  for (let index = 1; index <= 13; index++) histories.push({ ...clone(failed), id: `history-error-${index}`, notifyMessage: `失败通知 ${index}` })
}
function record(operation, payload) {
  calls.push([operation, clone(payload)])
  if (operation === 'deleteConfig' && flags.has('deleteReferenced')) throw { response: { status: 400, data: { status: 400, code: 'error.data.referenced', message: '当前通知配置已绑定模板，不可删除' } } }
  if (failures.delete(operation)) throw Object.assign(new Error(`Test failure: ${operation}`), { response: { status: 500 } })
}
const queryRows = (rows, query) => rows.filter(row => (query.terms || []).every(term => {
  const value = row[term.column]
  return !term.column || term.termType !== 'eq' || (value && typeof value === 'object' && !Array.isArray(value) ? value.value : value) === term.value
}))

// Direct legacy remote-option hooks are isolated too; the fixture never reaches a real service.
notificationRequest.get = async path => {
  record('remoteOption', path)
  if (/\/templates$/.test(path)) return { success: true, result: [{ templateCode: 'SMS_FIXTURE', templateName: '设备告警', templateContent: '设备 ${detail.targetName} 发生告警：${detail.alarmConfigName}' }] }
  if (/\/signs$/.test(path)) return { success: true, result: [{ signName: '测试签名' }] }
  if (/department|user|tag/.test(path)) return { success: true, result: [] }
  throw new Error(`Unexpected request in isolated fixture: ${path}`)
}
for (const method of ['post', 'put', 'patch', 'remove']) notificationRequest[method] = async path => { throw new Error(`Unexpected ${method} in isolated fixture: ${path}`) }
if (flags.has('emailImages')) notificationRequest.post = async (path, data) => {
  if (!path.startsWith('/file/upload')) throw new Error(`Unexpected post in image fixture: ${path}`)
  const file = data.get('file')
  record('uploadImage', { path, name: file?.name, size: file?.size })
  if (writeDelay) await new Promise(resolve => setTimeout(resolve, writeDelay))
  return { success: true, result: { id: 'email-image-fixture', accessUrl: emailImageFixture } }
}


function persistBusinessTemplate(providerId, item) {
  const business = businessTypes.find(row => row.id === providerId)
  if (!business) throw new Error('Business fixture not found')
  const previous = business.channels?.find(row => row.channelProvider === item.channel.channelProvider)
  const id = previous?.channelConfiguration?.templateId || `fixture-template-${providerId}-${item.channel.channelProvider}`
  const template = { ...clone(item.template), id }
  const channel = { ...clone(item.channel), providerId, id: previous?.id || `fixture-channel-${providerId}-${item.channel.channelProvider}`,
    channelConfiguration: { ...clone(item.channel.channelConfiguration || {}), templateId: id, notifierId: template.configId } }
  const templateIndex = templates.findIndex(row => row.id === id)
  if (templateIndex >= 0) templates[templateIndex] = template
  else templates.push(template)
  const index = business.channels?.findIndex(row => row.channelProvider === channel.channelProvider) ?? -1
  business.channels ??= []
  if (index >= 0) business.channels[index] = channel
  else business.channels.push(channel)
  return { channel: clone(channel), template: clone(template) }
}

// Test-only facade replaces every mutation/read entry before any page is mounted.
Object.assign(messageNotificationApi, {
  getCurrentEmail: async () => { record('getCurrentEmail', {}); return flags.has('noEmail') ? '' : 'tester@example.test' },
  getCurrentPhone: async () => { record('getCurrentPhone', {}); return flags.has('noPhone') ? '' : '13800138000' },
  getCurrentBindings: async () => {
    record('getCurrentBindings', {})
    return flags.has('noBinding') ? [] : configs.filter(config => ['dingTalkMessage', 'corpMessage', 'officialMessage'].includes(config.provider)).map(config => ({ type: `${config.type}_${config.provider}`, provider: config.id, thirdPartyUserId: `self_${config.provider}`, providerName: '测试用户' }))
  },
  sendInline: async (configId, template, context) => { if (writeDelay) await new Promise(resolve => setTimeout(resolve, writeDelay)); record('sendInline', { configId, template, context }) },
  setBusinessEnabled: async (id, enabled) => {
    record('setBusinessEnabled', { id, enabled })
    const business = businessTypes.find(item => item.id === id || item.provider === id)
    if (!business) throw { status: 404 }
    if (!business.id) business.id = `actual-${business.provider}`
    business.state = enabled ? 'enabled' : 'disabled'
  },
  queryTemplateDirectory: async () => { record('queryTemplateDirectory', {}); return clone(businessTypes) },
  queryTypes: async () => { record('queryTypes', {}); return clone(flags.get('catalog') === 'extended' ? [...channelTypes, extensionType] : channelTypes) },
  queryProviders: async type => { record('queryProviders', type); if (flags.get('providerError') === type) throw new Error('Provider fixture failure'); return clone(type === extensionType.id ? extensionProviders : flags.has('unifiedTests') && type === 'weixin' ? [...channelProviders.weixin, { id: 'officialMessage', name: '微信服务号' }] : channelProviders[type] || []) },
  queryAllConfigs: async () => { record('queryAllConfigs', {}); return clone(configs) },
  getConfigMetadata: async (type, provider) => {
    record('getConfigMetadata', { type, provider })
    if (flags.has('metadataError')) throw new Error('Metadata fixture failure')
    const metadata = clone(type === extensionType.id ? extensionMetadata : flags.has('unifiedTests') && provider === 'officialMessage' ? officialWireMetadata : channelWireMetadata[`${type}:${provider}`])
    if (flags.has('legacyRobotMetadata') && type === 'dingTalk' && provider === 'dingTalkRobotWebHook') metadata.properties = metadata.properties.filter(field => field.property !== 'secret')
    return normalizeNotificationConfigMetadata(metadata)
  },
  getTemplateMetadata: async (type, provider) => { record('getTemplateMetadata', { type, provider }); if (flags.has('templateMetadataError')) throw new Error('Template metadata fixture failure'); return { name: '消息模板', properties: type === extensionType.id ? [{ id: 'title', name: '标题', valueType: { type: 'string' } }, { id: 'content', name: '正文', valueType: { type: 'string' } }] : [] } },
  queryBusinessVariables: async providerId => { record('queryBusinessVariables', providerId); return [
    { id: 'detail.targetName', name: '设备名称', type: 'string' }, { id: 'detail.alarmConfigName', name: '告警名称', type: 'string' },
    { id: 'detail.alarmTime', name: '告警时间', type: 'date', format: 'yyyy-MM-dd HH:mm:ss' }, { id: 'detail.relieveTime', name: '解除时间', type: 'date' },
    { id: 'detail.level', name: '告警级别', type: 'int' }, { id: 'detail.sceneName', name: '场景名称', type: 'string' },
    ...(flags.has('emailImages') ? [{ id: 'imageUrl', name: '图片地址', type: 'string' }] : []),
  ] },
  getBusinessTemplate: async (providerId, channelProvider) => { record('getBusinessTemplate', { providerId, channelProvider });
    const business = businessTypes.find(row => row.id === providerId)
    const channel = business?.channels?.find(row => row.channelProvider === channelProvider)
    return channel ? { channel: { ...clone(channel), providerId }, template: clone(templates.find(row => row.id === channel.channelConfiguration?.templateId) || null) } : undefined
  },
  saveBusinessTemplate: async (providerId, channelProvider, item) => { record('saveBusinessTemplate', { providerId, channelProvider, item }); return persistBusinessTemplate(providerId, item) },
  saveBusinessTemplates: async (provider, info) => { record('saveBusinessTemplates', { provider, info });
    const business = businessTypes.find(row => !row.id && row.provider === provider)
    if (!business) throw new Error('Unsaved fixture not found')
    Object.assign(business, clone(info.provider), { id: `fixture-topic-${provider}`, channels: [] })
    return { provider: clone(business), channels: info.channels.map(item => persistBusinessTemplate(business.id, item)) }
  },
  queryConfigs: async query => { record('queryConfigs', query); return { data: clone(queryRows(configs, query)) } },
  getConfig: async id => { record('getConfig', id); return clone(configs.find(row => row.id === id)) },
  createConfig: async payload => { record('createConfig', payload); configs.push(clone(payload)) },
  updateConfig: async payload => { if (writeDelay) await new Promise(resolve => setTimeout(resolve, writeDelay)); record('updateConfig', payload); Object.assign(configs.find(row => row.id === payload.id), clone(payload)) },
  deleteConfig: async id => { record('deleteConfig', id); configs.splice(configs.findIndex(row => row.id === id), 1) },
  queryTemplates: async query => { record('queryTemplates', query); return { data: clone(queryRows(templates, query)) } },
  getTemplate: async id => { record('getTemplate', id); return clone(templates.find(row => row.id === id)) },
  getSendTemplate: async id => { record('getSendTemplate', id); return clone(templates.find(row => row.id === id)) },
  createTemplate: async payload => { record('createTemplate', payload); templates.push(clone(payload)) },
  updateTemplate: async payload => { record('updateTemplate', payload); Object.assign(templates.find(row => row.id === payload.id), clone(payload)) },
  deleteTemplate: async id => { record('deleteTemplate', id); templates.splice(templates.findIndex(row => row.id === id), 1) },
  send: async (configId, templateId, variables) => {
    if (!flags.has('wechat') || configId !== 'corp-fixture') throw new Error('Notification sending is disabled in this browser harness')
    record('sendFixture', { configId, templateId, variables })
  },
})
// Replace every member endpoint before mounting; no test member can reach real services.
Object.assign(wechatMemberApi, {
  departments: async id => { record('memberDepartments', id); return [{ id: 'all', name: '全部测试部门', children: [{ id: 'team', name: '研发组' }, { id: 'other', name: '运营组' }] }] },
  members: async id => { record('members', id); return clone(corporateMembers) },
  users: async (pageIndex, pageSize) => { record('memberUsers', { pageIndex, pageSize }); return { data: clone(platformMembers.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)), total: platformMembers.length } },
  bindings: async id => { record('memberBindings', id); return clone(memberBindings) },
  bind: async (configId, changes) => {
    record('bindMembers', { configId, changes })
    changes.forEach(change => {
      const index = memberBindings.findIndex(binding => binding.id === change.id)
      if (index >= 0) memberBindings.splice(index, 1)
      memberBindings.push({ ...clone(change), id: `binding-${change.userId}` })
    })
  },
  unbind: async id => { record('unbindMember', id); const index = memberBindings.findIndex(binding => binding.id === id); if (index >= 0) memberBindings.splice(index, 1) },
})

const historyAdapter = {
  available: flags.get('history') !== 'unavailable',
  query: async query => {
    calls.push(['queryHistory', clone(query)])
    const flat = query.terms.flatMap(term => term.terms || [term])
    const rows = queryRows(histories, { terms: flat })
    return { data: clone(rows.slice(query.pageIndex * query.pageSize, (query.pageIndex + 1) * query.pageSize)), total: rows.length }
  },
  count: async query => {
    record('countHistory', query)
    const rows = queryRows(histories, { terms: (query.terms || []).flatMap(term => term.terms || [term]) })
    const counts = { all: rows.length, success: 0, error: 0, retrying: 0, cancel: 0 }
    rows.forEach(row => counts[typeof row.state === 'string' ? row.state : row.state.value]++)
    return counts
  },
}
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/records', name: 'system/MessageNotification/Records', component: Records },
  { path: '/channels', name: 'system/MessageNotification/Channels', component: () => import('../../views/system/MessageNotification/Channels/index.vue') },
  { path: '/templates', name: 'system/MessageNotification/Templates', component: () => import('../../views/system/MessageNotification/Templates/index.vue') },
] })
const fixturePermission = code => !deniedPermissions.has(String(code)) && !(flags.get('permission') === 'no-template' && String(code).includes('/Templates')) && !(flags.get('permission') === 'no-send' && String(code).endsWith(':action')) && flags.get('permission') !== 'denied' && !(flags.get('permission') === 'read' && String(code).endsWith(':add')) && !(flags.get('permission') === 'no-bind' && String(code).endsWith(':bind'))
const Root = defineComponent({ setup() {
  usePermissionContext({ hasPermission: fixturePermission })
  // 页面与产品列表共用项目默认面板；隔离环境也提供同一布局契约。
  return () => h(ConfigProvider, { TableConfig: { pagination: { pageSize: 12 } } }, () => h(ContentPanel, { fill: true }, () => h(RouterView)))
} })
const app = createApp(Root)
app.use(createPinia()).use(AntDesign).use(i18n).use(router)
useAuthStore().hasPermission = fixturePermission
if (flags.has('unifiedTests')) useSystemStore().layout.title = '隔离验证平台'
useMenuStore().jumpPage = (name, options) => router.push({ name, ...options })
for (const [name, component] of Object.entries({ AIcon, FullPage, ContentPanel, SwitchGroup, TableActions, TableActionsItem,
  CloudEmpty, JlDrawerShell, KvGrid, CodeBlock, EqualHeightColumns, DetailHeader, Editable, StatusPill, StickyActionBar, JlConfirmDialog, FileUpload, MetadataValueItem, MonacoEditor,
  'j-pro-table': ProTable, 'j-permission-button': PermissionButton, 'j-badge-status': BadgeStatus })) app.component(name, component)
app.provide(notificationHistoryAdapterKey, historyAdapter)
i18n.global.locale.value = 'zh'
window.__notificationSmoke = { calls, router, configs, templates, businessTypes, failures, i18n, memberBindings, deniedPermissions }
await router.push(location.hash.slice(1) || '/records')
await router.isReady()
app.mount('#notification-test-root')
document.documentElement.dataset.notificationSmoke = 'ready'

const style = document.createElement('style')
style.textContent = 'body{margin:0;padding:var(--space-4);background:var(--bg-sunken);font-family:Arial,sans-serif}#notification-test-root{min-width:0;max-width:100%}'
document.head.append(style)
