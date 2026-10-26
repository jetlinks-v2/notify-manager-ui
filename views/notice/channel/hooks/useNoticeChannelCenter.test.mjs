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
  if (url === '/notify/channel/all-for-save' || url.endsWith('/_query-with-templates')) {
    if (current.mode === 'template' && url === '/notify/channel/all-for-save') return success(current.topics)
    throw new Error('403: no template or channel management permission')
  }
  if (current.mode === 'template') {
    if (url === '/notifier/config/_query') return success(current.configs)
    if (url.endsWith('/variables')) return success([])
    const target = url.match(/^\/notify\/channel\/topic\/([^/]+)\/_(query-with-template|save-with-template)$/)
    if (target) {
      if (current.denied?.includes(target[1])) throw new Error('403: inaccessible configuration')
      if (method === 'put') current.templates[target[1]] = structuredClone(body)
      return success(current.templates[target[1]])
    }
  }
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
    if (specifier === '@jetlinks-web-core/store/user') return { useUserStore: () => ({ userInfo: scenario.userInfo || {} }) }
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
const { useNoticeTemplateCenter } = loadModule(resolve(directory, '../../template/hooks/useNoticeTemplateCenter.ts'))
const renderer = vue.createRenderer({
  createElement: type => ({ type, children: [] }), createText: text => ({ text }),
  createComment: text => ({ text }), setText() {}, setElementText() {}, patchProp() {},
  parentNode: node => node.parent, nextSibling: () => null,
  insert(node, parent) { node.parent = parent; parent.children.push(node) }, remove() {},
})
const flush = async () => { await new Promise(done => setImmediate(done)); await vue.nextTick() }
const queries = () => scenario.calls.filter(call => call.url === bulkPath)
const metadataCalls = () => scenario.calls.filter(call => call.url.endsWith('/metadata'))

function mount(options = {}, createHook = useNoticeChannelCenter) {
  scenario = {
    types: ['sms', 'email', 'webhook'],
    configs: [config('sms-current'), config('email-current', 'email')], topics: [],
    calls: [], messages: [], errors: [], ...options,
    route: vue.reactive({ query: { channelProvider: 'notifier-sms' } }),
  }
  let state
  const app = renderer.createApp({ setup() { state = createHook(); return () => null } })
  app.config.errorHandler = error => scenario.errors.push(error)
  app.mount({ children: [] })
  return { state, close: () => app.unmount() }
}

test('只有凭证权限时一次批量查询，超过50条配置仍可显式选择，不依赖主题模板', async () => {
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
    assert.equal(mounted.state.selectedChannel.value.config, undefined)
    assert.equal(mounted.state.canSave.value, false)
    assert.equal(mounted.state.currentConfigs.value.length, 61)
    await mounted.state.selectConfig(bound.id)
    assert.equal(mounted.state.selectedChannel.value.config.id, bound.id)
    assert.equal(mounted.state.draft.id, bound.id)
    assert.equal(mounted.state.draft.provider, bound.provider)
    assert.equal(metadataCalls().length, 2)
    assert.equal(scenario.calls.some(call => call.url.includes('/notify/channel/all-for-save') || call.url.endsWith('/_query-with-templates')), false)
    assert.equal(mounted.state.channelList.value.find(item => item.type === 'webhook').status, 'unconfigured')
  } finally { mounted.close() }
})

function mountTemplate(options = {}) {
  const channel = channelProvider => ({ id: channelProvider, providerId: 'topic', channelProvider, state: 'enabled' })
  return mount({
    mode: 'template', types: ['email', 'sms'],
    configs: [config('email-current', 'email'), config('sms-current')],
    topics: [{ id: 'topic', provider: 'alarm', state: 'enabled', channels: [channel('notifier-email'), channel('notifier-sms')] }],
    templates: {
      'notifier-email': { channel: channel('notifier-email'), template: { id: 'email-template', configId: 'email-current', type: 'email', provider: 'email-service', name: 'email', template: { subject: 'original', text: 'body' } } },
      'notifier-sms': { channel: channel('notifier-sms'), template: { id: 'sms-template', configId: 'sms-current', type: 'sms', provider: 'sms-service', name: 'sms' } },
    }, ...options,
  }, useNoticeTemplateCenter)
}

test('模板页独立读取和保存有权通道，不提交Provider或无权兄弟通道', async () => {
  const mounted = mountTemplate({ denied: ['notifier-sms'] })
  try {
    await mounted.state.reload()
    await flush()
    assert.equal(mounted.state.templateDetail.value.id, 'email-template')
    await mounted.state.saveTemplate({ name: 'edited', type: 'email', provider: 'email-service', configId: 'email-current', template: { subject: 'changed', text: 'body' }, variableDefinitions: [] })
    await flush()
    const save = scenario.calls.find(call => call.method === 'put')
    assert.equal(save.url, '/notify/channel/topic/notifier-email/_save-with-template')
    assert.equal(save.body.provider, undefined)
    assert.equal(save.body.channels, undefined)
    assert.equal(save.body.template.configId, 'email-current')
    assert.equal(scenario.templates['notifier-sms'].template.name, 'sms')
    assert.equal(scenario.calls.some(call => call.url.endsWith('/_query-with-templates') || call.url.endsWith('/_save-with-templates')), false)
    mounted.state.selectChannel('topic', 'notifier-sms')
    await flush()
    assert.equal(mounted.state.detailReady.value, false)
    assert.equal(mounted.state.templateDetail.value, undefined)
    assert.equal(scenario.errors.length, 1)
    const count = scenario.calls.length
    await mounted.state.saveTemplate({ name: 'forbidden' })
    assert.equal(scenario.calls.length, count)
  } finally { mounted.close() }
})

test('已禁用主题的单通道编辑不启用或重写主题全局状态', async () => {
  const mounted = mountTemplate({ topics: [{ id: 'topic', provider: 'alarm', state: 'disabled' }] })
  try {
    await mounted.state.reload()
    await flush()
    assert.equal(mounted.state.templateDetail.value.id, 'email-template')
    await mounted.state.saveTemplate({ name: 'edited', type: 'email', provider: 'email-service', configId: 'email-current', template: { subject: 'title', text: 'body' }, variableDefinitions: [] })
    assert.equal(scenario.calls.some(call => call.url.endsWith('/enable')), false)
    assert.equal(scenario.topics[0].state, 'disabled')
  } finally { mounted.close() }
})

test('模板详情A→B→A的迟到响应不能覆盖当前通道', async () => {
  const old = deferred()
  let emailQueries = 0
  const mounted = mountTemplate({ respond: ({ url }) => url.endsWith('/notifier-email/_query-with-template') && ++emailQueries === 1 ? old.promise : undefined })
  try {
    await mounted.state.reload()
    await flush()
    mounted.state.selectChannel('topic', 'notifier-sms')
    await flush()
    assert.equal(mounted.state.templateDetail.value.id, 'sms-template')
    mounted.state.selectChannel('topic', 'notifier-email')
    await flush()
    assert.equal(mounted.state.templateDetail.value.id, 'email-template')
    old.resolve(success({ channel: { channelProvider: 'notifier-email' }, template: { id: 'stale-template' } }))
    await flush()
    assert.equal(mounted.state.templateDetail.value.id, 'email-template')
    assert.equal(mounted.state.detailReady.value, true)
  } finally { mounted.close() }
})

test('模板保存期间切换通道，旧响应不覆盖新选择或重载主题树', async () => {
  const pending = deferred()
  const mounted = mountTemplate({ respond: ({ method }) => method === 'put' ? pending.promise : undefined })
  try {
    await mounted.state.reload()
    await flush()
    const before = scenario.calls.filter(call => call.url === '/notify/channel/all-for-save').length
    const saving = mounted.state.saveTemplate({ name: 'edited', type: 'email', provider: 'email-service', configId: 'email-current', template: {}, variableDefinitions: [] })
    mounted.state.selectChannel('topic', 'notifier-sms')
    await flush()
    pending.resolve(success(scenario.templates['notifier-email']))
    await saving
    assert.equal(mounted.state.selectedChannel.value.channelProvider, 'notifier-sms')
    assert.equal(mounted.state.templateDetail.value.id, 'sms-template')
    assert.equal(scenario.calls.filter(call => call.url === '/notify/channel/all-for-save').length, before)
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
    await mounted.state.selectConfig('sms-current')
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

test('同服务商多配置保存和测试只使用显式选中ID，撤权刷新不自动改选', async () => {
  const mounted = mount({
    configs: [config('sms-a'), config('sms-b')],
    userInfo: { telephone: '13800000000' },
    respond: ({ url }) => url === '/notifier/sms-b/_send' ? success(true) : undefined,
  })
  try {
    await mounted.state.reload()
    await flush()
    await mounted.state.saveCredential()
    assert.equal(scenario.calls.some(call => call.method === 'patch'), false)
    await mounted.state.selectConfig('sms-b')
    mounted.state.draft.name = 'updated-b'
    await mounted.state.saveCredential()
    assert.equal(scenario.calls.find(call => call.method === 'patch').body.id, 'sms-b')
    await mounted.state.sendTest()
    assert.equal(scenario.calls.some(call => call.url === '/notifier/sms-b/_send'), true)
    scenario.configs = [config('sms-a')]
    await mounted.state.reload()
    await flush()
    assert.equal(mounted.state.draft.id, undefined)
    assert.equal(mounted.state.selectedChannel.value.config, undefined)
    assert.equal(mounted.state.canSave.value, false)
    const before = scenario.calls.length
    await mounted.state.saveCredential()
    await mounted.state.sendTest()
    assert.equal(scenario.calls.length, before)
    await mounted.state.selectConfig('sms-a')
    assert.equal(mounted.state.draft.id, 'sms-a')
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
