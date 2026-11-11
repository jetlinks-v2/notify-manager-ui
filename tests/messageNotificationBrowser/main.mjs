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
import fixtures from './fixtures.mjs'
import templateDirectoryFixture from '../messageNotificationTemplateDirectoryFixture.mjs'
import { channelTypes, channelProviders, channelWireMetadata, extensionType, extensionProviders, extensionMetadata } from '../messageNotificationChannelFixtures.mjs'
import { normalizeNotificationConfigMetadata } from '../../api/notice/notificationConfigMetadata'
import MetadataValueItem from '@jetlinks-web-core/components/MetadataValueItem/index.vue'
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
if (flags.get('directory') === 'tree') templates.push(...clone(templateDirectoryFixture.templates))
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
  if (failures.delete(operation)) throw Object.assign(new Error(`Test failure: ${operation}`), { response: { status: 500 } })
}
const queryRows = (rows, query) => rows.filter(row => (query.terms || []).every(term => {
  const value = row[term.column]
  return !term.column || term.termType !== 'eq' || (value && typeof value === 'object' && !Array.isArray(value) ? value.value : value) === term.value
}))

// Test-only facade replaces every mutation/read entry before any page is mounted.
Object.assign(messageNotificationApi, {
  getCurrentEmail: async () => { record('getCurrentEmail', {}); return flags.has('noEmail') ? '' : 'tester@example.test' },
  getCurrentPhone: async () => { record('getCurrentPhone', {}); return flags.has('noPhone') ? '' : '13800138000' },
  getCurrentBindings: async () => {
    record('getCurrentBindings', {})
    return flags.has('noBinding') ? [] : configs.filter(config => ['dingTalkMessage', 'corpMessage', 'officialMessage'].includes(config.provider)).map(config => ({ type: `${config.type}_${config.provider}`, provider: config.id, thirdPartyUserId: `self_${config.provider}`, providerName: '测试用户' }))
  },
  sendInline: async (configId, template, context) => { if (writeDelay) await new Promise(resolve => setTimeout(resolve, writeDelay)); record('sendInline', { configId, template, context }) },
  queryTemplateDirectory: async () => { record('queryTemplateDirectory', {}); return clone(flags.get('directory') === 'tree' ? templateDirectoryFixture.businessTypes : []) },
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
  queryConfigs: async query => { record('queryConfigs', query); return { data: clone(queryRows(configs, query)) } },
  getConfig: async id => { record('getConfig', id); return clone(configs.find(row => row.id === id)) },
  createConfig: async payload => { record('createConfig', payload); configs.push(clone(payload)) },
  updateConfig: async payload => { if (writeDelay) await new Promise(resolve => setTimeout(resolve, writeDelay)); record('updateConfig', payload); Object.assign(configs.find(row => row.id === payload.id), clone(payload)) },
  deleteConfig: async id => { record('deleteConfig', id); configs.splice(configs.findIndex(row => row.id === id), 1) },
  queryTemplates: async query => { record('queryTemplates', query); return { data: clone(queryRows(templates, query)) } },
  getTemplate: async id => { record('getTemplate', id); return clone(templates.find(row => row.id === id)) },
  createTemplate: async payload => { record('createTemplate', payload); templates.push(clone(payload)) },
  updateTemplate: async payload => { record('updateTemplate', payload); Object.assign(templates.find(row => row.id === payload.id), clone(payload)) },
  deleteTemplate: async id => { record('deleteTemplate', id); templates.splice(templates.findIndex(row => row.id === id), 1) },
  send: async () => { throw new Error('Notification sending is disabled in this browser harness') },
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
const fixturePermission = code => !deniedPermissions.has(String(code)) && !(flags.get('permission') === 'no-template' && String(code).includes('/Templates')) && !(flags.get('permission') === 'no-send' && String(code).endsWith(':action')) && flags.get('permission') !== 'denied' && !(flags.get('permission') === 'read' && String(code).endsWith(':add'))
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
  CloudEmpty, JlDrawerShell, KvGrid, CodeBlock, EqualHeightColumns, DetailHeader, Editable, StatusPill, StickyActionBar, JlConfirmDialog, FileUpload, MetadataValueItem,
  'j-pro-table': ProTable, 'j-permission-button': PermissionButton, 'j-badge-status': BadgeStatus })) app.component(name, component)
app.provide(notificationHistoryAdapterKey, historyAdapter)
i18n.global.locale.value = 'zh'
window.__notificationSmoke = { calls, router, configs, templates, failures, i18n, deniedPermissions }
await router.push(location.hash.slice(1) || '/records')
await router.isReady()
app.mount('#notification-test-root')
document.documentElement.dataset.notificationSmoke = 'ready'

const style = document.createElement('style')
style.textContent = 'body{margin:0;padding:var(--space-4);background:var(--bg-sunken);font-family:Arial,sans-serif}#notification-test-root{min-width:0;max-width:100%}'
document.head.append(style)
