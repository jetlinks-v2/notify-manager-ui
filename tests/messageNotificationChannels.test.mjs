import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { channelTypes, channelProviders, channelMetadata, channelWireMetadata, extensionType, extensionProviders, extensionMetadata } from './messageNotificationChannelFixtures.mjs'
import { transformSync } from 'esbuild'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../views/system/MessageNotification/Channels')
const moduleRoot = resolve(import.meta.dirname, '..')
const locale = JSON.parse(readFileSync(resolve(moduleRoot, 'locales/lang/zh.json'), 'utf8'))
let routeGuard
let pageContext
const builtinControl = name => vue.defineComponent({ name, props: ['value', 'disabled', 'placeholder'], setup: (_, { slots }) => () => vue.h('control', slots.default?.()) })
const coreInput = builtinControl('a-input')
coreInput.Password = builtinControl('a-input-password')
coreInput.TextArea = builtinControl('a-textarea')
const dependencies = {
  vue,
  'ant-design-vue': { Input: coreInput, InputNumber: builtinControl('a-input-number'), Select: builtinControl('a-select'), Button: builtinControl('a-button') },
  'vue-i18n': { useI18n: () => ({ t: (key, args) => args ? `${key}:${JSON.stringify(args)}` : key, te: key => Object.hasOwn(locale, key) }) },
  'vue-router': { onBeforeRouteLeave: guard => { routeGuard = guard }, useRoute: () => pageContext.route, useRouter: () => pageContext.router },
  '@jetlinks-web/core': { request: {} },
  '@jetlinks-web/hooks': { usePermission: code => ({ hasPerm: pageContext.permissions.get(code) }) },
  '@vueuse/core': { useWindowSize: () => ({ width: pageContext.width }) },
  '@jetlinks-web/utils': { onlyMessage: (...args) => pageContext.messages.push(args), randomString: length => randomBytes(length).toString('hex').slice(0, length) },
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
    if (name.startsWith('@jetlinks-web-core/components/InlineEditForm')) return load(resolve(moduleRoot, '../../jetlinks-web-core/src/components/InlineEditForm', name.slice('@jetlinks-web-core/components/InlineEditForm'.length).replace(/^\//, '') || 'index.ts'))
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(imports, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}

const { useChannelCatalog } = load(resolve(root, 'useChannelCatalog.ts'))
const { channelDefinition, channelDefaults } = load(resolve(root, 'configuration/channelMetadata.ts'))
const { emailEncryption, emailEncryptionProperties } = load(resolve(root, 'configuration/emailSettings.ts'))
const { useChannelConfiguration } = load(resolve(root, 'useChannelConfiguration.ts'))
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
const robot = (id = 'robot-real') => ({ id, name: '群机器人', type: 'dingTalk', provider: 'dingTalkRobotWebHook', configuration: { url: 'https://fixture.example.test/robot' } })
const sms = () => ({ id: 'sms-real', name: 'SMS', type: 'sms', provider: 'aliyunSms', configuration: { accessKeyId: 'key', secret: 'saved-secret' } })
const permissions = () => Object.fromEntries(['query', 'add', 'update', 'delete', 'action'].map(key => [key, vue.ref(true)]))

function testApi(initial = [email()]) {
  const records = new Map(initial.map(record => [record.id, clone(record)]))
  const calls = []
  const api = {
    async queryTypes() { calls.push(['queryTypes']); return clone(channelTypes) },
    async queryProviders(type) { calls.push(['queryProviders', type]); return clone(channelProviders[type] || []) },
    async queryAllConfigs() { calls.push(['queryAllConfigs']); return [...records.values()].map(clone) },
    async getConfigMetadata(type, provider) { calls.push(['getConfigMetadata', `${type}:${provider}`]); return clone(channelMetadata[`${type}:${provider}`]) },
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

test('legacy configuration IDs remain addressable without rewriting existing data', async () => {
  const io = testApi([email('one'), email('two'), sms()])
  const navigations = []
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions(), navigate: value => navigations.push(value) })
  await workspace.activate('email:embedded')
  assert.equal(workspace.state.value, 'ready')
  assert.equal(workspace.entry.value.draft.id, 'one')
  assert.equal(workspace.selectedConfigId.value, 'one')
  assert.equal(workspace.entry.value.draft.configuration.host, 'smtp.example.org')
  assert.equal(workspace.entry.value.draft.configuration.password, '')
  assert.equal(workspace.dirty.value, false)
  assert.deepEqual(navigations.at(-1), { channel: 'email:embedded', configId: 'one' })
  await workspace.selectConfig('two')
  assert.equal(workspace.entry.value.draft.configuration.password, '')
  workspace.changeField('name', 'edited two', true)
  workspace.changeField('password', 'new-secret')
  await workspace.selectConfig('one')
  workspace.changeField('name', 'edited one', true)
  await workspace.activate('sms:aliyunSms')
  assert.equal(workspace.entry.value.draft.id, 'sms-real')
  await workspace.activate('email:embedded')
  assert.equal(workspace.entry.value.draft.name, 'edited one')
  await workspace.activate('email:embedded', 'two')
  assert.equal(workspace.entry.value.draft.name, 'edited two')
  assert.equal(workspace.entry.value.draft.configuration.password, 'new-secret')
  assert.equal(workspace.hasUnsavedChanges.value, true)
  assert.deepEqual(navigations.at(-1), { channel: 'email:embedded', configId: 'two' })
  assert.equal(JSON.stringify(navigations).includes('new-secret'), false)
  assert.equal(io.calls.some(([method]) => ['createConfig', 'updateConfig', 'deleteConfig', 'send'].includes(method)), false)
})

test('default selection preserves new drafts and explicit links, and recovers a removed remembered record', async () => {
  const io = testApi([robot('one'), robot('two'), sms()])
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions() })
  await workspace.activate('dingTalk:dingTalkRobotWebHook', 'two')
  assert.equal(workspace.selectedConfigId.value, 'two')
  workspace.createConfig()
  const draftId = workspace.entry.value.draft.id
  workspace.changeField('url', 'https://fixture.example.test/unsaved')
  await workspace.activate('sms:aliyunSms')
  await workspace.activate('dingTalk:dingTalkRobotWebHook')
  assert.equal(workspace.entry.value.draft.id, draftId)
  assert.equal(workspace.entry.value.draft.configuration.url, 'https://fixture.example.test/unsaved')
  await workspace.activate('dingTalk:dingTalkRobotWebHook', 'two')
  assert.equal(workspace.selectedConfigId.value, 'two')
  for (const invalidId of ['missing-config', 'sms-real']) {
    await workspace.activate('dingTalk:dingTalkRobotWebHook', invalidId)
    assert.equal(workspace.entry.value, undefined)
    assert.equal(workspace.selectedConfigId.value, undefined)
  }
  io.records.delete('two')
  io.records.set('three', robot('three'))
  await workspace.activate('dingTalk:dingTalkRobotWebHook')
  assert.equal(workspace.selectedConfigId.value, 'one')
  assert.equal(workspace.hasUnsavedChanges.value, true)
  assert.equal(io.calls.some(([method]) => ['createConfig', 'updateConfig', 'deleteConfig', 'send'].includes(method)), false)
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
  for (let index = 0; index < 12 && !release; index++) await Promise.resolve()
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

test('first config generates stable identity and name before validation without dirtying the draft', async () => {
  const io = testApi([])
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions() })
  await workspace.activate('email:embedded')
  const generatedId = workspace.entry.value.draft.id
  assert.match(generatedId, /^[a-zA-Z0-9]{32}$/)
  assert.ok(workspace.entry.value.draft.name)
  assert.equal(workspace.dirty.value, false)
  assert.equal(workspace.hasUnsavedChanges.value, false)
  assert.equal(await workspace.save(), false)
  assert.equal(io.calls.some(([method]) => method === 'createConfig'), false)
  workspace.changeField('host', 'smtp.example.org')
  assert.equal(await workspace.save(), true)
  assert.equal(io.calls.find(([method]) => method === 'createConfig')[1].id, generatedId)
  assert.equal(workspace.selectedConfigId.value, generatedId)
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
  for (const name of ['a-form', 'a-form-item', 'a-input', 'a-input-password', 'a-input-number', 'a-typography-text', 'Editable', 'a-alert', 'a-button', 'a-select', 'a-collapse', 'a-collapse-panel', 'a-textarea', 'AIcon']) app.component(name, control(name))
  app.mount({})
  return app
}
function* walk(node) {
  if (!node) return
  yield node
  if (node.component) yield* walk(node.component.subTree)
  if (Array.isArray(node.children)) for (const child of node.children) if (typeof child === 'object') yield* walk(child)
}

test('saved configuration renders masked details, with empty password input only while editing', async () => {
  const original = email()
  const draft = createChannelConfigDraft(original)
  const entry = { key: 'record', draft, baseline: original, isNew: false, snapshot: JSON.stringify(draft), issues: [] }
  const app = mount(ChannelConfiguration, { entry, disabled: true })
  const nodes = [...walk(app._instance.subTree)]
  assert.equal(nodes.some(node => node.type?.name === 'a-input-password'), false)
  const passwordTrigger = nodes.find(node => node.type === 'button' && node.props?.['aria-label'] === 'messageNotification.channels.fields.password')
  assert.equal(passwordTrigger.props.disabled, true)
  app.unmount()
  const editable = mount(ChannelConfiguration, { entry })
  const trigger = [...walk(editable._instance.subTree)].find(node => node.type === 'button' && node.props?.['aria-label'] === 'messageNotification.channels.fields.password')
  trigger.props.onClick()
  await vue.nextTick()
  const password = [...walk(editable._instance.subTree)].find(node => node.type?.name === 'a-input-password')
  assert.equal(password.props.value, '')
  assert.equal(password.props['aria-label'], 'messageNotification.channels.fields.password')
  editable.unmount()
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
  const io = testApi([email(), email('smtp-backup')])
  const originalWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  const request = dependencies['@jetlinks-web/core'].request
  const permissionRefs = new Map(Object.values(notificationPermissions).flatMap(actions => Object.values(actions).map(code => [code, vue.ref(true)])))
  permissionRefs.get(notificationPermissions.templates.query).value = false
  pageContext = {
    route: vue.reactive({ query: { channel: 'email:embedded', q: 'kept-filter' } }),
    permissions: permissionRefs, width: vue.ref(1100), messages: [], jumps: [],
  }
  pageContext.router = { replace: ({ query }) => { pageContext.route.query = query } }
  Object.assign(request, {
    post: async (url, body) => ({ success: true, result: await (url === '/notifier/config/_query/no-paging' ? io.api.queryAllConfigs() : url === '/notifier/config/_query' ? io.api.queryConfigs(body) : io.api.queryTemplates(body)) }),
    get: async url => {
      const segments = url.split('/').map(decodeURIComponent)
      const result = url.endsWith('/types') ? await io.api.queryTypes()
        : url.endsWith('/providers') ? await io.api.queryProviders(segments.at(-2))
        : url.endsWith('/webhook/http/metadata') ? undefined
        : url.endsWith('/metadata') ? clone(channelWireMetadata[`${segments.at(-3)}:${segments.at(-2)}`])
        : await io.api.getConfig(segments.at(-1))
      return { success: true, result }
    },
    patch: async (_url, payload) => ({ success: true, result: await io.api.updateConfig(payload) }),
  })
  let page
  const app = mount(vue.defineComponent({ setup() { page = useChannelsPage(); return () => null } }))
  try {
    for (let index = 0; index < 24; index += 1) { await Promise.resolve(); await vue.nextTick() }
    assert.equal(page.entry.value.baseline.id, 'smtp-real')
    assert.equal(page.configurationVisible.value, true)
    assert.equal(page.configurationOptions.value.length, 2)
    assert.equal(page.multipleConfigurations.value, false)
    assert.equal(pageContext.route.query.configId, 'smtp-real')
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
    page.selectChannel([], { node: { key: 'dingTalk:dingTalkMessage' } })
    for (let index = 0; index < 24; index++) { await Promise.resolve(); await vue.nextTick() }
    assert.equal(page.channelId.value, 'dingTalk:dingTalkMessage')
    assert.equal(pageContext.route.query.channel, 'dingTalk:dingTalkMessage')
    assert.equal(page.entry.value.isNew, true)
    for (const [channelId, fields] of [['sms:aliyunSms', ['regionId', 'accessKeyId', 'secret']], ['webhook:http', ['url', 'headers']]]) {
      await page.workspace.activate(channelId)
      assert.equal(page.state.value, 'empty')
      assert.equal(page.entry.value.isNew, true)
      assert.deepEqual(page.entry.value.definition.fields.map(field => field.key), fields)
      assert.equal(page.dirty.value, false)
    }
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
  for (const filename of ['index.vue', 'ChannelConfiguration.vue', 'ConfigurationPairs.vue', 'ChannelSendDrawer.vue', 'configuration/ChannelHelp.vue']) {
    const source = readFileSync(resolve(root, filename), 'utf8')
    const { descriptor, errors } = parse(source, { filename })
    assert.deepEqual(errors, [])
    const compiled = compileScript(descriptor, { id: filename, inlineTemplate: true })
    assert.doesNotThrow(() => transformSync(compiled.content, { loader: 'ts', format: 'cjs' }))
  }
})

test('backend catalog includes every provider, new types and removals without a static fallback', async () => {
  const io = testApi([])
  const allowed = vue.ref(true)
  const returnedTypes = [...clone(channelTypes), extensionType]
  io.api.queryTypes = async () => returnedTypes
  io.api.queryProviders = async type => clone(type === 'extension' ? extensionProviders : channelProviders[type])
  const catalog = useChannelCatalog(allowed, io.api)
  await catalog.reload()
  assert.equal(catalog.channels.value.length, 9)
  assert.equal(catalog.channels.value.find(item => item.id === 'extension:custom').providerName, '自定义服务')
  assert.equal(catalog.count(catalog.channels.value[0]), undefined)
  await catalog.loadConfigs()
  assert.equal(catalog.count(catalog.channels.value[0]), 0)
  assert.equal(io.calls.filter(([method]) => method === 'queryAllConfigs').length, 1)
  await catalog.loadConfigs()
  assert.equal(io.calls.filter(([method]) => method === 'queryAllConfigs').length, 1)
  returnedTypes.splice(0, returnedTypes.length, extensionType)
  await catalog.reload()
  assert.deepEqual(catalog.channels.value.map(item => item.id), ['extension:custom', 'extension:second'])
  returnedTypes.length = 0
  await catalog.reload()
  assert.equal(catalog.state.value, 'empty')
  assert.deepEqual(catalog.channels.value, [])
})

test('a failing provider type keeps siblings usable and retries without turning failures into empty configs', async () => {
  const io = testApi([])
  const original = io.api.queryProviders
  io.api.queryProviders = async type => { if (type === 'dingTalk') throw new Error('offline'); return original(type) }
  const catalog = useChannelCatalog(vue.ref(true), io.api)
  await catalog.reload()
  assert.equal(catalog.state.value, 'ready')
  assert.equal(catalog.providerStates.get('dingTalk'), 'error')
  assert.equal(catalog.channels.value.some(item => item.type === 'email'), true)
  assert.equal(catalog.channels.value.some(item => item.type === 'dingTalk'), false)
  io.api.queryProviders = original
  await catalog.loadProviders('dingTalk')
  assert.equal(catalog.providerStates.get('dingTalk'), 'ready')
  assert.equal(catalog.channels.value.filter(item => item.type === 'dingTalk').length, 2)
  io.api.queryAllConfigs = async () => { throw { response: { status: 403 } } }
  await assert.rejects(catalog.loadConfigs())
  assert.equal(catalog.configState.value, 'forbidden')
  assert.equal(catalog.count(catalog.channels.value[0]), undefined)
})

test('catalog permission loss and stale metadata cannot retain data across a directory reset', async () => {
  const io = testApi([])
  const allowed = vue.ref(false)
  const catalog = useChannelCatalog(allowed, io.api)
  await catalog.reload()
  assert.equal(catalog.state.value, 'forbidden')
  assert.equal(io.calls.length, 0)
  allowed.value = true
  await catalog.reload()
  let release
  io.api.getConfigMetadata = () => new Promise(resolve => { release = resolve })
  const channel = catalog.channels.value[0]
  const pending = catalog.loadDefinition(channel)
  assert.equal(catalog.loadDefinition(channel), pending)
  allowed.value = false
  await catalog.reload()
  release(channelMetadata[channel.id])
  await assert.rejects(pending, /stale-metadata/)
  assert.deepEqual(catalog.channels.value, [])
})

const customChannel = { id: 'extension:custom', type: 'extension', provider: 'custom', name: '扩展通知 · 自定义服务', labelKey: '', group: 'integration', secretFields: [] }
const customDefinition = () => channelDefinition(customChannel, clone(extensionMetadata))

test('metadata preserves unknown fields, false/zero defaults, constraints and secret protection', () => {
  const definition = customDefinition()
  assert.equal(definition.fields.length, extensionMetadata.properties.length)
  assert.deepEqual(definition.secretFields, ['token'])
  assert.deepEqual(channelDefaults(definition), { enabled: false, priority: 0, retries: 0 })
  const draft = { id: 'generated', name: 'Generated', type: 'extension', provider: 'custom', configuration: { ...channelDefaults(definition), endpoint: 'https://example.test', token: 'actual-token', options: { nested: true } } }
  assert.deepEqual(validateChannelDraft(draft, undefined, definition), [])
  for (const [field, value] of [['enabled', 'false'], ['priority', 12], ['retries', 4], ['options', 'invalid-json']]) {
    const invalid = clone(draft)
    invalid.configuration[field] = value
    assert.equal(validateChannelDraft(invalid, undefined, definition).some(issue => issue.path === field && issue.key === 'invalidValue'), true)
  }
  const baseline = clone(draft)
  const editable = createChannelConfigDraft(baseline, definition)
  assert.equal(editable.configuration.token, '')
  editable.configuration.endpoint = 'https://changed.example.test'
  assert.equal(channelConfigPayload(editable, baseline, definition).configuration.token, 'actual-token')
  baseline.configuration.token = '******'
  assert.equal(validateChannelDraft(editable, baseline, definition).some(issue => issue.path === 'token' && issue.key === 'secretRequired'), true)
  assert.throws(() => channelConfigPayload(editable, baseline, definition))
})

test('backend additions to a known provider remain visible and template-only fields are never fabricated', () => {
  const known = notificationChannels.find(item => item.id === 'dingTalk:dingTalkMessage')
  const metadata = clone(channelMetadata[known.id])
  metadata.properties.push({ id: 'newSetting', name: '服务商新增字段', valueType: { type: 'string', expands: { required: true } } })
  const definition = channelDefinition(known, metadata)
  assert.deepEqual(definition.fields.map(item => item.key), ['appKey', 'appSecret', 'newSetting'])
  assert.deepEqual(definition.secretFields, ['appSecret'])
  assert.equal(definition.fields.some(item => item.key === 'agentId'), false)
  const fields = validateChannelDraft({ id: 'generated', name: 'Generated', type: known.type, provider: known.provider, configuration: { appKey: 'key', appSecret: 'secret' } }, undefined, definition)
  assert.deepEqual(fields, [{ path: 'newSetting', key: 'required' }])
  const unknownProvider = { ...customChannel, id: 'sms:custom', type: 'sms' }
  assert.equal(channelDefinition(unknownProvider, extensionMetadata).fields.every(field => field.group === 'configuration'), true)
  const official = channelDefinition({ ...customChannel, id: 'weixin:officialMessage', type: 'weixin', provider: 'officialMessage' }, {
    properties: [{ id: 'secret', name: '开发者密码(AppSecret)', valueType: { type: 'string', expands: { required: true } } }],
  })
  assert.deepEqual(official.secretFields, ['secret'])
  const baseline = { id: 'official', name: 'Official', type: 'weixin', provider: 'officialMessage', configuration: { secret: 'saved-secret' } }
  const draft = createChannelConfigDraft(baseline, official)
  assert.equal(draft.configuration.secret, '')
  assert.equal(channelConfigPayload(draft, baseline, official).configuration.secret, 'saved-secret')
})

test('dynamic workspace supports first save, stable identity, drafts and safe metadata failure', async () => {
  const io = testApi([])
  const channels = vue.ref([customChannel, notificationChannels[0]])
  const perms = permissions()
  const options = { api: io.api, permissions: perms, channels, loadConfigs: io.api.queryAllConfigs,
    loadDefinition: async channel => channel.id === customChannel.id ? customDefinition() : channelDefinition(channel, channelMetadata[channel.id]) }
  const workspace = useChannelWorkspace(options)
  await workspace.activate(customChannel.id)
  const identity = workspace.entry.value.draft.id
  assert.equal(workspace.entry.value.draft.name, customChannel.name)
  assert.deepEqual(workspace.entry.value.draft.configuration, { enabled: false, priority: 0, retries: 0 })
  assert.equal(workspace.dirty.value, false)
  assert.equal(await workspace.save(), false)
  assert.deepEqual(workspace.entry.value.issues.map(item => item.path), ['endpoint', 'token'])
  workspace.changeField('endpoint', 'https://receiver.example.test')
  workspace.changeField('token', 'typed-secret')
  await workspace.activate('email:embedded')
  await workspace.activate(customChannel.id)
  assert.equal(workspace.entry.value.draft.id, identity)
  assert.equal(workspace.entry.value.draft.configuration.token, 'typed-secret')
  const create = io.api.createConfig
  io.api.createConfig = async () => { throw new Error('offline') }
  assert.equal(await workspace.save(), false)
  assert.equal(workspace.entry.value.draft.id, identity)
  io.api.createConfig = create
  assert.equal(await workspace.save(), true)
  assert.equal(io.records.get(identity).configuration.enabled, false)
  assert.equal(workspace.entry.value.draft.configuration.token, '')
  assert.equal(workspace.entry.value.isNew, false)
  workspace.createConfig()
  assert.equal(workspace.entry.value.draft.name, customChannel.name)
  assert.equal(workspace.entry.value.isNew, false)
  const secondId = workspace.entry.value.draft.id
  assert.equal(secondId, identity)
  workspace.changeField('endpoint', 'changed')
  workspace.resetDraft()
  assert.equal(workspace.entry.value.draft.id, secondId)
  assert.equal(workspace.dirty.value, false)
  perms.add.value = false
  assert.equal(await workspace.save(), false)
  workspace.clear()
  assert.equal(workspace.entry.value, undefined)
  options.loadDefinition = async () => { throw new Error('metadata unavailable') }
  await workspace.activate(customChannel.id)
  assert.equal(workspace.state.value, 'error')
  assert.equal(workspace.entry.value, undefined)
})

test('new zero-field providers can save defaults, while users without add permission get no draft', async () => {
  const io = testApi([])
  const permissionsRef = permissions()
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissionsRef, channels: vue.ref([customChannel]), loadDefinition: async () => channelDefinition(customChannel, { properties: [] }) })
  permissionsRef.add.value = false
  await workspace.activate(customChannel.id)
  assert.equal(workspace.state.value, 'empty')
  assert.equal(workspace.entry.value, undefined)
  permissionsRef.add.value = true
  await workspace.activate(customChannel.id)
  assert.equal(workspace.dirty.value, false)
  assert.equal(await workspace.save(), true)
  assert.equal(io.calls.filter(([method]) => method === 'createConfig').length, 1)
})

test('dynamic navigation retains new provider IDs only when returned by the current backend', () => {
  const { normalizeNotificationNavigation, notificationQuery } = load(resolve(root, '../shared/navigation.ts'))
  const channels = [customChannel]
  const query = { channel: customChannel.id, configId: 'real-config', q: 'unrelated-filter' }
  assert.deepEqual(normalizeNotificationNavigation(query, channels), { channel: customChannel.id, configId: 'real-config' })
  assert.deepEqual(notificationQuery({ channel: customChannel.id }, query, channels), { channel: customChannel.id, q: 'unrelated-filter' })
  assert.equal(normalizeNotificationNavigation(query, []).channel, undefined)
  assert.equal(notificationQuery({ channel: customChannel.id }).channel, undefined)
})

test('SMTP presets and encryption retain custom properties and do not rewrite the legacy ssl flag', () => {
  const configuration = { ssl: true, properties: [{ name: 'mail.smtp.auth', value: 'true' }, { name: 'custom', value: 'keep', description: 'keep this' }] }
  const starttls = emailEncryptionProperties(configuration, 'starttls')
  assert.equal(emailEncryption({ ...configuration, properties: starttls }), 'starttls')
  assert.equal(starttls.find(item => item.name === 'mail.smtp.ssl.enable').value, 'false')
  assert.equal(starttls.find(item => item.name === 'mail.smtp.starttls.required').value, 'true')
  assert.deepEqual(starttls.find(item => item.name === 'custom'), configuration.properties[1])
  assert.equal(configuration.properties.length, 2)
  const none = emailEncryptionProperties({ ...configuration, properties: starttls }, 'none')
  assert.equal(emailEncryption({ ...configuration, properties: none }), 'none')
  const draft = { id: 'new', name: '邮件', type: 'email', provider: 'embedded', configuration: clone(configuration) }
  const entry = vue.reactive({ key: 'new', draft, isNew: true, snapshot: JSON.stringify(draft), issues: [], definition: channelDefinition(notificationChannels[0], channelMetadata['email:embedded']) })
  const editor = useChannelConfiguration({ entry, disabled: false }, (key, value) => { entry.draft.configuration[key] = value })
  editor.setPreset('exchange')
  assert.equal(entry.draft.configuration.host, 'smtp.office365.com')
  assert.equal(entry.draft.configuration.port, 587)
  assert.equal(emailEncryption(entry.draft.configuration), 'starttls')
  editor.setPreset('other')
  assert.equal(editor.preset.value, 'other')
  assert.equal(entry.draft.configuration.host, 'smtp.office365.com')
})

test('first configuration renders business fields without identity inputs and preserves typed select values', () => {
  const definition = customDefinition()
  const draft = { id: 'generated', name: 'Generated', type: customChannel.type, provider: customChannel.provider, configuration: channelDefaults(definition) }
  const entry = vue.reactive({ key: 'new', draft, isNew: true, snapshot: JSON.stringify(draft), issues: [], definition })
  const editor = useChannelConfiguration({ entry, disabled: false }, (key, value) => { entry.draft.configuration[key] = value })
  const enabled = definition.fields.find(field => field.key === 'enabled')
  assert.deepEqual(editor.numberBounds({ key: 'port', property: { valueType: { type: 'int', min: 0, max: 100000 } } }), { min: 0, max: 100000 })
  assert.equal(editor.selectedValue(enabled), 1)
  editor.setSelectedValue(enabled, 0)
  assert.equal(entry.draft.configuration.enabled, true)
  editor.setSelectedValue(enabled, 1)
  assert.equal(entry.draft.configuration.enabled, false)
  const app = mount(ChannelConfiguration, { entry, disabled: true })
  const nodes = [...walk(app._instance.subTree)]
  assert.equal(nodes.some(node => node.props?.['aria-label'] === 'messageNotification.channels.fields.id'), false)
  assert.equal(nodes.some(node => node.props?.['aria-label'] === 'messageNotification.channels.fields.name'), false)
  assert.equal(nodes.some(node => node.props?.['aria-label'] === '服务地址'), true)
  assert.equal(nodes.some(node => node.type?.name === 'a-input-password' && node.props['aria-label'] === '访问凭据'), true)
  app.unmount()
})

test('inline saves merge only their fields and preserve unrelated drafts, extensions and credentials', async () => {
  const io = testApi()
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions() })
  await workspace.activate('email:embedded')
  workspace.changeField('name', 'unsaved name', true)
  workspace.changeField('sender', 'unsaved@example.test')
  workspace.changeField('host', 'inline.example.test')
  assert.equal(await workspace.saveFields([{ key: 'host', value: 'inline.example.test' }], 'host'), true)
  const saved = io.records.get('smtp-real')
  assert.equal(saved.configuration.host, 'inline.example.test')
  assert.equal(saved.name, 'smtp-real')
  assert.equal(saved.configuration.sender, undefined)
  assert.equal(saved.configuration.password, 'saved-password')
  assert.deepEqual(saved.configuration.preservedExtension, { value: 1 })
  assert.equal(workspace.entry.value.draft.name, 'unsaved name')
  assert.equal(workspace.entry.value.draft.configuration.sender, 'unsaved@example.test')
  assert.equal(workspace.dirty.value, true)
  assert.equal(JSON.parse(workspace.entry.value.snapshot).configuration.host, 'inline.example.test')
  assert.equal(workspace.entry.value.draft.configuration.password, '')
})

test('inline validation and failed writes retain input; refresh retry after a successful write is read-only', async () => {
  const io = testApi()
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions() })
  await workspace.activate('email:embedded')
  workspace.changeField('host', '')
  assert.equal(await workspace.saveFields([{ key: 'host', value: '' }], 'host'), false)
  assert.equal(io.calls.some(([method]) => method === 'updateConfig'), false)
  workspace.changeField('host', 'changed.example.test')
  const update = io.api.updateConfig
  io.api.updateConfig = async () => { throw new Error('offline') }
  assert.equal(await workspace.saveFields([{ key: 'host', value: 'changed.example.test' }], 'host'), false)
  assert.equal(workspace.entry.value.draft.configuration.host, 'changed.example.test')
  assert.equal(workspace.entry.value.baseline.configuration.host, 'smtp.example.org')
  assert.equal(workspace.entry.value.fieldFailures.host, 'error')
  io.api.updateConfig = update
  const query = io.api.queryConfigs
  io.api.queryConfigs = async () => { throw new Error('read failure') }
  assert.equal(await workspace.saveFields([{ key: 'host', value: 'changed.example.test' }], 'host'), true)
  assert.equal(workspace.entry.value.refreshFailure, 'error')
  assert.equal(workspace.dirty.value, false)
  io.api.queryConfigs = query
  await workspace.refreshSaved()
  assert.equal(workspace.entry.value.refreshFailure, undefined)
  assert.equal(io.calls.filter(([method]) => method === 'updateConfig').length, 1)
})

test('inline pending writes lock selection and duplicates, and permission loss prevents late data restoration', async () => {
  const io = testApi([email('one'), email('two')])
  const perms = permissions()
  const workspace = useChannelWorkspace({ api: io.api, permissions: perms })
  await workspace.activate('email:embedded')
  let resolveWrite
  let count = 0
  io.api.updateConfig = () => { count++; return new Promise(resolve => { resolveWrite = resolve }) }
  workspace.changeField('host', 'changed.example.test')
  const pending = workspace.saveFields([{ key: 'host', value: 'changed.example.test' }], 'host')
  await workspace.selectConfig('two')
  assert.equal(workspace.selectedConfigId.value, 'one')
  assert.equal(await workspace.saveFields([{ key: 'host', value: 'duplicate' }], 'host'), false)
  perms.query.value = false
  workspace.clear()
  resolveWrite()
  await pending
  assert.equal(count, 1)
  assert.equal(workspace.entry.value, undefined)
  assert.equal(workspace.state.value, 'forbidden')
})

test('metadata form submits email preset/encryption as one operation and keeps custom ports and extra SMTP properties', async () => {
  const record = email()
  record.configuration.port = 465
  record.configuration.properties.push({ name: 'mail.smtp.ssl.enable', value: 'true' }, { name: 'mail.smtp.timeout', value: '9000' })
  const io = testApi([record])
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions(), loadDefinition: async channel => channelDefinition(channel, channelMetadata[channel.id]) })
  await workspace.activate('email:embedded')
  const props = { get entry() { return workspace.entry.value }, disabled: false, submit: workspace.saveFields }
  const openedFields = []
  const model = useChannelConfiguration(props, workspace.changeField, key => openedFields.push(key))
  model.changeValue('email:encryption', 'starttls')
  assert.equal((await model.submitValue('email:encryption', 'starttls')).ok, true)
  assert.equal(io.records.get(record.id).configuration.port, 587)
  assert.equal(io.records.get(record.id).configuration.properties.find(item => item.name === 'mail.smtp.timeout').value, '9000')
  assert.equal(io.calls.filter(([method]) => method === 'updateConfig').length, 1)
  workspace.changeField('port', 2525)
  await workspace.saveFields([{ key: 'port', value: 2525 }], 'port')
  model.changeValue('email:encryption', 'ssl')
  await model.submitValue('email:encryption', 'ssl')
  assert.equal(io.records.get(record.id).configuration.port, 2525)
  model.changeValue('email:preset', 'exchange')
  await model.submitValue('email:preset', 'exchange')
  assert.equal(io.records.get(record.id).configuration.host, 'smtp.office365.com')
  assert.equal(io.records.get(record.id).configuration.port, 587)
  assert.equal(emailEncryption(io.records.get(record.id).configuration), 'starttls')
  assert.equal(io.calls.filter(([method]) => method === 'updateConfig').length, 4)
  model.changeValue('email:preset', 'tencent')
  model.cancelValue('email:preset')
  assert.equal(workspace.dirty.value, false)
  model.changeValue('email:preset', 'other')
  assert.equal((await model.submitValue('email:preset', 'other')).ok, true)
  assert.deepEqual(openedFields, ['config:host'])
  assert.equal(io.calls.filter(([method]) => method === 'updateConfig').length, 4)
  assert.equal(workspace.dirty.value, false)
})

test('creation and deletion responses do not restore workspace data after permission loss', async () => {
  for (const operation of ['createConfig', 'deleteConfig']) {
    const io = testApi(operation === 'createConfig' ? [] : [email()])
    const perms = permissions()
    const workspace = useChannelWorkspace({ api: io.api, permissions: perms })
    await workspace.activate('email:embedded')
    if (operation === 'createConfig') {
      workspace.changeField('host', 'fixture.example.test')
      workspace.changeField('port', 465)
    }
    let finish
    io.api[operation] = () => new Promise(resolve => { finish = resolve })
    const pending = operation === 'createConfig' ? workspace.save() : workspace.deleteConfig()
    assert.equal(workspace.busy.value, true)
    perms.query.value = false
    workspace.clear()
    finish()
    assert.equal(await pending, true)
    assert.equal(workspace.entry.value, undefined)
    assert.equal(workspace.selectedConfigId.value, undefined)
    assert.equal(workspace.state.value, 'forbidden')
    assert.deepEqual(workspace.configs.value, [])
  }
})

test('inline password updates keep blank input and unknown metadata false/zero values retain their meaning', async () => {
  const io = testApi()
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions() })
  await workspace.activate('email:embedded')
  workspace.changeField('password', 'replacement')
  assert.equal(await workspace.saveFields([{ key: 'password', value: 'replacement' }], 'password'), true)
  assert.equal(io.records.get('smtp-real').configuration.password, 'replacement')
  assert.equal(workspace.entry.value.draft.configuration.password, '')
  const custom = { id: 'custom', name: 'Custom', type: 'extension', provider: 'custom', configuration: { endpoint: 'https://receiver.example.test', token: 'saved-token', enabled: true, priority: 2, retries: 1 } }
  const customIO = testApi([custom])
  const extension = useChannelWorkspace({ api: customIO.api, permissions: permissions(), channels: vue.ref([customChannel]), loadDefinition: async () => customDefinition() })
  await extension.activate(customChannel.id)
  const props = { get entry() { return extension.entry.value }, disabled: false, submit: extension.saveFields }
  const model = useChannelConfiguration(props, extension.changeField)
  for (const [key, value] of [['config:enabled', 1], ['config:priority', 0]]) {
    model.changeValue(key, value)
    assert.equal((await model.submitValue(key, value)).ok, true)
  }
  assert.equal(customIO.records.get('custom').configuration.enabled, false)
  assert.equal(customIO.records.get('custom').configuration.priority, 0)
  assert.equal(customIO.records.get('custom').configuration.token, 'saved-token')
})


test('only robots allow a second configuration and keep automatic duplicate-name numbering', async () => {
  const io = testApi([email(), robot()])
  const workspace = useChannelWorkspace({ api: io.api, permissions: permissions(), channelName: () => '群机器人' })
  await workspace.activate('email:embedded')
  assert.equal(workspace.multipleConfigurations.value, false)
  workspace.createConfig()
  assert.equal(workspace.entry.value.draft.id, 'smtp-real')
  assert.equal(workspace.entry.value.isNew, false)
  await workspace.activate('dingTalk:dingTalkRobotWebHook')
  assert.equal(workspace.multipleConfigurations.value, true)
  workspace.createConfig()
  assert.equal(workspace.entry.value.isNew, true)
  assert.equal(workspace.entry.value.draft.name, '群机器人 (2)')
  const id = workspace.entry.value.draft.id
  workspace.changeField('url', 'https://fixture.example.test/second-robot')
  workspace.resetDraft()
  assert.equal(workspace.entry.value.draft.id, id)
  workspace.changeField('url', 'https://fixture.example.test/second-robot')
  assert.equal(await workspace.save(), true)
  assert.equal(workspace.configs.value.length, 2)
  await workspace.selectConfig('robot-real')
  assert.equal(workspace.selectedConfigId.value, 'robot-real')
  assert.equal(io.calls.filter(([method]) => method === 'createConfig').length, 1)
})
