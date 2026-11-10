import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../views/system/MessageNotification/Channels')
const moduleRoot = resolve(import.meta.dirname, '..')
let routeGuard
let pageContext
const dependencies = {
  vue,
  'vue-i18n': { useI18n: () => ({ t: (key, args) => args ? `${key}:${JSON.stringify(args)}` : key }) },
  'vue-router': { onBeforeRouteLeave: guard => { routeGuard = guard }, useRoute: () => pageContext.route, useRouter: () => pageContext.router },
  '@jetlinks-web/core': { request: {} },
  '@jetlinks-web/hooks': { usePermission: code => ({ hasPerm: pageContext.permissions.get(code) }) },
  '@vueuse/core': { useWindowSize: () => ({ width: pageContext.width }) },
  '@jetlinks-web/utils': { onlyMessage: (...args) => pageContext.messages.push(args) },
  '@jetlinks-web-core/store/menu': { useMenuStore: () => ({ jumpPage: (...args) => pageContext.jumps.push(args) }) },
}
const cache = new Map()

// Execute real workspace, schema, send/leave hooks and editor SFCs; HTTP remains injected test I/O.
function load(filename) {
  if (!/\.(ts|vue)$/.test(filename)) filename = existsSync(`${filename}.ts`) ? `${filename}.ts` : resolve(filename, 'index.ts')
  if (cache.has(filename)) return cache.get(filename)
  let source = readFileSync(filename, 'utf8')
  if (filename.endsWith('.vue')) source = compileScript(parse(source, { filename }).descriptor, { id: filename, inlineTemplate: true }).content
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs' })
  const module = { exports: {} }
  const imports = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    if (name.startsWith('.')) return load(resolve(dirname(filename), name))
    if (name.startsWith('@notify-manager-ui/')) return load(resolve(moduleRoot, name.slice('@notify-manager-ui/'.length)))
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(imports, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}

const { useChannelWorkspace } = load(resolve(root, 'useChannelWorkspace.ts'))
const { createChannelConfigDraft, channelConfigPayload, validateChannelDraft, parseChannelSendVariables } = load(resolve(root, 'channelSchema.ts'))
const { useChannelSend, missingChannelSendParameters } = load(resolve(root, 'useChannelSend.ts'))
const { useChannelLeaveGuard } = load(resolve(root, 'useChannelLeaveGuard.ts'))
const { useChannelsPage } = load(resolve(root, 'useChannelsPage.ts'))
const { useChannelSendDrawer } = load(resolve(root, 'useChannelSendDrawer.ts'))
const { useConfigurationPairs } = load(resolve(root, 'useConfigurationPairs.ts'))
const { notificationChannels, notificationPermissions } = load(resolve(root, '../shared/index.ts'))
const ChannelConfiguration = load(resolve(root, 'ChannelConfiguration.vue')).default

const clone = value => JSON.parse(JSON.stringify(value))
const email = (id = 'smtp-real') => ({ id, name: id, type: 'email', provider: 'embedded', configuration: { host: 'smtp.example.org', port: 587, username: 'sender', password: 'saved-password', properties: [{ name: 'mail.smtp.auth', value: 'true' }], preservedExtension: { value: 1 } } })
const sms = () => ({ id: 'sms-real', name: 'SMS', type: 'sms', provider: 'aliyunSms', configuration: { accessKeyId: 'key', secret: 'saved-secret' } })
const permissions = () => Object.fromEntries(['query', 'add', 'update', 'delete', 'action'].map(key => [key, vue.ref(true)]))

function testApi(initial = [email()]) {
  const records = new Map(initial.map(record => [record.id, clone(record)]))
  const calls = []
  const api = {
    async queryConfigs(query) { calls.push(['queryConfigs', clone(query)]); return { data: [...records.values()].map(clone) } },
    async getConfig(id) { calls.push(['getConfig', id]); return clone(records.get(id)) },
    async createConfig(payload) { calls.push(['createConfig', clone(payload)]); records.set(payload.id, clone(payload)); return undefined },
    async updateConfig(payload) { calls.push(['updateConfig', clone(payload)]); records.set(payload.id, clone(payload)); return undefined },
    async deleteConfig(id) { calls.push(['deleteConfig', id]); records.delete(id) },
    async queryTemplates(query) { calls.push(['queryTemplates', clone(query)]); return { data: [] } },
    async getTemplate(id) { calls.push(['getTemplate', id]); return undefined },
    async createTemplate() {}, async updateTemplate() {}, async deleteTemplate() {},
    async send(...args) { calls.push(['send', ...clone(args)]) },
  }
  return { api, calls, records }
}

test('multiple real configs require explicit selection and maintain separate drafts through switches', async () => {
  const io = testApi([email('one'), email('two'), sms()])
  const navigations = []
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions(), navigate: value => navigations.push(value) })
  await workspace.activate('email:embedded')
  assert.equal(workspace.state.value, 'ready')
  assert.equal(workspace.entry.value, undefined)
  assert.equal(io.calls.some(([method]) => method === 'getConfig'), false)
  await workspace.selectConfig('two')
  assert.equal(workspace.entry.value.draft.configuration.password, '')
  workspace.changeField('name', 'edited two', true)
  workspace.changeField('password', 'new-secret')
  await workspace.selectConfig('one')
  workspace.changeField('name', 'edited one', true)
  await workspace.activate('sms:aliyunSms')
  assert.equal(workspace.entry.value.draft.id, 'sms-real')
  await workspace.activate('email:embedded', 'two')
  assert.equal(workspace.entry.value.draft.name, 'edited two')
  assert.equal(workspace.entry.value.draft.configuration.password, 'new-secret')
  assert.equal(workspace.hasUnsavedChanges.value, true)
  assert.deepEqual(navigations.at(-1), { channel: 'email:embedded', configId: 'two' })
  assert.equal(JSON.stringify(navigations).includes('new-secret'), false)
})

test('denied, unavailable, empty and request failure states cannot become successful empty results', async () => {
  const io = testApi([])
  const perms = permissions()
  perms.query.value = false
  const workspace = useChannelWorkspace({ api: io.api, permissions: perms })
  await workspace.activate('email:embedded')
  assert.equal(workspace.state.value, 'forbidden')
  assert.equal(io.calls.length, 0)
  await workspace.activate('inbox:embedded')
  assert.equal(workspace.state.value, 'unavailable')
  assert.equal(io.calls.length, 0)
  perms.query.value = true
  await workspace.activate('email:embedded')
  assert.equal(workspace.state.value, 'empty')
  io.api.queryConfigs = async () => { throw new Error('offline') }
  await workspace.activate('email:embedded')
  assert.equal(workspace.state.value, 'error')
  io.api.queryConfigs = async () => { throw { response: { status: 403 } } }
  await workspace.activate('email:embedded')
  assert.equal(workspace.state.value, 'forbidden')
})

test('late list responses cannot replace the newly selected provider', async () => {
  const io = testApi([email(), sms()])
  let releaseList
  io.api.queryConfigs = query => query.terms.some(term => term.value === 'email') ? new Promise(resolve => { releaseList = resolve }) : Promise.resolve({ data: [sms()] })
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions() })
  const pending = workspace.activate('email:embedded')
  await workspace.activate('sms:aliyunSms')
  releaseList({ data: [email()] })
  await pending
  assert.equal(workspace.channelId.value, 'sms:aliyunSms')
  assert.equal(workspace.entry.value.draft.id, 'sms-real')
})

test('late detail responses cannot expose another provider after navigation', async () => {
  const io = testApi([email(), sms()])
  let release
  const getConfig = io.api.getConfig
  io.api.getConfig = id => id === 'smtp-real' ? new Promise(resolve => { release = resolve }) : getConfig(id)
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions() })
  const pending = workspace.activate('email:embedded')
  await Promise.resolve()
  await workspace.activate('sms:aliyunSms')
  release(email())
  await pending
  assert.equal(workspace.entry.value.draft.id, 'sms-real')
  assert.equal(workspace.selectedConfigId.value, 'sms-real')
})

test('failed saves preserve every input; a later success retains the known secret and extension fields', async () => {
  const io = testApi()
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions() })
  await workspace.activate('email:embedded')
  workspace.changeField('host', 'smtp.updated.example.org')
  workspace.changeField('password', 'typed-secret')
  const update = io.api.updateConfig
  io.api.updateConfig = async () => { throw new Error('offline') }
  assert.equal(await workspace.save(), false)
  assert.equal(workspace.entry.value.draft.configuration.password, 'typed-secret')
  assert.equal(workspace.entry.value.draft.configuration.host, 'smtp.updated.example.org')
  assert.equal(workspace.dirty.value, true)
  assert.equal(workspace.entry.value.failure, 'error')
  io.api.updateConfig = update
  assert.equal(await workspace.save(), true)
  assert.equal(workspace.dirty.value, false)
  assert.equal(workspace.entry.value.draft.configuration.password, '')
  assert.equal(io.records.get('smtp-real').configuration.password, 'typed-secret')
  assert.deepEqual(io.records.get('smtp-real').configuration.preservedExtension, { value: 1 })
  workspace.changeField('name', 'Rename only', true)
  assert.equal(await workspace.save(), true)
  assert.equal(io.records.get('smtp-real').configuration.password, 'typed-secret')
})

test('masked saved credentials block unsafe update and permission checks protect mutations', async () => {
  const record = email()
  record.configuration.password = '******'
  const io = testApi([record])
  const perms = permissions()
  const workspace = useChannelWorkspace({ api: io.api, permissions: perms })
  await workspace.activate('email:embedded')
  workspace.changeField('name', 'Renamed', true)
  assert.equal(await workspace.save(), false)
  assert.deepEqual(workspace.entry.value.issues, [{ path: 'password', key: 'secretRequired' }])
  workspace.changeField('password', 're-entered')
  perms.update.value = false
  assert.equal(await workspace.save(), false)
  assert.equal(workspace.entry.value.draft.configuration.password, 're-entered')
  perms.update.value = true
  assert.equal(await workspace.save(), true)
  perms.delete.value = false
  assert.equal(await workspace.deleteConfig(), false)
  assert.equal(io.calls.some(([method]) => method === 'deleteConfig'), false)
})

test('new config uses the explicitly supplied ID and never guesses an ID from a mutation response', async () => {
  const io = testApi([])
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions() })
  await workspace.activate('email:embedded')
  workspace.createConfig()
  workspace.changeField('name', 'New SMTP', true)
  workspace.changeField('host', 'smtp.example.org')
  assert.equal(await workspace.save(), false)
  assert.equal(io.calls.some(([method]) => method === 'createConfig'), false)
  workspace.changeField('id', 'explicit/real-id', true)
  assert.equal(await workspace.save(), true)
  assert.equal(io.calls.find(([method]) => method === 'createConfig')[1].id, 'explicit/real-id')
  assert.equal(workspace.selectedConfigId.value, 'explicit/real-id')
  workspace.changeField('name', 'Updated actual', true)
  assert.equal(await workspace.save(), true)
  assert.equal(io.calls.filter(([method]) => method === 'createConfig').length, 1)
  assert.equal(io.calls.filter(([method]) => method === 'updateConfig').length, 1)
})

test('known write success survives refresh failure without repeating a create', async () => {
  const io = testApi([])
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions() })
  await workspace.activate('email:embedded')
  workspace.createConfig()
  workspace.changeField('id', 'real-id', true)
  workspace.changeField('name', 'SMTP', true)
  workspace.changeField('host', 'smtp.example.org')
  io.api.queryConfigs = async () => { throw new Error('refresh failed') }
  assert.equal(await workspace.save(), true)
  assert.equal(workspace.state.value, 'error')
  assert.equal(workspace.hasUnsavedChanges.value, false)
  assert.equal(io.calls.filter(([method]) => method === 'createConfig').length, 1)
  io.api.queryConfigs = async () => ({ data: [...io.records.values()] })
  await workspace.activate('email:embedded', 'real-id')
  assert.equal(workspace.entry.value.isNew, false)
})

test('reset and deletion affect only the current actual configuration', async () => {
  const io = testApi([email('one'), email('two')])
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions() })
  await workspace.activate('email:embedded', 'one')
  workspace.changeField('name', 'Preserved other draft', true)
  await workspace.selectConfig('two')
  workspace.changeField('host', 'wrong')
  workspace.resetDraft()
  assert.equal(workspace.entry.value.draft.configuration.host, 'smtp.example.org')
  assert.equal(await workspace.deleteConfig(), true)
  assert.equal(io.records.has('two'), false)
  assert.equal(io.records.has('one'), true)
  assert.equal(workspace.entry.value.draft.name, 'Preserved other draft')
})

test('SMTP fields and confidential HTTP header rows follow actual schema and safe empty semantics', () => {
  const invalid = { id: 'one', name: 'Name', type: 'email', provider: 'embedded', configuration: { host: '', port: 65536, properties: [{ name: '', value: 'x' }] } }
  assert.deepEqual(validateChannelDraft(invalid).map(issue => issue.path), ['host', 'port', 'properties'])
  const record = { id: 'hook', name: 'Hook', type: 'webhook', provider: 'http', configuration: { url: 'https://example.org', headers: [{ key: 'Authorization', value: 'Bearer stored' }], extension: 'keep' } }
  const draft = createChannelConfigDraft(record)
  assert.equal(draft.configuration.headers[0].value, '')
  assert.deepEqual(validateChannelDraft(draft, record), [])
  assert.equal(channelConfigPayload(draft, record).configuration.headers[0].value, 'Bearer stored')
  draft.configuration.headers[0].value = '******'
  assert.equal(channelConfigPayload(draft, record).configuration.headers[0].value, 'Bearer stored')
  record.configuration.headers[0].value = '******'
  assert.equal(validateChannelDraft(draft, record).some(issue => issue.path === 'headers' && issue.key === 'secretRequired'), true)
  draft.configuration.headers[0].value = 'Bearer replacement'
  assert.equal(channelConfigPayload(draft, record).configuration.headers[0].value, 'Bearer replacement')
  draft.configuration.headers = []
  assert.deepEqual(channelConfigPayload(draft, record).configuration.headers, [])
})

const template = () => ({ id: 'template-real', name: 'Actual template', type: 'email', provider: 'embedded', template: { subject: 'Hello', text: 'Body', sendTo: [], attachments: [{ name: 'Log', location: '' }] }, variableDefinitions: [{ id: 'code', required: true, type: 'string' }] })

test('trial email requires an actual compatible template, recipients and all dynamic attachment parameters', async () => {
  const io = testApi()
  const actual = template()
  io.api.queryTemplates = async () => ({ data: [actual, { ...actual, id: 'wrong-config', configId: 'other' }] })
  io.api.getTemplate = async () => actual
  const send = useChannelSend(io.api)
  const context = { channel: notificationChannels[0], configId: 'smtp-real', permitted: () => true, clean: () => true }
  await send.show(context)
  assert.equal(send.templates.value.length, 1)
  assert.equal(send.selected.value, undefined)
  assert.equal(await send.send(), false)
  await send.selectTemplate('template-real')
  assert.deepEqual(send.missing.value.sort(), ['_attach_location_1', 'code', 'sendTo'])
  send.parameters.value = '{"code":"42","sendTo":["recipient@example.org"]}'
  assert.equal(await send.send(), false)
  send.parameters.value = '{"code":"42","sendTo":["recipient@example.org"],"_attach_location_1":"file-id"}'
  assert.equal(send.canSend.value, true)
  assert.equal(await send.send(), true)
  assert.deepEqual(io.calls.find(([method]) => method === 'send'), ['send', 'smtp-real', 'template-real', { code: '42', sendTo: ['recipient@example.org'], _attach_location_1: 'file-id' }])
  assert.equal(send.sent.value, true)
  assert.equal(missingChannelSendParameters({ ...actual, template: { sendTo: ['fixed@example.org'] }, variableDefinitions: [] }, {}).length, 0)
})

test('trial failures retain input, permission/dirty/unknown-provider paths do not send', async () => {
  const io = testApi()
  const actual = { ...template(), template: { sendTo: ['fixed@example.org'] }, variableDefinitions: [] }
  io.api.queryTemplates = async () => ({ data: [actual] })
  io.api.getTemplate = async () => actual
  const permitted = vue.ref(true)
  const clean = vue.ref(true)
  const send = useChannelSend(io.api)
  await send.show({ channel: notificationChannels[0], configId: 'smtp-real', permitted: () => permitted.value, clean: () => clean.value })
  await send.selectTemplate(actual.id)
  send.parameters.value = '[]'
  assert.equal(await send.send(), false)
  send.parameters.value = '{"custom":"keep"}'
  clean.value = false
  assert.equal(await send.send(), false)
  clean.value = true
  permitted.value = false
  assert.equal(await send.send(), false)
  permitted.value = true
  io.api.send = async () => { throw new Error('offline') }
  assert.equal(await send.send(), false)
  assert.equal(send.error.value, 'error')
  assert.equal(send.sent.value, false)
  assert.equal(send.parameters.value, '{"custom":"keep"}')
  send.close()
  assert.equal(send.parameters.value, '{}')
  await send.show({ channel: notificationChannels[1], configId: 'ding', permitted: () => true, clean: () => true })
  assert.equal(send.state.value, 'unavailable')
  assert.equal(parseChannelSendVariables('null'), undefined)
  assert.equal(parseChannelSendVariables('invalid'), undefined)
})

test('an active trial freezes channel/config navigation and displays its original actual config ID', async () => {
  const io = testApi([email(), sms()])
  const actual = { ...template(), template: { sendTo: ['fixed@example.org'] }, variableDefinitions: [] }
  io.api.queryTemplates = async () => ({ data: [actual] })
  io.api.getTemplate = async () => actual
  let release
  io.api.send = () => new Promise(resolve => { release = resolve })
  const trial = useChannelSend(io.api)
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions(), blocked: trial.sending })
  await workspace.activate('email:embedded')
  await trial.show({ channel: notificationChannels[0], configId: 'smtp-real', permitted: () => true, clean: () => !workspace.dirty.value })
  await trial.selectTemplate(actual.id)
  const pending = trial.send()
  assert.equal(trial.sending.value, true)
  assert.equal(await trial.send(), false)
  await workspace.activate('sms:aliyunSms')
  workspace.createConfig()
  workspace.changeField('name', 'must not change', true)
  trial.close()
  assert.equal(workspace.channelId.value, 'email:embedded')
  assert.equal(workspace.selectedConfigId.value, 'smtp-real')
  assert.equal(workspace.entry.value.draft.name, 'smtp-real')
  assert.equal(trial.configId.value, 'smtp-real')
  assert.equal(trial.open.value, true)
  release(undefined)
  assert.equal(await pending, true)
  await workspace.activate('sms:aliyunSms')
  assert.equal(workspace.selectedConfigId.value, 'sms-real')
  trial.close()
  assert.equal(trial.configId.value, '')
})

const renderer = vue.createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {},
  setText() {}, setElementText() {}, patchProp() {}, parentNode: () => null, nextSibling: () => null,
})
const control = name => vue.defineComponent({ name, props: ['value', 'disabled', 'placeholder'], setup: (_, { slots }) => () => vue.h('control', slots.default?.()) })
function mount(component, props = {}) {
  const app = renderer.createApp({ setup: () => () => vue.h(component, props) })
  for (const name of ['a-form', 'a-form-item', 'a-input', 'a-input-password', 'a-input-number', 'a-typography-text', 'Editable', 'a-alert', 'a-button', 'AIcon']) app.component(name, control(name))
  app.mount({})
  return app
}
function* walk(node) {
  if (!node) return
  yield node
  if (node.component) yield* walk(node.component.subTree)
  if (Array.isArray(node.children)) for (const child of node.children) if (typeof child === 'object') yield* walk(child)
}

test('the actual editor passes empty password input and disabled inline controls with accessible names', () => {
  const original = email()
  const draft = createChannelConfigDraft(original)
  const entry = { key: 'record', draft, baseline: original, isNew: false, snapshot: JSON.stringify(draft), issues: [] }
  const app = mount(ChannelConfiguration, { entry, disabled: true })
  const nodes = [...walk(app._instance.subTree)]
  const password = nodes.find(node => node.type?.name === 'a-input-password')
  assert.equal(password.props.value, '')
  assert.equal(password.props.disabled, true)
  assert.equal(password.props['aria-label'], 'messageNotification.channels.fields.password')
  const editable = nodes.find(node => node.type?.name === 'Editable')
  assert.equal(editable.props['component-props'].disabled, true)
  assert.equal(editable.props.tabindex, -1)
  app.unmount()
})

test('actual leave hook keeps navigation pending, supports stay/leave and cleans up unload protection', async () => {
  const originalWindow = globalThis.window
  const listeners = new Map()
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const dirty = vue.ref(true)
  const busy = vue.ref(false)
  let guard
  const app = mount(vue.defineComponent({ setup() { guard = useChannelLeaveGuard(dirty, busy); return () => null } }))
  try {
    const stay = routeGuard()
    assert.equal(guard.leaveOpen.value, true)
    guard.decideLeave(false)
    assert.equal(await stay, false)
    const leave = routeGuard()
    guard.decideLeave(true)
    assert.equal(await leave, true)
    let prevented = false
    const unload = { preventDefault: () => { prevented = true } }
    listeners.get('beforeunload')(unload)
    assert.equal(prevented, true)
    assert.equal(unload.returnValue, '')
    dirty.value = false
    assert.equal(routeGuard(), true)
    busy.value = true
    assert.equal(routeGuard(), false)
  } finally {
    app.unmount()
    globalThis.window = originalWindow
  }
  assert.equal(listeners.size, 0)
})

test('extracted page orchestration preserves route filters, template-read gates and failed save recovery', async () => {
  const io = testApi()
  const originalWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  const request = dependencies['@jetlinks-web/core'].request
  const permissionRefs = new Map(Object.values(notificationPermissions).flatMap(actions => Object.values(actions).map(code => [code, vue.ref(true)])))
  permissionRefs.get(notificationPermissions.templates.query).value = false
  pageContext = {
    route: vue.reactive({ query: { channel: 'email:embedded', configId: 'smtp-real', q: 'kept-filter' } }),
    permissions: permissionRefs, width: vue.ref(1100), messages: [], jumps: [],
  }
  pageContext.router = { replace: ({ query }) => { pageContext.route.query = query } }
  Object.assign(request, {
    post: async (url, body) => ({ success: true, result: await (url === '/notifier/config/_query' ? io.api.queryConfigs(body) : io.api.queryTemplates(body)) }),
    get: async url => ({ success: true, result: await io.api.getConfig(decodeURIComponent(url.split('/').at(-1))) }),
    patch: async (_url, payload) => ({ success: true, result: await io.api.updateConfig(payload) }),
  })
  let page
  const app = mount(vue.defineComponent({ setup() { page = useChannelsPage(); return () => null } }))
  try {
    for (let index = 0; index < 8; index += 1) { await Promise.resolve(); await vue.nextTick() }
    assert.equal(page.entry.value.baseline.id, 'smtp-real')
    assert.equal(pageContext.route.query.q, 'kept-filter')
    assert.equal(io.calls.filter(([method]) => method === 'getConfig').length, 1)
    assert.equal(page.canTrial.value, false)
    page.showSend()
    assert.equal(io.calls.some(([method]) => method === 'queryTemplates'), false)
    page.workspace.changeField('password', 'replacement-secret')
    page.workspace.changeField('host', 'smtp.updated.example.org')
    const update = io.api.updateConfig
    io.api.updateConfig = async () => { throw new Error('offline') }
    await page.save()
    assert.equal(page.entry.value.draft.configuration.password, 'replacement-secret')
    assert.equal(page.dirty.value, true)
    assert.equal(pageContext.messages.length, 0)
    io.api.updateConfig = update
    await page.save()
    assert.equal(page.entry.value.draft.configuration.password, '')
    assert.equal(pageContext.messages.length, 1)
    permissionRefs.get(notificationPermissions.templates.query).value = true
    assert.equal(page.canTrial.value, true)
    page.goTemplates()
    assert.deepEqual(pageContext.jumps.at(-1), ['system/MessageNotification/Templates', { query: { channel: 'email:embedded', configId: 'smtp-real' } }])
    assert.equal(io.calls.some(([method]) => method === 'send'), false)
  } finally {
    app.unmount()
    for (const key of Object.keys(request)) delete request[key]
    pageContext = undefined
    globalThis.window = originalWindow
  }
})

test('pair editing emits replacements and rejects malformed saved rows without mutating the baseline', () => {
  const original = [{ key: 'Authorization', value: '' }]
  const model = vue.reactive({ value: original, kind: 'headers', disabled: false, savedKeys: ['authorization'] })
  const editor = useConfigurationPairs(() => model, value => { model.value = value })
  editor.update(0, 'value', 'new-secret')
  assert.equal(original[0].value, '')
  assert.equal(model.value[0].value, 'new-secret')
  editor.add()
  assert.equal(model.value.length, 2)
  editor.remove(1)
  assert.equal(model.value.length, 1)
  model.value = [null]
  assert.equal(editor.validShape.value, false)
  assert.deepEqual(editor.rows.value, [])
})

test('drawer focus hook waits for ready templates and preserves actual template options', async () => {
  const model = vue.reactive({ open: true, state: 'loading', templates: [template()] })
  let focusCount = 0
  let drawer
  const app = mount(vue.defineComponent({ setup() { drawer = useChannelSendDrawer(() => model); return () => null } }))
  try {
    drawer.templateSelect.value = { focus: () => { focusCount += 1 } }
    await vue.nextTick()
    assert.equal(focusCount, 0)
    model.state = 'ready'
    await vue.nextTick()
    await vue.nextTick()
    assert.equal(focusCount, 1)
    assert.deepEqual(drawer.templateOptions.value, [{ value: 'template-real', label: 'Actual template · template-real' }])
  } finally { app.unmount() }
})

test('all channel SFCs compile through Vue script/template without auto-named script extensions', () => {
  for (const filename of ['index.vue', 'ChannelConfiguration.vue', 'ConfigurationPairs.vue', 'ChannelSendDrawer.vue']) {
    const source = readFileSync(resolve(root, filename), 'utf8')
    const { descriptor, errors } = parse(source, { filename })
    assert.deepEqual(errors, [])
    const compiled = compileScript(descriptor, { id: filename, inlineTemplate: true })
    assert.doesNotThrow(() => transformSync(compiled.content, { loader: 'ts', format: 'cjs' }))
  }
})
