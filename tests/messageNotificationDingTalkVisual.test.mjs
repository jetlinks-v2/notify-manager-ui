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
const templateRoot = resolve(import.meta.dirname, '../views/system/MessageNotification/Templates')
const cache = new Map()
const dependencies = {
  vue,
  'vue-i18n': { useI18n: () => ({ t: key => key }) },
  '@notify-manager-ui/api/notice-center': {},
  '@jetlinks-web/core': { request: {} },
}

// Run production adapters/components against memory-only suppliers; no browser or service is opened.
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

const { createTemplateDraft } = load(resolve(templateRoot, 'model.ts'))
const { useTemplateEditor } = load(resolve(templateRoot, 'hooks/useTemplateEditor.ts'))
const { useDingTalkTemplateEditor } = load(resolve(templateRoot, 'hooks/useDingTalkTemplateEditor.ts'))
const { useDingTalkTemplateView } = load(resolve(templateRoot, 'hooks/useDingTalkTemplateView.ts'))
const DingTalkTemplatePreview = load(resolve(templateRoot, 'components/channels/DingTalkTemplatePreview.vue')).default
const draftFor = (provider, template) => createTemplateDraft({ id: 'stored', name: 'Notification', type: 'dingTalk', provider, template })
function editor(draft) {
  const props = vue.reactive({ draft, configs: [], configState: 'empty', availableVariables: [], disabled: false })
  const scope = vue.effectScope()
  const controller = scope.run(() => useTemplateEditor(props, () => {}))
  const fields = scope.run(() => useDingTalkTemplateEditor(controller))
  return { props, scope, controller, fields }
}
const previewFor = (text, kind = 'dingTalk') => ({
  t: key => key, kind: vue.ref(kind), text: vue.ref(text), subject: vue.ref(''), displayTime: vue.ref('2026-01-01 12:00:00'),
  applicationName: vue.ref('Current application'), showInstantSubject: vue.ref(true), markdown: vue.ref(false), messageUrl: vue.ref(''),
})

test('work-notification title/body update only the real message and preserve advanced supplier fields', () => {
  const draft = draftFor('dingTalkMessage', { agentId: 'agent-one', userIdList: 'recipient', message: 'Title\nOriginal body', vendorExtra: 'keep' })
  const initial = JSON.stringify(draft)
  const item = editor(draft)
  assert.equal(JSON.stringify(draft), initial)
  assert.equal(item.fields.title.value, 'Title')
  assert.equal(item.fields.body.value, 'Original body')
  assert.ok(item.fields.advancedFields.value.some(field => field.key === 'agentId'))
  item.fields.changeTitle('Updated title')
  item.fields.changeBody('Updated body')
  const stored = JSON.parse(item.props.draft.templateJson)
  assert.equal(stored.message, 'Updated title\nUpdated body')
  assert.equal(stored.title, undefined)
  assert.equal(stored.agentId, 'agent-one')
  assert.equal(stored.userIdList, 'recipient')
  assert.equal(stored.vendorExtra, 'keep')
  item.scope.stop()
})

test('robot editor keeps canonical title/body and exposes message-type/link controls as advanced fields', () => {
  const item = editor(draftFor('dingTalkRobotWebHook', { messageType: 'link', link: { title: 'Link title', text: 'Body', messageUrl: 'https://example.test' } }))
  assert.equal(item.fields.robot.value, true)
  assert.deepEqual(item.fields.mainFields.value.map(field => field.key), ['linkTitle', 'message'])
  assert.ok(item.fields.advancedFields.value.some(field => field.key === 'messageType'))
  assert.ok(item.fields.advancedFields.value.some(field => field.key === 'messageUrl'))
  item.controller.changeField(item.fields.mainFields.value.find(field => field.key === 'linkTitle'), 'Changed')
  item.controller.changeField(item.fields.mainFields.value.find(field => field.key === 'message'), 'Changed body')
  const stored = JSON.parse(item.props.draft.templateJson)
  assert.equal(stored.link.title, 'Changed')
  assert.equal(stored.link.text, 'Changed body')
  assert.equal(stored.link.messageUrl, 'https://example.test')
  item.scope.stop()
})

test('one-line legacy notifications remain bodies and display uses a non-executable phone card', async () => {
  const preview = previewFor('A preserved body <script>doNotExecute()</script>')
  const value = useDingTalkTemplateView(preview)
  assert.equal(value.title.value, '')
  assert.equal(value.body.value, preview.text.value)
  const app = vue.createSSRApp({ render: () => vue.h(DingTalkTemplatePreview, { preview }) })
  app.component('AIcon', { render: () => null })
  const html = await renderToString(app)
  assert.match(html, /template-phone/)
  assert.match(html, /Current application/)
  assert.match(html, /&lt;script&gt;doNotExecute\(\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>/)
  assert.equal(preview.text.value, 'A preserved body <script>doNotExecute()</script>')
})
