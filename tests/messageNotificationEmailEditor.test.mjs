import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test, { after } from 'node:test'
import { transformSync } from 'esbuild'
import { JSDOM } from 'jsdom'

// Mount the production Vue/Quill editors against a real DOM; only platform I/O is replaced.
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true, url: 'http://localhost/' })
for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'SVGElement', 'MutationObserver', 'Text', 'DOMParser', 'HTMLParagraphElement', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  const value = ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name) ? dom.window[name].bind(dom.window) : dom.window[name]
  Object.defineProperty(globalThis, name, { value, configurable: true })
}
after(() => dom.window.close())
// Vue runtime-dom must load after the DOM globals, or its cached document stays null.
const vue = await import('vue')
const quill = await import('quill')
const imageBlot = await import('quill/formats/image.js')
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect()
dom.window.Range.prototype.getClientRects = () => []
const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../views/system/MessageNotification/Templates')
const cache = new Map()
const dependencies = {
  vue, quill: { __esModule: true, ...quill }, 'quill/formats/image.js': { __esModule: true, ...imageBlot }, 'vue-i18n': { useI18n: () => ({ t: key => key }) },
  '@jetlinks-web/core': { request: {} }, '@notify-manager-ui/api/notice-center': {},
}
function load(filename) {
  if (cache.has(filename)) return cache.get(filename)
  const { code } = transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs', supported: { 'dynamic-import': false } })
  const module = { exports: {} }
  const imports = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    if (name.startsWith('.')) {
      let path = resolve(dirname(filename), name)
      if (!path.endsWith('.ts')) path = existsSync(`${path}.ts`) ? `${path}.ts` : resolve(path, 'index.ts')
      return load(path)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(imports, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}
const { createTemplateDraft, buildTemplatePayload } = load(resolve(root, 'model.ts'))
const { useTemplateEditor } = load(resolve(root, 'hooks/useTemplateEditor.ts'))
const { useEmailRichTextEditor } = load(resolve(root, 'hooks/useEmailRichTextEditor.ts'))
const draftFor = text => createTemplateDraft({ id: 'mail', name: '邮件模板', type: 'email', provider: 'embedded', configId: 'smtp',
  template: { subject: '标题', text, providerExtra: 'keep', sendTo: [], attachments: [] } })
const settle = async () => { await vue.nextTick(); await new Promise(resolve => setTimeout(resolve, 10)); await vue.nextTick() }
async function mount(text) {
  const container = document.createElement('div')
  document.body.append(container)
  const props = vue.reactive({ draft: draftFor(text), configs: [], configState: 'empty', disabled: false,
    availableVariables: [{ id: 'deviceName', name: '设备名称', defaultValue: '样例设备', expands: { businessType: 'string' } }] })
  let controller, rich
  const app = vue.createApp({ setup() {
    controller = useTemplateEditor(props, () => {})
    rich = useEmailRichTextEditor({ get draft() { return props.draft }, get disabled() { return props.disabled }, editor: controller })
    return () => vue.h('div', [
      vue.h('input', { value: props.draft.subject, 'data-subject': true }),
      vue.h('input', { value: rich.imageUrl.value, 'data-image-source': true }),
      vue.h('div', { ref: rich.editorElement }),
    ])
  } })
  app.mount(container)
  await settle()
  return { props, controller, rich, container, get instance() { return rich.richEditor.value },
    destroy() { app.unmount(); container.remove() } }
}

test('email editor mounts legacy text without changing the draft and saves real formatting as HTML', async t => {
  const value = '第一行\r\n第二行\n\n第三行'
  const view = await mount(value)
  t.after(() => view.destroy())
  assert.equal(view.props.draft.text, value)
  assert.equal(view.instance.getText(), '第一行\n第二行\n\n第三行\n')
  assert.equal(view.rich.bodyLength.value, buildTemplatePayload(view.props.draft).template.text.length)
  assert.equal(view.controller.canInsertVariable.value, true)
  view.instance.setSelection(0, 3, 'user')
  view.rich.runFormat('bold')
  await vue.nextTick()
  assert.match(view.props.draft.text, /<strong>第一行<\/strong>/)
  assert.equal(buildTemplatePayload(view.props.draft).template.text, view.instance.getSemanticHTML())
  assert.equal(buildTemplatePayload(view.props.draft).template.providerExtra, 'keep')
  assert.equal(view.rich.bodyLength.value, view.props.draft.text.length)
})

test('email variables replace the real formatted selection and retain declarations without preview defaults', async t => {
  const view = await mount('<p>开头<strong>替换片段</strong>结尾</p>')
  t.after(() => view.destroy())
  view.instance.setSelection(2, 4, 'user')
  await view.controller.insertVariable('deviceName')
  assert.equal(view.props.draft.text, '<p>开头<strong>${deviceName}</strong>结尾</p>')
  assert.equal(view.props.draft.variables.length, 1)
  assert.equal(view.props.draft.variables[0].defaultValue, undefined)
  assert.deepEqual(view.props.draft.variables[0].expands, { businessType: 'string' })
  assert.equal(view.instance.getSelection().index, 15)
  assert.equal(view.instance.getSelection().length, 0)
  assert.equal(view.container.querySelectorAll('.ql-editor').length, 1)
})

test('subject cursor takes precedence and an external body reset does not steal it', async t => {
  const view = await mount('<p>原正文</p>')
  t.after(() => view.destroy())
  view.instance.setSelection(1, 0, 'user')
  const subject = view.container.querySelector('[data-subject]')
  subject.focus()
  subject.setSelectionRange(1, 2)
  view.controller.captureCaret({ target: subject }, 'subject')
  view.props.draft.text = '恢复默认\r\n新正文'
  await vue.nextTick()
  await view.controller.insertVariable('deviceName')
  assert.equal(view.props.draft.subject, '标${deviceName}')
  assert.equal(view.props.draft.text, '恢复默认\r\n新正文')
  assert.equal(view.instance.getText(), '恢复默认\n新正文\n')
  assert.equal(document.activeElement, subject)
  assert.equal(subject.selectionStart, 14)
})

test('email editor rejects empty rich text and prevents edits beyond the HTML length limit', async t => {
  const view = await mount(`<p>${'x'.repeat(5113)}</p>`)
  t.after(() => view.destroy())
  assert.equal(view.props.draft.text.length, 5120)
  view.instance.setSelection(1, 0, 'user')
  view.instance.insertText(1, 'y', 'user')
  assert.equal(view.props.draft.text.length, 5120)
  assert.equal(view.rich.limitReached.value, true)
  await view.controller.insertVariable('deviceName')
  assert.equal(view.props.draft.variables.length, 0)
  assert.equal(view.props.draft.text.length, 5120)
  view.instance.deleteText(0, 1, 'user')
  assert.equal(view.props.draft.text.length, 5119)
  assert.equal(view.rich.limitReached.value, false)
  view.instance.setText('', 'user')
  assert.equal(view.instance.getLength(), 1)
  assert.throws(() => buildTemplatePayload(view.props.draft), /contentRequired/)
})

test('oversized historical bodies can be reduced without accepting additional content', async t => {
  const value = `<p>${'x'.repeat(5120)}</p>`
  const view = await mount(value)
  t.after(() => view.destroy())
  assert.equal(view.props.draft.text, value)
  view.instance.setSelection(1, 0, 'user')
  view.instance.insertText(1, 'y', 'user')
  assert.equal(view.props.draft.text, value)
  view.instance.deleteText(0, 2, 'user')
  assert.equal(view.props.draft.text.length, value.length - 2)
  assert.throws(() => buildTemplatePayload(view.props.draft), /contentLimit/)
})

test('disabled email editors reject variables, formatting and links, then resume editing', async t => {
  const view = await mount('<p>正文</p>')
  t.after(() => view.destroy())
  view.instance.setSelection(0, 2, 'user')
  view.props.disabled = true
  await vue.nextTick()
  assert.equal(view.instance.isEnabled(), false)
  assert.equal(view.controller.canInsertVariable.value, false)
  await view.controller.insertVariable('deviceName')
  view.rich.runFormat('bold')
  view.rich.linkUrl.value = 'https://example.test/'
  view.rich.applyLink()
  assert.equal(view.props.draft.text, '<p>正文</p>')
  assert.equal(view.props.draft.variables.length, 0)
  assert.ok(view.rich.toolbarActions.value.every(action => action.disabled))
  view.props.disabled = false
  await vue.nextTick()
  assert.equal(view.instance.isEnabled(), true)
  await view.controller.insertVariable('deviceName')
  assert.match(view.props.draft.text, /\$\{deviceName\}/)
})

test('links use the selected text, reject executable URLs, and can be removed', async t => {
  const view = await mount('<p>查看详情</p>')
  t.after(() => view.destroy())
  view.instance.setSelection(0, 4, 'user')
  view.rich.openLink(true)
  view.rich.linkUrl.value = 'javascript:attack()'
  assert.equal(view.rich.linkValid.value, false)
  view.rich.applyLink()
  assert.equal(view.props.draft.text, '<p>查看详情</p>')
  view.rich.linkUrl.value = 'https://example.test/detail'
  view.rich.applyLink()
  assert.match(view.props.draft.text, /href="https:\/\/example.test\/detail"/)
  assert.match(view.props.draft.text, /rel="noopener noreferrer"/)
  assert.match(view.props.draft.text, />查看详情<\/a>/)
  view.rich.removeLink()
  assert.equal(view.props.draft.text, '<p>查看详情</p>')
})

test('replacement drafts clear undo and stale targets and unmount disconnects Quill', async () => {
  const view = await mount('<p>旧模板</p>')
  try {
    const oldInstance = view.instance
    oldInstance.insertText(0, '旧草稿编辑', 'user')
    assert.ok(oldInstance.history.stack.undo.length)
    view.props.draft = draftFor('恢复默认\r\n独立正文')
    await settle()
    assert.equal(view.instance, oldInstance)
    assert.equal(view.props.draft.text, '恢复默认\r\n独立正文')
    assert.equal(view.instance.history.stack.undo.length, 0)
    view.rich.runFormat('undo')
    assert.equal(view.props.draft.text, '恢复默认\r\n独立正文')
    assert.equal(view.container.querySelectorAll('.ql-editor').length, 1)
    view.instance.setSelection(1, 0, 'user')
    await view.controller.insertVariable('deviceName')
    assert.match(view.props.draft.text, /恢\$\{deviceName\}复默认/)
    const currentInstance = view.instance
    view.destroy()
    assert.equal(currentInstance.isEnabled(), false)
    assert.equal(view.rich.richEditor.value, undefined)
    assert.equal(currentInstance.root.isConnected, false)
    assert.equal(view.controller.canInsertVariable.value, false)
  } catch (error) {
    view.destroy()
    throw error
  }
})

test('Quill list HTML uses semantic ul/ol without runtime list markers', async t => {
  const view = await mount('<p>列表第一项</p><p>列表第二项</p>')
  t.after(() => view.destroy())
  view.instance.setSelection(0, view.instance.getLength() - 1, 'user')
  view.rich.runFormat('bulletList')
  assert.match(view.props.draft.text, /^<ul><li>列表第一项<\/li><li>列表第二项<\/li><\/ul>$/)
  assert.doesNotMatch(view.props.draft.text, /data-list|ql-/)
  view.rich.runFormat('orderedList')
  assert.match(view.props.draft.text, /^<ol><li>列表第一项<\/li><li>列表第二项<\/li><\/ol>$/)
})

test('image source input receives variables and preserves template URLs through save and reload', async t => {
  const view = await mount('<p>正文</p>')
  t.after(() => view.destroy())
  view.instance.setSelection(2, 0, 'user')
  view.rich.openImage(true)
  view.rich.imageUrl.value = 'https://cdn.example.test/.png'
  await vue.nextTick()
  const input = view.container.querySelector('[data-image-source]')
  input.focus()
  input.setSelectionRange(25, 25)
  view.rich.captureImageCaret({ target: input })
  view.rich.openImage(false) // Clicking the external variable panel dismisses the popover first.
  await view.controller.insertVariable('deviceName')
  assert.equal(view.rich.imageOpen.value, true)
  assert.equal(view.rich.imageUrl.value, 'https://cdn.example.test/${deviceName}.png')
  assert.equal(view.props.draft.text, '<p>正文</p>')
  assert.equal(view.rich.imageSourceValid.value, true)
  view.rich.insertImageSource()
  assert.match(view.props.draft.text, /<img src="https:\/\/cdn.example.test\/\$\{deviceName\}\.png">/)
  assert.equal(view.instance.root.querySelector('img').getAttribute('src'), null)
  assert.equal(view.instance.root.querySelector('img').getAttribute('data-email-template-src'), 'https://cdn.example.test/${deviceName}.png')
  assert.equal(view.instance.root.querySelector('img').getAttribute('alt'), 'https://cdn.example.test/${deviceName}.png')
  assert.equal(view.instance.root.querySelector('img').getAttribute('title'), 'https://cdn.example.test/${deviceName}.png')
  const stored = buildTemplatePayload(view.props.draft).template.text
  assert.doesNotMatch(stored, /alt=|title=|data-email-template-src=/)
  view.props.draft = draftFor(stored)
  await settle()
  assert.match(view.instance.getSemanticHTML(), /src="https:\/\/cdn.example.test\/\$\{deviceName\}\.png"/)
  assert.equal(view.props.draft.text, stored)
  assert.equal(view.instance.root.querySelector('img').getAttribute('alt'), 'https://cdn.example.test/${deviceName}.png')
  assert.equal(view.instance.root.querySelector('img').getAttribute('title'), 'https://cdn.example.test/${deviceName}.png')
  assert.equal(view.instance.history.stack.undo.length, 0)
})

test('whole-variable image sources remain templates and unsafe/base64 sources never enter the draft', async t => {
  const view = await mount('<p>图片</p>')
  t.after(() => view.destroy())
  assert.equal(view.rich.insertImage('javascript:attack()'), false)
  assert.equal(view.rich.insertImage('data:image/png;base64,YQ=='), false)
  assert.equal(view.props.draft.text, '<p>图片</p>')
  assert.equal(view.rich.insertImage('${imageUrl}'), true)
  assert.match(view.props.draft.text, /<img src="\$\{imageUrl\}">/)
  assert.equal(view.instance.root.querySelector('img').getAttribute('alt'), '${imageUrl}')
  assert.equal(view.instance.root.querySelector('img').getAttribute('title'), '${imageUrl}')
  assert.doesNotMatch(view.props.draft.text, /\/\/:0|data-email-template/)
  const converted = view.instance.clipboard.convert({ html: '<p>复制文本<img src="data:image/png;base64,YQ=="></p>' })
  assert.equal(converted.ops.some(op => op.insert?.image), false)
})

test('image upload bookmarks follow accepted edits and reject reset, disabled and destroyed targets', async () => {
  const view = await mount('<p>abcdef</p>')
  try {
    const selection = view.rich.captureImageSelection({ index: 3, length: 0 })
    view.instance.insertText(0, 'PREFIX', 'user')
    assert.equal(selection.range.index, 9)
    assert.equal(view.rich.insertImage('https://example.test/image.png', selection), true)
    assert.match(view.props.draft.text, /PREFIXabc<img src="https:\/\/example.test\/image.png">def/)
    const reset = view.rich.captureImageSelection()
    view.props.draft = draftFor('<p>另一个草稿</p>')
    await settle()
    assert.equal(view.rich.insertImage('https://example.test/image.png', reset), false)
    const locked = view.rich.captureImageSelection()
    view.props.disabled = true
    await vue.nextTick()
    assert.equal(view.rich.insertImage('https://example.test/image.png', locked), false)
    view.props.disabled = false
    await vue.nextTick()
    const stale = view.rich.captureImageSelection()
    view.destroy()
    assert.equal(view.rich.insertImage('https://example.test/image.png', stale), false)
  } catch (error) { view.destroy(); throw error }
})

test('Quill clipboard image uploads are delegated and never use the default base64 handler', async t => {
  const view = await mount('<p>正文</p>')
  t.after(() => view.destroy())
  const file = new dom.window.File(['png'], 'notification.png', { type: 'image/png' })
  let received
  view.rich.setImageUploadHandler((files, selection) => { received = { files, selection } })
  view.instance.getModule('uploader').upload({ index: 1, length: 0 }, [file])
  assert.equal(received.files[0], file)
  assert.deepEqual(received.selection.range, { index: 1, length: 0 })
  assert.equal(received.selection.draft, view.props.draft)
  assert.equal(view.props.draft.text, '<p>正文</p>')
  assert.doesNotMatch(view.instance.getSemanticHTML(), /data:image/)
})

test('image upload and variables use Quill silent caret updates after Enter', async t => {
  const view = await mount('<p>告警解除通知</p><p>现场图片</p><p>变量图片</p>')
  t.after(() => view.destroy())
  view.instance.setSelection(11, 0, 'user')
  view.instance.root.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))
  assert.equal(view.instance.getSelection().index, 12)
  view.container.querySelector('[data-subject]').focus()
  assert.equal(view.instance.hasFocus(), false)
  const upload = view.rich.captureImageSelection()
  assert.equal(upload.range.index, 12)
  assert.equal(view.rich.insertImage('https://example.test/scene.png', upload), true)
  assert.match(view.props.draft.text, /<p>现场图片<\/p><p><img src="https:\/\/example.test\/scene.png"><\/p>/)
  view.instance.setSelection(0, 0, 'silent')
  await view.controller.insertVariable('deviceName')
  assert.match(view.props.draft.text, /^<p>\$\{deviceName\}告警解除通知<\/p>/)
})


test('image source popover stays pinned for external variables and closes explicitly or on body focus', async t => {
  const view = await mount('<p>正文</p>')
  t.after(() => view.destroy())
  view.rich.openImage(true)
  view.rich.imageUrl.value = 'https://example.test/'
  await vue.nextTick()
  const input = view.container.querySelector('[data-image-source]')
  input.focus(); input.setSelectionRange(input.value.length, input.value.length)
  view.rich.captureImageCaret({ target: input })
  view.rich.openImage(false)
  assert.equal(view.rich.imageOpen.value, true)
  await view.controller.insertVariable('deviceName')
  input.setSelectionRange(input.value.length, input.value.length)
  view.rich.captureImageCaret({ target: input })
  view.rich.openImage(false)
  await view.controller.insertVariable('deviceName')
  assert.equal(view.rich.imageUrl.value, 'https://example.test/${deviceName}${deviceName}')
  assert.equal(view.rich.imageOpen.value, true)
  view.rich.closeImage()
  assert.equal(view.rich.imageOpen.value, false)
  view.rich.openImage(true)
  input.focus()
  view.instance.root.focus()
  assert.equal(view.rich.imageOpen.value, false)
})


test('external same-draft body reset closes and invalidates an image address context', async t => {
  const view = await mount('<p>原正文</p>')
  t.after(() => view.destroy())
  view.rich.openImage(true)
  view.rich.imageUrl.value = 'https://example.test/'
  await vue.nextTick()
  const source = view.container.querySelector('[data-image-source]')
  source.focus(); source.setSelectionRange(source.value.length, source.value.length)
  view.rich.captureImageCaret({ target: source })
  const pending = view.rich.captureImageSelection()
  view.props.draft.text = '外部重置\n正文'
  await vue.nextTick()
  assert.equal(view.rich.imageOpen.value, false)
  assert.equal(view.props.draft.text, '外部重置\n正文')
  assert.equal(view.rich.insertImage('https://example.test/image.png', pending), false)
  await view.controller.insertVariable('deviceName')
  assert.equal(view.rich.imageUrl.value, 'https://example.test/')
  assert.match(view.props.draft.text, /^<p>\$\{deviceName\}外部重置<\/p>/)
})


test('inserted root image URLs become absolute HTTP URLs without encoding template tokens', async t => {
  const view = await mount('<p>图片内容</p>')
  t.after(() => view.destroy())
  view.instance.setSelection(4, 0, 'user')
  assert.equal(view.rich.insertImage('/file/${imageId}/image.png?name=${deviceName}'), true)
  const expected = 'http://localhost/file/${imageId}/image.png?name=${deviceName}'
  assert.match(view.props.draft.text, /src="http:\/\/localhost\/file\/\$\{imageId\}\/image\.png\?name=\$\{deviceName\}"/)
  assert.equal(view.instance.root.querySelector('img').getAttribute('data-email-template-src'), expected)
  assert.equal(view.instance.root.querySelector('img').getAttribute('alt'), expected)
  const stored = buildTemplatePayload(view.props.draft).template.text
  assert.doesNotMatch(stored, /%24|%7[bBdD]|data-email-template/)
  view.props.draft = draftFor(stored)
  await settle()
  assert.equal(view.instance.getSemanticHTML(), stored)
  assert.equal(view.instance.root.querySelector('img').getAttribute('data-email-template-src'), expected)
  assert.equal(view.rich.insertImage('HTTP://Example.test/IMAGE.png'), true)
  assert.match(view.props.draft.text, /src="http:\/\/Example\.test\/IMAGE\.png"/)
  assert.equal(view.rich.insertImage('${imageUrl}'), true)
  assert.match(view.props.draft.text, /src="\$\{imageUrl\}"/)
})

test('attachment variable images use the retained body selection independently of a toolbar image draft', async t => {
  const view = await mount('<p>开头中间结尾</p>')
  t.after(() => view.destroy())
  view.instance.setSelection(0, 0, 'user')
  view.rich.openImage(true)
  view.instance.setSelection(2, 2, 'silent')
  const field = view.container.querySelector('[data-subject]')
  field.focus()
  field.value = '附件文件名.png'
  field.setSelectionRange(2, 2)
  assert.equal(view.instance.hasFocus(), false)
  assert.equal(view.rich.insertAttachmentImage('${deviceName}'), true)
  assert.equal(view.props.draft.text, '<p>开头<img src="${deviceName}">结尾</p>')
  assert.equal(view.instance.getSelection().index, 3)
  assert.equal(view.instance.root.querySelector('img').getAttribute('data-email-template-src'), '${deviceName}')
  assert.equal(view.instance.root.querySelector('img').getAttribute('alt'), '${deviceName}')
  assert.equal(view.rich.imageOpen.value, false)
  assert.equal(view.props.draft.attachments.length, 0)
  assert.equal(buildTemplatePayload(view.props.draft).template.text, view.props.draft.text)
})

test('attachment variable images have a default body position and preserve the template after reload', async t => {
  const view = await mount('<p>默认正文</p>')
  t.after(() => view.destroy())
  assert.equal(view.instance.hasFocus(), false)
  assert.equal(view.rich.insertAttachmentImage('${imageUrl}'), true)
  assert.equal(view.props.draft.text, '<p><img src="${imageUrl}">默认正文</p>')
  const stored = buildTemplatePayload(view.props.draft).template.text
  view.props.draft = draftFor(stored)
  await settle()
  assert.equal(view.props.draft.text, stored)
  assert.equal(view.instance.root.querySelector('img').getAttribute('data-email-template-src'), '${imageUrl}')
  assert.equal(view.instance.history.stack.undo.length, 0)
})

test('attachment image insertion rejects length and disabled failures without changing the body or declarations', async t => {
  const original = `<p>${'x'.repeat(5113)}</p>`
  const view = await mount(original)
  t.after(() => view.destroy())
  view.instance.setSelection(3, 0, 'user')
  view.container.querySelector('[data-subject]').focus()
  assert.equal(view.rich.insertAttachmentImage('${deviceName}'), false)
  assert.equal(view.props.draft.text, original)
  assert.equal(view.instance.root.querySelector('img'), null)
  assert.equal(view.props.draft.variables.length, 0)
  assert.equal(view.rich.limitReached.value, true)
  view.props.disabled = true
  await vue.nextTick()
  assert.equal(view.rich.insertAttachmentImage('${deviceName}'), false)
  assert.equal(view.props.draft.text, original)
  assert.equal(view.props.draft.variables.length, 0)
})

test('attachment image insertion resets its body cursor with a replacement draft and invalidates old bookmarks', async t => {
  const view = await mount('<p>原草稿内容</p>')
  t.after(() => view.destroy())
  view.instance.setSelection(4, 0, 'user')
  view.rich.openImage(true)
  const oldSelection = view.rich.captureImageSelection()
  view.container.querySelector('[data-subject]').focus()
  view.props.draft = draftFor('<p>新正文</p>')
  await settle()
  assert.equal(oldSelection.active, false)
  assert.equal(view.rich.insertImage('${oldImage}', oldSelection), false)
  assert.equal(view.rich.insertAttachmentImage('${imageUrl}'), true)
  assert.equal(view.props.draft.text, '<p><img src="${imageUrl}">新正文</p>')
  assert.doesNotMatch(view.props.draft.text, /原草稿|oldImage/)
  assert.equal(view.props.draft.variables.length, 0)
})
