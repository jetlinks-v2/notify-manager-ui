import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const vue = require('vue')
const directory = dirname(fileURLToPath(import.meta.url))
const moduleRoot = resolve(directory, '../../../..')
const modules = new Map()
let scenario
const success = result => ({ success: true, status: 200, result })
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const config = (id, type = 'sms', provider = `${type}-service`) => ({
  id, name: id, type, provider, configuration: { host: id },
})
const metadata = id => success({ properties: [{ id, valueType: { type: 'string' } }] })
const bulkPath = '/notifier/config/_query/no-paging'

// 运行真实 Vue hook、model 和 API 封装，只替换 HTTP 传输、路由和用户反馈。
async function request(method, url, body) {
  const current = scenario
  const call = { method, url, body }
  current.calls.push(call)
  const overridden = current.respond?.(call)
  if (overridden !== undefined) return overridden
  if (url === '/notify/channel/providers') {
    return success(current.types.map(type => ({ id: `notifier-${type}`, name: type })))
  }
  if (url === '/notify/channel/all-for-save') return success(current.topics)
  if (url.endsWith('/_query-with-templates')) return success({ channels: [] })
  if (url === bulkPath) {
    return success(current.configs.filter(item => body.terms[0].value.includes(item.type)))
  }
  const providers = url.match(/^\/notifier\/config\/type\/([^/]+)\/providers$/)
  if (providers) {
    return success([...new Set(current.configs.filter(item => item.type === providers[1])
      .map(item => item.provider).concat(`${providers[1]}-service`))].map(id => ({ id })))
  }
  if (url.endsWith('/metadata')) return metadata('host')
  if (url === '/notifier/config' && ['post', 'patch'].includes(method)) {
    const saved = { ...body, id: body.id || `${body.type}-created` }
    current.configs = [saved, ...current.configs.filter(item => item.id !== saved.id)]
    return success(saved)
  }
  throw new Error(`Unexpected request: ${method} ${url}`)
}

function loadModule(filename) {
  if (modules.has(filename)) return modules.get(filename)
  const { code } = transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' })
  const module = { exports: {} }
  const localRequire = specifier => {
    if (specifier === 'vue-router') return {
      useRoute: () => scenario.route,
      useRouter: () => ({ replace: ({ query }) => { scenario.route.query = query } }),
    }
    if (specifier === 'vue-i18n') return { useI18n: () => ({ t: key => key }) }
    if (specifier === '@jetlinks-web/utils') return { onlyMessage: (...args) => scenario.messages.push(args) }
    if (specifier === '@jetlinks-web-core/store/user') return { useUserStore: () => ({ userInfo: {} }) }
    if (specifier === '@jetlinks-web/core') return {
      request: Object.fromEntries(['get', 'post', 'put', 'patch'].map(method => [method,
        (url, body) => request(method, url, body)])),
    }
    if (specifier.startsWith('@notify-manager-ui/')) {
      return loadModule(resolve(moduleRoot, `${specifier.slice('@notify-manager-ui/'.length)}.ts`))
    }
    if (specifier.startsWith('.')) return loadModule(resolve(dirname(filename), `${specifier}.ts`))
    return require(specifier)
  }
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports)
  modules.set(filename, module.exports)
  return module.exports
}

const { useNoticeChannelCenter } = loadModule(resolve(directory, 'useNoticeChannelCenter.ts'))
const renderer = vue.createRenderer({
  createElement: type => ({ type, children: [] }), createText: text => ({ text }),
  createComment: text => ({ text }), setText() {}, setElementText() {}, patchProp() {},
  parentNode: node => node.parent, nextSibling: () => null,
  insert(node, parent) { node.parent = parent; parent.children.push(node) }, remove() {},
})
const flush = async () => { await new Promise(done => setImmediate(done)); await vue.nextTick() }
const queries = () => scenario.calls.filter(call => call.url === bulkPath)
const metadataCalls = () => scenario.calls.filter(call => call.url.endsWith('/metadata'))

function mount(options = {}) {
  scenario = {
    types: ['sms', 'email', 'webhook'],
    configs: [config('sms-current'), config('email-current', 'email')], topics: [],
    calls: [], messages: [], errors: [], ...options,
    route: vue.reactive({ query: { channelProvider: 'notifier-sms' } }),
  }
  let state
  const app = renderer.createApp({ setup() { state = useNoticeChannelCenter(); return () => null } })
  app.config.errorHandler = error => scenario.errors.push(error)
  app.mount({ children: [] })
  return { state, close: () => app.unmount() }
}

test('初始化一次批量查询，超过50条仍保留绑定配置，元数据只请求一次', async () => {
  const many = Array.from({ length: 60 }, (_, index) => config(`sms-${index}`))
  const bound = config('sms-legacy', 'sms', 'legacy-service')
  const mounted = mount({
    configs: [...many, bound, config('email-current', 'email'), config('excluded', 'sms', 'officialMessage')],
    topics: [{ id: 'topic', channels: [{ channelProvider: 'notifier-sms', channelConfiguration: { notifierId: bound.id } }] }],
  })
  try {
    await mounted.state.reload()
    await flush()
    assert.equal(queries().length, 1)
    assert.deepEqual(queries()[0].body.terms, [{ column: 'type', termType: 'in', value: ['sms', 'email', 'webhook'] }])
    assert.equal(queries()[0].body.pageSize, undefined)
    assert.equal(scenario.calls.some(call => call.url === '/notifier/config/_query'), false)
    assert.equal(mounted.state.selectedChannel.value.config.id, bound.id)
    assert.equal(metadataCalls().length, 1)
    assert.equal(mounted.state.channelList.value.find(item => item.type === 'webhook').status, 'unconfigured')
  } finally { mounted.close() }
})

test('切换渠道复用配置快照和服务商目录，元数据每次选择只加载一次', async () => {
  const mounted = mount()
  try {
    await mounted.state.reload()
    await flush()
    mounted.state.selectProvider('notifier-email')
    await flush()
    assert.equal(mounted.state.draft.id, 'email-current')
    mounted.state.selectProvider('notifier-sms')
    await flush()
    assert.equal(mounted.state.draft.id, 'sms-current')
    assert.equal(queries().length, 1)
    assert.equal(metadataCalls().length, 3)
    assert.equal(scenario.calls.filter(call => call.url.endsWith('/providers') && call.url.includes('/type/')).length, 2)
  } finally { mounted.close() }
})

test('保存后仅刷新当前类型，回显后端值且保留其他渠道', async () => {
  const mounted = mount()
  try {
    await mounted.state.reload()
    await flush()
    mounted.state.draft.name = 'changed'
    mounted.state.draft.configuration.host = 'new-host'
    await mounted.state.saveCredential()
    await flush()
    assert.equal(queries().length, 2)
    assert.deepEqual(queries()[1].body.terms[0].value, ['sms'])
    assert.equal(mounted.state.draft.name, 'changed')
    assert.equal(mounted.state.draft.configuration.host, 'new-host')
    assert.equal(mounted.state.channelList.value.find(item => item.type === 'email').config.id, 'email-current')
    assert.equal(metadataCalls().length, 1)
  } finally { mounted.close() }
})

test('空配置可新增，保存后回显新ID并复用列表快照', async () => {
  const mounted = mount({ configs: [] })
  try {
    await mounted.state.reload()
    await flush()
    assert.equal(mounted.state.selectedChannel.value.status, 'unconfigured')
    mounted.state.draft.name = 'created'
    await mounted.state.saveCredential()
    assert.equal(mounted.state.draft.id, 'sms-created')
    assert.equal(mounted.state.selectedChannel.value.status, 'configured')
    assert.equal(queries().length, 2)
  } finally { mounted.close() }
})

test('保存期间切换服务商，旧保存完成后不覆盖当前编辑草稿', async () => {
  const pending = deferred()
  const mounted = mount({
    configs: [config('sms-current'), config('sms-other', 'sms', 'other-service')],
    respond: ({ method, url }) => method === 'patch' && url === '/notifier/config' ? pending.promise : undefined,
  })
  try {
    await mounted.state.reload()
    await flush()
    const saving = mounted.state.saveCredential()
    mounted.state.draft.provider = 'other-service'
    await flush()
    mounted.state.draft.configuration.host = 'unsaved-other-host'
    pending.resolve(success(config('sms-current')))
    await saving
    assert.equal(mounted.state.draft.id, 'sms-other')
    assert.equal(mounted.state.draft.configuration.host, 'unsaved-other-host')
    assert.deepEqual(queries()[1].body.terms[0].value, ['sms'])
    assert.equal(mounted.state.saving.value, false)
  } finally { mounted.close() }
})

test('刷新替换权限快照，空结果不会保留上一范围的配置', async () => {
  const mounted = mount()
  try {
    await mounted.state.reload()
    await flush()
    assert.equal(mounted.state.draft.id, 'sms-current')
    scenario.configs = []
    await mounted.state.reload()
    await flush()
    assert.equal(queries().length, 2)
    assert.equal(mounted.state.draft.id, undefined)
    assert.equal(mounted.state.selectedChannel.value.status, 'unconfigured')
    assert.equal(mounted.state.channelList.value.every(item => item.config === undefined), true)
  } finally { mounted.close() }
})

test('列表查询失败可重试，加载状态恢复且不会缓存失败结果', async () => {
  let fail = true
  const mounted = mount({ respond: ({ url }) => url === bulkPath && fail ? Promise.reject(new Error('unavailable')) : undefined })
  try {
    await assert.rejects(mounted.state.reload(), /unavailable/)
    assert.equal(mounted.state.loading.value, false)
    assert.equal(mounted.state.detailLoading.value, false)
    fail = false
    await mounted.state.reload()
    await flush()
    assert.equal(mounted.state.draft.id, 'sms-current')
    assert.equal(queries().length, 2)
  } finally { mounted.close() }
})

test('A→B→A合并进行中的元数据请求，旧响应不能覆盖当前表单', async () => {
  const sms = deferred()
  const email = deferred()
  const mounted = mount({ respond: ({ url }) => {
    if (!url.endsWith('/metadata')) return
    return url.includes('/sms/') ? sms.promise : email.promise
  } })
  try {
    await mounted.state.reload()
    await flush()
    mounted.state.selectProvider('notifier-email')
    await flush()
    mounted.state.selectProvider('notifier-sms')
    await flush()
    assert.equal(metadataCalls().filter(call => call.url.includes('/sms/')).length, 1)
    sms.resolve(metadata('sms-field'))
    await flush()
    assert.equal(mounted.state.draft.id, 'sms-current')
    assert.equal(mounted.state.detailLoading.value, false)
    email.resolve(metadata('email-field'))
    await flush()
    assert.equal(mounted.state.draft.id, 'sms-current')
    assert.deepEqual(mounted.state.selectedChannel.value.metadata.map(item => item.id), ['sms-field'])
    assert.equal(queries().length, 1)
  } finally { mounted.close() }
})

test('服务商切换只请求一次元数据，失败后可再次选择重试', async () => {
  let fail = true
  const mounted = mount({
    configs: [config('sms-current'), config('sms-other', 'sms', 'other-service')],
    respond: ({ url }) => url.endsWith('/other-service/metadata') && fail ? Promise.reject(new Error('metadata unavailable')) : undefined,
  })
  try {
    await mounted.state.reload()
    await flush()
    mounted.state.draft.provider = 'other-service'
    await flush()
    assert.equal(scenario.errors.length, 1)
    assert.equal(mounted.state.detailLoading.value, false)
    assert.equal(mounted.state.draft.id, undefined)
    mounted.state.draft.provider = 'sms-service'
    await flush()
    fail = false
    mounted.state.draft.provider = 'other-service'
    await flush()
    assert.equal(mounted.state.draft.id, 'sms-other')
    assert.equal(metadataCalls().filter(call => call.url.includes('/other-service/')).length, 2)
    assert.equal(queries().length, 1)
  } finally { mounted.close() }
})

test('新的刷新完成后，旧权限查询迟到不能覆盖新快照', async () => {
  const old = deferred()
  let count = 0
  const mounted = mount({ respond: ({ url }) => url === bulkPath && ++count === 1 ? old.promise : undefined })
  try {
    const first = mounted.state.reload()
    await flush()
    scenario.configs = [config('new-scope')]
    await mounted.state.reload()
    await flush()
    old.resolve(success([config('old-scope')]))
    await first
    await flush()
    assert.equal(mounted.state.draft.id, 'new-scope')
    assert.equal(mounted.state.loading.value, false)
  } finally { mounted.close() }
})

test('离开页面后，进行中的元数据响应不再回填表单', async () => {
  const pending = deferred()
  const mounted = mount({ respond: ({ url }) => url.endsWith('/metadata') ? pending.promise : undefined })
  await mounted.state.reload()
  await flush()
  mounted.close()
  pending.resolve(metadata('late-field'))
  await flush()
  assert.equal(mounted.state.draft.id, undefined)
})
