import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test, { after } from 'node:test'
import { transformSync } from 'esbuild'
import { JSDOM } from 'jsdom'

// Mount the production input and provider adapters with real Vue/Quill; only platform I/O is replaced.
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true, url: 'http://localhost/' })
for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'SVGElement', 'MutationObserver', 'Text', 'DOMParser', 'HTMLParagraphElement', 'getComputedStyle']) {
  Object.defineProperty(globalThis, name, { value: name === 'getComputedStyle' ? dom.window[name].bind(dom.window) : dom.window[name], configurable: true })
}
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect()
dom.window.Range.prototype.getClientRects = () => []
after(() => dom.window.close())
const vue = await import('vue')
const quill = await import('quill')
const { compileScript, parse } = await import('vue/compiler-sfc')
const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../views/system/MessageNotification/Templates')
const locale = vue.ref('zh')
const messages = Object.fromEntries(['zh', 'en', 'ja'].map(lang => [lang, JSON.parse(readFileSync(resolve(root, `../../../../locales/lang/${lang}.json`), 'utf8'))]))
const translate = key => messages[locale.value][key] || key
const dependencies = {
  vue, quill: { __esModule: true, ...quill }, 'vue-i18n': { useI18n: () => ({ t: translate }) },
  '@jetlinks-web/core': { request: {} }, '@notify-manager-ui/api/notice-center': {},
  './TemplateAttachmentsEditor.vue': { __esModule: true, default: () => null },
}
const cache = new Map()
function load(filename) {
  if (cache.has(filename)) return cache.get(filename)
  let source = readFileSync(filename, 'utf8')
  if (filename.endsWith('.vue')) source = compileScript(parse(source, { filename }).descriptor, { id: filename, inlineTemplate: true }).content
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', supported: { 'dynamic-import': false } })
  const module = { exports: {} }
  const imports = name => {
    if (name.endsWith('.css')) return {}
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    if (name.startsWith('.')) {
      let path = resolve(dirname(filename), name)
      if (!/\.(ts|vue)$/.test(path)) path = existsSync(`${path}.ts`) ? `${path}.ts` : resolve(path, 'index.ts')
      return load(path)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(imports, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}
const { createTemplateDraft, buildTemplatePayload, templateDraftFingerprint } = load(resolve(root, 'model.ts'))
const { useTemplateEditor } = load(resolve(root, 'hooks/useTemplateEditor.ts'))
const { useTemplateMessageEditor } = load(resolve(root, 'hooks/useTemplateMessageEditor.ts'))
const { provideTemplateVariableEditing } = load(resolve(root, 'variables/catalog.ts'))
const Input = load(resolve(root, 'variables/TemplateVariableInput.vue')).default
const ProviderField = load(resolve(root, 'variables/TemplateProviderField.vue')).default
const settle = async () => { await vue.nextTick(); await new Promise(resolve => setTimeout(resolve, 10)); await vue.nextTick() }
const draftFor = (type = 'email', provider = 'embedded', template = { subject: '标题', text: '正文' }) => createTemplateDraft({
  id: 'saved', name: '模板', configId: 'configured', type, provider, template,
  variableDefinitions: [{ id: 'detail.targetName', name: 'detail.targetName' }],
})
async function mount(value, options = {}) {
  locale.value = 'zh'
  const container = document.createElement('div'); document.body.append(container)
  const state = vue.reactive({ value, disabled: false, readonly: false, multiline: true, ...options,
    draft: options.draft || draftFor(), configs: [], configState: 'empty', business: { provider: 'alarm-device' },
    availableVariables: [
      { id: 'detail.targetName', name: 'detail.targetName' },
      { id: 'one', name: '同名' }, { id: 'two', name: '同名' }, { id: 'notifyTime', name: 'notifyTime' },
    ],
  })
  const baseline = templateDraftFingerprint(state.draft), updates = []
  let editor, child, message
  const app = vue.createApp({ setup() {
    editor = useTemplateEditor(state, () => {})
    if (options.part) message = useTemplateMessageEditor(editor)
    provideTemplateVariableEditing({ names: editor.variableNames, identity: vue.computed(() => state.draft), captureCaret: editor.captureCustomCaret })
    const value = () => options.part ? message[options.part].value : options.metadataField ? String(editor.metadataValue(options.metadataField) ?? '') : options.json ? state.draft.templateJson : state.value
    const update = value => {
      if (options.part) message[options.part === 'title' ? 'changeTitle' : 'changeBody'](value)
      else if (options.metadataField) editor.changeMetadata(options.metadataField.id, value)
      else if (options.json) state.draft.templateJson = value
      else state.value = value
      updates.push(value)
    }
    return () => options.field
      ? vue.h(ProviderField, { field: editor.fields.value.find(item => item.key === options.field), editor })
      : vue.h(Input, { ref: el => { child = el }, value: value(), disabled: state.disabled, readonly: state.readonly,
        multiline: state.multiline, maxlength: state.maxlength,
        'onUpdate:value': update })
  } })
  app.config.warnHandler = () => {}
  app.mount(container); await settle()
  const instance = options.field ? quill.default.find(container.querySelector('.ql-container')) : child.instance
  return { state, editor, instance, container, baseline, updates, destroy() { app.unmount(); container.remove() } }
}
const tokens = view => [...view.container.querySelectorAll('.template-variable-token')].map(node => node.textContent.replaceAll('\uFEFF', ''))
function clipboard(editor, type, text) {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true }), data = new Map()
  Object.defineProperty(event, 'clipboardData', { value: { setData: (type, value) => data.set(type, value), getData: () => text || '' } })
  editor.root.dispatchEvent(event)
  return data
}

test('legacy expressions render localized blue nodes without changing the draft or input value', async t => {
  const value = '设备${detail.targetName} / ${one}${two} / ${unknown}\n${notifyTime}'
  const view = await mount(value); t.after(view.destroy)
  assert.deepEqual(tokens(view), ['{设备名称}', '{同名}', '{同名}', '{unknown}', '{通知时间}'])
  assert.equal(view.state.value, value)
  assert.equal(view.updates.length, 0)
  assert.equal(templateDraftFingerprint(view.state.draft), view.baseline)
  const original = view.instance.getContents()
  for (const lang of ['en', 'ja', 'zh']) {
    locale.value = lang; await settle()
    assert.equal(view.state.value, value)
    assert.equal(view.updates.length, 0)
    assert.deepEqual(view.instance.getContents(), original)
    assert.equal(view.instance.history.stack.undo.length, 0)
    assert.equal(templateDraftFingerprint(view.state.draft), view.baseline)
  }
})

test('insert, whole-node delete, undo/redo and clipboard preserve same-name variable identities', async t => {
  const view = await mount('前${one}${two}后\n下一段'); t.after(view.destroy)
  view.instance.setSelection(1, 2, 'user')
  const copied = clipboard(view.instance, 'copy')
  assert.equal(copied.get('text/plain'), '${one}${two}')
  assert.equal(copied.get('text/html'), '${one}${two}')
  await view.editor.insertVariable('detail.targetName'); await settle()
  assert.equal(view.state.value, '前${detail.targetName}后\n下一段')
  assert.equal(view.instance.getSelection().index, 2)
  assert.equal(view.state.draft.variables.filter(item => item.id === 'detail.targetName').length, 1)
  view.instance.history.undo(); await settle()
  assert.equal(view.state.value, '前${one}${two}后\n下一段')
  view.instance.history.redo(); await settle()
  assert.equal(view.state.value, '前${detail.targetName}后\n下一段')
  view.instance.history.cutoff(); view.instance.deleteText(1, 1, 'user'); await settle()
  assert.equal(view.state.value, '前后\n下一段')
  view.instance.setSelection(1, 0, 'user')
  clipboard(view.instance, 'paste', copied.get('text/plain')); await settle()
  assert.equal(view.state.value, '前${one}${two}后\n下一段')
  view.instance.setSelection(1, 2, 'user')
  const cut = clipboard(view.instance, 'cut'); await settle()
  assert.equal(cut.get('text/plain'), '${one}${two}')
  assert.equal(view.state.value, '前后\n下一段')
})

test('Backspace on a backward selection between variable right guards deletes the selected ID', async t => {
  const view = await mount('前${one}${two}后'); t.after(view.destroy)
  const [first, second] = view.instance.root.querySelectorAll('[data-template-variable]')
  view.instance.focus()
  window.getSelection().setBaseAndExtent(second.lastChild, 0, first.lastChild, 0)
  view.instance.root.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))
  await settle()
  assert.equal(view.state.value, '前${one}后')
  assert.equal(view.instance.getSelection().index, 2)
})

test('single-line input counts raw key length and rejects excess without losing undo history', async t => {
  const view = await mount('a${one}', { multiline: false, maxlength: 9 }); t.after(view.destroy)
  view.instance.setSelection(2, 0, 'user')
  view.instance.insertText(2, '12', 'user'); await settle()
  assert.equal(view.state.value, 'a${one}12')
  const history = view.instance.history.stack.undo.length
  await view.editor.insertVariable('two'); await settle()
  assert.equal(view.state.value, 'a${one}12')
  assert.equal(view.instance.history.stack.undo.length, history)
  assert.equal(view.state.draft.variables.some(item => item.id === 'two'), false)
  view.instance.setSelection(0, 2, 'user')
  clipboard(view.instance, 'paste', '第一行\n第二行'); await settle()
  assert.equal(view.state.value, '第一行 第二行12')
  assert.equal(view.instance.getText().split('\n').length, 2)
})

test('completed typed expressions become nodes and composition commits Chinese text intact', async t => {
  const view = await mount(''); t.after(view.destroy)
  view.instance.setSelection(0, 0, 'user')
  view.instance.insertText(0, '${one}', 'user'); await settle()
  assert.deepEqual(tokens(view), ['{同名}'])
  assert.equal(view.state.value, '${one}')
  const paragraph = view.instance.root.querySelector('p')
  paragraph.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }))
  assert.equal(view.instance.composition.isComposing, true)
  view.instance.insertText(1, '中文输入', 'user')
  assert.equal(view.state.value, '${one}')
  paragraph.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true, data: '中文输入' }))
  await settle()
  assert.equal(view.state.value, '${one}中文输入')
  assert.deepEqual(tokens(view), ['{同名}'])
})

test('JSON escaping and cross-paragraph selection round trip unchanged', async t => {
  const value = '{\n  "name": "${detail.targetName}",\n  "path": "C:\\\\data\\\"quoted\\\""\n}'
  const view = await mount(value); t.after(view.destroy)
  view.instance.setSelection(0, view.instance.getLength() - 1, 'user')
  assert.equal(clipboard(view.instance, 'copy').get('text/plain'), value)
  clipboard(view.instance, 'paste', value); await settle()
  assert.equal(view.state.value, value)
  assert.deepEqual(JSON.parse(view.state.value), JSON.parse(value))
  assert.deepEqual(tokens(view), ['{设备名称}'])
})

test('undo restores original CRLF bytes as well as the original variable nodes', async t => {
  const value = '第一行\r\n${one}\r\n最后一行'
  const view = await mount(value); t.after(view.destroy)
  view.instance.setSelection(0, 0, 'user')
  await view.editor.insertVariable('two'); await settle()
  assert.notEqual(view.state.value, value)
  view.instance.history.undo(); await settle()
  assert.equal(view.state.value, value)
  view.instance.history.redo(); await settle()
  assert.equal(view.state.value, '${two}第一行\n${one}\n最后一行')
})

test('disabled and supplier-readonly inputs show tokens but cannot edit, then reset clears history', async t => {
  const view = await mount('${one}', { readonly: true }); t.after(view.destroy)
  assert.deepEqual(tokens(view), ['{同名}'])
  assert.equal(view.instance.isEnabled(), false)
  view.instance.insertText(0, 'blocked', 'user'); await settle()
  assert.equal(view.state.value, '${one}')
  view.state.readonly = false; await settle()
  view.instance.setSelection(1, 0, 'user')
  await view.editor.insertVariable('two'); await settle()
  assert.equal(view.state.value, '${one}${two}')
  view.state.disabled = true; await settle()
  assert.equal(view.editor.canInsertVariable.value, false)
  await view.editor.insertVariable('one')
  assert.equal(view.state.value, '${one}${two}')
  view.state.draft = draftFor(); view.state.value = '${unknown}'; view.state.disabled = false; await settle()
  assert.equal(view.instance.history.stack.undo.length, 0)
  assert.deepEqual(tokens(view), ['{unknown}'])
})

test('provider field slots retain canonical channel payloads and supplier readonly rules', async t => {
  const cases = [
    ['dingTalk', 'dingTalkMessage', { agentId: '1', message: '内容${detail.targetName}' }, 'message'],
    ['dingTalk', 'dingTalkRobotWebHook', { messageType: 'markdown', title: '标题', message: '内容${detail.targetName}' }, 'message'],
    ['weixin', 'corpMessage', { message: '内容${detail.targetName}' }, 'message'],
    ['voice', 'aliyun', { templateType: 'tts', ttsCode: 'TTS_1', ttsmessage: '内容${detail.targetName}' }, 'ttsmessage'],
    ['sms', 'aliyunSms', { code: 'SMS_1', signName: '签名', message: '审核${detail.targetName}' }, 'message'],
    ['webhook', 'http', { contextAsBody: false, body: '{"name":"${detail.targetName}"}' }, 'body'],
  ]
  for (const [type, provider, template, field] of cases) {
    const view = await mount('', { draft: draftFor(type, provider, template), field })
    try {
      assert.deepEqual(tokens(view), ['{设备名称}'], provider)
      assert.equal(templateDraftFingerprint(view.state.draft), view.baseline, provider)
      if (type === 'sms') {
        assert.equal(view.instance.isEnabled(), false)
        assert.equal(buildTemplatePayload(view.state.draft).template.message, template.message)
        continue
      }
      view.instance.setSelection(0, 0, 'user')
      await view.editor.insertVariable('two'); await settle()
      const saved = buildTemplatePayload(view.state.draft).template
      assert.ok(JSON.stringify(saved).includes('${two}'), provider)
      assert.ok(JSON.stringify(saved).includes('${detail.targetName}'), provider)
      assert.doesNotMatch(JSON.stringify(saved), /template-variable|data-template|设备名称|同名/, provider)
      if (type === 'voice') assert.equal(saved.ttsCode, 'TTS_1')
    } finally { view.destroy() }
  }
})

test('split work/WeChat title and body inputs save one canonical supplier message', async () => {
  for (const [type, provider] of [['dingTalk', 'dingTalkMessage'], ['weixin', 'corpMessage']]) {
    for (const part of ['title', 'body']) {
      const draft = draftFor(type, provider, { agentId: '1', message: '标题${one}\n正文${detail.targetName}', vendorExtra: 'keep' })
      const view = await mount('', { draft, part })
      try {
        assert.equal(templateDraftFingerprint(view.state.draft), view.baseline)
        view.instance.setSelection(0, 0, 'user')
        await view.editor.insertVariable('two'); await settle()
        const saved = buildTemplatePayload(view.state.draft).template
        assert.equal(saved.message, part === 'title' ? '${two}标题${one}\n正文${detail.targetName}' : '标题${one}\n${two}正文${detail.targetName}')
        assert.equal(saved.vendorExtra, 'keep')
        assert.equal(saved.title, undefined)
      } finally { view.destroy() }
    }
  }
})

test('dynamic string fields and generic JSON use raw expressions in saved extension payloads', async () => {
  const property = { id: 'content', name: '内容', valueType: { type: 'string' } }
  for (const json of [false, true]) {
    const draft = draftFor('extension', 'dynamic', { content: '前${detail.targetName}后', untouched: true })
    const view = await mount('', { draft, json, ...(json ? {} : { metadataField: property, metadata: { properties: [property] } }) })
    try {
      assert.equal(templateDraftFingerprint(view.state.draft), view.baseline)
      assert.deepEqual(tokens(view), ['{设备名称}'])
      const position = view.instance.getText().indexOf('前') + 1
      view.instance.setSelection(position, 0, 'user')
      await view.editor.insertVariable('two'); await settle()
      const payload = buildTemplatePayload(view.state.draft, [{ type: 'extension', provider: 'dynamic', id: 'extension:dynamic', labelKey: 'dynamic', group: 'integration', secretFields: [] }])
      assert.equal(payload.template.content, '前${two}${detail.targetName}后')
      assert.equal(payload.template.untouched, true)
      assert.doesNotMatch(JSON.stringify(payload.template), /template-variable|data-template|设备名称|同名/)
    } finally { view.destroy() }
  }
})
