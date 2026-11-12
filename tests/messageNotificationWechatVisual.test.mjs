import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'

const require = createRequire(import.meta.url)
const templateRoot = resolve(import.meta.dirname, '../views/system/MessageNotification/Templates')
const remoteApi = Object.fromEntries(['queryAliyunSmsTemplates_api', 'queryAliyunSmsSigns_api', 'queryWechatCorpDepartments_api', 'queryWechatCorpUsers_api', 'queryWechatCorpTags_api']
  .map(key => [key, async () => ({ result: [] })]))
const dependencies = { vue, 'vue-i18n': { useI18n: () => ({ t: key => key }) }, '@notify-manager-ui/api/notice-center': remoteApi, '@jetlinks-web/core': { request: {} } }
const cache = new Map()

// Run real message/caret adapters and SSR views while isolating the supplier option requests.
function load(filename) {
  if (filename.endsWith('/definition/templateDefaults.ts')) return { prototypePreviewExamples: () => ({ 'detail.targetName': 'Device A', notifyTime: '2026-01-01 12:00:00' }) }
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

const { createTemplateDraft } = load(resolve(templateRoot, 'model.ts'))
const { useTemplateEditor } = load(resolve(templateRoot, 'hooks/useTemplateEditor.ts'))
const { useTemplateMessageEditor, splitTemplateMessage } = load(resolve(templateRoot, 'hooks/useTemplateMessageEditor.ts'))
const { useTemplatePreview } = load(resolve(templateRoot, 'hooks/useTemplatePreview.ts'))
const { useWechatTemplatePreview } = load(resolve(templateRoot, 'hooks/useWechatTemplatePreview.ts'))

function setup(message, type = 'weixin', provider = 'corpMessage') {
  const draft = createTemplateDraft({ id: 'one', name: 'Stored', type, provider, configId: 'config-one', template: { message, agentId: '42', extra: 'keep' }, variableDefinitions: [] })
  const props = vue.reactive({ draft, configs: [], configState: 'ready', disabled: false, availableVariables: [{ id: 'detail.targetName', name: 'Device' }] })
  const scope = vue.effectScope()
  const editor = scope.run(() => useTemplateEditor(props, () => {}))
  const parts = scope.run(() => useTemplateMessageEditor(editor))
  return { draft: props.draft, props, editor, parts, stop: () => scope.stop() }
}
const element = (start, end = start) => ({ selectionStart: start, selectionEnd: end, focus() {}, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end } })

test('title/body view preserves legacy one-line messages and does not rewrite on focus', () => {
  assert.deepEqual(splitTemplateMessage('Single line'), { title: '', body: 'Single line', bodyOffset: 0, hasTitleLine: false })
  const item = setup('Single line')
  const before = JSON.stringify(item.draft)
  assert.equal(item.parts.title.value, '')
  assert.equal(item.parts.body.value, 'Single line')
  item.parts.captureTitleCaret({ target: element(0) })
  assert.equal(JSON.stringify(item.draft), before)
  item.stop()
})

test('split editor writes one actual message and keeps supplier extensions and AgentId', () => {
  const item = setup('Old title\nFirst body\nSecond body')
  item.parts.changeTitle('New title')
  item.parts.changeBody('New body')
  assert.deepEqual(JSON.parse(item.draft.templateJson), { message: 'New title\nNew body', agentId: '42', extra: 'keep', toParty: '', toUser: '', toUserName: '', toTag: '' })
  assert.ok(item.parts.advancedFields.value.some(field => field.key === 'agentId' && field.required))
  assert.equal(JSON.parse(item.draft.templateJson).title, undefined)
  item.stop()
})

test('variables insert into an empty title without replacing the legacy body', async () => {
  const item = setup('Saved body')
  const input = element(0)
  item.parts.captureTitleCaret({ target: input })
  await item.editor.insertVariable('detail.targetName')
  assert.equal(JSON.parse(item.draft.templateJson).message, '${detail.targetName}\nSaved body')
  assert.equal(input.selectionStart, '${detail.targetName}'.length)
  assert.equal(item.draft.variables.length, 1)
  item.stop()
})

test('body insertion replaces only its selection and restores the visible cursor for both corporate suppliers', async () => {
  for (const [type, provider] of [['weixin', 'corpMessage'], ['dingTalk', 'dingTalkMessage']]) {
    const item = setup('Header\nBefore selected after', type, provider)
    const textarea = element(7, 15)
    item.parts.captureBodyCaret({ target: textarea })
    await item.editor.insertVariable('detail.targetName')
    assert.equal(JSON.parse(item.draft.templateJson).message, 'Header\nBefore ${detail.targetName} after')
    assert.equal(textarea.selectionStart, 'Before ${detail.targetName}'.length)
    item.props.disabled = true
    const before = item.draft.templateJson
    await item.editor.insertVariable('detail.targetName')
    assert.equal(item.draft.templateJson, before)
    item.stop()
  }
})

test('Wechat card uses actual split content, escapes HTML, and leaves the draft unchanged', async () => {
  const item = setup('Alert ${detail.targetName}\n<script>alert(1)</script>\nBody')
  const before = JSON.stringify(item.draft)
  const preview = useTemplatePreview({ draft: item.draft })
  const parts = useWechatTemplatePreview(preview)
  assert.equal(parts.messageTitle.value, 'Alert Device A')
  assert.equal(parts.messageBody.value, '<script>alert(1)</script>\nBody')
  const component = load(resolve(templateRoot, 'components/channels/WechatTemplatePreview.vue')).default
  const app = vue.createSSRApp({ render: () => vue.h(component, { preview }) })
  app.config.warnHandler = () => {}
  const html = await renderToString(app)
  assert.match(html, /Alert Device A/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>/)
  assert.equal(JSON.stringify(item.draft), before)
  item.stop()
})

test('Wechat view components compile without requests or unsafe HTML', () => {
  for (const name of ['WechatTemplateEditor.vue', 'WechatTemplatePreview.vue']) {
    const filename = resolve(templateRoot, 'components/channels', name)
    const source = readFileSync(filename, 'utf8')
    assert.ok(source.split('\n').length <= 300)
    assert.doesNotThrow(() => compileScript(parse(source, { filename }).descriptor, { id: filename, inlineTemplate: true }))
    assert.doesNotMatch(source, /v-html|request\.(get|post|patch)/)
  }
})
