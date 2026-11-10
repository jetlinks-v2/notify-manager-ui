import { createApp, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { createPinia } from 'pinia'
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
import Editable from '@jetlinks-web-core/components/Editable/index.vue'
import StatusPill from '@jetlinks-web-core/components/StatusPill/index.vue'
import StickyActionBar from '@jetlinks-web-core/components/StickyActionBar/index.vue'
import JlConfirmDialog from '@jetlinks-web-core/components/JlConfirmDialog/index.vue'
import FileUpload from '@jetlinks-web-core/components/Upload/File/index.vue'
import Records from '../../views/system/MessageNotification/Records/index.vue'
import { notificationHistoryAdapterKey } from '../../views/system/MessageNotification/Records/recordQuery'
import { messageNotificationApi } from '../../api/notice/messageNotification'
import fixtures from './fixtures.mjs'
import '@jetlinks-web-core/style.css'
import 'ant-design-vue/dist/reset.css'
import '@jetlinks-web-core/style/components.less'

const clone = value => JSON.parse(JSON.stringify(value))
const calls = []
const failures = new Set()
const configs = clone(fixtures.configs)
const templates = clone(fixtures.templates)
const flags = new URLSearchParams(location.search)
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
  queryConfigs: async query => { record('queryConfigs', query); return { data: clone(queryRows(configs, query)) } },
  getConfig: async id => { record('getConfig', id); return clone(configs.find(row => row.id === id)) },
  createConfig: async payload => { record('createConfig', payload); configs.push(clone(payload)) },
  updateConfig: async payload => { record('updateConfig', payload); Object.assign(configs.find(row => row.id === payload.id), clone(payload)) },
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
    const rows = queryRows(fixtures.history, { terms: flat })
    return { data: clone(rows.slice(query.pageIndex * query.pageSize, (query.pageIndex + 1) * query.pageSize)), total: rows.length }
  },
}
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/records', name: 'system/MessageNotification/Records', component: Records },
  { path: '/channels', name: 'system/MessageNotification/Channels', component: () => import('../../views/system/MessageNotification/Channels/index.vue') },
  { path: '/templates', name: 'system/MessageNotification/Templates', component: () => import('../../views/system/MessageNotification/Templates/index.vue') },
] })
const Root = defineComponent({ setup() {
  usePermissionContext({ hasPermission: () => flags.get('permission') !== 'denied' })
  // 页面与产品列表共用项目默认面板；隔离环境也提供同一布局契约。
  return () => h(ConfigProvider, { TableConfig: { pagination: { pageSize: 12 } } }, () => h(ContentPanel, { fill: true }, () => h(RouterView)))
} })
const app = createApp(Root)
app.use(createPinia()).use(AntDesign).use(i18n).use(router)
for (const [name, component] of Object.entries({ AIcon, FullPage, ContentPanel, SwitchGroup, TableActions, TableActionsItem,
  CloudEmpty, JlDrawerShell, KvGrid, CodeBlock, EqualHeightColumns, Editable, StatusPill, StickyActionBar, JlConfirmDialog, FileUpload,
  'j-pro-table': ProTable, 'j-permission-button': PermissionButton, 'j-badge-status': BadgeStatus })) app.component(name, component)
app.provide(notificationHistoryAdapterKey, historyAdapter)
i18n.global.locale.value = 'zh'
window.__notificationSmoke = { calls, router, configs, templates, failures, i18n }
await router.push(location.hash.slice(1) || '/records')
await router.isReady()
app.mount('#notification-test-root')
document.documentElement.dataset.notificationSmoke = 'ready'

const style = document.createElement('style')
style.textContent = 'body{margin:0;padding:var(--space-4);background:var(--bg-sunken);font-family:Arial,sans-serif}#notification-test-root{min-width:0;max-width:100%}'
document.head.append(style)
