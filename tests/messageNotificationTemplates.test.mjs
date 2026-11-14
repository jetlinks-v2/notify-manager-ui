import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import directoryFixture from './messageNotificationTemplateDirectoryFixture.mjs'
import { channelTypes, channelProviders } from './messageNotificationChannelFixtures.mjs'
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
  '@jetlinks-web-core/store/menu': { useMenuStore: () => ({ jumpPage() {} }) },
  // 页面守卫用例不渲染子组件，AutoTree 的真实布局由浏览器验证。
  '@jetlinks-web-core/components/AutoTree': { __esModule: true, default: () => null },
  '@jetlinks-web-core/components/Upload/File/index.vue': { __esModule: true, default: () => null },
  '@jetlinks-web-core/components/Upload/File/useFileDownload': { getFileDownloadUrl: file => file.response?.result?.accessUrl || file.url },
  '@jetlinks-web-core/components/Upload/utils': { createFileUploadCustomRequest: () => () => {} },
  '@notify-manager-ui/api/notice-center': Object.fromEntries([
    'queryAliyunSmsSigns_api', 'queryAliyunSmsTemplates_api', 'queryWechatCorpDepartments_api',
    'queryWechatCorpTags_api', 'queryWechatCorpUsers_api',
  ].map(name => [name, async () => ({ success: true, result: [] })])),
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
    if (name.endsWith('.css')) return {}
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
    queryTypes: async () => channelTypes,
    queryProviders: async type => channelProviders[type] || [],
    getTemplateMetadata: async () => ({ properties: [] }),
    queryAllConfigs: async () => [{ id: 'smtp-one', name: 'SMTP', type: 'email', provider: 'embedded', configuration: {} }],
    queryBusinessVariables: async () => [{ id: 'targetName', name: '设备名称', type: 'string' }],
    saveBusinessTemplates: async (provider, info) => ({ ...info, provider: { ...info.provider, id: `saved-${provider}` } }),
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

test('email saving converts legacy line breaks to HTML only at the persistence boundary', () => {
  const original = '第一行 <温度> & 告警\r\n第二行\n\n第三行'
  const draft = model.createTemplateDraft(record('legacy-email', { template: { subject: 'Subject', text: original } }))
  const before = model.templateDraftFingerprint(draft)
  const payload = model.buildTemplatePayload(draft)
  assert.equal(payload.template.text, '第一行 &lt;温度&gt; &amp; 告警<br>第二行<br><br>第三行')
  assert.equal(model.templateDraftFingerprint(draft), before)
  assert.equal(model.createTemplateDraft({ ...record(), template: payload.template }).text, payload.template.text)
  draft.text = '<p><strong>${device.name}</strong></p><p>第二段<br>第三行</p>'
  assert.equal(model.buildTemplatePayload(draft).template.text, draft.text)
  for (const empty of ['<p><br></p>', '<p>&nbsp;</p>']) {
    draft.text = empty
    assert.throws(() => model.buildTemplatePayload(draft), /contentRequired/)
  }
  draft.text = '&'.repeat(1025)
  assert.throws(() => model.buildTemplatePayload(draft), /contentLimit/)
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
  assert.deepEqual(api.calls.find(call => call[0] === 'queryTemplates')[1].terms.map(term => [term.column, term.value]), [['type', 'email'], ['provider', 'embedded']])
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
  await workspace.reloadCatalog()
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
  api.queryAllConfigs = async () => [{ id: 'smtp-two', name: 'Second', type: 'email', provider: 'embedded', configuration: {} }]
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
  api.queryAllConfigs = () => slow.promise
  const permissions = access()
  const workspace = useTemplateWorkspace(permissions, api)
  const pending = workspace.loadChannel('email:embedded')
  await settlePage()
  permissions.query.value = false
  await workspace.loadChannel('email:embedded')
  slow.resolve([{ id: 'late', name: 'Late', type: 'email', provider: 'embedded', configuration: {} }])
  await pending
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

test('all channel editors hide advanced settings and retain configuration, recipients and declarations', async () => {
  const Editor = load(resolve(templatesRoot, 'components/TemplateEditor.vue')).default
  const render = async (draft, configs) => {
    const app = vue.createSSRApp(Editor, { draft, existing: true, businessMode: true, configs, configState: 'ready' })
    app.config.warnHandler = () => {}
    return renderToString(app)
  }
  const channels = [
    ['email', 'embedded', { subject: 'Subject', text: 'Body', sendTo: ['existing@example.test'], attachments: [] }],
    ['dingTalk', 'dingTalkMessage', { agentId: 'agent-one', message: 'Title\nBody' }],
    ['dingTalk', 'dingTalkRobotWebHook', { messageType: 'markdown', markdown: { title: 'Title', text: 'Body' } }],
    ['weixin', 'corpMessage', { agentId: 'agent-one', message: 'Title\nBody' }],
    ['voice', 'aliyun', { templateType: 'tts', message: 'Body', playTimes: 1 }],
    ['sms', 'aliyunSms', { code: 'SMS_1', signName: 'Alarm', message: 'Body' }],
    ['webhook', 'http', { contextAsBody: false, body: '{"message":"Body"}' }],
    ['extension', 'custom', { content: 'Body' }],
  ]
  for (const [type, provider, template] of channels) {
    const draft = model.createTemplateDraft(record(`stored-${type}-${provider}`, { type, provider, configId: 'config-one', template,
      variableDefinitions: [{ id: 'detail.alarmTime', name: 'Alarm time', type: 'date', format: 'yyyy-MM-dd', required: true, defaultValue: '2026-01-01', expands: { preserved: true } }],
    }))
    const configs = ['config-one', 'config-two'].map(id => ({ id, name: id, type, provider }))
    const baseline = model.templateDraftFingerprint(draft)
    const html = await render(draft, configs)
    assert.ok(!html.includes('class="template-editor__advanced"'), `${type}:${provider}`)
    assert.ok(!html.includes('messageNotification.templates.visual.advancedSettings'))
    assert.ok(!html.includes('messageNotification.templates.addVariable'))
    assert.ok(!html.includes('messageNotification.templates.recipients'))
    assert.ok(!html.includes('messageNotification.templates.configPlaceholder'))
    assert.equal(model.templateDraftFingerprint(draft), baseline)
    for (const configId of ['', 'unavailable-config']) {
      draft.configId = configId
      const unconfiguredBaseline = model.templateDraftFingerprint(draft)
      const unconfigured = await render(draft, configs)
      assert.ok(!unconfigured.includes('class="template-editor__advanced"'))
      assert.ok(!unconfigured.includes('messageNotification.templates.addVariable'))
      assert.ok(unconfigured.includes('messageNotification.templates.configPlaceholder'))
      assert.equal(model.templateDraftFingerprint(draft), unconfiguredBaseline)
    }
  }
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

async function settlePage() {
  for (let index = 0; index < 24; index++) { await Promise.resolve(); await vue.nextTick() }
}

async function mountTemplatePage(query = {}, permission = () => true, options = {}) {
  const messages = []
  dependencies['@jetlinks-web/utils'].onlyMessage = (...args) => messages.push(args)
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  const route = vue.reactive({ query })
  const api = mockApi()
  const businessTypes = clone(options.businessTypes ?? directoryFixture.businessTypes)
  const records = new Map()
  const independent = [record('first'), record('second')]
  for (const business of businessTypes) {
    business.channels = (business.channels || []).map(binding => {
      const template = record(binding.channelConfiguration.templateId)
      const channel = { ...binding, providerId: business.id,
        channelConfiguration: { ...binding.channelConfiguration, notifierId: template.configId } }
      records.set(`${business.id}/${channel.channelProvider}`, { channel, template })
      return channel
    })
  }
  api.queryTemplateDirectory = async () => clone(businessTypes)
  api.queryAllConfigs = async () => [
    { id: 'smtp-one', name: 'SMTP', type: 'email', provider: 'embedded', configuration: {} },
    { id: 'hook-one', name: 'HTTP', type: 'webhook', provider: 'http', configuration: {} },
  ]
  api.queryTemplates = async query => {
    api.calls.push(['queryTemplates', clone(query)])
    return { data: [...independent, ...[...records.values()].map(item => clone(item.template))] }
  }
  api.queryBusinessVariables = async id => { api.calls.push(['queryBusinessVariables', id]); return [{ id: 'targetName', name: '设备名称', type: 'string' }] }
  api.getBusinessTemplate = async (id, channelProvider) => {
    api.calls.push(['getBusinessTemplate', id, channelProvider])
    return clone(records.get(`${id}/${channelProvider}`))
  }
  // The server assigns topic, channel and template IDs; the page must use the returned binding.
  function persistItem(providerId, value) {
    const saved = clone(value)
    saved.channel.id ||= `channel-${providerId}-${saved.channel.channelProvider}`
    saved.channel.providerId = providerId
    saved.template.id ||= `template-${providerId}-${saved.channel.channelProvider}`
    saved.channel.channelConfiguration.templateId = saved.template.id
    saved.channel.channelConfiguration.notifierId = saved.template.configId
    records.set(`${providerId}/${saved.channel.channelProvider}`, clone(saved))
    return saved
  }
  api.saveBusinessTemplate = async (id, channelProvider, value) => {
    api.calls.push(['saveBusinessTemplate', id, channelProvider, clone(value)])
    return persistItem(id, value)
  }
  api.saveBusinessTemplates = async (provider, value) => {
    api.calls.push(['saveBusinessTemplates', provider, clone(value)])
    const saved = clone(value)
    saved.provider.id = `saved-${provider}`
    saved.channels = saved.channels.map(item => persistItem(saved.provider.id, item))
    return saved
  }
  Object.assign(api, Object.fromEntries(Object.entries(options).filter(([key]) => !["businessTypes", "configureApi"].includes(key))))
  options.configureApi?.(api, records, businessTypes)
  const facade = load(resolve(root, 'api/notice/messageNotification.ts'), false).messageNotificationApi
  const original = { ...facade }
  Object.assign(facade, api)
  let leaveGuard
  let updateGuard
  const replace = async target => {
    if (updateGuard && await updateGuard(target, { query: route.query }) === false) return false
    route.query = target.query
    await vue.nextTick()
    return true
  }
  Object.assign(dependencies['vue-router'] ||= {}, {
    useRoute: () => route,
    useRouter: () => ({ replace }),
    onBeforeRouteLeave: callback => { leaveGuard = callback },
    onBeforeRouteUpdate: callback => { updateGuard = callback },
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
  return { page, route, api, facade, records, businessTypes, messages, leave: () => leaveGuard(), updateRoute: query => replace({ query }),
    close() { app.unmount(); Object.assign(facade, original) } }
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
    businessTypes: [business('aiSecurityAlarm')],
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

const businessKey = business => load(resolve(templatesRoot, 'templateDirectoryModel.ts')).templateBusinessKey(business)

test('actual page route guard retains dirty drafts on cancel and creation success shows a toast with real channel fixtures', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded', templateId: 'first' }, () => true, { businessTypes: [] })
  try {
    const { page } = current
    page.createTemplate()
    page.draft.value.name = 'New draft'
    page.draft.value.subject = 'Subject'
    page.draft.value.text = 'Body'
    page.draft.value.configId = 'smtp-one'
    const cancelled = current.leave()
    assert.equal(page.confirmation.open, true)
    page.resolveConfirmation(false)
    assert.equal(await cancelled, false)
    assert.equal(page.draft.value.text, 'Body')
    const confirmed = current.leave()
    page.resolveConfirmation(true)
    assert.equal(await confirmed, true)
    await page.save()
    await settlePage()
    assert.deepEqual(current.messages, [['messageNotification.templates.saved', 'success']])
    assert.equal(page.draft.value, undefined)
    assert.equal(page.workspace.hasDirtyDrafts.value, false)
    page.setUploading(true)
    const uploading = current.leave()
    assert.equal(page.confirmation.open, true)
    page.resolveConfirmation(false)
    assert.equal(await uploading, false)
    page.setUploading(false)
  } finally { current.close() }
})

test('page defaults to the first business under folders and keeps its stored preview on repeated channel clicks', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded' })
  try {
    assert.equal(current.page.business.value.id, 'device-config')
    assert.equal(current.page.selectedDirectoryKey.value, businessKey(current.businessTypes[0]))
    assert.equal(current.page.draft.value.id, 'template-alarm')
    assert.equal(current.page.entry.value.existing, true)
    assert.equal(current.page.editing.value, false)
    current.page.changeChannel('email:embedded')
    await settlePage()
    assert.equal(current.page.business.value.id, 'device-config')
    assert.equal(current.page.draft.value.id, 'template-alarm')
    current.page.startEditing()
    assert.equal(current.page.editing.value, true)
    await current.page.requestDiscard()
    assert.equal(current.page.confirmation.open, false)
    assert.equal(current.page.editing.value, false)
  } finally { current.close() }
})

test('a selectable unsaved business previews its prototype without querying invented topic IDs', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded' })
  try {
    const { page } = current
    const selected = current.businessTypes.find(item => item.provider === 'aiComplianceAlarm')
    assert.ok(page.templateOptions.value.some(option => option.value === businessKey(selected)))
    const previousCalls = current.api.calls.length
    await page.selectTemplate(businessKey(selected))
    await settlePage()
    assert.equal(page.business.value.provider, 'aiComplianceAlarm')
    assert.equal(page.business.value.id, undefined)
    assert.equal(page.isDefault.value, true)
    assert.equal(page.hasContent.value, true)
    assert.equal(page.entry.value.existing, false)
    assert.equal(page.editing.value, false)
    assert.ok(page.draft.value.subject.trim())
    assert.ok(page.draft.value.text.includes('${'))
    assert.equal(page.dirty.value, false)
    assert.equal(current.api.calls.slice(previousCalls).some(([name]) => ['getBusinessTemplate', 'queryBusinessVariables'].includes(name)), false)
  } finally { current.close() }
})

test('business config deep links initialize the exact configuration and config-only route changes reload with the new hint', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded', business: 'aiComplianceAlarm', configId: 'smtp-two' }, () => true, {
    configureApi(api) {
      api.queryAllConfigs = async () => [
        { id: 'smtp-one', name: 'First SMTP', type: 'email', provider: 'embedded', configuration: {} },
        { id: 'smtp-two', name: 'Second SMTP', type: 'email', provider: 'embedded', configuration: {} },
      ]
    },
  })
  try {
    const { page } = current
    assert.equal(page.business.value.provider, 'aiComplianceAlarm')
    assert.equal(page.draft.value.configId, 'smtp-two')
    assert.equal(page.activeConfig.value.id, 'smtp-two')
    assert.equal(page.canSave.value, true)
    assert.equal(page.dirty.value, false)
    const loads = []
    const loadBusiness = page.workspace.loadBusiness
    page.workspace.loadBusiness = async (...args) => {
      loads.push([args[0].provider, args[1], args[2]])
      return loadBusiness(...args)
    }
    await current.updateRoute({ ...current.route.query, configId: 'smtp-one' })
    await settlePage()
    assert.deepEqual(loads, [['aiComplianceAlarm', 'email:embedded', 'smtp-one']])
    assert.equal(page.draft.value.configId, 'smtp-two')
    assert.equal(page.dirty.value, false)
    page.startEditing()
    page.draft.value.subject = 'Keep this configured draft'
    await current.updateRoute({ ...current.route.query, configId: 'smtp-two' })
    await settlePage()
    assert.deepEqual(loads, [
      ['aiComplianceAlarm', 'email:embedded', 'smtp-one'],
      ['aiComplianceAlarm', 'email:embedded', 'smtp-two'],
    ])
    assert.equal(page.business.value.provider, 'aiComplianceAlarm')
    assert.equal(page.draft.value.configId, 'smtp-two')
    assert.equal(page.draft.value.subject, 'Keep this configured draft')
    assert.equal(page.dirty.value, true)
    assert.equal(page.confirmation.open, false)
    assert.equal(page.editing.value, true)
  } finally { current.close() }
})

test('switching channels retains the selected business and each channel draft without a discard dialog', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded' })
  try {
    const { page } = current
    page.startEditing()
    page.draft.value.subject = 'Keep email draft'
    page.changeChannel('webhook:http')
    await settlePage()
    assert.equal(page.confirmation.open, false)
    assert.equal(page.business.value.id, 'device-config')
    assert.equal(current.route.query.business, 'device-config')
    assert.equal(page.draft.value.configId, 'hook-one')
    page.draft.value.templateJson = '{"body":"Keep webhook draft"}'
    page.changeChannel('email:embedded')
    await settlePage()
    assert.equal(page.confirmation.open, false)
    assert.equal(page.draft.value.subject, 'Keep email draft')
    assert.equal(page.business.value.id, 'device-config')
    page.changeChannel('webhook:http')
    await settlePage()
    assert.equal(page.draft.value.templateJson, '{"body":"Keep webhook draft"}')
    assert.equal(page.workspace.hasDirtyDrafts.value, true)
  } finally { current.close() }
})

test('switching businesses requires discard confirmation and continue editing retains all channel drafts', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded' })
  try {
    const { page } = current
    page.startEditing()
    page.draft.value.subject = 'Discard email draft'
    page.changeChannel('webhook:http')
    await settlePage()
    page.draft.value.templateJson = '{"body":"Discard webhook draft"}'
    const next = current.businessTypes.find(item => item.provider === 'alarm-device-relieve')
    const cancelled = page.selectTemplate(businessKey(next))
    assert.equal(page.confirmation.open, true)
    page.resolveConfirmation(false)
    await cancelled
    assert.equal(page.business.value.id, 'device-config')
    assert.equal(page.draft.value.templateJson, '{"body":"Discard webhook draft"}')
    assert.equal(page.editing.value, true)
    const confirmed = page.selectTemplate(businessKey(next))
    assert.equal(page.confirmation.open, true)
    page.resolveConfirmation(true)
    await confirmed
    await settlePage()
    assert.equal(page.business.value.id, 'relieve-config')
    assert.equal(page.editing.value, false)
    assert.equal(page.workspace.hasDirtyDrafts.value, false)
    await page.selectTemplate(businessKey(current.businessTypes[0]))
    await settlePage()
    assert.equal(page.business.value.id, 'device-config')
    assert.notEqual(page.draft.value.templateJson, '{"body":"Discard webhook draft"}')
    page.changeChannel('email:embedded')
    await settlePage()
    assert.equal(page.draft.value.subject, 'Alarm ${device.name}')
  } finally { current.close() }
})

test('cancel restores stored content or prototype and continuing editing preserves the active changes', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded' })
  try {
    const { page } = current
    const original = page.draft.value.subject
    page.startEditing()
    page.draft.value.subject = 'Changed stored template'
    const continued = page.requestDiscard()
    assert.equal(page.confirmation.open, true)
    page.resolveConfirmation(false)
    await continued
    assert.equal(page.editing.value, true)
    assert.equal(page.draft.value.subject, 'Changed stored template')
    const discarded = page.requestDiscard()
    page.resolveConfirmation(true)
    await discarded
    await settlePage()
    assert.equal(page.editing.value, false)
    assert.equal(page.draft.value.subject, original)
    assert.equal(page.workspace.hasDirtyDrafts.value, false)
    await page.selectTemplate(businessKey(current.businessTypes.find(item => item.provider === 'aiComplianceAlarm')))
    await settlePage()
    const prototype = page.draft.value.text
    page.startEditing()
    page.draft.value.text = 'Changed default'
    const resetDefault = page.requestDiscard()
    page.resolveConfirmation(true)
    await resetDefault
    await settlePage()
    assert.equal(page.editing.value, false)
    assert.equal(page.isDefault.value, true)
    assert.equal(page.draft.value.text, prototype)
    assert.equal(page.workspace.hasDirtyDrafts.value, false)
    assert.equal(current.api.calls.some(([name]) => name.startsWith('save') || name === 'createTemplate' || name === 'updateTemplate'), false)
  } finally { current.close() }
})

test('cancel restores only the current channel and leaves sibling drafts available without an unrelated confirmation', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded' })
  try {
    const { page } = current
    page.startEditing()
    page.draft.value.subject = 'Keep sibling email draft'
    page.changeChannel('webhook:http')
    await settlePage()
    const original = page.draft.value.templateJson
    page.draft.value.templateJson = '{"body":"Discard current webhook draft"}'
    const continued = page.requestDiscard()
    assert.equal(page.confirmation.open, true)
    page.resolveConfirmation(false)
    await continued
    assert.equal(page.draft.value.templateJson, '{"body":"Discard current webhook draft"}')
    assert.equal(page.editing.value, true)
    const discarded = page.requestDiscard()
    assert.equal(page.confirmation.open, true)
    page.resolveConfirmation(true)
    await discarded
    await settlePage()
    assert.equal(page.editing.value, false)
    assert.equal(page.draft.value.templateJson, original)
    assert.equal(page.dirty.value, false)
    assert.equal(page.workspace.hasDirtyDrafts.value, true)
    page.startEditing()
    await page.requestDiscard()
    assert.equal(page.confirmation.open, false)
    assert.equal(page.editing.value, false)
    assert.equal(page.workspace.hasDirtyDrafts.value, true)
    page.changeChannel('email:embedded')
    await settlePage()
    assert.equal(page.business.value.id, 'device-config')
    assert.equal(page.draft.value.subject, 'Keep sibling email draft')
    assert.equal(page.dirty.value, true)
    assert.equal(current.api.calls.some(([name]) => name.startsWith('save') || name === 'createTemplate' || name === 'updateTemplate'), false)
  } finally { current.close() }
})

test('saving blocks route departure and updates, while upload busy state requires confirmation before departure', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded' })
  const pending = deferred()
  let save
  try {
    const { page } = current
    page.startEditing()
    page.draft.value.subject = 'Saving this business'
    current.facade.saveBusinessTemplate = async (...args) => { await pending.promise; return current.api.saveBusinessTemplate(...args) }
    save = page.save()
    assert.equal(page.saving.value, true)
    assert.equal(page.busy.value, true)
    assert.equal(await current.leave(), false)
    assert.equal(page.confirmation.open, false)
    const nextQuery = { ...current.route.query, channel: 'webhook:http', business: 'device-config' }
    assert.equal(await current.updateRoute(nextQuery), false)
    assert.equal(current.route.query.channel, 'email:embedded')
    assert.equal(page.channelId.value, 'email:embedded')
    page.changeChannel('webhook:http')
    await page.selectTemplate(businessKey(current.businessTypes[1]))
    await page.requestDiscard()
    await settlePage()
    assert.equal(page.confirmation.open, false)
    assert.equal(page.business.value.id, 'device-config')
    assert.equal(page.draft.value.subject, 'Saving this business')
    pending.resolve()
    await save
    await settlePage()
    assert.deepEqual(current.messages, [['messageNotification.templates.saved', 'success']])
    assert.equal(page.busy.value, false)
    assert.equal(await current.leave(), true)
    page.setUploading(true)
    assert.equal(page.busy.value, true)
    assert.equal(await current.updateRoute(nextQuery), false)
    assert.equal(current.route.query.channel, 'email:embedded')
    const uploadDeparture = current.leave()
    assert.equal(page.confirmation.open, true)
    page.resolveConfirmation(false)
    assert.equal(await uploadDeparture, false)
    page.setUploading(false)
    assert.equal(await current.updateRoute(nextQuery), true)
    await settlePage()
    assert.equal(page.channelId.value, 'webhook:http')
    assert.equal(page.business.value.id, 'device-config')
    assert.equal(page.confirmation.open, false)
  } finally { pending.resolve(); await save; current.close() }
})

test('failed business saves retain editing and a successful single-channel save returns to the same business preview', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded' })
  try {
    current.page.startEditing()
    current.page.draft.value.subject = 'Changed subject'
    current.facade.saveBusinessTemplate = async () => { throw new Error('offline') }
    await current.page.save()
    assert.equal(current.page.editing.value, true)
    assert.equal(current.page.draft.value.subject, 'Changed subject')
    assert.deepEqual(current.messages, [])
    current.facade.saveBusinessTemplate = current.api.saveBusinessTemplate
    await current.page.save()
    await settlePage()
    assert.equal(current.page.editing.value, false)
    assert.deepEqual(current.messages, [['messageNotification.templates.saved', 'success']])
    assert.equal(current.page.draft.value.subject, 'Changed subject')
    assert.equal(current.route.query.business, 'device-config')
    assert.equal(current.route.query.templateId, 'template-alarm')
    const saved = current.api.calls.find(([name]) => name === 'saveBusinessTemplate')
    assert.deepEqual(saved.slice(1, 3), ['device-config', 'notifier-email'])
    assert.equal(saved[3].template.id, 'template-alarm')
    assert.equal(saved[3].template.template.subject, 'Changed subject')
    assert.equal(current.api.calls.some(([name]) => ['saveBusinessTemplates', 'createTemplate', 'updateTemplate'].includes(name)), false)
  } finally { current.close() }
})

test('first save adopts actual topic and template IDs, preserves the sibling draft and keeps different businesses separate', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded', business: 'aiComplianceAlarm' })
  try {
    const { page } = current
    page.startEditing()
    page.draft.value.subject = 'Compliance email'
    page.changeChannel('webhook:http')
    await settlePage()
    page.draft.value.templateJson = '{"body":"Compliance webhook draft"}'
    page.changeChannel('email:embedded')
    await settlePage()
    await page.save()
    await settlePage()
    const created = current.api.calls.find(([name]) => name === 'saveBusinessTemplates')
    assert.equal(created[1], 'aiComplianceAlarm')
    assert.equal(created[2].provider.state, 'disabled')
    assert.equal(created[2].channels.length, 1)
    assert.equal(created[2].channels[0].channel.channelProvider, 'notifier-email')
    assert.equal(page.business.value.id, 'saved-aiComplianceAlarm')
    assert.equal(page.draft.value.id, 'template-saved-aiComplianceAlarm-notifier-email')
    assert.equal(current.route.query.business, page.business.value.id)
    assert.equal(current.route.query.templateId, page.draft.value.id)
    assert.deepEqual(current.messages, [['messageNotification.templates.saved', 'success']])
    assert.equal(page.editing.value, false)
    page.changeChannel('webhook:http')
    await settlePage()
    assert.equal(page.business.value.id, 'saved-aiComplianceAlarm')
    assert.equal(page.draft.value.templateJson, '{"body":"Compliance webhook draft"}')
    assert.equal(page.entry.value.existing, false)
    page.startEditing()
    await page.save()
    await settlePage()
    const updated = current.api.calls.find(([name]) => name === 'saveBusinessTemplate')
    assert.deepEqual(updated.slice(1, 3), ['saved-aiComplianceAlarm', 'notifier-webhook'])
    assert.equal(page.draft.value.id, 'template-saved-aiComplianceAlarm-notifier-webhook')
    assert.equal(page.workspace.hasDirtyDrafts.value, false)
    const other = current.businessTypes.find(item => item.provider === 'aiSecurityAlarm')
    await page.selectTemplate(businessKey(other))
    await settlePage()
    assert.equal(page.confirmation.open, false)
    assert.equal(page.business.value.id, undefined)
    assert.notEqual(page.draft.value.templateJson, '{"body":"Compliance webhook draft"}')
    page.startEditing()
    page.draft.value.templateJson = '{"body":"Security only"}'
    await page.save()
    await settlePage()
    assert.equal(page.business.value.id, 'saved-aiSecurityAlarm')
    assert.equal(current.route.query.business, 'saved-aiSecurityAlarm')
    const first = page.businessTypes.value.find(item => item.provider === 'aiComplianceAlarm')
    await page.selectTemplate(businessKey(first))
    await settlePage()
    assert.equal(page.business.value.id, 'saved-aiComplianceAlarm')
    assert.equal(JSON.parse(page.draft.value.templateJson).body, 'Compliance webhook draft')
    page.changeChannel('email:embedded')
    await settlePage()
    assert.equal(page.draft.value.subject, 'Compliance email')
    assert.equal(current.api.calls.filter(([name]) => name === 'saveBusinessTemplates').length, 2)
  } finally { current.close() }
})

test('an explicit unbound template deep link keeps standalone editing and persistence', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded', templateId: 'second' })
  try {
    const { page } = current
    assert.equal(page.business.value, undefined)
    assert.equal(page.draft.value.id, 'second')
    assert.equal(page.editing.value, false)
    page.startEditing()
    page.draft.value.subject = 'Standalone edit'
    await page.save()
    await settlePage()
    assert.deepEqual(current.messages, [['messageNotification.templates.saved', 'success']])
    assert.equal(page.editing.value, false)
    assert.equal(page.draft.value.id, 'second')
    assert.equal(current.route.query.templateId, 'second')
    assert.equal(current.route.query.business, undefined)
    assert.equal(current.api.calls.find(([name]) => name === 'updateTemplate')[1].id, 'second')
    assert.equal(current.api.calls.some(([name]) => name.startsWith('saveBusiness')), false)
  } finally { current.close() }
})

test('standalone new drafts can be cancelled without a write and read-only users only see previews', async () => {
  const current = await mountTemplatePage({ channel: 'email:embedded', templateId: 'first' })
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
  const readonly = await mountTemplatePage({ channel: 'email:embedded', templateId: 'template-alarm' }, code => String(code).endsWith(':query'))
  try {
    assert.equal(readonly.page.draft.value.id, 'template-alarm')
    assert.equal(readonly.page.canEdit.value, false)
    readonly.page.startEditing()
    assert.equal(readonly.page.editing.value, false)
    assert.equal(readonly.page.canSave.value, false)
    await readonly.updateRoute({ channel: 'email:embedded', business: 'aiComplianceAlarm' })
    await settlePage()
    assert.equal(readonly.page.draft.value, undefined)
    assert.equal(readonly.page.businessLinkState.value, 'forbidden')
    readonly.page.startEditing()
    assert.equal(readonly.page.editing.value, false)
    assert.equal(readonly.page.canSave.value, false)
    await readonly.page.save()
    assert.equal(readonly.api.calls.some(([name]) => name.startsWith('save') || name === 'createTemplate' || name === 'updateTemplate'), false)
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
  assert.deepEqual(events, [['select', child.key]])
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

test('explicit activation keeps the prototype draft and adopts the real business record', async () => {
  let directory = [{ provider: 'scene', name: 'Scene', state: 'disabled', channels: [] }]
  const current = await mountTemplatePage({ topicProvider: 'scene' }, () => true, {
    queryTemplateDirectory: async () => directory,
    getBusinessTemplate: async () => undefined,
    setBusinessEnabled: async (id, enabled) => { assert.equal(id, 'scene'); assert.equal(enabled, true); directory = [{ ...directory[0], id: 'actual-scope-id', state: 'enabled' }] },
  })
  try {
    assert.equal(current.page.isDefault.value, true)
    current.page.startEditing()
    current.page.draft.value.subject = 'Unsaved before activation'
    assert.equal(current.api.calls.some(call => call[0].startsWith('saveBusiness')), false)
    await current.page.toggleBusiness()
    await settlePage()
    assert.equal(current.route.query.topicProvider, 'actual-scope-id')
    assert.equal((current.page.business.value?.id || current.page.business.value?.provider || ''), 'actual-scope-id')
    assert.equal(current.page.draft.value.type, 'email')
    assert.equal(current.page.draft.value.subject, 'Unsaved before activation')
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
    api.queryAllConfigs = async () => [{ id: 'exact-config', name: 'Exact', type: channelId.split(':')[0], provider: channelId.split(':')[1], configuration: {} }]
    let persisted
    api.getBusinessTemplate = async () => persisted
    const scope = vue.effectScope()
    const workspace = scope.run(() => useTemplateWorkspace(access(), api))
    try {
      await workspace.loadBusiness(owner, channelId)
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
      assert.equal(workspace.dirty.value, true)
      await workspace.discardDraft()
      assert.equal(workspace.channelEnabled.value, true)
      assert.equal(workspace.dirty.value, false)
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
  const api = mockApi()
  const original = { id: 'binding', providerId: 'scope-a', channelProvider: 'notifier-email', state: { value: 'disabled' }, grant: { roles: ['role'] }, channelConfiguration: { templateId: 'old-independent', notifierId: 'smtp-one', variables: { custom: 'keep' } } }
  api.getBusinessTemplate = async (owner, type) => owner === 'scope-a' && type === 'notifier-email' ? { channel: original, template: record('old-independent', { type: 'email' }) } : undefined
  const scope = vue.effectScope()
  const workspace = scope.run(() => useTemplateWorkspace(access(), api))
  try {
    const owner = { ...business(), id: 'scope-a', channels: [] }
    await workspace.loadBusiness(owner, 'email:embedded')
    assert.equal(workspace.channelEnabled.value, false)
    workspace.draft.value.subject = 'Unsaved A'
    await workspace.loadBusiness({ ...owner, id: 'scope-b' }, 'email:embedded')
    assert.notEqual(workspace.draft.value.subject, 'Unsaved A')
    await workspace.loadBusiness(owner, 'dingTalk:dingTalkRobotWebHook')
    workspace.draft.value.name = 'Robot draft'
    await workspace.loadBusiness(owner, 'dingTalk:dingTalkMessage')
    workspace.draft.value.name = 'Corp draft'
    await workspace.loadBusiness(owner, 'dingTalk:dingTalkRobotWebHook')
    assert.equal(workspace.draft.value.name, 'Robot draft')
    await workspace.loadBusiness(owner, 'email:embedded')
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
    assert.equal(payload.template.id, 'old-independent')
    assert.deepEqual(payload.channel.grant, original.grant)
    assert.equal(payload.channel.channelConfiguration.variables.custom, 'keep')
    assert.equal(original.channelConfiguration.templateId, 'old-independent')
  } finally { scope.stop() }
})

test('missing sending config and supplier fields block writes; imported history preserves managed target', async () => {
  const api = mockApi()
  api.getBusinessTemplate = async owner => ({ channel: { id: 'binding', providerId: owner, channelProvider: 'notifier-sms', channelConfiguration: { templateId: 'stpl_binding' } }, template: { ...record('stpl_binding'), type: 'sms', provider: 'aliyunSms', template: { code: 'SMS_OLD', signName: 'Old sign' } } })
  api.queryAllConfigs = async () => ['sms-config', 'sms-source'].map(id => ({ id, name: id, type: 'sms', provider: 'aliyunSms', configuration: {} }))
  api.getTemplate = async id => ({ ...record(id), type: 'sms', provider: 'aliyunSms', configId: 'sms-source', template: { code: 'SMS_SOURCE', signName: 'Approved' } })
  const scope = vue.effectScope()
  const workspace = scope.run(() => useTemplateWorkspace(access(), api))
  try {
    await workspace.loadBusiness(business(), 'sms:aliyunSms')
    workspace.draft.value.configId = ''
    assert.equal(await workspace.saveTemplate(), false)
    workspace.draft.value.configId = 'sms-config'
    workspace.draft.value.templateJson = '{}'
    await assert.rejects(workspace.saveTemplate(), /smsTemplateRequired/)
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
    await current.page.selectTemplate(businessKey({ ...business(), id: 'another-scope' }))
    await settlePage()
    assert.equal((current.page.business.value?.id || current.page.business.value?.provider || ''), 'another-scope')
  } finally { current.close() }
  const api = mockApi()
  api.getBusinessTemplate = async owner => ({ channel: { providerId: owner, channelProvider: 'notifier-email', channelConfiguration: { templateId: 'missing-template' } }, template: null })
  const scope = vue.effectScope()
  const workspace = scope.run(() => useTemplateWorkspace(access(), api))
  try {
    await workspace.loadBusiness(business(), 'email:embedded')
    assert.equal(workspace.detailState.value, 'error')
    assert.equal(workspace.canSave.value, false)
    assert.equal(await workspace.saveTemplate(), false)
  } finally { scope.stop() }
})

test('business reads normalize enum values and discard late results after permission loss or disposal', async () => {
  const api = mockApi()
  api.getBusinessTemplate = async owner => ({ channel: { providerId: owner, channelProvider: 'notifier-email' }, template: record('enum-template') })
  const permissions = access()
  const scope = vue.effectScope()
  const workspace = scope.run(() => useTemplateWorkspace(permissions, api))
  await workspace.loadBusiness(business('scene', ''), 'email:embedded')
  assert.equal(workspace.draft.value.id, 'enum-template')
  const late = deferred()
  api.getBusinessTemplate = () => late.promise
  const pending = workspace.loadBusiness({ ...business(), id: 'second-scope' }, 'email:embedded')
  permissions.query.value = false
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
    assert.equal((current.page.business.value?.id || current.page.business.value?.provider || ''), 'first-alarm')
    assert.equal(current.page.channelId.value, 'webhook:http')
    assert.deepEqual(current.route.query, { channel: 'webhook:http', topicProvider: 'first-alarm' })
    assert.deepEqual(reads, [{ owner: 'first-alarm', provider: 'notifier-webhook' }])
    directory.reverse()
    current.page.reload()
    await settlePage()
    assert.equal((current.page.business.value?.id || current.page.business.value?.provider || ''), 'first-alarm')
    current.page.changeChannel('email:embedded')
    await settlePage()
    assert.equal((current.page.business.value?.id || current.page.business.value?.provider || ''), 'first-alarm')
    assert.equal(current.page.channelId.value, 'email:embedded')
  } finally { current.close() }
})

test('first-alarm entry stays empty without alarms and never falls back to an unrelated saved template', async () => {
  const current = await mountTemplatePage({ channel: 'webhook:http', businessSelection: 'first-alarm' }, () => true, {
    queryTemplateDirectory: async () => [business('scene'), business('system-event')],
  })
  try {
    assert.equal(current.page.businessLinkState.value, 'empty')
    assert.equal((current.page.business.value?.id || current.page.business.value?.provider || ''), '')
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
    assert.equal((current.page.business.value?.id || current.page.business.value?.provider || ''), 'aiSecurityAlarm')
    assert.equal(current.route.query.topicProvider, 'aiSecurityAlarm')
    assert.equal(current.page.channelId.value, 'webhook:http')
    assert.equal(current.page.draft.value.type, 'webhook')
    assert.equal(current.page.isDefault.value, true)
    assert.equal(current.page.businessEnabled.value, false)
  } finally { current.close() }
})


test('standalone builtin preview uses its own samples and cannot replace a business prototype', () => {
  const { useTemplateEditor } = load(resolve(templatesRoot, 'hooks/useTemplateEditor.ts'))
  const { useTemplatePreview } = load(resolve(templatesRoot, 'hooks/useTemplatePreview.ts'))
  const { builtinEmailTemplates } = load(resolve(templatesRoot, '../shared/builtinEmailTemplates.ts'))
  const draft = vue.reactive(model.newTemplateDraft(shared.findNotificationChannel('email:embedded')))
  const props = { draft, configs: [], configState: 'ready', existing: false, businessMode: false }
  const scope = vue.effectScope()
  const editor = scope.run(() => useTemplateEditor(props, () => {}))
  const preview = scope.run(() => useTemplatePreview(props))
  editor.selectBuiltin('scene')
  const definition = builtinEmailTemplates(locale.useI18n().t).find(item => item.key === 'scene')
  assert.equal(preview.examples.value.message, definition.examples.message)
  assert.ok(preview.text.value.includes(definition.examples.message))
  props.businessMode = true
  const before = JSON.stringify(draft)
  editor.selectBuiltin('alarm-device')
  assert.equal(JSON.stringify(draft), before)
  scope.stop()
})
