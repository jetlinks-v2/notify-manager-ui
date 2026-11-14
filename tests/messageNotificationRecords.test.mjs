import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const uiRoot = resolve(root, '../..')
const pageRoot = resolve(root, 'views/system/MessageNotification/Records')
const coreRoot = resolve(uiRoot, 'jetlinks-web-core/src')
const cache = new Map()
let unique = 0
let io
const t = (key, params) => params ? `${key}:${JSON.stringify(params)}` : key
globalThis.window = { btoa, atob }
class TestFocusableElement {
  isConnected = true
  focused = 0
  focus() { this.focused++ }
}
globalThis.HTMLElement = TestFocusableElement

// Execute the production route codec, mapper, hooks and SFCs; replace platform I/O and visual controls only.
function load(filename) {
  if (cache.has(filename)) return cache.get(filename)
  let source = readFileSync(filename, 'utf8')
  if (filename.endsWith('.vue')) source = compileScript(parse(source, { filename }).descriptor, { id: filename, inlineTemplate: true }).content
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs' })
  const module = { exports: {} }
  const imports = name => {
    if (name === 'vue') return vue
    if (name === 'vue-i18n') return { useI18n: () => ({ t }) }
    if (name === 'vue-router') return {
      useRoute: () => io.route,
      useRouter: () => ({ replace: async target => { io.routes.push(target); io.route.query = target.query } }),
    }
    if (name === '@jetlinks-web/hooks') return { usePermission: () => ({ hasPerm: io.permission }) }
    if (name === '@jetlinks-web-core/store/menu') return { useMenuStore: () => ({ jumpPage: (name, options) => io.jumps.push({ name, options }) }) }
    if (name === '@jetlinks-web/core') return { request: { get: async url => {
      assert.ok(url.startsWith('/notifier/template/'))
      const id = decodeURIComponent(url.slice('/notifier/template/'.length))
      io.templateCalls.push(id)
      const result = io.getTemplate ? await io.getTemplate(id) : { id, name: 'Template display name' }
      return { success: true, result }
    }, post: async (url, data, options) => {
      if (url === '/notify/history/_agg') {
        io.countCalls.push({ url, data, options })
        if (io.failure) throw io.failure
        return io.countResponse
      }
      assert.equal(url, '/notify/history/_query')
      io.calls.push({ url, data, options })
      if (io.failure) throw io.failure
      return io.response
    } } }
    if (name === '@jetlinks-web/utils') return { randomString: () => `key-${++unique}` }
    if (name === '@jetlinks-web-core/locales') return { global: { t } }
    if (name === '@jetlinks-web-core/components/ConditionFilter') return {
      __esModule: true, ...load(resolve(coreRoot, 'components/ConditionFilter/utils.ts')), default: control('ConditionFilter'),
    }
    if (name.startsWith('@notify-manager-ui/')) return load(resolve(root, name.slice('@notify-manager-ui/'.length)))
    if (name.startsWith('.')) {
      let target = resolve(dirname(filename), name)
      if (!/\.(vue|ts)$/.test(target)) {
        try { return load(`${target}.ts`) } catch (error) { if (error.code !== 'ENOENT') throw error }
        target = resolve(target, 'index.ts')
      }
      return load(target)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(imports, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}

const queryModel = load(resolve(pageRoot, 'recordQuery.ts'))
const presentation = load(resolve(pageRoot, 'presentation.ts'))
const { createNotificationRecordsController, useNotificationRecords } = load(resolve(pageRoot, 'useNotificationRecords.ts'))
const shared = load(resolve(root, 'views/system/MessageNotification/shared/index.ts'))
const codec = load(resolve(coreRoot, 'components/ConditionFilter/utils.ts'))
const fields = presentation.historyFilterFields(t)
const fixture = (id, state = 'success') => ({
  id, notifierId: 'smtp-one', templateId: 'template-old', notifyType: 'email', provider: 'embedded', state,
  notifyTime: 1730000000000, receiver: ['user@example.org'], notifyMessage: `Saved ${id}`,
  template: '{"subject":"Saved subject","text":"${oldVariable}"}', context: '{"oldVariable":"old value"}',
})
const flush = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); await vue.nextTick() } }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

function controller(adapter, allowed = true) {
  const scope = vue.effectScope()
  const query = vue.ref({ pageIndex: 0, pageSize: 12, terms: [] })
  const permission = vue.ref(allowed)
  const result = scope.run(() => createNotificationRecordsController(adapter, permission, query))
  return { ...result, query, permission, dispose: () => scope.stop() }
}

test('production adapter queries global history and cancellation reaches the request boundary', async () => {
  io.response = { success: true, result: { data: [fixture('global')], total: 25 } }
  const result = controller(queryModel.notificationHistoryAdapter)
  await flush()
  assert.equal(result.state.value, 'ready')
  assert.equal(result.rows.value[0].id, 'global')
  assert.equal(result.total.value, 25)
  assert.deepEqual(io.calls[0].data, { pageIndex: 0, pageSize: 12, terms: [] })
  assert.equal(io.calls[0].options.signal.aborted, false)
  result.query.value = { ...result.query.value, pageIndex: 1 }
  await flush()
  assert.equal(io.calls[0].options.signal.aborted, true)
  assert.equal(io.calls[1].data.pageIndex, 1)
  result.dispose()
  assert.equal(io.calls[1].options.signal.aborted, true)
})

test('an unavailable environment does not query or fabricate zero counts', async () => {
  const result = controller({ available: false, query: async () => { assert.fail('Unavailable adapter must not query') } })
  assert.equal(result.state.value, 'unavailable')
  assert.equal(result.total.value, undefined)
  assert.deepEqual(result.rows.value, [])
  assert.deepEqual(io.calls, [])
  result.dispose()
})

test('permission denial is distinct from unavailable and prevents adapter queries', async () => {
  let calls = 0
  const result = controller({ available: true, query: async () => { calls++; return { data: [] } } }, false)
  assert.equal(result.state.value, 'forbidden')
  assert.equal(calls, 0)
  result.permission.value = true
  await flush()
  assert.equal(result.state.value, 'empty')
  assert.equal(calls, 1)
  assert.equal(result.total.value, undefined)
  result.dispose()
})

test('real success, empty, forbidden and load failure retain separate states', async () => {
  let response = { data: [fixture('one')], total: 1 }
  let failure
  const result = controller({ available: true, query: async () => { if (failure) throw failure; return response } })
  await flush()
  assert.equal(result.state.value, 'ready')
  assert.equal(result.total.value, 1)
  response = { data: [], total: 0 }
  await result.load()
  assert.equal(result.state.value, 'empty')
  assert.equal(result.total.value, 0)
  failure = { response: { status: 403 } }
  await result.load()
  assert.equal(result.state.value, 'forbidden')
  assert.equal(result.total.value, undefined)
  failure = new Error('offline')
  await result.load()
  assert.equal(result.state.value, 'error')
  assert.equal(result.total.value, undefined)
  result.dispose()
})

test('a stale query or error cannot replace a newer page and disposal aborts its signal', async () => {
  const pending = []
  const result = controller({ available: true, query: (query, signal) => {
    const item = { query, signal, ...deferred() }; pending.push(item); return item.promise
  } })
  result.query.value = { ...result.query.value, pageIndex: 1 }
  await flush()
  assert.equal(pending.length, 2)
  assert.equal(pending[0].signal.aborted, true)
  pending[1].resolve({ data: [fixture('new')], total: 30 })
  await flush()
  pending[0].reject(new Error('old network failure'))
  await flush()
  assert.equal(result.rows.value[0].id, 'new')
  assert.equal(result.total.value, 30)
  assert.equal(result.state.value, 'ready')
  result.dispose()
  assert.equal(pending[1].signal.aborted, true)
})

test('state controls use standard terms, all four real values and provider-scoped historical fields', () => {
  const base = [{ column: 'receiver', termType: 'eq', value: 'user@example.org' }]
  for (const state of shared.notificationStates) {
    const terms = queryModel.replaceHistoryState(base, state)
    assert.equal(queryModel.selectedHistoryState(terms), state)
    const output = queryModel.buildHistoryQuery(terms, { channel: 'email:embedded', configId: 'smtp-one', templateId: 'template-one' }, 1, 24)
    assert.equal(output.pageIndex, 1)
    assert.equal(output.pageSize, 24)
    assert.deepEqual(output.terms.slice(1).map(term => term.column), ['notifyType', 'provider', 'notifierId', 'templateId'])
    assert.deepEqual(output.terms[0].terms, terms)
  }
  assert.deepEqual(queryModel.replaceHistoryState(queryModel.replaceHistoryState(base, 'cancel')), base)
  assert.equal(queryModel.selectedHistoryState([{ column: 'state', termType: 'eq', value: 'unsent' }]), undefined)
})

test('historical EnumDict text and saved content remain unchanged, including cancelled and malformed snapshots', () => {
  assert.equal(presentation.historyStateLabel({ value: 'cancel', text: 'Stopped by sender' }, t), 'Stopped by sender')
  assert.equal(presentation.historyStateLabel('cancel', t), 'messageNotification.records.state.cancel')
  assert.equal(presentation.historyStateLabel('unknown', t), 'unknown')
  assert.equal(presentation.historyChannelLabel({ value: 'email', text: 'Mail from server' }, 'embedded', t), 'Mail from server / embedded')
  assert.equal(presentation.historySnapshot('${oldVariable}<script>alert(1)</script>'), '${oldVariable}<script>alert(1)</script>')
  assert.equal(presentation.historySnapshot('{bad-json'), '{bad-json')
  assert.equal(presentation.historySnapshot('{"oldVariable":"old value"}'), '{\n  "oldVariable": "old value"\n}')
  assert.notEqual(presentation.historyTime(0), '—')
  assert.equal(presentation.historyTime(NaN), '—')
})

test('the selected detail is an isolated snapshot and permission revocation closes it', async () => {
  const record = fixture('one')
  const result = controller({ available: true, query: async () => ({ data: [record] }) })
  await flush()
  result.openDetail(record)
  record.notifyMessage = 'changed outside drawer'
  assert.equal(result.selected.value.notifyMessage, 'Saved one')
  assert.equal(result.detailOpen.value, true)
  result.permission.value = false
  await flush()
  assert.equal(result.detailOpen.value, false)
  assert.equal(result.selected.value, undefined)
  result.dispose()
})

function control(name) {
  return vue.defineComponent({ name, inheritAttrs: false, setup: (_, { attrs, slots }) => () => vue.h(name, attrs, [slots.default?.(), slots.actions?.()]) })
}
const renderer = vue.createRenderer({
  createElement: type => ({ type, props: {}, children: [], parent: null }),
  createText: text => ({ type: '#text', text, children: [] }), createComment: text => ({ type: '#comment', text, children: [] }),
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child)
    const index = anchor ? parent.children.indexOf(anchor) : -1
    child.parent = parent
    if (index < 0) parent.children.push(child)
    else parent.children.splice(index, 0, child)
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child) },
  setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.text = text; node.children = [] },
  patchProp: (node, key, old, value) => { node.props[key] = value },
  parentNode: node => node?.parent, nextSibling: node => node?.parent?.children[node.parent.children.indexOf(node) + 1],
})
const walk = (node, predicate) => [node, ...(node.children || []).flatMap(child => walk(child, predicate))].filter(predicate)

function mount(component, props = {}, adapter) {
  const rootNode = { type: 'root', children: [] }
  const app = renderer.createApp({ setup() {
    if (adapter) vue.provide(queryModel.notificationHistoryAdapterKey, adapter)
    return () => vue.h(component, props)
  } })
  for (const name of ['FullPage', 'ContentPanel', 'PageHeader', 'SwitchGroup', 'TableActions', 'TableActionsItem', 'CloudEmpty', 'AIcon', 'a-button', 'a-tooltip', 'a-tag', 'a-space', 'a-divider', 'a-descriptions', 'a-descriptions-item', 'a-pagination', 'KvGrid', 'CodeBlock', 'j-permission-button', 'j-badge-status']) app.component(name, control(name))
  app.component('a-result', vue.defineComponent({ setup: (_, { attrs, slots }) => () => vue.h('a-result', attrs, [slots.default?.(), slots.extra?.()]) }))
  app.component('j-pro-table', vue.defineComponent({ props: ['dataSource'], setup: (props, { attrs, slots }) => () => vue.h('j-pro-table', { ...attrs, dataSource: props.dataSource }, [slots.headerLeftRender?.(), props.dataSource?.length ? props.dataSource.flatMap(row => [slots.notifyMessage?.(row), slots.action?.(row)]) : slots.emptyText?.()]) }))
  app.component('JlDrawerShell', vue.defineComponent({ setup: (_, { attrs, slots }) => () => vue.h('JlDrawerShell', attrs, [slots.default?.(), slots.foot?.()]) }))
  app.mount(rootNode)
  return { rootNode, unmount: () => app.unmount() }
}

test.beforeEach(() => {
  io = { route: vue.reactive({ query: {} }), routes: [], jumps: [], permission: vue.ref(true), calls: [], templateCalls: [], countCalls: [], countResponse: '', response: { success: true, result: { data: [], total: 0 } } }
})

test('the default page queries real history with filters and pagination while permission denial prevents HTTP', async () => {
  io.response = { success: true, result: { data: [fixture('global')], total: 25 } }
  const Page = load(resolve(pageRoot, 'index.vue')).default
  const mounted = mount(Page)
  await flush()
  assert.equal(io.calls.length, 1)
  assert.deepEqual(io.calls[0].data, { paging: true, pageIndex: 0, pageSize: 12, sorts: [{ name: 'notifyTime', order: 'desc' }], terms: [{ type: 'and', terms: [{ column: 'state', termType: 'eq', value: 'error' }] }] })
  assert.equal(io.countCalls.length, 1)
  assert.deepEqual(io.countCalls[0].data.filter.terms, [])
  assert.equal(walk(mounted.rootNode, node => node.type === 'j-pro-table')[0].props.dataSource[0].id, 'global')
  const filter = walk(mounted.rootNode, node => node.type === 'ConditionFilter')[0]
  assert.equal(filter.props.disabled, false)
  filter.props.onChange({ terms: [{ column: 'receiver', termType: 'eq', value: 'user@example.org' }] })
  await flush()
  assert.equal(io.calls.length, 2)
  assert.equal(io.calls[1].data.terms[0].terms[0].value, 'user@example.org')
  const pagination = walk(mounted.rootNode, node => node.type === 'a-pagination')[0]
  assert.equal(pagination.props.total, 25)
  pagination.props.onChange(2, 12)
  await flush()
  assert.equal(io.calls[2].data.pageIndex, 1)
  assert.deepEqual(io.calls[2].data.terms, io.calls[1].data.terms)
  io.permission.value = false
  await flush()
  assert.equal(io.calls.length, 3)
  assert.equal(walk(mounted.rootNode, node => node.type === 'a-result')[0].props.title, 'messageNotification.records.feedback.forbidden')
  mounted.unmount()
})

test('route codec, status and pagination produce one request per committed change and round-trip filters', async () => {
  const requests = []
  const adapter = { available: true, query: async query => { requests.push(query); return { data: [fixture('one')], total: 50 } } }
  let page
  const Harness = vue.defineComponent({ setup() { page = useNotificationRecords(vue.ref(fields)); return () => null } })
  const mounted = mount(Harness, {}, adapter)
  await flush()
  assert.equal(requests.length, 1)
  page.changeTerms([{ column: 'receiver', termType: 'eq', value: 'user@example.org' }])
  await flush()
  assert.equal(requests.length, 2)
  assert.equal(codec.decodeConditionFilterQuery(io.route.query.q, fields)[0].value, 'user@example.org')
  page.changeState('cancel')
  await flush()
  assert.equal(requests.length, 3)
  assert.equal(page.selectedState.value, 'cancel')
  assert.equal(io.route.query.state, 'cancel')
  page.changePage(2, 12)
  await flush()
  assert.equal(requests.length, 4)
  assert.equal(requests.at(-1).pageIndex, 1)
  assert.equal(requests.at(-1).terms[0].terms.some(term => term.column === 'state' && term.value === 'cancel'), true)
  page.changeState('cancel')
  await flush()
  assert.equal(requests.length, 5)
  assert.equal(io.route.query.page, undefined)
  assert.equal(page.selectedState.value, undefined)
  mounted.unmount()
})

test('real page renders unavailable HTTP feedback with zero default counts and no statistics retry or enabled export', async () => {
  io.failure = { response: { status: 405 } }
  const Page = load(resolve(pageRoot, 'index.vue')).default
  const mounted = mount(Page)
  await flush()
  const feedback = walk(mounted.rootNode, node => node.type === 'a-result')[0]
  assert.equal(io.calls.length, 1)
  assert.equal(feedback.props.title, 'messageNotification.records.feedback.unavailable')
  assert.equal(walk(mounted.rootNode, node => node.type === 'a-pagination').length, 0)
  const unavailableActions = walk(mounted.rootNode, node => node.type === 'a-button')
    .filter(button => walk(button, node => node.text?.includes('messageNotification.records.export') || node.text?.includes('messageNotification.records.retrySend')).length)
  assert.equal(unavailableActions.length, 1)
  assert.ok(unavailableActions.every(button => button.props.disabled === '' || button.props.disabled === true))
  const switchGroup = walk(mounted.rootNode, node => node.type === 'SwitchGroup')[0]
  assert.ok(switchGroup.props.options.every(option => option.count === 0))
  assert.equal(walk(mounted.rootNode, node => node.text?.includes('messageNotification.records.reloadCounts')).length, 0)
  mounted.unmount()
})

test('real detail renders the requested fields and only sent content, retaining exit focus restoration', async () => {
  const Detail = load(resolve(pageRoot, 'components/RecordDetail.vue')).default
  let closed = 0
  const mounted = mount(Detail, { open: true, record: fixture('saved', { value: 'cancel', text: 'Cancelled on server' }), onClosed: () => closed++ })
  await flush()
  const blocks = walk(mounted.rootNode, node => node.type === 'CodeBlock')
  assert.deepEqual(blocks.map(block => block.props.content), ['Saved saved'])
  assert.ok(walk(mounted.rootNode, node => node.type === 'a-button').some(button => walk(button, node => node.text === 'Template display name').length))
  assert.deepEqual(walk(mounted.rootNode, node => node.type === 'dt').map(node => node.text), [
    'messageNotification.records.field.notifyTime', 'messageNotification.records.detail.notificationType',
    'messageNotification.records.detail.channel', 'messageNotification.records.field.receiver',
    'messageNotification.records.detail.relatedObject', 'messageNotification.records.detail.messageTemplate',
    'messageNotification.records.detail.retryCount',
  ])
  const drawer = walk(mounted.rootNode, node => node.type === 'JlDrawerShell')[0]
  assert.equal(drawer.props.keyboard, true)
  assert.equal(drawer.props.autofocus, true)
  await drawer.props.onAfterOpenChange(false)
  assert.equal(closed, 1)
  mounted.unmount()
})

test('injected rows exercise the actual page filters, clickable content and return keyboard focus after close', async () => {
  const requests = []
  const adapter = { available: true, query: async query => { requests.push(query); return { data: [fixture('server-record', 'cancel')], total: 1 } } }
  const Page = load(resolve(pageRoot, 'index.vue')).default
  const mounted = mount(Page, {}, adapter)
  await flush()
  const filter = walk(mounted.rootNode, node => node.type === 'ConditionFilter')[0]
  assert.equal(filter.props['onUpdate:modelValue'], undefined)
  filter.props.onChange({ terms: [{ column: 'receiver', termType: 'eq', value: 'user@example.org' }] })
  await flush()
  assert.equal(requests.length, 2)
  const switchGroup = walk(mounted.rootNode, node => node.type === 'SwitchGroup')[0]
  switchGroup.props.onChange('cancel')
  await flush()
  assert.equal(requests.length, 3)
  assert.equal(io.route.query.state, 'cancel')
  const origin = new TestFocusableElement()
  const viewButton = walk(mounted.rootNode, node => node.type === 'j-permission-button' && node.props.class === 'notification-records__content')[0]
  assert.equal(viewButton.props.title, 'Saved server-record')
  assert.equal(viewButton.props['has-permission'], shared.notificationPermissions.records.query)
  viewButton.props.onClick({ currentTarget: origin })
  await flush()
  const drawer = walk(mounted.rootNode, node => node.type === 'JlDrawerShell')[0]
  assert.equal(drawer.props.open, true)
  assert.ok(walk(mounted.rootNode, node => node.type === 'CodeBlock').some(node => node.props.content === 'Saved server-record'))
  drawer.props['onUpdate:open'](false)
  await flush()
  await drawer.props.onAfterOpenChange(false)
  assert.equal(origin.focused, 1)
  mounted.unmount()
})

test('default failure and explicit all round-trip while counts retain search scope and ignore status/paging', async () => {
  const requests = [], counts = []
  const adapter = { available: true,
    query: async query => { requests.push(query); return { data: [], total: 0 } },
    count: async query => { counts.push(query); return { all: 4, error: 3, success: 1, retrying: 0, cancel: 0 } },
  }
  io.route.query = { configId: 'smtp-one', templateId: 'template-old', channel: 'email:embedded' }
  let page
  const Harness = vue.defineComponent({ setup() { page = useNotificationRecords(vue.ref(fields)); return () => null } })
  let mounted = mount(Harness, {}, adapter)
  await flush()
  assert.equal(page.selectedState.value, 'error')
  assert.deepEqual(counts[0].terms.map(term => term.column), ['notifyType', 'provider', 'notifierId', 'templateId'])
  page.changeState('success')
  await flush()
  page.changePage(2, 12)
  await flush()
  assert.equal(counts.length, 1)
  page.changeState('success')
  await flush()
  assert.equal(io.route.query.state, 'all')
  assert.equal(io.route.query.q, undefined)
  mounted.unmount()
  mounted = mount(Harness, {}, adapter)
  await flush()
  assert.equal(page.selectedState.value, undefined)
  page.changeTerms([{ column: 'bizType', termType: 'eq', value: 'alarm' }])
  await flush()
  assert.equal(counts.at(-1).terms[0].terms[0].value, 'alarm')
  assert.equal(requests.at(-1).terms[0].terms[0].value, 'alarm')
  mounted.unmount()
})

test('statistics reject stale responses, isolate errors and cancel on permission loss or disposal', async () => {
  const { useHistoryCounts } = load(resolve(pageRoot, 'useHistoryCounts.ts'))
  const pending = [], allowed = vue.ref(true), filter = vue.ref({ terms: [] }), scope = vue.effectScope()
  const stats = scope.run(() => useHistoryCounts({ available: true, count: (query, signal) => {
    const task = { ...deferred(), query, signal }; pending.push(task); return task.promise
  } }, allowed, filter))
  filter.value = { terms: [{ column: 'bizType', value: 'alarm' }] }
  await flush()
  assert.equal(pending[0].signal.aborted, true)
  pending[1].resolve({ all: 2, error: 2 })
  await flush()
  pending[0].resolve({ all: 99, error: 99 })
  await flush()
  assert.equal(stats.counts.value.all, 2)
  const reload = stats.loadCounts()
  pending[2].reject(new Error('offline'))
  await reload
  assert.equal(stats.countState.value, 'error')
  assert.equal(stats.counts.value, undefined)
  allowed.value = false
  await flush()
  assert.equal(stats.countState.value, 'forbidden')
  assert.equal(pending.length, 3)
  allowed.value = true
  await flush()
  scope.stop()
  assert.equal(pending[3].signal.aborted, true)
})

test('selection preserves cross-page snapshots, deselects and clears when filters or permissions change', async () => {
  const { useHistorySelection } = load(resolve(pageRoot, 'useHistorySelection.ts'))
  const rows = vue.ref([fixture('one')]), scopeKey = vue.ref('search-one'), allowed = vue.ref(true), scope = vue.effectScope()
  const selection = scope.run(() => useHistorySelection(rows, scopeKey, allowed, t))
  selection.rowSelection.value.onChange(['one'], rows.value)
  rows.value = [fixture('two')]
  await flush()
  assert.equal(selection.selectionCount.value, 1)
  selection.rowSelection.value.onChange(['one', 'two'], rows.value)
  assert.deepEqual(selection.rowSelection.value.selectedRowKeys, ['one', 'two'])
  selection.rowSelection.value.onChange(['one'], [])
  assert.deepEqual(selection.rowSelection.value.selectedRowKeys, ['one'])
  scopeKey.value = 'search-two'
  await flush()
  assert.equal(selection.selectionCount.value, 0)
  selection.rowSelection.value.onChange(['two'], rows.value)
  allowed.value = false
  await flush()
  assert.equal(selection.selectionCount.value, 0)
  assert.equal(selection.rowSelection.value, undefined)
  scope.stop()
})

test('CSV exports full historical text, quotes and newlines while neutralizing formula prefixes', () => {
  const { historyCsv } = load(resolve(pageRoot, 'useHistorySelection.ts'))
  const csv = historyCsv([{ ...fixture('csv'), notifyMessage: '=HYPERLINK("https://invalid.test")\n完整内容', receiver: ['+1234'], errorMessage: 'failed, "quoted"' }], t)
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('"\'=HYPERLINK(""https://invalid.test"")\n完整内容"'))
  assert.ok(csv.includes('"\'+1234"'))
  assert.ok(csv.includes('"failed, ""quoted"""'))
  assert.equal(csv.includes('undefined'), false)
})

test('details preserve reported values, fill missing fields and navigate by actual IDs with permission checks', async () => {
  const { useRecordDetail } = load(resolve(pageRoot, 'useRecordDetail.ts'))
  const record = vue.ref({ ...fixture('detail'), notifierId: 'config/#', templateId: 'template/#', bizType: 'alarm', bizId: 'alarm-1', errorMessage: 'Provider rejected', result: {} })
  let detail
  const Harness = vue.defineComponent({ setup() { detail = useRecordDetail(record, vue.ref(true), () => {}); return () => null } })
  const mounted = mount(Harness)
  await flush()
  const values = () => Object.fromEntries(detail.summary.value.map(item => [item.key, item.value]))
  assert.equal(values().notificationType, 'alarm')
  assert.equal(values().relatedObject, 'alarm-1')
  assert.equal(values().receiver, 'user@example.org')
  assert.equal(values().messageTemplate, 'Template display name')
  assert.deepEqual(io.templateCalls, ['template/#'])
  assert.equal(values().retryCount, 'messageNotification.records.detail.unreported')
  detail.navigate('channels')
  detail.navigate('templates')
  assert.deepEqual(io.jumps, [
    { name: shared.notificationRouteNames.channels, options: { query: { channel: 'email:embedded', configId: 'config/#' } } },
    { name: shared.notificationRouteNames.templates, options: { query: { channel: 'email:embedded', configId: 'config/#', templateId: 'template/#' } } },
  ])
  io.permission.value = false
  detail.navigate('channels')
  detail.navigate('templates')
  assert.equal(io.jumps.length, 2)
  record.value = { id: 'missing', receiver: [' ', ''], notifyTime: NaN }
  assert.deepEqual(values(), {
    notifyTime: 'messageNotification.records.detail.unreported',
    notificationType: 'messageNotification.records.detail.unreported',
    channel: 'messageNotification.records.detail.unconfigured',
    receiver: 'messageNotification.records.detail.unreported',
    relatedObject: 'messageNotification.records.detail.unreported',
    messageTemplate: 'messageNotification.records.detail.unconfigured',
    retryCount: 'messageNotification.records.detail.unreported',
  })
  assert.ok(detail.summary.value.every(item => item.missing))
  assert.equal(detail.sentContent.value, 'messageNotification.records.detail.unreported')
  assert.equal(detail.canGoTemplate.value, false)
  record.value = { id: 'raw', notifyTime: 0, notifyMessage: '  ${oldVariable}<script>text only</script>\nsecond line  ' }
  assert.equal(values().notifyTime, presentation.historyTime(0))
  assert.equal(detail.sentContent.value, record.value.notifyMessage)
  mounted.unmount()
})

test('template names load only for visible authorized details and ignore responses from previous records', async () => {
  const { useRecordDetail } = load(resolve(pageRoot, 'useRecordDetail.ts'))
  const requests = []
  io.getTemplate = id => {
    const response = deferred()
    requests.push({ id, ...response })
    return response.promise
  }
  const record = vue.ref(fixture('first'))
  const open = vue.ref(false)
  let detail
  const Harness = vue.defineComponent({ setup() { detail = useRecordDetail(record, open, () => {}); return () => null } })
  const mounted = mount(Harness)
  const template = () => detail.summary.value.find(item => item.key === 'messageTemplate')
  assert.equal(io.templateCalls.length, 0)
  open.value = true
  assert.equal(template().value, 'messageNotification.common.loading')
  assert.equal(template().missing, true)
  record.value = { ...fixture('second'), templateId: 'template-second' }
  assert.deepEqual(io.templateCalls, ['template-old', 'template-second'])
  requests[1].resolve({ id: 'template-second', name: 'Second template' })
  await flush()
  assert.equal(template().value, 'Second template')
  requests[0].resolve({ id: 'template-old', name: 'Stale template' })
  await flush()
  assert.equal(template().value, 'Second template')
  io.permission.value = false
  assert.equal(template().value, 'messageNotification.records.detail.unreported')
  assert.equal(io.templateCalls.length, 2)
  io.permission.value = true
  open.value = false
  requests[2].resolve({ id: 'template-second', name: 'Response after close' })
  await flush()
  assert.equal(template().value, 'messageNotification.records.detail.unreported')
  open.value = true
  mounted.unmount()
  requests[3].resolve({ id: 'template-second', name: 'Response after unmount' })
  await flush()
  assert.notEqual(template().value, 'Response after unmount')
})

test('unavailable or mismatched template metadata never displays the ID as a name', async () => {
  const { useRecordDetail } = load(resolve(pageRoot, 'useRecordDetail.ts'))
  io.getTemplate = async () => { throw { response: { status: 404 } } }
  const record = vue.ref(fixture('deleted'))
  let detail
  const Harness = vue.defineComponent({ setup() { detail = useRecordDetail(record, vue.ref(true), () => {}); return () => null } })
  const mounted = mount(Harness)
  const template = () => detail.summary.value.find(item => item.key === 'messageTemplate')
  await flush()
  assert.equal(template().value, 'messageNotification.records.detail.unreported')
  assert.equal(template().missing, true)
  io.getTemplate = async () => ({ id: 'different-template', name: 'Wrong name' })
  record.value = { ...fixture('mismatch'), templateId: 'requested-template' }
  await flush()
  assert.equal(template().value, 'messageNotification.records.detail.unreported')
  io.getTemplate = async id => ({ id, name: '   ' })
  record.value = { ...fixture('blank'), templateId: 'blank-template' }
  await flush()
  assert.equal(template().value, 'messageNotification.records.detail.unreported')
  record.value = { id: 'unconfigured' }
  assert.equal(template().value, 'messageNotification.records.detail.unconfigured')
  assert.deepEqual(io.templateCalls, ['template-old', 'requested-template', 'blank-template'])
  mounted.unmount()
})
