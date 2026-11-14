import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../views/system/MessageNotification/Templates')
const cache = new Map()
const dependencies = {
  vue, 'vue-i18n': { useI18n: () => ({ t: key => key }) },
  '@notify-manager-ui/api/notice-center': {}, '@jetlinks-web/core': { request: {} },
}
function load(filename) {
  if (cache.has(filename)) return cache.get(filename)
  let source = readFileSync(filename, 'utf8')
  if (filename.endsWith('.vue')) source = compileScript(parse(source, { filename }).descriptor, { id: filename, inlineTemplate: true }).content
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs' })
  const module = { exports: {} }
  const imports = name => {
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

const { createTemplateDraft } = load(resolve(root, 'model.ts'))
const { useTemplateEditor } = load(resolve(root, 'hooks/useTemplateEditor.ts'))
const { useWebhookTemplateEditorVisual } = load(resolve(root, 'hooks/useWebhookTemplateVisual.ts'))
const WebhookPreview = load(resolve(root, 'components/channels/WebhookTemplatePreview.vue')).default

function webhookEditor(body) {
  const draft = createTemplateDraft({ id: 'stored', name: 'Webhook', type: 'webhook', provider: 'http',
    template: { contextAsBody: false, body, vendorExtra: { preserve: true }, method: 'PATCH' } })
  const props = vue.reactive({ draft, configs: [], configState: 'empty',
    availableVariables: [{ id: 'message', name: 'Message', defaultValue: 'preview-only' }] })
  const baseline = JSON.stringify(props.draft)
  const scope = vue.effectScope()
  const editor = scope.run(() => useTemplateEditor(props, () => {}))
  const visual = scope.run(() => useWebhookTemplateEditorVisual(editor))
  return { props, baseline, scope, editor, visual }
}

test('object webhook bodies remain clean on mount and default insertion appends to the displayed JSON', async () => {
  const body = { name: 'old', nested: { keep: true }, values: [1, 2] }
  const displayed = JSON.stringify(body, null, 2)
  const item = webhookEditor(body)
  assert.equal(JSON.stringify(item.props.draft), item.baseline)
  assert.deepEqual(JSON.parse(item.props.draft.templateJson).body, body)
  assert.equal(item.visual.body.value, displayed)
  assert.equal(item.editor.canInsertVariable.value, true)
  await item.editor.insertVariable('message')
  const stored = JSON.parse(item.props.draft.templateJson)
  assert.equal(stored.body, displayed + '${message}')
  assert.equal(stored.method, 'PATCH')
  assert.deepEqual(stored.vendorExtra, { preserve: true })
  assert.equal(item.props.draft.variables[0].defaultValue, undefined)
  assert.doesNotMatch(stored.body, /\[object Object\]|preview-only/)
  item.scope.stop()
})

test('focused object webhook insertion replaces the textarea selection and preserves every other JSON character', async () => {
  const body = { name: 'old', keep: { text: 'unchanged' } }
  const displayed = JSON.stringify(body, null, 2)
  const item = webhookEditor(body)
  const start = displayed.indexOf('old')
  const selection = []
  const element = {
    selectionStart: start, selectionEnd: start + 3,
    focus() {}, setSelectionRange(...args) { selection.push(args) },
  }
  item.visual.captureBody({ target: element })
  assert.equal(JSON.stringify(item.props.draft), item.baseline)
  await item.editor.insertVariable('message')
  const stored = JSON.parse(item.props.draft.templateJson)
  const expected = displayed.slice(0, start) + '${message}' + displayed.slice(start + 3)
  assert.equal(stored.body, expected)
  assert.deepEqual(JSON.parse(stored.body), { name: '${message}', keep: { text: 'unchanged' } })
  assert.deepEqual(stored.vendorExtra, { preserve: true })
  assert.deepEqual(selection, [[start + '${message}'.length, start + '${message}'.length]])
  item.scope.stop()
})

test('string webhook bodies keep their whitespace and unknown fields during focused variable insertion', async () => {
  const original = '{ "name": "old",\n  "keep": "unchanged" }\n'
  const item = webhookEditor(original)
  assert.equal(JSON.stringify(item.props.draft), item.baseline)
  assert.equal(item.visual.body.value, original)
  const start = original.indexOf('old')
  item.visual.captureBody({ target: { selectionStart: start, selectionEnd: start + 3, focus() {}, setSelectionRange() {} } })
  await item.editor.insertVariable('message')
  const stored = JSON.parse(item.props.draft.templateJson)
  assert.equal(stored.body, original.slice(0, start) + '${message}' + original.slice(start + 3))
  assert.equal(stored.method, 'PATCH')
  assert.deepEqual(stored.vendorExtra, { preserve: true })
  item.scope.stop()
})

test('webhook textarea writes the actual body, retains extension fields and disables insertion in context mode', async () => {
  const draft = createTemplateDraft({ id: 'stored', name: 'Webhook', type: 'webhook', provider: 'http', template: { contextAsBody: false, body: '{"name":"old"}', vendorExtra: 'keep' } })
  const props = vue.reactive({ draft, configs: [], configState: 'empty', availableVariables: [{ id: 'message', name: 'Message' }] })
  const initial = JSON.stringify(props.draft)
  const scope = vue.effectScope()
  const editor = scope.run(() => useTemplateEditor(props, () => {}))
  const visual = scope.run(() => useWebhookTemplateEditorVisual(editor))
  assert.equal(JSON.stringify(props.draft), initial)
  assert.equal(visual.body.value, '{"name":"old"}')
  visual.changeBody('{"name":"changed"}')
  assert.equal(JSON.parse(props.draft.templateJson).body, '{"name":"changed"}')
  assert.equal(JSON.parse(props.draft.templateJson).vendorExtra, 'keep')
  editor.changeField(visual.modeField.value, true)
  assert.equal(visual.contextAsBody.value, true)
  assert.equal(visual.bodyField.value, undefined)
  assert.equal(editor.canInsertVariable.value, false)
  const contextDraft = props.draft.templateJson
  await editor.insertVariable('message')
  assert.equal(props.draft.templateJson, contextDraft)
  editor.changeField(visual.modeField.value, false)
  assert.equal(visual.body.value, '')
  assert.equal(JSON.parse(props.draft.templateJson).vendorExtra, 'keep')
  scope.stop()
})

test('webhook request preview escapes body markup and omits unsupported signature headers', async () => {
  const preview = {
    t: key => key, webhookMethod: vue.ref('POST'), webhookUrl: vue.ref('https://example.test/hook'),
    webhookBody: vue.ref('{"content":"<script>unsafe()</script>"}'), contextAsBody: vue.ref(false),
  }
  const app = vue.createSSRApp({ render: () => vue.h(WebhookPreview, { preview }) })
  app.component('a-tag', { setup: (_, { slots }) => () => vue.h('span', slots.default?.()) })
  const html = await renderToString(app)
  assert.match(html, /POST/)
  assert.match(html, /https:\/\/example.test\/hook/)
  assert.match(html, /Content-Type: application\/json/)
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>|X-Signature/)
})
