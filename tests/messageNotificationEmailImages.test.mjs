import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'

const require = createRequire(import.meta.url)
const moduleRoot = resolve(import.meta.dirname, '..')
const templateRoot = resolve(moduleRoot, 'views/system/MessageNotification/Templates')
const downloadHelper = resolve(moduleRoot, '../../jetlinks-web-core/src/components/Upload/File/useFileDownload.ts')
const ignoreFile = Symbol('upload-list-ignore')
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
Object.defineProperty(globalThis, 'window', { configurable: true, writable: true,
  value: { location: { href: 'https://console.example/workspace/' } } })
after(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else delete globalThis.window
})

function loadHooks() {
  const requests = []
  const imageIds = []
  const cache = new Map()
  let uploadFactories = 0
  const dependencies = {
    vue,
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    'ant-design-vue': { Upload: { LIST_IGNORE: ignoreFile } },
    '@notify-manager-ui/api/notice-center': {},
    '@jetlinks-web/core': { request: {} },
    '@jetlinks-web/utils': { downloadFileByUrl() {}, onlyMessage() {} },
    '@jetlinks-web-core/utils': { getImageUrl: id => { imageIds.push(id); return `/file/${encodeURIComponent(id)}` } },
    '@jetlinks-web-core/components/Upload/utils': {
      createFileUploadCustomRequest() {
        uploadFactories++
        return options => new Promise((resolveRequest, rejectRequest) => {
          requests.push({ options,
            succeed(response) { options.onSuccess?.(response); resolveRequest() },
            fail(error = new Error('Upload failed')) { options.onError?.(error); resolveRequest() },
            reject(error = new Error('Network failed')) { rejectRequest(error) },
          })
        })
      },
    },
  }
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename)
    const { code } = transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' })
    const module = { exports: {} }
    const imports = name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      if (name === '@jetlinks-web-core/components/Upload/File/useFileDownload') return load(downloadHelper)
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
  return { requests, imageIds, factories: () => uploadFactories,
    images: load(resolve(templateRoot, 'hooks/useEmailTemplateImages.ts')).useEmailTemplateImages,
    editor: load(resolve(templateRoot, 'hooks/useTemplateEditor.ts')).useTemplateEditor,
    draft: load(resolve(templateRoot, 'model.ts')).createTemplateDraft }
}

function createDraft(loader, id = 'email-one') {
  return loader.draft({ id, name: 'Email', type: 'email', provider: 'embedded', configId: 'smtp-one',
    template: { subject: 'Subject', text: '<p>Keep this body</p>', attachments: [{ name: 'report.pdf', location: 'existing-file' }] } })
}

const renderer = vue.createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {},
  setText() {}, setElementText() {}, patchProp() {}, parentNode: () => null, nextSibling: () => null,
})

function mountImages({ loader = loadHooks(), useEditor = false, events = [], selection = { index: 7, length: 0 },
  insertable = true, captureSelection, acceptSelection } = {}) {
  const props = vue.reactive({ draft: createDraft(loader), configs: [], configState: 'empty', availableVariables: [], disabled: false, editor: undefined })
  const insertions = []
  const callbacks = { success: [], errors: [] }
  const aggregate = []
  let editable = true
  let accepted = insertable
  let images
  let editor
  const app = renderer.createApp({ setup() {
    if (useEditor) {
      editor = loader.editor(props, (name, value) => { aggregate.push([name, value]) })
      const setUploading = editor.setUploading
      editor.setUploading = (value, source) => { events.push([value, source]); setUploading(value, source) }
    } else editor = { setUploading: (value, source) => events.push([value, source]) }
    props.editor = vue.markRaw(editor)
    images = loader.images(props, {
      capture: () => captureSelection ? captureSelection() : selection,
      editable: () => editable,
      insert(url, position) {
        if (!accepted || acceptSelection && !acceptSelection(position)) return false
        insertions.push({ url, position })
        props.draft.text += `<img src="${url}">`
        return true
      },
    })
    return () => null
  } })
  app.mount({})
  let closed = false
  return { props, images, editor, events, aggregate, insertions, callbacks, loader,
    upload(file = imageFile(), options = {}) {
      images.customImageRequest({ file, filename: 'file',
        onSuccess: response => callbacks.success.push(response), onError: error => callbacks.errors.push(error), ...options })
    },
    setEditable(value) { editable = value }, setInsertable(value) { accepted = value },
    close() { if (!closed) { closed = true; app.unmount() } },
  }
}

function imageFile(type = 'image/png', size = 1024, name = 'alert.png') { return { type, size, name } }
async function settle() { await Promise.resolve(); await vue.nextTick(); await Promise.resolve() }
const successfulResponse = { success: true, result: { accessUrl: '/file/image-one' } }

test('email images accept the four image MIME types and reject empty, 2MB, larger and unsupported files before upload', t => {
  const item = mountImages()
  t.after(() => item.close())
  for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
    assert.equal(item.images.beforeImageUpload(imageFile(type, 2 * 1024 * 1024 - 1)), true)
  }
  for (const file of [imageFile('image/svg+xml'), imageFile('application/octet-stream'), imageFile('image/png', 0),
    imageFile('image/jpeg', 2 * 1024 * 1024), imageFile('image/gif', 2 * 1024 * 1024 + 1)]) {
    assert.equal(item.images.beforeImageUpload(file), ignoreFile)
    item.upload(file)
  }
  assert.equal(item.images.imageError.value, 'imageLimit')
  assert.equal(item.loader.requests.length, 0)
  assert.deepEqual(item.events, [])
  item.props.disabled = true
  assert.equal(item.images.beforeImageUpload(imageFile()), ignoreFile)
  item.upload()
  assert.equal(item.loader.requests.length, 0)
})

test('successful email images use the real file URL conversion and insert only the uploaded absolute URL', async t => {
  const item = mountImages()
  t.after(() => item.close())
  const before = JSON.stringify(item.props.draft.attachments)
  item.upload()
  assert.equal(item.images.imageUploading.value, true)
  assert.deepEqual(item.events, [[true, 'emailImages']])
  const response = { success: true, result: { id: 'image/id', others: { accessKey: 'private key' }, metadata: 'not-body-content' } }
  item.loader.requests[0].succeed(response)
  await settle()
  assert.deepEqual(item.loader.imageIds, ['image/id'])
  assert.deepEqual(item.insertions, [{ url: 'https://console.example/file/image%2Fid?accessKey=private+key', position: { index: 7, length: 0 } }])
  assert.deepEqual(item.callbacks.success, [response])
  assert.equal(item.callbacks.errors.length, 0)
  assert.equal(JSON.stringify(item.props.draft.attachments), before)
  assert.doesNotMatch(item.props.draft.text, /base64|not-body-content|\[object Object\]/)
  assert.equal(item.images.imageUploading.value, false)
  assert.deepEqual(item.events, [[true, 'emailImages'], [false, 'emailImages']])
})

test('failed uploads and invalid response URLs preserve the original email body', async t => {
  const invalidResponses = [undefined, { success: false, result: { accessUrl: '/file/nope' } }, { success: true },
    { success: true, result: { accessUrl: 'javascript:alert(1)' } }, { success: true, result: { accessUrl: 'data:image/png;base64,AA==' } },
    { success: true, result: { accessUrl: 'blob:https://console.example/temporary' } }, { success: true, result: { accessUrl: 'https://files.example/bad.svg' } }]
  for (const response of invalidResponses) {
    const item = mountImages()
    t.after(() => item.close())
    const original = item.props.draft.text
    item.upload()
    item.loader.requests[0].succeed(response)
    await settle()
    assert.equal(item.props.draft.text, original)
    assert.equal(item.insertions.length, 0)
    assert.equal(item.images.imageError.value, 'imageUploadFailed')
    assert.equal(item.callbacks.errors.length, 1)
    assert.equal(item.callbacks.success.length, 0)
    assert.equal(item.images.imageUploading.value, false)
  }
  for (const failure of ['fail', 'reject']) {
    const item = mountImages()
    t.after(() => item.close())
    const original = item.props.draft.text
    item.upload()
    const error = new Error('Offline')
    item.loader.requests[0][failure](error)
    await settle()
    assert.equal(item.props.draft.text, original)
    assert.deepEqual(item.callbacks.errors, [error])
    assert.equal(item.images.imageError.value, 'imageUploadFailed')
    assert.equal(item.images.imageUploading.value, false)
  }
})

test('an image that cannot be inserted reports failure without replacing existing content', async t => {
  const item = mountImages({ insertable: false })
  t.after(() => item.close())
  const original = item.props.draft.text
  item.upload()
  item.loader.requests[0].succeed(successfulResponse)
  await settle()
  assert.equal(item.props.draft.text, original)
  assert.equal(item.images.imageError.value, 'imageInsertFailed')
  assert.equal(item.callbacks.errors.length, 1)
  assert.equal(item.callbacks.success.length, 0)
  assert.equal(item.images.imageUploading.value, false)
})

test('concurrent image uploads retain their own pending count until all requests finish', async t => {
  const item = mountImages()
  t.after(() => item.close())
  item.upload(imageFile('image/png', 100, 'one.png'))
  item.upload(imageFile('image/jpeg', 200, 'two.jpg'))
  assert.equal(item.loader.requests.length, 2)
  assert.deepEqual(item.events, [[true, 'emailImages'], [true, 'emailImages']])
  item.loader.requests[0].succeed(successfulResponse)
  await settle()
  assert.equal(item.images.imageUploading.value, true)
  assert.deepEqual(item.events.at(-1), [true, 'emailImages'])
  item.loader.requests[1].fail()
  await settle()
  assert.equal(item.images.imageUploading.value, false)
  assert.deepEqual(item.events.at(-1), [false, 'emailImages'])
  assert.equal(item.insertions.length, 1)
})

test('switching drafts discards old callbacks without releasing a new draft image upload', async t => {
  const item = mountImages()
  t.after(() => item.close())
  const oldDraft = item.props.draft
  item.upload()
  item.props.draft = createDraft(item.loader, 'email-two')
  await vue.nextTick()
  item.upload(imageFile('image/png', 100, 'new.png'))
  const beforeOldResponse = item.events.length
  item.loader.requests[0].succeed(successfulResponse)
  await settle()
  assert.equal(item.events.length, beforeOldResponse)
  assert.equal(item.images.imageUploading.value, true)
  assert.equal(oldDraft.text, '<p>Keep this body</p>')
  assert.equal(item.props.draft.text, '<p>Keep this body</p>')
  assert.equal(item.callbacks.success.length, 0)
  item.loader.requests[1].succeed(successfulResponse)
  await settle()
  assert.equal(item.insertions.length, 1)
  assert.equal(item.images.imageUploading.value, false)
})

test('disabling the editor invalidates old uploads and ignores their errors after a new upload begins', async t => {
  const item = mountImages()
  t.after(() => item.close())
  item.upload()
  item.props.disabled = true
  await vue.nextTick()
  assert.equal(item.images.imageUploading.value, false)
  item.props.disabled = false
  await vue.nextTick()
  item.upload(imageFile('image/webp', 100, 'new.webp'))
  const beforeOldResponse = item.events.length
  item.loader.requests[0].fail(new Error('Late error'))
  await settle()
  assert.equal(item.events.length, beforeOldResponse)
  assert.equal(item.images.imageUploading.value, true)
  assert.equal(item.images.imageError.value, '')
  assert.equal(item.callbacks.errors.length, 0)
  item.loader.requests[1].succeed(successfulResponse)
  await settle()
  assert.equal(item.images.imageUploading.value, false)
  assert.equal(item.insertions.length, 1)
})

test('unmounted image editors discard late callbacks without changing a replacement editor upload state', async t => {
  const events = []
  const old = mountImages({ events })
  old.upload()
  old.close()
  const current = mountImages({ events })
  t.after(() => current.close())
  current.upload()
  const beforeOldResponse = events.length
  old.loader.requests[0].succeed(successfulResponse)
  await settle()
  assert.equal(events.length, beforeOldResponse)
  assert.equal(old.insertions.length, 0)
  assert.equal(old.callbacks.success.length, 0)
  assert.equal(current.images.imageUploading.value, true)
  current.loader.requests[0].succeed(successfulResponse)
  await settle()
  assert.equal(current.images.imageUploading.value, false)
  assert.equal(current.insertions.length, 1)
})

test('clipboard and dropped image file batches reuse the upload request and captured selection', async t => {
  const position = { index: 2, length: 3 }
  const item = mountImages({ selection: position })
  t.after(() => item.close())
  const pasted = imageFile('image/png', 100, 'pasted.png')
  const dropped = imageFile('image/webp', 100, 'dropped.webp')
  const batch = item.images.uploadImageFiles([pasted, dropped])
  assert.equal(item.loader.factories(), 1)
  assert.equal(item.loader.requests.length, 1)
  assert.equal(item.loader.requests[0].options.file, pasted)
  assert.equal(item.loader.requests[0].options.filename, 'file')
  item.loader.requests[0].succeed({ success: true, result: { accessUrl: 'https://files.example/pasted.png' } })
  await settle()
  assert.equal(item.loader.requests.length, 2)
  assert.equal(item.loader.requests[1].options.file, dropped)
  item.loader.requests[1].succeed({ success: true, result: { accessUrl: '/file/dropped.webp' } })
  await batch
  assert.deepEqual(item.insertions, [
    { url: 'https://files.example/pasted.png', position },
    { url: 'https://console.example/file/dropped.webp', position },
  ])
  assert.equal(item.images.imageUploading.value, false)
})

test('image batches recapture a fresh bookmark after each insertion consumes the previous selection', async t => {
  const bookmarks = []
  let cursor = 4
  const item = mountImages({
    captureSelection() {
      const bookmark = { index: cursor, length: 0, active: true }
      bookmarks.push(bookmark)
      return bookmark
    },
    acceptSelection(bookmark) {
      if (!bookmark?.active) return false
      bookmark.active = false
      cursor = bookmark.index + 1
      return true
    },
  })
  t.after(() => item.close())
  const batch = item.images.uploadImageFiles([
    imageFile('image/png', 100, 'first.png'), imageFile('image/webp', 100, 'second.webp'),
  ])
  assert.equal(bookmarks.length, 1)
  item.loader.requests[0].succeed({ success: true, result: { accessUrl: '/file/first.png' } })
  await settle()
  assert.equal(bookmarks[0].active, false)
  assert.equal(item.loader.requests.length, 2)
  assert.equal(bookmarks.length, 2)
  assert.notEqual(bookmarks[1], bookmarks[0])
  assert.equal(bookmarks[1].index, 5)
  item.loader.requests[1].succeed({ success: true, result: { accessUrl: '/file/second.webp' } })
  await batch
  assert.equal(item.insertions.length, 2)
  assert.equal(item.insertions[0].position, bookmarks[0])
  assert.equal(item.insertions[1].position, bookmarks[1])
  assert.deepEqual(item.insertions.map(({ url }) => url), [
    'https://console.example/file/first.png', 'https://console.example/file/second.webp',
  ])
  assert.equal(bookmarks[1].active, false)
  assert.equal(bookmarks[2].index, 6)
  assert.equal(item.images.imageError.value, '')
})

test('an image batch stops before requesting its next file when the draft changes after its first success', async t => {
  const item = mountImages()
  t.after(() => item.close())
  const oldDraft = item.props.draft
  const batch = item.images.uploadImageFiles([
    imageFile('image/png', 100, 'first.png'), imageFile('image/webp', 100, 'second.webp'),
  ])
  item.loader.requests[0].succeed({ success: true, result: { accessUrl: '/file/first.png' } })
  item.props.draft = createDraft(item.loader, 'replacement-email')
  await batch
  await settle()
  assert.equal(item.loader.requests.length, 1)
  assert.equal(item.insertions.length, 1)
  assert.match(oldDraft.text, /first\.png/)
  assert.equal(item.props.draft.text, '<p>Keep this body</p>')
  assert.equal(item.images.imageUploading.value, false)
})

test('actual template editor aggregates attachment and inline image sources in either completion order', async t => {
  const item = mountImages({ useEditor: true })
  t.after(() => item.close())
  item.editor.setUploading(true)
  item.upload()
  item.editor.setUploading(false)
  assert.deepEqual(item.aggregate.at(-1), ['uploading', true])
  item.loader.requests[0].succeed(successfulResponse)
  await settle()
  assert.deepEqual(item.aggregate.at(-1), ['uploading', false])

  item.editor.setUploading(true)
  item.upload()
  item.loader.requests[1].succeed(successfulResponse)
  await settle()
  assert.equal(item.images.imageUploading.value, false)
  assert.deepEqual(item.aggregate.at(-1), ['uploading', true])
  item.editor.setUploading(false)
  assert.deepEqual(item.aggregate.at(-1), ['uploading', false])
  assert.deepEqual(item.aggregate.map(([, value]) => value), [true, true, true, false, true, true, true, false])
})
