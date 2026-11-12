import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import directoryFixture from './messageNotificationTemplateDirectoryFixture.mjs'
import { transformSync } from 'esbuild'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const templatesRoot = resolve(root, 'views/system/MessageNotification/Templates')
const cache = new Map()
const locale = { useI18n: () => ({ t: (key, args) => args?.name ? `Example ${args.name}` : key }) }
const dependencies = {
  vue, 'vue-i18n': locale,
  '@jetlinks-web/core': { request: {} },
  '@jetlinks-web-core/hooks/useNotificationConfigNavigation': { useNotificationConfigNavigation: () => ({ available: vue.ref(true), open() {} }) },
  '@jetlinks-web-core/components/Upload/utils': { getFileName: file => file.name },
  '@jetlinks-web/utils': { downloadFileByUrl() {}, onlyMessage() {} },
  '@jetlinks-web-core/utils': { getImageUrl: id => `/files/${encodeURIComponent(id)}` },
  // 页面守卫用例不渲染子组件，AutoTree 的真实布局由浏览器验证。
  '@jetlinks-web-core/components/AutoTree': { __esModule: true, default: () => null },
  '@jetlinks-web-core/components/Upload/File/index.vue': { __esModule: true, default: () => null },
  '@jetlinks-web-core/components/Upload/File/useFileDownload': { getFileDownloadUrl: file => file.response?.result?.accessUrl || file.url },
}

// Run actual mappers, reactive workspace and component setup; only replace platform I/O.
function load(filename, inline = true) {
  const key = `${filename}:${inline}`
  if (cache.has(key)) return cache.get(key)
  let source = readFileSync(filename, 'utf8')
  if (filename.endsWith('.vue')) source = compileScript(parse(source, { filename }).descriptor, { id: filename, inlineTemplate: inline }).content
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs' })
  const module = { exports: {} }
  const imports = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    if (name.startsWith('.')) {
      let path = resolve(dirname(filename), name)
      if (!/\.(ts|vue)$/.test(path)) path = existsSync(`${path}.ts`) ? `${path}.ts` : resolve(path, 'index.ts')
      return load(path, inline)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(imports, module, module.exports)
  cache.set(key, module.exports)
  return module.exports
}

const model = load(resolve(templatesRoot, 'model.ts'))
const { useTemplateWorkspace } = load(resolve(templatesRoot, 'useTemplateWorkspace.ts'))
const shared = load(resolve(root, 'views/system/MessageNotification/shared/index.ts'))
const record = (id = 'template-one', overrides = {}) => ({
  id, name: `Template ${id}`, type: { value: 'email', text: 'Mail' }, provider: 'embedded', configId: 'smtp-one',
  template: { subject: 'Alarm ${device.name}', text: 'Reading ${reading}', sendTo: [], attachments: [], providerExtra: { untouched: true } },
  variableDefinitions: [{ id: 'device.name', name: 'Device', type: 'string', expands: { x: true } }], ...overrides,
})
const access = (query = true, add = true, update = true) => ({ query: vue.ref(query), add: vue.ref(add), update: vue.ref(update) })
function mockApi() {
  const calls = []
  return { calls,
    queryTemplateDirectory: async () => [],
    getBusinessTemplate: async (owner, type) => type === 'notifier-email' ? { channel: { id: 'binding', providerId: owner, channelProvider: type, state: 'enabled', channelConfiguration: { templateId: 'second', notifierId: 'smtp-one' } }, template: record('second', { type: 'email' }) } : undefined,
    saveBusinessTemplate: async (owner, type, payload) => { calls.push(['saveBusinessTemplate', owner, type, structuredClone(payload)]); return { channel: { ...payload.channel, id: 'binding', providerId: owner, channelConfiguration: { ...payload.channel.channelConfiguration, templateId: 'stpl_binding' } }, template: { ...payload.template, id: 'stpl_binding' } } },
    setBusinessEnabled: async (...args) => { calls.push(['setBusinessEnabled', ...args]) },
    queryTemplates: async query => { calls.push(['queryTemplates', query]); return { data: [record()] } },
    queryConfigs: async query => { calls.push(['queryConfigs', query]); return { data: [{ id: 'smtp-one', name: 'SMTP', type: 'email', provider: 'embedded', configuration: {} }] } },
    getTemplate: async id => { calls.push(['getTemplate', id]); return record(id) },
    updateTemplate: async payload => { calls.push(['updateTemplate', structuredClone(payload)]); return undefined },
    createTemplate: async payload => { calls.push(['createTemplate', structuredClone(payload)]); return undefined },
  }
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('actual template conversion preserves ID, provider fields, variable metadata and dynamic recipients', () => {
  const original = record()
  const draft = model.createTemplateDraft(original)
  draft.subject = 'Changed'
  const payload = model.buildTemplatePayload(draft)
  assert.equal(payload.id, original.id)
  assert.equal(payload.type, 'email')
  assert.deepEqual(payload.template.sendTo, [])
  assert.deepEqual(payload.template.providerExtra, { untouched: true })
  assert.deepEqual(payload.variableDefinitions[0].expands, { x: true })
  assert.equal(original.template.subject, 'Alarm ${device.name}')
})

test('new generic provider templates use valid object JSON and do not inherit email fields', () => {
  const channel = shared.findNotificationChannel('webhook:http')
  const draft = model.newTemplateDraft(channel)
  draft.name = 'Webhook'
  draft.templateJson = '{"body":"${device.name}","method":"POST"}'
  assert.deepEqual(model.buildTemplatePayload(draft).template, { body: '${device.name}', method: 'POST' })
  draft.templateJson = '[]'
  assert.throws(() => model.buildTemplatePayload(draft), /invalidJson/)
  draft.templateJson = '{'
  assert.throws(() => model.buildTemplatePayload(draft), /invalidJson/)
})

test('variable identifiers are validated and insertion replaces selection at the actual caret', () => {
  assert.deepEqual(model.insertTemplateVariable('before selected after', 'device.name', 7, 15), { text: 'before ${device.name} after', caret: 21 })
  const draft = model.createTemplateDraft(record())
  draft.variables.push({ id: 'device.name' })
  assert.throws(() => model.buildTemplatePayload(draft), /invalidVariables/)
  assert.equal(model.previewTemplateText('${device.name}/${missing}', { 'device.name': '<script>bad</script>' }), '<script>bad</script>/${missing}')
})

test('attachment validation rejects unsafe URLs and duplicate names while allowing runtime references', () => {
  const draft = model.createTemplateDraft(record())
  draft.attachments = [{ name: 'report.pdf', location: 'javascript:alert(1)' }]
  assert.throws(() => model.buildTemplatePayload(draft), /invalidAttachment/)
  draft.attachments = [{ name: 'report.pdf', location: '${report}' }]
  assert.equal(model.buildTemplatePayload(draft).template.attachments[0].location, '${report}')
  draft.attachments.push({ name: 'report.pdf', location: '/files/second' })
  assert.throws(() => model.buildTemplatePayload(draft), /duplicateAttachment/)
  assert.equal(model.attachmentFromUpload({ name: 'x', status: 'error' }, () => '/files/x'), undefined)
  assert.equal(model.attachmentFromUpload({ name: 'x', status: 'done', response: { success: false } }, () => '/files/x'), undefined)
})

test('workspace queries real type/provider terms and keeps distinct drafts when switching templates', async () => {
  const api = mockApi()
  const workspace = useTemplateWorkspace(access(), api)
  await workspace.loadChannel('email:embedded', 'template-one')
  workspace.draft.value.subject = 'Unsaved subject'
  await workspace.selectTemplate('template-two')
  workspace.draft.value.text = 'Another draft'
  await workspace.selectTemplate('template-one')
  assert.equal(workspace.draft.value.subject, 'Unsaved subject')
  assert.equal(workspace.hasDirtyDrafts.value, true)
  assert.equal(api.calls.filter(call => call[0] === 'getTemplate' && call[1] === 'template-one').length, 1)
  assert.deepEqual(api.calls[0][1].terms.map(term => [term.column, term.value]), [['type', 'email'], ['provider', 'embedded']])
})

test('failed saves keep all inputs and baseline dirty; success updates the one actual template ID', async () => {
  const api = mockApi()
  const workspace = useTemplateWorkspace(access(), api)
  await workspace.loadChannel('email:embedded', 'template-one')
  const draft = workspace.draft.value
  draft.subject = 'Unsaved subject'
  api.updateTemplate = async () => { throw { response: { status: 403 } } }
  assert.equal(await workspace.saveTemplate(), false)
  assert.equal(workspace.saveState.value, 'forbidden')
  assert.equal(workspace.draft.value, draft)
  assert.equal(workspace.dirty.value, true)
  api.updateTemplate = async payload => { api.calls.push(['saved', structuredClone(payload)]) }
  assert.equal(await workspace.saveTemplate(), true)
  const saved = api.calls.find(call => call[0] === 'saved')[1]
  assert.equal(saved.id, 'template-one')
  assert.equal(saved.template.subject, 'Unsaved subject')
  assert.equal(workspace.dirty.value, false)
})

test('forbidden, empty, unavailable and request failure remain distinct without fake results', async () => {
  const api = mockApi()
  const denied = useTemplateWorkspace(access(false), api)
  await denied.loadChannel('email:embedded')
  assert.equal(denied.listState.value, 'forbidden')
  assert.equal(api.calls.length, 0)
  const workspace = useTemplateWorkspace(access(), api)
  await workspace.loadChannel('unknown')
  assert.equal(workspace.listState.value, 'unavailable')
  api.queryTemplates = async () => ({ data: [] })
  await workspace.loadChannel('email:embedded')
  assert.equal(workspace.listState.value, 'empty')
  api.queryTemplates = async () => { throw new Error('offline') }
  await workspace.loadChannel('email:embedded')
  assert.equal(workspace.listState.value, 'error')
})

test('older detail responses cannot replace a newer selection or cross a changed channel', async () => {
  const api = mockApi()
  const slow = deferred()
  api.getTemplate = id => id === 'slow' ? slow.promise : Promise.resolve(record(id))
  const workspace = useTemplateWorkspace(access(), api)
  await workspace.loadChannel('email:embedded')
  const pending = workspace.selectTemplate('slow')
  await workspace.selectTemplate('fast')
  slow.resolve(record('slow'))
  await pending
  assert.equal(workspace.draft.value.id, 'fast')
  const slow2 = deferred()
  api.getTemplate = () => slow2.promise
  const pending2 = workspace.selectTemplate('old')
  await workspace.loadChannel('webhook:http')
  slow2.resolve(record('old'))
  await pending2
  assert.equal(workspace.draft.value, undefined)
})

test('new templates with an unknown response ID are refreshed without guessing a directory selection', async () => {
  const api = mockApi()
  const workspace = useTemplateWorkspace(access(), api)
  await workspace.loadChannel('email:embedded')
  workspace.createTemplate('smtp-one')
  workspace.draft.value.name = 'New template'
  workspace.draft.value.subject = 'Subject'
  workspace.draft.value.text = 'Body'
  assert.equal(await workspace.saveTemplate(), true)
  assert.equal(workspace.activeKey.value, '')
  assert.equal(api.calls.find(call => call[0] === 'createTemplate')[1].id, undefined)
})

test('refreshing changed configurations keeps the active template draft and fixed config ID', async () => {
  const api = mockApi()
  const workspace = useTemplateWorkspace(access(), api)
  await workspace.loadChannel('email:embedded', 'template-one')
  workspace.draft.value.subject = 'Draft remains'
  api.queryConfigs = async () => ({ data: [{ id: 'smtp-two', name: 'Second', type: 'email', provider: 'embedded', configuration: {} }] })
  await workspace.refreshConfigs()
  assert.equal(workspace.draft.value.subject, 'Draft remains')
  assert.equal(workspace.draft.value.configId, 'smtp-one')
  assert.deepEqual(workspace.configs.value.map(item => item.id), ['smtp-two'])
})

test('cached template drafts cannot be displayed under another provider channel', async () => {
  const api = mockApi()
  const workspace = useTemplateWorkspace(access(), api)
  await workspace.loadChannel('email:embedded', 'template-one')
  workspace.draft.value.text = 'Private email draft'
  await workspace.loadChannel('sms:aliyunSms', 'template-one')
  assert.equal(workspace.detailState.value, 'unavailable')
  assert.equal(workspace.draft.value, undefined)
  assert.equal(await workspace.saveTemplate(), false)
  await workspace.loadChannel('email:embedded', 'template-one')
  assert.equal(workspace.detailState.value, 'ready')
  assert.equal(workspace.draft.value.text, 'Private email draft')
})

test('permission revocation invalidates pending config requests before an early return', async () => {
  const api = mockApi()
  const slow = deferred()
  api.queryConfigs = () => slow.promise
  const permissions = access()
  const workspace = useTemplateWorkspace(permissions, api)
  await workspace.loadChannel('email:embedded')
  permissions.query.value = false
  await workspace.loadChannel('email:embedded')
  slow.resolve({ data: [{ id: 'late', name: 'Late', type: 'email', provider: 'embedded', configuration: {} }] })
  await Promise.resolve()
  await vue.nextTick()
  assert.equal(workspace.configState.value, 'forbidden')
  assert.deepEqual(workspace.configs.value, [])
})

test('valid named runtime attachments remain supported without a fixed location', () => {
  const draft = model.createTemplateDraft(record('runtime', { template: { subject: 'Report', text: 'Report body', attachments: [{ name: 'report.pdf' }] } }))
  assert.deepEqual(model.buildTemplatePayload(draft).template.attachments, [{ name: 'report.pdf', location: '' }])
})

test('stored platform attachment IDs and base64 resources round-trip and core resolves IDs as platform files', () => {
  const attachments = [
    { name: 'platform.pdf', location: 'file_01H9V8A7B6' },
    { name: 'inline.txt', location: 'data:text/plain;base64,cmVwb3J0' },
    { name: 'server.pdf', location: 'file:///srv/reports/daily.pdf' },
  ]
  const draft = model.createTemplateDraft(record('attachments', { template: { subject: 'Subject', text: 'Body', attachments } }))
  draft.subject = 'Updated subject'
  assert.deepEqual(model.buildTemplatePayload(draft).template.attachments, attachments)
  const file = model.attachmentToUploadFile(draft.attachments[0], 0)
  assert.equal(file.url, undefined)
  assert.equal(file.response.result.id, 'file_01H9V8A7B6')
  const { getFileDownloadUrl } = load(resolve(root, '../../jetlinks-web-core/src/components/Upload/File/useFileDownload.ts'))
  const previousWindow = globalThis.window
  globalThis.window = { location: { href: 'https://console.example.test/current/page' } }
  try {
    assert.equal(getFileDownloadUrl(file), 'https://console.example.test/files/file_01H9V8A7B6')
    assert.equal(getFileDownloadUrl(model.attachmentToUploadFile(draft.attachments[1], 1)), attachments[1].location)
    assert.equal(getFileDownloadUrl(model.attachmentToUploadFile({ name: 'runtime', location: '${reportFile}' }, 2)), undefined)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
  assert.equal(model.validAttachmentLocation('file_01H9V8A7B6'), true)
  assert.equal(model.validAttachmentLocation('data:application/pdf;base64,cmVwb3J0'), true)
})

test('actual editor setup restores focus and inserts a variable over the selected range', async () => {
  const Editor = load(resolve(templatesRoot, 'components/TemplateEditor.vue'), false).default
  const draft = model.createTemplateDraft(record())
  draft.text = 'abc selected xyz'
  let focused = false
  let selection
  const setup = Editor.setup({ draft, existing: true, configs: [], configState: 'ready' }, { expose() {}, emit() {} })
  setup.captureCaret({ target: { selectionStart: 4, selectionEnd: 12, focus: () => { focused = true }, setSelectionRange: (...args) => { selection = args } } }, 'text')
  await setup.insertVariable('device.name')
  assert.equal(draft.text, 'abc ${device.name} xyz')
  assert.equal(focused, true)
  assert.deepEqual(selection, [18, 18])
})

test('actual preview renders escaped example text without executable HTML', async () => {
  const Preview = load(resolve(templatesRoot, 'components/TemplatePreview.vue')).default
  const draft = model.createTemplateDraft(record())
  draft.text = '<img src=x onerror=alert(1)> ${device.name}'
  draft.variables[0].defaultValue = '<script>alert(2)</script>'
  const app = vue.createSSRApp(Preview, { draft })
  app.config.warnHandler = () => {}
  const html = await renderToString(app)
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(html.includes('&lt;script&gt;alert(2)&lt;/script&gt;'))
  assert.ok(!html.includes('<script>alert'))
})

test('actual upload component reports pending status, retains previous attachments on failure and emits real references', () => {
  const Editor = load(resolve(templatesRoot, 'components/AttachmentEditor.vue'), false).default
  const attachments = [{ name: 'first.pdf', location: '/files/first' }]
  const events = []
  const setup = Editor.setup({ attachments, disabled: false }, { expose() {}, emit: (...args) => events.push(args) })
  setup.uploadChanged({ file: { uid: 'pending', name: 'second.pdf', status: 'uploading' } })
  assert.deepEqual(events.at(-1), ['uploading', true])
  setup.uploadChanged({ file: { uid: 'pending', name: 'second.pdf', status: 'error' } })
  assert.equal(events.some(event => event[0] === 'update:attachments'), false)
  assert.equal(attachments.length, 1)
  setup.uploadChanged({ file: { uid: 'done', name: 'second.pdf', status: 'done', response: { success: true, result: { accessUrl: 'https://example.test/file?accessKey=token' } } } })
  assert.deepEqual(events.at(-1), ['update:attachments', [...attachments, { name: 'second.pdf', location: 'https://example.test/file?accessKey=token' }]])
  assert.equal(setup.beforeUpload({ name: 'large.pdf', size: 10 * 1024 * 1024 }, []), require('ant-design-vue').Upload.LIST_IGNORE)
})

test('two upload completions before the parent applies props preserve both files and the existing attachment', () => {
  const Editor = load(resolve(templatesRoot, 'components/AttachmentEditor.vue'), false).default
  const attachments = [{ name: 'first.pdf', location: 'existing-platform-file-id' }]
  const events = []
  const setup = Editor.setup({ attachments, disabled: false }, { expose() {}, emit: (...args) => events.push(args) })
  setup.uploadChanged({ file: { uid: 'second', name: 'second.pdf', status: 'uploading' } })
  setup.uploadChanged({ file: { uid: 'third', name: 'third.pdf', status: 'uploading' } })
  assert.deepEqual(setup.files.value.filter(file => file.status === 'uploading').map(file => file.uid), ['second', 'third'])
  setup.uploadChanged({ file: { uid: 'second', name: 'second.pdf', status: 'done', response: { result: { accessUrl: 'https://files.example.test/second' } } } })
  assert.equal(setup.files.value.find(file => file.uid === 'third').status, 'uploading')
  setup.uploadChanged({ file: { uid: 'third', name: 'third.pdf', status: 'done', response: { result: { accessUrl: 'https://files.example.test/third' } } } })
  assert.deepEqual(events.filter(event => event[0] === 'update:attachments').at(-1)[1], [
    ...attachments,
    { name: 'second.pdf', location: 'https://files.example.test/second' },
    { name: 'third.pdf', location: 'https://files.example.test/third' },
  ])
  assert.equal(attachments.length, 1)
  assert.deepEqual(events.filter(event => event[0] === 'uploading').at(-1), ['uploading', false])
  assert.equal(setup.files.value[0].url, undefined)
  assert.equal(setup.files.value[0].response.result.id, 'existing-platform-file-id')
})

test('actual page route guard keeps dirty drafts on cancel and confirms leaving; creation success stays visible', async () => {
  const route = vue.reactive({ query: { channel: 'email:embedded' } })
  let leaveGuard
  dependencies['vue-router'] = {
    useRoute: () => route,
    useRouter: () => ({ replace: async target => { route.query = target.query; await vue.nextTick() } }),
    onBeforeRouteLeave: callback => { leaveGuard = callback },
  }
  dependencies['@jetlinks-web/hooks'] = { usePermission: () => ({ hasPerm: vue.ref(true) }) }
  dependencies['@jetlinks-web/core'].request.get = async () => ({ success: true, result: [] })
  dependencies['@jetlinks-web/core'].request.post = async () => ({ success: true, result: { data: [] } })
  const Page = load(resolve(templatesRoot, 'index.vue'), false).default
  let page
  const renderer = vue.createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {},
    setText() {}, setElementText() {}, patchProp() {}, parentNode: () => null, nextSibling: () => null,
  })
  const app = renderer.createApp({ setup(_, context) { page = Page.setup({}, context); return () => null } })
  app.mount({})
  await Promise.resolve()
  await vue.nextTick()
  page.workspace.createTemplate()
  page.workspace.draft.value.name = 'New draft'
  page.workspace.draft.value.subject = 'Subject'
  page.workspace.draft.value.text = 'Body'
  const cancelled = leaveGuard()
  assert.equal(page.confirmation.open, true)
  page.resolveConfirmation(false)
  assert.equal(await cancelled, false)
  assert.equal(page.workspace.draft.value.text, 'Body')
  const confirmed = leaveGuard()
  page.resolveConfirmation(true)
  assert.equal(await confirmed, true)
  await page.save()
  assert.equal(page.saved.value, true)
  assert.equal(page.workspace.draft.value, undefined)
  assert.equal(page.workspace.hasDirtyDrafts.value, false)
  app.unmount()
})

async function settlePage() {
  for (let index = 0; index < 12; index++) { await Promise.resolve(); await vue.nextTick() }
}

async function mountTemplatePage(query = {}, permission = () => true, overrides = {}) {
  const route = vue.reactive({ query })
  const api = mockApi()
  api.queryTemplates = async () => ({ data: [record('first'), record('second')] })
  Object.assign(api, overrides)
  const facade = load(resolve(root, 'api/notice/messageNotification.ts'), false).messageNotificationApi
  const original = { ...facade }
  Object.assign(facade, api)
  Object.assign(dependencies['vue-router'] ||= {}, {
    useRoute: () => route,
    useRouter: () => ({ replace: async target => { route.query = target.query; await vue.nextTick() } }),
    onBeforeRouteLeave() {},
  })
  dependencies['@jetlinks-web/hooks'] ||= {}
  dependencies['@jetlinks-web/hooks'].usePermission = code => ({ hasPerm: vue.ref(permission(code.value)) })
  const Page = load(resolve(templatesRoot, 'index.vue'), false).default
  let page
  const renderer = vue.createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {},
    setText() {}, setElementText() {}, patchProp() {}, parentNode: () => null, nextSibling: () => null,
  })
  const app = renderer.createApp({ setup(_, context) { page = Page.setup({}, context); return () => null } })
  app.mount({})
  await settlePage()
  return { page, route, api, facade, close() { app.unmount(); Object.assign(facade, original) } }
}

const business = (provider = 'scene', templateId = 'second', channelProvider = 'notifier-email') => ({
  id: `id-${provider}`, provider, name: provider,
  channels: templateId ? [{ channelProvider, channelConfiguration: { templateId } }] : [],
})

test('business entry resolves the actual bound template/provider and preserves its topic and return context', async () => {
  const current = await mountTemplatePage({ topicProvider: 'scene', channelProvider: 'notifier-dingTalk', q: 'kept' }, () => true, {
    queryTemplateDirectory: async () => [business('scene', 'ding-template', 'notifier-dingTalk')],
    getBusinessTemplate: async (owner, type) => type === 'notifier-dingTalk' ? { channel: { providerId: owner, channelProvider: type }, template: record('ding-template', { type: 'dingTalk', provider: 'dingTalkMessage', configId: 'ding-config' }) } : undefined,
    queryTemplates: async () => ({ data: [record('ding-template', { type: 'dingTalk', provider: 'dingTalkMessage', configId: 'ding-config' })] }),
  })
  try {
    assert.equal(current.page.channelId.value, 'dingTalk:dingTalkMessage')
    assert.equal(current.route.query.topicProvider, 'scene')
    assert.equal(current.page.draft.value.configId, 'ding-config')
    assert.equal(current.route.query.q, 'kept')
    assert.equal(current.page.draft.value.id, 'ding-template')
    current.page.startEditing()
    current.page.draft.value.name = 'Keep business draft'
    current.page.changeChannel('email:embedded')
    await settlePage()
    assert.equal(current.page.draft.value.type, 'email')
    assert.equal(current.page.businessLinkState.value, 'ready')
    current.page.changeChannel('dingTalk:dingTalkMessage')
    await settlePage()
    assert.equal(current.page.draft.value.name, 'Keep business draft')
  } finally { current.close() }
})

test('missing, ambiguous or denied business bindings never select an unrelated first template', async () => {
  for (const [directory, expected] of [
    [async () => [business('other')], 'unavailable'],
    [async () => [business(), { ...business(), id: 'other-scope' }], 'unavailable'],
    [async () => { throw { status: 403 } }, 'forbidden'],
  ]) {
    const current = await mountTemplatePage({ topicProvider: 'scene' }, () => true, { queryTemplateDirectory: directory })
    try {
      assert.equal(current.page.draft.value, undefined)
      assert.equal(current.route.query.templateId, undefined)
      assert.equal(current.page.businessLinkState.value, expected)
    } finally { current.close() }
  }
})

test('business resolution ignores late template reads after the user follows an explicit deep link', async () => {
  const late = deferred()
  const current = await mountTemplatePage({ topicProvider: 'scene' }, () => true, {
    queryTemplateDirectory: async () => [business('scene', 'late')],
    getBusinessTemplate: () => late.promise,
  })
  try {
    current.route.query = { channel: 'email:embedded', templateId: 'second' }
    await settlePage()
    late.resolve(record('late', { type: 'dingTalk', provider: 'dingTalkMessage' }))
    await settlePage()
    assert.equal(current.page.draft.value.id, 'second')
    assert.equal(current.route.query.channel, 'email:embedded')
  } finally { current.close() }
})

test('only a successfully saved business-bound template emits the original AI alarm session event', async () => {
  const OriginalBroadcast = globalThis.BroadcastChannel
  const events = []
  globalThis.BroadcastChannel = class {
    constructor(name) { this.name = name }
    postMessage(value) { events.push([this.name, value]) }
    close() {}
  }
  const current = await mountTemplatePage({ topicProvider: 'aiSecurityAlarm', aiAlarmType: 'aiSecurityAlarm', visualAlarmSession: 'a'.repeat(32) }, () => true, {
    queryTemplateDirectory: async () => [business('aiSecurityAlarm')],
  })
  try {
    current.page.startEditing()
    current.page.draft.value.subject = 'Changed'
    current.facade.saveBusinessTemplate = async () => { throw new Error('offline') }
    await current.page.save()
    assert.equal(events.length, 0)
    current.facade.saveBusinessTemplate = current.api.saveBusinessTemplate
    await current.page.save()
    assert.deepEqual(events, [[`jetlinks.visual-alarm-template.v1.${'a'.repeat(32)}`, { type: 'template-saved', version: 1, alarmType: 'aiSecurityAlarm' }]])
    current.page.selectTemplate('first')
    await settlePage()
    current.page.draft.value.subject = 'Other template'
    await current.page.save()
    assert.equal(events.length, 1)
  } finally { current.close(); globalThis.BroadcastChannel = OriginalBroadcast }
})

test('page opens a real template preview, honors deep links and keeps the selection on repeated channel clicks', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded' })
  try {
    assert.equal(current.page.draft.value.id, 'first')
    assert.equal(current.route.query.templateId, 'first')
    assert.equal(current.page.editing.value, false)
    current.page.changeChannel('email:embedded')
    await settlePage()
    assert.equal(current.route.query.templateId, 'first')
    current.page.startEditing()
    assert.equal(current.page.editing.value, true)
    await current.page.requestDiscard()
    assert.equal(current.page.confirmation.open, false)
    assert.equal(current.page.editing.value, false)
  } finally { current.close() }
  const linked = await mountTemplatePage({ channel: 'email:embedded', templateId: 'second' })
  try { assert.equal(linked.page.draft.value.id, 'second'); assert.equal(linked.page.editing.value, false) }
  finally { linked.close() }
})

test('switching templates resumes only the dirty draft, and cancel discards only the active record', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded', templateId: 'first' })
  try {
    const { page } = current
    page.startEditing()
    page.draft.value.subject = 'Keep first draft'
    page.selectTemplate('second')
    await settlePage()
    assert.equal(page.editing.value, false)
    page.startEditing()
    page.draft.value.subject = 'Discard second draft'
    let cancel = page.requestDiscard()
    assert.equal(page.confirmation.open, true)
    page.resolveConfirmation(false)
    await cancel
    assert.equal(page.draft.value.subject, 'Discard second draft')
    assert.equal(page.editing.value, true)
    cancel = page.requestDiscard()
    page.resolveConfirmation(true)
    await cancel
    await settlePage()
    assert.equal(page.editing.value, false)
    assert.equal(page.draft.value.subject, 'Alarm ${device.name}')
    assert.equal(page.workspace.hasDirtyDrafts.value, true)
    page.selectTemplate('first')
    await settlePage()
    assert.equal(page.editing.value, true)
    assert.equal(page.draft.value.subject, 'Keep first draft')
  } finally { current.close() }
})

test('failed saves retain editing and successful saves return to preview without changing the template identity', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded', templateId: 'first' })
  try {
    current.page.startEditing()
    current.page.draft.value.subject = 'Changed subject'
    current.facade.updateTemplate = async () => { throw new Error('offline') }
    await current.page.save()
    assert.equal(current.page.editing.value, true)
    assert.equal(current.page.draft.value.subject, 'Changed subject')
    assert.equal(current.page.saved.value, false)
    current.facade.updateTemplate = current.api.updateTemplate
    await current.page.save()
    await settlePage()
    assert.equal(current.page.editing.value, false)
    assert.equal(current.page.saved.value, true)
    assert.equal(current.page.draft.value.subject, 'Changed subject')
    assert.equal(current.route.query.templateId, 'first')
  } finally { current.close() }
})

test('new templates start editing, can be cancelled without a write, and read-only users cannot start editing', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded' })
  try {
    await current.page.createTemplate()
    await settlePage()
    assert.equal(current.page.entry.value.existing, false)
    assert.equal(current.page.editing.value, true)
    current.page.draft.value.name = 'Cancelled new template'
    const cancel = current.page.requestDiscard()
    current.page.resolveConfirmation(true)
    await cancel
    await settlePage()
    assert.equal(current.page.draft.value, undefined)
    assert.equal(current.page.editing.value, false)
    assert.equal(current.page.workspace.hasDirtyDrafts.value, false)
    assert.equal(current.api.calls.some(([name]) => name === 'createTemplate'), false)
  } finally { current.close() }
  const readonly = await mountTemplatePage({ channel: 'email:embedded' }, code => String(code).endsWith(':query'))
  try {
    assert.equal(readonly.page.draft.value.id, 'first')
    readonly.page.startEditing()
    assert.equal(readonly.page.editing.value, false)
    assert.equal(readonly.page.canSave.value, false)
  } finally { readonly.close() }
})


test('business directory retains only business groups and actual bindings without guessing name associations', () => {
  const { buildTemplateDirectory, filterTemplateDirectory, flattenTemplateDirectory } = load(resolve(templatesRoot, 'templateDirectoryModel.ts'))
  const templates = [record('template-alarm'), ...directoryFixture.templates, record('template-maintenance'), record('unbound', { name: '设备告警 · 邮件' })]
  const tree = buildTemplateDirectory(templates, directoryFixture.businessTypes, { other: '其他' }, key => key)
  assert.deepEqual(tree.map(node => node.title), ['物联告警', '视联告警', '其他'])
  const alarm = tree[0].children[0]
  assert.equal(alarm.title, '设备告警')
  assert.equal(alarm.templateId, 'template-alarm')
  assert.equal(alarm.children[0].title, '告警解除')
  assert.equal(alarm.children[0].templateId, 'template-relieve')
  assert.equal(tree[1].children[0].selectable, true)
  assert.ok(flattenTemplateDirectory(tree).every(node => node.templateId !== 'unbound'))
  assert.deepEqual(buildTemplateDirectory(templates, [], { other: '其他' }, key => key), [])
  const filtered = filterTemplateDirectory(tree, 'TEMPLATE-RELIEVE')
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].title, '物联告警')
  assert.equal(filtered[0].children[0].children[0].templateId, 'template-relieve')
  assert.deepEqual(filterTemplateDirectory(tree, 'missing-value'), [])
  assert.equal(filterTemplateDirectory(tree, '视联告警')[0].children.length, 2)
  const orphan = buildTemplateDirectory(templates, [directoryFixture.businessTypes[1]], { other: '其他' }, key => key)
  assert.equal(orphan[0].children[0].templateId, 'template-relieve')
})

test('directory selects the child actual ID, preserves group and business collapse on search and reveals deep-linked children', async () => {
  const { useTemplateDirectory } = load(resolve(templatesRoot, 'hooks/useTemplateDirectory.ts'))
  const props = vue.reactive({ templates: [record('template-alarm'), ...directoryFixture.templates], businessTypes: directoryFixture.businessTypes,
    selectedId: 'template-alarm', state: 'ready', directoryState: 'ready', disabled: false })
  const events = []
  const scope = vue.effectScope()
  const directory = scope.run(() => useTemplateDirectory(props, (...args) => events.push(args)))
  const group = directory.visibleTemplates.value[0]
  const parent = group.children[0]
  const child = parent.children[0]
  assert.ok(directory.expandedKeys.value.includes(parent.key))
  directory.expand([group.key])
  assert.ok(!directory.expandedKeys.value.includes(parent.key))
  directory.expand([])
  assert.ok(!directory.expandedKeys.value.includes(group.key))
  directory.search.value = '解除'
  assert.ok(directory.expandedKeys.value.includes(group.key))
  assert.ok(directory.expandedKeys.value.includes(parent.key))
  directory.expand([])
  assert.ok(directory.expandedKeys.value.includes(group.key))
  directory.search.value = ''
  assert.ok(!directory.expandedKeys.value.includes(group.key))
  assert.ok(!directory.expandedKeys.value.includes(parent.key))
  directory.select([child.key])
  assert.deepEqual(events, [['business', 'relieve-config']])
  directory.select([])
  directory.select([group.key])
  props.disabled = true
  directory.select([parent.key])
  assert.equal(events.length, 1)
  props.selectedId = 'template-relieve'
  await vue.nextTick()
  assert.deepEqual(directory.selectedKeys.value, [child.key])
  assert.ok(directory.expandedKeys.value.includes(group.key))
  assert.ok(directory.expandedKeys.value.includes(parent.key))
  scope.stop()
})

test('business directory ignores late responses after refresh, permission loss and unmount', async () => {
  const { useTemplateBusinessDirectory } = load(resolve(templatesRoot, 'hooks/useTemplateBusinessDirectory.ts'))
  const slow = deferred()
  const allowed = vue.ref(true)
  const api = { ...mockApi(), queryTemplateDirectory: () => slow.promise }
  const scope = vue.effectScope()
  const directory = scope.run(() => useTemplateBusinessDirectory(allowed, api))
  api.queryTemplateDirectory = async () => directoryFixture.businessTypes
  await directory.reloadDirectory()
  slow.resolve([])
  await settlePage()
  assert.equal(directory.businessTypes.value.length, directoryFixture.businessTypes.length)
  const revoked = deferred()
  api.queryTemplateDirectory = () => revoked.promise
  const pending = directory.reloadDirectory()
  allowed.value = false
  await vue.nextTick()
  revoked.resolve(directoryFixture.businessTypes)
  await pending
  assert.equal(directory.directoryState.value, 'forbidden')
  assert.deepEqual(directory.businessTypes.value, [])
  const unmounted = deferred()
  api.queryTemplateDirectory = () => unmounted.promise
  allowed.value = true
  await vue.nextTick()
  scope.stop()
  unmounted.resolve(directoryFixture.businessTypes)
  await settlePage()
  assert.deepEqual(directory.businessTypes.value, [])
})

test('explicit activation creates one real business record and unbound business is editable only afterwards', async () => {
  let directory = [{ provider: 'scene', name: 'Scene', state: 'disabled', channels: [] }]
  const current = await mountTemplatePage({ topicProvider: 'scene' }, () => true, {
    queryTemplateDirectory: async () => directory,
    getBusinessTemplate: async () => undefined,
    setBusinessEnabled: async (id, enabled) => { assert.equal(id, 'scene'); assert.equal(enabled, true); directory = [{ ...directory[0], id: 'actual-scope-id', state: 'enabled' }] },
  })
  try {
    assert.equal(current.page.draft.value, undefined)
    await current.page.save()
    assert.equal(current.api.calls.some(call => call[0] === 'saveBusinessTemplate'), false)
    await current.page.toggleBusiness()
    await settlePage()
    assert.equal(current.route.query.topicProvider, 'actual-scope-id')
    assert.equal(current.page.selectedBusinessId.value, 'actual-scope-id')
    assert.equal(current.page.draft.value.type, 'email')
    assert.equal(current.page.editing.value, true)
    assert.equal(current.page.channelEnabled.value, true)
  } finally { current.close() }
})

test('read-only template users query independent templates without requesting all-for-save or enabling businesses', async () => {
  let reads = 0, writes = 0
  const current = await mountTemplatePage({ templateId: 'first', channel: 'email:embedded' }, code => code.endsWith(':query'), {
    queryTemplateDirectory: async () => { reads++; return [business()] }, setBusinessEnabled: async () => { writes++ },
  })
  try {
    assert.equal(current.page.draft.value.id, 'first')
    assert.equal(current.page.canManage.value, false)
    assert.equal(current.page.canSave.value, false)
    await current.page.toggleBusiness()
    assert.equal(reads, 0)
    assert.equal(writes, 0)
  } finally { current.close() }
})

test('five business channels save single bindings, preserve states and receiver mapping, and use server IDs on repeat saves', async () => {
  const { useBusinessTemplateWorkspace } = load(resolve(templatesRoot, 'hooks/useBusinessTemplateWorkspace.ts'))
  const samples = [
    ['email:embedded', 'sendTo', {}],
    ['dingTalk:dingTalkMessage', 'userIdList', { agentId: 'real-agent', message: '${message}' }],
    ['weixin:corpMessage', 'toUser', { message: '${message}' }],
    ['voice:aliyun', 'calledNumber', { templateType: 'tts', templateCode: 'TTS_REAL', ttsmessage: '${name}', playTimes: 1 }],
    ['sms:aliyunSms', 'phoneNumber', { code: 'SMS_REAL', signName: 'ApprovedSign' }],
  ]
  for (const [channelId, receiver, content] of samples) {
    const api = mockApi()
    const owner = { ...business(), id: 'scope-a', defaultSubscribed: true, defaultNotifyChannels: ['sibling'], grant: { users: ['u1'] }, channels: [{ id: 'sibling', channelProvider: 'inside-mail' }] }
    const before = structuredClone(owner)
    let persisted
    api.getBusinessTemplate = async () => persisted
    const scope = vue.effectScope()
    const workspace = scope.run(() => useBusinessTemplateWorkspace(access(), api))
    try {
      await workspace.selectBusiness(owner, channelId)
      workspace.draft.value.configId = 'exact-config'
      workspace.draft.value.name = 'Business template'
      workspace.draft.value.subject = 'Subject'
      workspace.draft.value.text = 'Body'
      workspace.draft.value.templateJson = JSON.stringify(content)
      assert.equal(workspace.channelEnabled.value, true)
      assert.equal(await workspace.saveTemplate(), true)
      const first = api.calls.find(call => call[0] === 'saveBusinessTemplate')
      assert.equal(first[1], 'scope-a')
      assert.equal(first[3].channel.channelConfiguration.notifierId, 'exact-config')
      assert.equal(first[3].template.configId, 'exact-config')
      assert.equal(first[3].template.id, undefined)
      assert.equal(first[3].channel.channelConfiguration.variables[receiver].relation.objectSource.upperKey, 'subscriber')
      assert.equal(first[3].channel.providerId, 'scope-a')
      assert.equal(first[3].channel.channels, undefined)
      assert.deepEqual(owner, before)
      assert.equal(workspace.draft.value.id, 'stpl_binding')
      workspace.channelEnabled.value = false
      assert.equal(await workspace.saveTemplate(), true)
      const second = api.calls.filter(call => call[0] === 'saveBusinessTemplate')[1][3]
      assert.equal(second.template.id, 'stpl_binding')
      assert.equal(second.channel.state, 'disabled')
      assert.equal(workspace.channelEnabled.value, false)
      assert.equal(workspace.dirty.value, false)
      assert.equal(api.calls.some(call => ['createTemplate', 'updateTemplate', 'setBusinessEnabled'].includes(call[0])), false)
    } finally { scope.stop() }
  }
})

test('business drafts survive channel, vendor and asset-scope switches, failed saves and retries', async () => {
  const { useBusinessTemplateWorkspace } = load(resolve(templatesRoot, 'hooks/useBusinessTemplateWorkspace.ts'))
  const api = mockApi()
  const original = { id: 'binding', providerId: 'scope-a', channelProvider: 'notifier-email', state: { value: 'disabled' }, grant: { roles: ['role'] }, channelConfiguration: { templateId: 'old-independent', notifierId: 'smtp-one', variables: { custom: 'keep' } } }
  api.getBusinessTemplate = async (owner, type) => owner === 'scope-a' && type === 'notifier-email' ? { channel: original, template: record('old-independent', { type: 'email' }) } : undefined
  const scope = vue.effectScope()
  const workspace = scope.run(() => useBusinessTemplateWorkspace(access(), api))
  try {
    const owner = { ...business(), id: 'scope-a' }
    await workspace.selectBusiness(owner, 'email:embedded')
    assert.equal(workspace.channelEnabled.value, false)
    workspace.draft.value.subject = 'Unsaved A'
    await workspace.selectBusiness({ ...owner, id: 'scope-b' }, 'email:embedded')
    assert.notEqual(workspace.draft.value.subject, 'Unsaved A')
    await workspace.selectBusiness(owner, 'dingTalk:dingTalkRobotWebHook')
    workspace.draft.value.name = 'Robot draft'
    await workspace.selectBusiness(owner, 'dingTalk:dingTalkMessage')
    workspace.draft.value.name = 'Corp draft'
    await workspace.selectBusiness(owner, 'dingTalk:dingTalkRobotWebHook')
    assert.equal(workspace.draft.value.name, 'Robot draft')
    await workspace.selectBusiness(owner, 'email:embedded')
    assert.equal(workspace.draft.value.subject, 'Unsaved A')
    const save = api.saveBusinessTemplate
    api.saveBusinessTemplate = async () => { throw { status: 403 } }
    assert.equal(await workspace.saveTemplate(), false)
    assert.equal(workspace.saveState.value, 'forbidden')
    assert.equal(workspace.dirty.value, true)
    assert.equal(workspace.draft.value.subject, 'Unsaved A')
    api.saveBusinessTemplate = save
    assert.equal(await workspace.saveTemplate(), true)
    const payload = api.calls.find(call => call[0] === 'saveBusinessTemplate')[3]
    assert.equal(payload.template.id, undefined)
    assert.deepEqual(payload.channel.grant, original.grant)
    assert.equal(payload.channel.channelConfiguration.variables.custom, 'keep')
    assert.equal(original.channelConfiguration.templateId, 'old-independent')
  } finally { scope.stop() }
})

test('missing sending config and supplier fields block writes; imported history preserves managed target', async () => {
  const { useBusinessTemplateWorkspace } = load(resolve(templatesRoot, 'hooks/useBusinessTemplateWorkspace.ts'))
  const api = mockApi()
  api.getBusinessTemplate = async owner => ({ channel: { id: 'binding', providerId: owner, channelProvider: 'notifier-sms', channelConfiguration: { templateId: 'stpl_binding' } }, template: { ...record('stpl_binding'), type: 'sms', provider: 'aliyunSms', template: { code: 'SMS_OLD', signName: 'Old sign' } } })
  api.getTemplate = async id => ({ ...record(id), type: 'sms', provider: 'aliyunSms', configId: 'sms-source', template: { code: 'SMS_SOURCE', signName: 'Approved' } })
  const scope = vue.effectScope()
  const workspace = scope.run(() => useBusinessTemplateWorkspace(access(), api))
  try {
    await workspace.selectBusiness(business(), 'sms:aliyunSms')
    workspace.draft.value.configId = ''
    await assert.rejects(workspace.saveTemplate(), /configRequired/)
    workspace.draft.value.configId = 'sms-config'
    workspace.draft.value.templateJson = '{}'
    await assert.rejects(workspace.saveTemplate(), /providerFieldsRequired/)
    await workspace.importTemplate('historical-independent')
    assert.equal(await workspace.saveTemplate(), true)
    const payload = api.calls.find(call => call[0] === 'saveBusinessTemplate')[3]
    assert.equal(payload.template.id, 'stpl_binding')
    assert.equal(payload.template.configId, 'sms-source')
    assert.equal(payload.template.template.code, 'SMS_SOURCE')
    assert.equal(api.calls.some(call => call[0] === 'updateTemplate'), false)
  } finally { scope.stop() }
})

test('a placeholder cannot hide multiple asset scopes and a missing bound template cannot be treated as new', async () => {
  const current = await mountTemplatePage({ topicProvider: 'scene' }, () => true, {
    queryTemplateDirectory: async () => [{ provider: 'scene', channels: [] }, business(), { ...business(), id: 'another-scope' }],
  })
  try {
    assert.equal(current.page.businessLinkState.value, 'unavailable')
    assert.equal(current.page.draft.value, undefined)
    current.page.selectBusiness('another-scope')
    await settlePage()
    assert.equal(current.page.selectedBusinessId.value, 'another-scope')
  } finally { current.close() }
  const { useBusinessTemplateWorkspace } = load(resolve(templatesRoot, 'hooks/useBusinessTemplateWorkspace.ts'))
  const api = mockApi()
  api.getBusinessTemplate = async () => ({ channel: { channelConfiguration: { templateId: 'missing-template' } }, template: null })
  const scope = vue.effectScope()
  const workspace = scope.run(() => useBusinessTemplateWorkspace(access(), api))
  try {
    await workspace.selectBusiness(business(), 'email:embedded')
    assert.equal(workspace.detailState.value, 'unavailable')
    assert.equal(workspace.canSave.value, false)
    assert.equal(await workspace.saveTemplate(), false)
  } finally { scope.stop() }
})

test('business reads normalize enum values and discard late results after permission loss or disposal', async () => {
  const { useBusinessTemplateWorkspace } = load(resolve(templatesRoot, 'hooks/useBusinessTemplateWorkspace.ts'))
  const api = mockApi()
  api.getBusinessTemplate = async () => ({ channel: {}, template: record('enum-template') })
  const permissions = access()
  const scope = vue.effectScope()
  const workspace = scope.run(() => useBusinessTemplateWorkspace(permissions, api))
  await workspace.selectBusiness(business(), 'email:embedded')
  assert.equal(workspace.draft.value.id, 'enum-template')
  const late = deferred()
  api.getBusinessTemplate = () => late.promise
  const pending = workspace.selectBusiness({ ...business(), id: 'second-scope' }, 'email:embedded')
  permissions.add.value = false
  permissions.update.value = false
  late.resolve({ channel: {}, template: record('late') })
  await pending
  assert.equal(workspace.draft.value, undefined)
  assert.equal(workspace.canSave.value, false)
  scope.stop()
})


test('channel link opens the first alarm Webhook and fixes its exact record before further navigation', async () => {
  const reads = []
  const directory = [business('scene'), { ...business('alarm-device', ''), id: 'first-alarm' }, { ...business('alarm-device', ''), id: 'second-alarm' }]
  const current = await mountTemplatePage({ channel: 'webhook:http', businessSelection: 'first-alarm' }, () => true, {
    queryTemplateDirectory: async () => directory,
    getBusinessTemplate: async (owner, provider) => { reads.push({ owner, provider }); return undefined },
    queryTemplates: async () => ({ data: [] }),
  })
  try {
    assert.equal(current.page.selectedBusinessId.value, 'first-alarm')
    assert.equal(current.page.channelId.value, 'webhook:http')
    assert.deepEqual(current.route.query, { channel: 'webhook:http', topicProvider: 'first-alarm' })
    assert.deepEqual(reads, [{ owner: 'first-alarm', provider: 'notifier-webhook' }])
    directory.reverse()
    current.page.reload()
    await settlePage()
    assert.equal(current.page.selectedBusinessId.value, 'first-alarm')
    current.page.changeChannel('email:embedded')
    await settlePage()
    assert.equal(current.page.selectedBusinessId.value, 'first-alarm')
    assert.equal(current.page.channelId.value, 'email:embedded')
  } finally { current.close() }
})

test('first-alarm entry stays empty without alarms and never falls back to an unrelated saved template', async () => {
  const current = await mountTemplatePage({ channel: 'webhook:http', businessSelection: 'first-alarm' }, () => true, {
    queryTemplateDirectory: async () => [business('scene'), business('system-event')],
  })
  try {
    assert.equal(current.page.businessLinkState.value, 'empty')
    assert.equal(current.page.selectedBusinessId.value, '')
    assert.equal(current.page.draft.value, undefined)
    assert.equal(current.api.calls.some(([method]) => method === 'getTemplate'), false)
  } finally { current.close() }
})

test('first-alarm entry supports AI alarm placeholders without fabricating a saved record', async () => {
  const current = await mountTemplatePage({ channel: 'webhook:http', businessSelection: 'first-alarm' }, () => true, {
    queryTemplateDirectory: async () => [{ provider: 'aiSecurityAlarm', channels: [] }],
    getBusinessTemplate: async () => { throw new Error('placeholder must not read a saved record') },
  })
  try {
    assert.equal(current.page.selectedBusinessId.value, 'aiSecurityAlarm')
    assert.equal(current.route.query.topicProvider, 'aiSecurityAlarm')
    assert.equal(current.page.channelId.value, 'webhook:http')
    assert.equal(current.page.draft.value, undefined)
    assert.equal(current.page.businessEnabled.value, false)
  } finally { current.close() }
})
