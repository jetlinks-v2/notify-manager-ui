import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const templateRoot = resolve(root, 'views/system/MessageNotification/Templates')
const requests = []
const remoteApi = {
  queryAliyunSmsTemplates_api: async id => { requests.push(['smsTemplates', id]); return { result: [{ templateCode: 'SMS_1', templateName: 'Alarm', templateContent: 'Alarm ${detail.targetName}' }] } },
  queryAliyunSmsSigns_api: async id => { requests.push(['smsSigns', id]); return { result: [] } },
  queryWechatCorpDepartments_api: async id => { requests.push(['departments', id]); return { result: [] } },
  queryWechatCorpUsers_api: async id => { requests.push(['users', id]); return { result: [] } },
  queryWechatCorpTags_api: async id => { requests.push(['tags', id]); return { result: [] } },
}
const samples = { 'detail.targetName': 'Camera 218', 'detail.alarmTime': '2026-01-01T12:00:00Z', 'detail.propertyValue': '90.125', message: 'Example alarm', notifyTime: '2026-01-01 12:00:00' }
const dependencies = {
  vue, 'vue-i18n': { useI18n: () => ({ t: (key, args) => args?.name ? `Example ${args.name}` : key }) },
  '@notify-manager-ui/api/notice-center': remoteApi,
  '@jetlinks-web/core': { request: {} },
}
const cache = new Map()

// Execute the real presentation and form adapters; all I/O and sample data stay inside this fixture.
function load(filename) {
  if (filename.endsWith('/definition/templateDefaults.ts')) return { prototypePreviewExamples: () => samples }
  if (cache.has(filename)) return cache.get(filename)
  let source = readFileSync(filename, 'utf8')
  if (filename.endsWith('.vue')) source = compileScript(parse(source, { filename }).descriptor, { id: filename, inlineTemplate: true }).content
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs' })
  const module = { exports: {} }
  const imports = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    if (name.startsWith('.')) {
      let path = resolve(dirname(filename), name)
      if (!/\.(ts|vue)$/.test(path)) path = existsSync(`${path}.ts`) || path.endsWith('/definition/templateDefaults') ? `${path}.ts` : resolve(path, 'index.ts')
      return load(path)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(imports, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}

const { createTemplateDraft, buildTemplatePayload } = load(resolve(templateRoot, 'model.ts'))
const { useTemplateEditor } = load(resolve(templateRoot, 'hooks/useTemplateEditor.ts'))
const { useTemplatePreview, templatePreviewExample } = load(resolve(templateRoot, 'hooks/useTemplatePreview.ts'))
const { templateTextSegments, templateTextBlocks } = load(resolve(templateRoot, 'hooks/useTemplateMessageText.ts'))
const draftFor = (type, provider, template = {}) => createTemplateDraft({
  id: 'template-one', name: 'Saved', configId: 'config-one', type, provider, template,
  variableDefinitions: [{ id: 'detail.targetName', name: 'Device' }],
})
const configFor = (draft, configuration = {}) => ({ id: 'config-one', name: 'Configured', type: draft.type, provider: draft.provider, configuration })
function editor(draft, overrides = {}) {
  const props = vue.reactive({ draft, configs: [configFor(draft)], configState: 'ready', disabled: false, ...overrides })
  const scope = vue.effectScope()
  const value = scope.run(() => useTemplateEditor(props, () => {}))
  return { props, value, stop: () => scope.stop() }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await vue.nextTick() }

test('attachment actions declare real variables without persisting preview defaults or duplicating metadata', () => {
  const variable = { id: 'detail.imageUrl', name: '图片', type: 'file', defaultValue: 'https://example.test/sample.png', expands: { businessType: 'image', mockValue: 'preview' } }
  const item = editor(draftFor('email', 'embedded', { subject: 'Subject', text: 'Body' }), { availableVariables: [variable] })
  const before = JSON.stringify(item.props.draft)
  assert.equal(item.value.registerVariable('missing'), false)
  assert.equal(JSON.stringify(item.props.draft), before)
  assert.equal(item.value.registerVariable(variable.id), true)
  assert.equal(item.value.registerVariable(variable.id), true)
  const declarations = item.props.draft.variables.filter(value => value.id === variable.id)
  assert.equal(declarations.length, 1)
  assert.equal(declarations[0].defaultValue, undefined)
  assert.deepEqual(declarations[0].expands, variable.expands)
  assert.equal(variable.defaultValue, 'https://example.test/sample.png')
  item.props.disabled = true
  item.props.availableVariables.push({ id: 'otherImage', name: '其他图片' })
  assert.equal(item.value.registerVariable('otherImage'), false)
  assert.equal(item.props.draft.variables.some(value => value.id === 'otherImage'), false)
  item.stop()
})

test('variable attachment names preview samples while their saved source and names retain expressions', () => {
  const attachments = [{ name: '${detail.targetName}-告警.png', location: '${detail.imageUrl}' }, { name: '运行时附件.png', location: '' }]
  const draft = draftFor('email', 'embedded', { subject: 'Subject', text: '<p>正文</p>', attachments, sendTo: ['existing@example.test'] })
  const before = JSON.stringify(draft)
  const preview = useTemplatePreview({ draft })
  assert.equal(preview.attachmentNames.value, 'Camera 218-告警.png, 运行时附件.png')
  assert.equal(JSON.stringify(draft), before)
  const payload = buildTemplatePayload(draft)
  assert.deepEqual(payload.template.attachments, attachments)
  assert.deepEqual(payload.template.sendTo, ['existing@example.test'])
  assert.equal(payload.configId, 'config-one')
})
async function renderPreview(props) {
  const Preview = load(resolve(templateRoot, 'components/TemplatePreview.vue')).default
  const app = vue.createSSRApp({ render: () => vue.h(Preview, props) })
  app.config.warnHandler = () => {}
  return renderToString(app)
}

test('known provider forms use actual fields, keep extensions and do not dirty untouched drafts', () => {
  for (const [type, provider, field] of [
    ['dingTalk', 'dingTalkMessage', 'agentId'], ['dingTalk', 'dingTalkRobotWebHook', 'messageType'],
    ['weixin', 'corpMessage', 'toParty'], ['voice', 'aliyun', 'templateCode'], ['sms', 'aliyunSms', 'signName'], ['webhook', 'http', 'body'],
  ]) {
    const draft = draftFor(type, provider, { contextAsBody: false, vendorExtra: { keep: true } })
    const baseline = JSON.stringify(draft)
    const item = editor(draft)
    assert.equal(JSON.stringify(draft), baseline)
    assert.ok(item.value.fields.value.some(item => item.key === field), `${provider}: ${field}`)
    assert.ok(item.value.fields.value.every(item => item.key !== 'provider'))
    assert.equal(item.value.genericJson.value, false)
    item.stop()
  }
})

test('stored voice ttsCode hydrates locally and survives a body edit and payload conversion', () => {
  const draft = draftFor('voice', 'aliyun', { templateType: 'tts', ttsCode: 'TTS_1', message: 'Stored voice', playTimes: 1 })
  const baseline = JSON.stringify(draft)
  const item = editor(draft)
  const code = item.value.fields.value.find(field => field.key === 'templateCode')
  assert.equal(item.value.fieldValue(code), 'TTS_1')
  assert.equal(JSON.stringify(draft), baseline)
  item.value.changeField(item.value.fields.value.find(field => field.key === 'ttsmessage'), 'Edited ${detail.targetName}')
  assert.equal(JSON.parse(draft.templateJson).ttsCode, 'TTS_1')
  const payload = buildTemplatePayload(draft)
  assert.equal(payload.template.ttsCode, 'TTS_1')
  assert.equal(payload.template.message, 'Edited ${detail.targetName}')
  assert.equal(payload.template.ttsmessage, undefined)
  item.stop()
})

test('robot editing publishes the selected message shape and keeps stored extension fields', () => {
  const item = editor(draftFor('dingTalk', 'dingTalkRobotWebHook', { messageType: 'markdown', markdown: { title: 'Old', text: 'Saved body' }, vendorExtra: { keep: true } }))
  item.value.changeField(item.value.fields.value.find(field => field.key === 'message'), 'New ${detail.targetName}')
  const payload = JSON.parse(item.props.draft.templateJson)
  assert.equal(payload.markdown.text, 'New ${detail.targetName}')
  assert.deepEqual(payload.vendorExtra, { keep: true })
  assert.equal(item.props.draft.provider, 'dingTalkRobotWebHook')
  item.stop()
})

test('SMS remote options use only an exact readable configuration and selected templates update content', async () => {
  requests.length = 0
  const item = editor(draftFor('sms', 'aliyunSms', { code: '', signName: '' }))
  await flush()
  const code = item.value.fields.value.find(field => field.key === 'code')
  assert.equal(code.kind, 'select')
  item.value.changeField(code, 'SMS_1')
  assert.equal(JSON.parse(item.props.draft.templateJson).message, 'Alarm ${detail.targetName}')
  assert.ok(requests.every(([, id]) => id === 'config-one'))
  item.stop()
  requests.length = 0
  const mismatch = editor(draftFor('sms', 'aliyunSms', {}), { configs: [{ id: 'config-one', name: 'Other', type: 'sms', provider: 'different', configuration: {} }] })
  await flush()
  assert.equal(mismatch.value.configOptions.value[0].disabled, true)
  assert.equal(requests.length, 0)
  mismatch.stop()
})

test('metadata-driven service account editing uses backend IDs and retains unknown values', () => {
  const draft = draftFor('weixin', 'officialMessage', { wxTemplateId: 'wx-one', content: 'Saved', extension: { keep: 1 } })
  const item = editor(draft, { metadata: { properties: [{ id: 'wxTemplateId', valueType: { type: 'string', expands: { required: true } } }, { id: 'content', valueType: { type: 'string' } }] }, metadataState: 'ready' })
  assert.equal(item.value.fields.value.length, 0)
  assert.deepEqual(item.value.metadataFields.value.map(field => field.id), ['wxTemplateId', 'content'])
  item.value.changeMetadata('content', 'Changed ${detail.targetName}')
  assert.equal(JSON.parse(item.props.draft.templateJson).content, 'Changed ${detail.targetName}')
  assert.deepEqual(JSON.parse(item.props.draft.templateJson).extension, { keep: 1 })
  assert.equal(JSON.parse(item.props.draft.templateJson).templateId, undefined)
  item.stop()
})

test('unfinished JSON remains visible and no schema defaults overwrite it', () => {
  const draft = draftFor('extension', 'vendor')
  draft.templateJson = '{ unfinished'
  const item = editor(draft, { metadata: { properties: [{ id: 'message', valueType: { type: 'string' } }] } })
  assert.equal(item.value.genericJson.value, true)
  assert.equal(item.value.parsed.value.valid, false)
  assert.equal(item.props.draft.templateJson, '{ unfinished')
  item.stop()
})

test('variable insertion replaces the focused provider selection and disabled editors do not change values', async () => {
  const item = editor(draftFor('dingTalk', 'dingTalkMessage', { message: 'Before selected after' }))
  item.value.captureProviderCaret({ target: { selectionStart: 7, selectionEnd: 15, focus() {}, setSelectionRange() {} } }, ['message'])
  await item.value.insertVariable('detail.targetName')
  assert.equal(JSON.parse(item.props.draft.templateJson).message, 'Before ${detail.targetName} after')
  const previous = item.props.draft.templateJson
  item.props.disabled = true
  await item.value.insertVariable('detail.other')
  assert.equal(item.props.draft.templateJson, previous)
  item.stop()
})

test('Webhook context and non-TTS voice modes reject variable insertion without a text target', async () => {
  for (const [type, provider, template, mode, value] of [
    ['webhook', 'http', { contextAsBody: false, body: '{}' }, 'contextAsBody', true],
    ['voice', 'aliyun', { templateType: 'tts', ttsCode: 'TTS_1', message: 'Stored' }, 'templateType', 'voice'],
  ]) {
    const item = editor(draftFor(type, provider, template))
    assert.equal(item.value.canInsertVariable.value, true)
    item.value.changeField(item.value.fields.value.find(field => field.key === mode), value)
    const baseline = JSON.stringify(item.props.draft)
    assert.equal(item.value.canInsertVariable.value, false)
    await item.value.insertVariable('detail.targetName')
    assert.equal(JSON.stringify(item.props.draft), baseline)
    assert.doesNotThrow(() => JSON.parse(item.props.draft.templateJson))
    item.stop()
  }
})

test('raw JSON variable insertion requires a captured cursor and preserves the selected string position', async () => {
  const item = editor(draftFor('extension', 'vendor', { message: 'Before selected after' }))
  const baseline = JSON.stringify(item.props.draft)
  assert.equal(item.value.canInsertVariable.value, false)
  await item.value.insertVariable('detail.targetName')
  assert.equal(JSON.stringify(item.props.draft), baseline)
  const start = item.props.draft.templateJson.indexOf('selected')
  item.value.captureCaret({ target: { selectionStart: start, selectionEnd: start + 'selected'.length, focus() {}, setSelectionRange() {} } }, 'templateJson')
  assert.equal(item.value.canInsertVariable.value, true)
  await item.value.insertVariable('detail.targetName')
  assert.equal(JSON.parse(item.props.draft.templateJson).message, 'Before ${detail.targetName} after')
  item.stop()
})

test('available unused variables insert real tokens and declarations without persisting example defaults', async () => {
  const unused = { id: 'detail.alarmTime', name: 'Alarm time', type: 'date', format: 'yyyy-MM-dd', required: true, defaultValue: 'sample-only', expands: { format: 'yyyy-MM-dd' } }
  const draft = draftFor('dingTalk', 'dingTalkMessage', { message: 'Saved ' })
  draft.variables = [{ id: 'detail.targetName', name: 'Saved name', type: 'string', expands: { keep: true } }]
  const item = editor(draft, { availableVariables: [unused, { id: 'detail.targetName', name: 'New catalog name', type: 'date' }] })
  assert.equal(item.value.insertableVariables.value.find(variable => variable.id === 'detail.targetName').name, 'Saved name')
  assert.equal(item.props.draft.variables.length, 1)
  await item.value.insertVariable('detail.alarmTime')
  assert.equal(JSON.parse(item.props.draft.templateJson).message, 'Saved ${detail.alarmTime}')
  const declaration = item.props.draft.variables.find(variable => variable.id === 'detail.alarmTime')
  assert.equal(declaration.type, 'date')
  assert.equal(declaration.required, true)
  assert.equal(declaration.format, 'yyyy-MM-dd')
  assert.equal(declaration.defaultValue, undefined)
  assert.equal(unused.defaultValue, 'sample-only')
  assert.deepEqual(item.props.draft.variables[0].expands, { keep: true })
  item.stop()
})

test('switching to another business draft resets insertion to that draft content', async () => {
  const item = editor(draftFor('dingTalk', 'dingTalkMessage', { message: 'First' }))
  const next = draftFor('dingTalk', 'dingTalkMessage', { message: 'Second' })
  item.props.draft = next
  await vue.nextTick()
  await item.value.insertVariable('detail.targetName')
  assert.equal(JSON.parse(next.templateJson).message, 'Second${detail.targetName}')
  item.stop()
})

test('preview tracks stored and edited bodies for all verified provider shapes', () => {
  for (const [type, provider, template, kind] of [
    ['email', 'embedded', { subject: 'Saved title', text: 'Saved ${detail.targetName}' }, 'email'],
    ['dingTalk', 'dingTalkMessage', { message: 'Saved ${detail.targetName}' }, 'dingTalk'],
    ['dingTalk', 'dingTalkRobotWebHook', { messageType: 'text', text: { content: 'Saved ${detail.targetName}' } }, 'robot'],
    ['weixin', 'corpMessage', { message: 'Saved ${detail.targetName}' }, 'wechat'],
    ['sms', 'aliyunSms', { message: 'Saved ${detail.targetName}', signName: 'JetLinks' }, 'sms'],
    ['voice', 'aliyun', { message: 'Saved ${detail.targetName}', ttsCode: 'TTS_1' }, 'voice'],
  ]) {
    const props = vue.reactive({ draft: draftFor(type, provider, template) })
    const view = useTemplatePreview(props)
    assert.equal(view.kind.value, kind)
    assert.equal(view.text.value, 'Saved Camera 218')
    if (type === 'email') props.draft.text = 'Edited'
    else props.draft.templateJson = JSON.stringify({ message: 'Edited' })
    assert.equal(view.text.value, 'Edited')
  }
})

test('examples respect date and numeric formats without changing saved variable definitions', () => {
  assert.equal(templatePreviewExample(1767268800000, { id: 'date', type: 'date', format: 'timestamp' }), '1767268800000')
  assert.equal(templatePreviewExample('90.125', { id: 'value', type: 'double', format: '%.2f' }), '90.13')
  assert.equal(templatePreviewExample('Example date', { id: 'date', type: 'date' }), 'Example date')
  const draft = draftFor('email', 'embedded', { text: '${detail.propertyValue}' })
  draft.variables = [{ id: 'detail.propertyValue', type: 'double', format: '%.1f' }]
  const before = JSON.stringify(draft)
  assert.equal(useTemplatePreview({ draft }).text.value, '90.1')
  assert.equal(JSON.stringify(draft), before)
})

test('sender requires the exact configuration and previews never read credentials', () => {
  const draft = draftFor('email', 'embedded', { text: 'Body' })
  const props = vue.reactive({ draft, config: configFor(draft, { sender: 'ops@example.com', password: 'never-show', username: 'private' }) })
  const view = useTemplatePreview(props)
  assert.equal(view.sender.value, 'ops@example.com')
  props.config.provider = 'other'
  assert.equal(view.sender.value, '')
})

test('unknown providers preserve their actual fields with sensitive extension values masked', () => {
  const draft = draftFor('weixin', 'officialMessage', { wxTemplateId: 'wx-one', title: 'Saved', content: '<script>alert(1)</script>', secret: 'never-show', nested: { token: 'also-hide' } })
  const view = useTemplatePreview({ draft })
  assert.equal(view.kind.value, 'generic')
  assert.equal(view.text.value, '<script>alert(1)</script>')
  assert.equal(view.providerContent.value.includes('never-show'), false)
  assert.equal(view.providerContent.value.includes('also-hide'), false)
  assert.ok(view.summary.value.some(field => field.key === 'wxTemplateId' && field.value === 'wx-one'))
})

test('Webhook previews only the body and derives context examples without changing template JSON', () => {
  const draft = draftFor('webhook', 'http', { contextAsBody: true, headers: { Authorization: 'private' } })
  const before = draft.templateJson
  const view = useTemplatePreview({ draft })
  assert.equal(JSON.parse(view.webhookBody.value).detail.targetName, 'Camera 218')
  assert.equal(view.webhookBody.value.includes('private'), false)
  assert.equal(draft.templateJson, before)
})

test('Webhook JSON substitution preserves quotes and the actual saved request method', () => {
  const draft = draftFor('webhook', 'http', { method: 'PUT', body: '{"message":"${detail.quoted}"}' })
  draft.variables = [{ id: 'detail.quoted', defaultValue: 'A "quoted" value' }]
  const view = useTemplatePreview({ draft })
  assert.equal(view.webhookMethod.value, 'PUT')
  assert.deepEqual(JSON.parse(view.webhookBody.value), { message: 'A "quoted" value' })
})

test('limited Markdown and HTML-shaped text render safely through real presentation components', async () => {
  assert.deepEqual(templateTextSegments('**Alarm**\n<script>x</script>', true), [{ text: 'Alarm', strong: true }, { text: '\n<script>x</script>', strong: false }])
  const Preview = load(resolve(templateRoot, 'components/TemplatePreview.vue')).default
  const draft = draftFor('dingTalk', 'dingTalkRobotWebHook', { messageType: 'markdown', markdown: { title: '<img src=x>', text: '**Alarm**\n<script>alert(1)</script>' } })
  const app = vue.createSSRApp({ render: () => vue.h(Preview, { draft, editing: true }) })
  app.config.warnHandler = () => {}
  const html = await renderToString(app)
  assert.match(html, /<strong>Alarm<\/strong>/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>|<img src=x>/)
})

test('Markdown headings and line breaks render safely while HTML and links remain literal text', async () => {
  const text = '#### **Alarm**\nFirst line\n\n<script>alert(1)</script>\n[Open](https://example.com)\n<img src=x>'
  const blocks = templateTextBlocks(text, true)
  assert.equal(blocks[0].tag, 'h4')
  assert.deepEqual(blocks[0].segments, [{ text: 'Alarm', strong: true }])
  assert.equal(blocks[2].empty, true)
  assert.equal(templateTextBlocks(text, false)[0].segments[0].text, text)
  const MessageText = load(resolve(templateRoot, 'components/TemplateMessageText.vue')).default
  const html = (await renderToString(vue.createSSRApp({ render: () => vue.h(MessageText, { text, markdown: true }) }))).replace(/<!--[\s\S]*?-->/g, '')
  assert.match(html, /<h4[^>]*>[\s\S]*?<strong>Alarm<\/strong>[\s\S]*?<\/h4>/)
  assert.match(html, /<div[^>]*><span>First line<\/span>/)
  assert.match(html, /<br/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /\[Open\]\(https:\/\/example.com\)/)
  assert.doesNotMatch(html, /####|<script>|<img src=x>|<a[\s>]/)
})

test('robot previews hide only a subject matching the first Markdown heading and keep the body unchanged', async () => {
  const Preview = load(resolve(templateRoot, 'components/TemplatePreview.vue')).default
  for (const [title, body, markdown, showSubject, headingCount] of [
    ['Alert ${detail.targetName}', '#### **Alert ${detail.targetName}**\nBody', true, false, 1],
    ['Different title', '#### Alert ${detail.targetName}\nBody', true, true, 2],
    ['Alert ${detail.targetName}', 'Introduction\n#### Alert ${detail.targetName}', true, true, 2],
    ['Alert ${detail.targetName}', '#### Alert ${detail.targetName}', false, true, 1],
  ]) {
    const draft = draftFor('dingTalk', 'dingTalkRobotWebHook', markdown
      ? { messageType: 'markdown', markdown: { title, text: body } }
      : { messageType: 'link', link: { title, text: body } })
    const baseline = JSON.stringify(draft)
    const view = useTemplatePreview({ draft })
    assert.equal(view.showInstantSubject.value, showSubject)
    const app = vue.createSSRApp({ render: () => vue.h(Preview, { draft }) })
    app.config.warnHandler = () => {}
    const html = await renderToString(app)
    assert.equal((html.match(/<h4\b/g) || []).length, headingCount)
    assert.match(html, /Alert Camera 218/)
    assert.equal(JSON.stringify(draft), baseline)
  }
})

test('email preview is one message card with actual metadata and an unchanged body in view and edit modes', async () => {
  const draft = draftFor('email', 'embedded', {
    subject: 'Alarm ${detail.targetName}', text: 'First line\n\nSecond line', sendTo: ['receiver@example.test'],
    attachments: [{ name: 'alarm-report.pdf', location: 'file-fixture' }],
  })
  const config = configFor(draft, { sender: 'sender@example.test', password: 'DO_NOT_SHOW_PASSWORD', username: 'DO_NOT_SHOW_ACCOUNT' })
  const baseline = JSON.stringify(draft)
  for (const editing of [false, true]) {
    const html = await renderPreview({ draft, config, editing })
    assert.equal((html.match(/<article\b/g) || []).length, 1)
    assert.match(html, /email-template__header/)
    assert.match(html, /<h4[^>]*>Alarm Camera 218<\/h4>/)
    assert.match(html, /email-template__metadata/)
    assert.match(html, /sender@example.test/)
    assert.match(html, /receiver@example.test/)
    assert.match(html, /2026-01-01 12:00:00/)
    assert.match(html, /First line<br><br>Second line/)
    assert.match(html, /alarm-report.pdf/)
    assert.doesNotMatch(html, /emailList|template-preview__summary|DO_NOT_SHOW_PASSWORD|DO_NOT_SHOW_ACCOUNT/)
    assert.equal(JSON.stringify(draft), baseline)
  }
})

test('each known channel dispatches to its visual preview without exposing credentials or executing content', async () => {
  for (const [type, provider, template, appearance] of [
    ['email', 'embedded', { subject: '<img src=x>', text: '<script>unsafe</script> ${detail.targetName}' }, 'email-template__body'],
    ['dingTalk', 'dingTalkMessage', { message: 'Alarm\n<script>unsafe</script> ${detail.targetName}' }, 'ding-preview__card'],
    ['dingTalk', 'dingTalkRobotWebHook', { messageType: 'markdown', markdown: { title: 'Alarm', text: '<script>unsafe</script> ${detail.targetName}' } }, 'ding-preview__card'],
    ['weixin', 'corpMessage', { message: 'Alarm\n<script>unsafe</script> ${detail.targetName}' }, 'wechat-template__card'],
    ['voice', 'aliyun', { message: '<script>unsafe</script> ${detail.targetName}', ttsCode: 'TTS_1', playTimes: 2 }, 'voice-preview__transcript'],
    ['sms', 'aliyunSms', { message: '<script>unsafe</script> ${detail.targetName}', signName: 'Sign', code: 'SMS_1' }, 'sms-preview__bubble'],
    ['webhook', 'http', { body: '{"message":"<script>unsafe</script> ${detail.targetName}"}' }, 'webhook-preview__request-line'],
  ]) {
    const draft = draftFor(type, provider, template)
    const baseline = JSON.stringify(draft)
    const config = configFor(draft, {
      sender: 'sender@example.test', password: 'PRIVATE_CREDENTIAL_DO_NOT_RENDER', secret: 'PRIVATE_CREDENTIAL_DO_NOT_RENDER',
      url: 'https://user:PRIVATE_CREDENTIAL_DO_NOT_RENDER@example.test/hook?token=PRIVATE_CREDENTIAL_DO_NOT_RENDER#PRIVATE_CREDENTIAL_DO_NOT_RENDER',
      headers: { Authorization: 'PRIVATE_CREDENTIAL_DO_NOT_RENDER' },
    })
    const html = await renderPreview({ draft, config })
    assert.ok(html.includes(appearance), `${provider} renders ${appearance}`)
    assert.match(html, /Camera 218/)
    assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/)
    assert.doesNotMatch(html, /<script>|<img src=x>|PRIVATE_CREDENTIAL_DO_NOT_RENDER/)
    if (['dingTalk', 'weixin', 'sms'].includes(type)) assert.match(html, /template-phone__screen/)
    if (type === 'webhook') assert.match(html, /https:\/\/example.test\/hook/)
    assert.equal(JSON.stringify(draft), baseline)
  }
})

test('changed Vue components compile and remain within the repository size constraint', () => {
  const channelViews = readdirSync(resolve(templateRoot, 'components/channels')).filter(name => name.endsWith('.vue')).map(name => `channels/${name}`)
  for (const name of ['TemplateEditor.vue', 'TemplatePreview.vue', 'TemplateMessageText.vue', 'TemplatePhoneFrame.vue', ...channelViews]) {
    const filename = resolve(templateRoot, 'components', name)
    const source = readFileSync(filename, 'utf8')
    assert.ok(source.split('\n').length <= 300)
    assert.doesNotThrow(() => compileScript(parse(source, { filename }).descriptor, { id: filename, inlineTemplate: true }))
    assert.doesNotMatch(source, /request\.(get|post|patch)/)
    if (name === 'channels/EmailTemplatePreview.vue') {
      assert.match(source, /sanitizeEmailPreview/)
      assert.match(source, /v-html="safeBody"/)
    } else assert.doesNotMatch(source, /v-html/)
  }
})
