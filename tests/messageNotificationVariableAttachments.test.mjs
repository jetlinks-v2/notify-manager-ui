import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../views/system/MessageNotification/Templates')
const ignoreFile = Symbol('ignore-upload')
const cache = new Map()
const dependencies = {
  vue, 'vue-i18n': { useI18n: () => ({ t: key => key }) },
  'ant-design-vue': { Upload: { LIST_IGNORE: ignoreFile } },
  '@jetlinks-web/core': { request: {} }, '@notify-manager-ui/api/notice-center': {},
  '@jetlinks-web-core/components/Upload/File/useFileDownload': { getFileDownloadUrl: file => file.response?.result?.accessUrl || file.url },
}
function load(filename) {
  if (cache.has(filename)) return cache.get(filename)
  const { code } = transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' })
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
const { useTemplateAttachments } = load(resolve(root, 'hooks/useTemplateAttachments.ts'))
const renderer = vue.createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {},
  setText() {}, setElementText() {}, patchProp() {}, parentNode: () => null, nextSibling: () => null,
})
const fixed = { name: 'report.pdf', location: 'platform-file-one' }
const variable = { name: 'alarm.png', location: '${detail.imageUrl}' }
function mount({ attachments = [fixed], autoAck = false, inlineResult = true } = {}) {
  const events = [], declared = [], images = []
  const editor = vue.markRaw({ insertableVariables: vue.ref([{ id: 'detail.imageUrl', name: '告警图片', defaultValue: 'https://example.test/mock.png' }, { id: 'other.image', name: '其他图片' }]), registerVariable: id => { declared.push(id); return true } })
  const props = vue.reactive({ attachments: attachments.map(item => ({ ...item })), disabled: false, editor,
    insertInlineImage: source => { images.push(source); return inlineResult } })
  let state
  const app = renderer.createApp({ setup() {
    state = useTemplateAttachments(props, (...args) => {
      events.push(args)
      if (autoAck && args[0] === 'update:attachments') props.attachments = args[1]
    })
    return () => null
  } })
  app.mount({})
  return { state, props, events, declared, images, close: () => app.unmount(),
    current: () => events.filter(event => event[0] === 'update:attachments').at(-1)?.[1] ?? props.attachments,
  }
}
const file = (uid, name = uid + '.pdf') => ({ uid, name, size: 1024 })
const upload = (uid, status, name = uid + '.pdf') => ({ file: { ...file(uid, name), status, response: { success: true, result: { accessUrl: 'https://files.example.test/' + uid } } } })
const select = (state, name = 'alarm.png', source = '${detail.imageUrl}') => { state.filename.value = name; state.variableSource.value = source }


test('variable modal uses actual catalog and cancellation changes neither attachments nor declarations', t => {
  const item = mount()
  t.after(item.close)
  item.state.openVariable()
  assert.equal(item.state.modalOpen.value, true)
  assert.deepEqual(item.state.variableOptions.value.map(row => row.value), ['${detail.imageUrl}', '${other.image}'])
  assert.ok(item.state.variableOptions.value.every(row => !row.label.includes('https://example.test/mock.png')))
  select(item.state)
  item.state.closeVariable()
  assert.deepEqual(item.current(), [fixed])
  assert.deepEqual(item.declared, [])
  assert.deepEqual(item.images, [])
})

test('accepted variable attachment remains a literal resource reference and never becomes a download link', t => {
  const item = mount()
  t.after(item.close)
  item.state.openVariable(); select(item.state)
  assert.equal(item.state.confirmVariable(), true)
  assert.deepEqual(item.current(), [fixed, variable])
  assert.deepEqual(item.declared, ['detail.imageUrl'])
  assert.equal(item.state.modalOpen.value, false)
  assert.equal(item.state.files.value.length, 1)
  assert.equal(item.state.files.value[0].response.result.id, fixed.location)
  assert.equal(item.state.variableAttachments.value[0].index, 1)
  assert.deepEqual(item.images, [])
})

test('editing and deleting variable attachments preserve provider fields and fixed resources', t => {
  const item = mount({ attachments: [fixed, { ...variable, extra: 'keep' }] })
  t.after(item.close)
  item.state.openVariable(1); select(item.state, 'changed.png', '${other.image}')
  assert.equal(item.state.confirmVariable(), true)
  assert.deepEqual(item.current(), [fixed, { name: 'changed.png', location: '${other.image}', extra: 'keep' }])
  item.state.removeVariableAttachment(1)
  assert.deepEqual(item.current(), [fixed])
  item.state.removeVariableAttachment(10)
  assert.deepEqual(item.current(), [fixed])
})

test('inline placement inserts at the parent body cursor without adding an attachment', t => {
  const item = mount()
  t.after(item.close)
  item.state.openVariable(); select(item.state)
  item.state.placement.value = 'inline'
  assert.equal(item.state.confirmVariable(), true)
  assert.deepEqual(item.images, ['${detail.imageUrl}'])
  assert.deepEqual(item.declared, ['detail.imageUrl'])
  assert.deepEqual(item.current(), [fixed])
  assert.equal(item.state.modalOpen.value, false)
})

test('failed body insertion preserves the modal and does not declare or append any variable', t => {
  const item = mount({ inlineResult: false })
  t.after(item.close)
  item.state.openVariable(); select(item.state); item.state.placement.value = 'inline'
  assert.equal(item.state.confirmVariable(), false)
  assert.equal(item.state.modalOpen.value, true)
  assert.equal(item.state.modalError.value, 'inlineFailed')
  assert.deepEqual(item.current(), [fixed])
  assert.deepEqual(item.declared, [])
})

test('existing variable attachments can also be inserted into the body while remaining attached', t => {
  const item = mount({ attachments: [fixed, variable] })
  t.after(item.close)
  item.state.insertAttachmentImage(1)
  assert.deepEqual(item.images, ['${detail.imageUrl}'])
  assert.deepEqual(item.current(), [fixed, variable])
  assert.deepEqual(item.declared, ['detail.imageUrl'])
})

test('attachment validation requires name and source and rejects duplicate names across uploaded and variable files', t => {
  const item = mount({ attachments: [fixed, variable] })
  t.after(item.close)
  item.state.openVariable()
  assert.equal(item.state.confirmVariable(), false)
  assert.equal(item.state.modalError.value, 'variableRequired')
  item.state.variableSource.value = '${detail.imageUrl}'
  assert.equal(item.state.confirmVariable(), false)
  assert.equal(item.state.modalError.value, 'nameRequired')
  item.state.filename.value = ' report.pdf '
  assert.equal(item.state.confirmVariable(), false)
  assert.equal(item.state.modalError.value, 'duplicateName')
  item.state.closeVariable(); item.state.openVariable(1)
  assert.equal(item.state.confirmVariable(), true)
  assert.deepEqual(item.current(), [fixed, variable])
})

test('pending uploads and variable rows share the five-attachment limit without losing concurrent changes', t => {
  const item = mount({ attachments: [fixed, variable, { name: 'two.png', location: '${other.image}' }] })
  t.after(item.close)
  assert.equal(item.state.beforeUpload(file('first'), [file('first')]), true)
  item.state.uploadChanged(upload('first', 'uploading'))
  item.state.openVariable(); select(item.state, 'third.png')
  assert.equal(item.state.confirmVariable(), true)
  item.state.uploadChanged(upload('first', 'done'))
  assert.equal(item.current().length, 5)
  assert.equal(item.current().at(-1).name, 'first.pdf')
  item.state.openVariable(); select(item.state, 'overflow.png')
  assert.equal(item.state.modalOpen.value, true)
  assert.equal(item.state.confirmVariable(), false)
  assert.equal(item.state.modalError.value, 'limit')
  item.state.placement.value = 'inline'
  assert.equal(item.state.confirmVariable(), true)
  assert.deepEqual(item.images, ['${detail.imageUrl}'])
  assert.equal(item.state.beforeUpload(file('overflow'), [file('overflow')]), ignoreFile)
  assert.equal(item.current().filter(row => row.location === '${detail.imageUrl}').length, 2)
})

test('multi-file reservations count each batch once and reject over-limit batches', t => {
  const item = mount({ attachments: [fixed, variable, { name: 'two.png', location: '${other.image}' }] })
  t.after(item.close)
  const batch = [file('first'), file('second')]
  assert.equal(item.state.beforeUpload(batch[0], batch), true)
  assert.equal(item.state.beforeUpload(batch[1], batch), true)
  item.state.uploadChanged(upload('first', 'uploading'))
  item.state.uploadChanged(upload('second', 'uploading'))
  assert.equal(item.state.files.value.filter(row => row.status === 'uploading').length, 2)
  item.state.uploadChanged(upload('second', 'done'))
  item.state.uploadChanged(upload('first', 'done'))
  assert.equal(item.current().length, 5)
})

test('external attachment reset closes a local modal and ignores old upload completion', async t => {
  const item = mount()
  t.after(item.close)
  item.state.beforeUpload(file('old'), [file('old')]); item.state.uploadChanged(upload('old', 'uploading'))
  item.state.openVariable(); select(item.state)
  item.props.attachments = [{ name: 'new.pdf', location: 'new-file' }]
  await vue.nextTick()
  assert.equal(item.state.modalOpen.value, false)
  item.state.uploadChanged(upload('old', 'done'))
  assert.deepEqual(item.current(), [{ name: 'new.pdf', location: 'new-file' }])
  assert.deepEqual(item.declared, [])
  assert.equal(item.state.files.value.length, 1)
})

test('own v-model acknowledgement retains modal fields while an upload finishes', async t => {
  const item = mount({ autoAck: true })
  t.after(item.close)
  item.state.uploadChanged(upload('first', 'uploading'))
  item.state.openVariable(); select(item.state)
  item.state.uploadChanged(upload('first', 'done'))
  await vue.nextTick()
  assert.equal(item.state.modalOpen.value, true)
  assert.equal(item.state.filename.value, 'alarm.png')
  assert.equal(item.state.confirmVariable(), true)
  await vue.nextTick()
  assert.deepEqual(item.current(), [fixed, { name: 'first.pdf', location: 'https://files.example.test/first' }, variable])
})

test('disabled and unmounted attachments reject modal actions and late uploads', async () => {
  const item = mount({ attachments: [fixed, variable] })
  item.state.uploadChanged(upload('old', 'uploading'))
  item.state.openVariable(); select(item.state, 'new.png')
  item.props.disabled = true
  await vue.nextTick()
  assert.equal(item.state.modalOpen.value, false)
  assert.equal(item.state.beforeUpload(file('new'), []), ignoreFile)
  item.state.uploadChanged(upload('old', 'done'))
  item.state.openVariable(); item.state.removeVariableAttachment(1); item.state.insertAttachmentImage(1)
  assert.equal(item.state.confirmVariable(), false)
  assert.deepEqual(item.current(), [fixed, variable])
  assert.deepEqual(item.images, [])
  item.close()
  item.state.uploadChanged(upload('later', 'done'))
  assert.deepEqual(item.current(), [fixed, variable])
})

test('legacy empty and compound template locations remain visible and editable without rewriting them', t => {
  const legacy = { name: 'runtime.png', location: '' }
  const compound = { name: 'compound.png', location: 'https://files.example.test/${detail.id}.png' }
  const item = mount({ attachments: [fixed, legacy, compound] })
  t.after(item.close)
  assert.equal(item.state.variableAttachments.value.length, 2)
  item.state.openVariable(2)
  assert.ok(item.state.variableOptions.value.some(row => row.value === compound.location))
  assert.equal(item.state.confirmVariable(), true)
  assert.deepEqual(item.current(), [fixed, legacy, compound])
  item.state.removeAttachment(item.state.files.value[0])
  assert.deepEqual(item.current(), [legacy, compound])
})


test('an acknowledged newest emission clears obsolete snapshots so reset to an earlier state is authoritative', async t => {
  const item = mount()
  t.after(item.close)
  item.state.openVariable(); select(item.state, 'first.png'); item.state.confirmVariable()
  const first = item.current().map(row => ({ ...row }))
  item.state.openVariable(); select(item.state, 'second.png'); item.state.confirmVariable()
  item.props.attachments = item.current().map(row => ({ ...row }))
  await vue.nextTick()
  item.state.openVariable(); select(item.state, 'discard.png')
  item.props.attachments = first
  await vue.nextTick()
  assert.equal(item.state.modalOpen.value, false)
  assert.equal(item.state.variableAttachments.value.length, 1)
  assert.equal(item.state.variableAttachments.value[0].item.name, 'first.png')
})
