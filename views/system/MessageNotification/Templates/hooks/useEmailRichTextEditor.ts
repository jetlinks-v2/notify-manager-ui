import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type Quill from 'quill'
import type { Delta, Range } from 'quill'
import type { TemplateDraft } from '../model'
import type { TemplateEditorController } from '../channelViewTypes'
import { isEmailImageSource, normalizeEmailImageSource, toEmailBodyHtml } from '../definition/emailTemplateContent'
import { bindTemplateVariableClipboard, copyTemplateEditorHistory as copyHistory, createTemplateVariableBlot,
  promoteTemplateVariables, refreshTemplateVariableLabels, templateVariableDisplayText, tokenizeTemplateDelta } from '../variables/quillVariables'

interface EmailRichTextProps { draft: TemplateDraft; editor: TemplateEditorController; disabled?: boolean }
export interface EmailImageSelection { draft: TemplateDraft; editor: Quill; range: { index: number; length: number }; active: boolean }
type FormatAction = 'paragraph' | 'heading' | 'bold' | 'italic' | 'underline' | 'bulletList' | 'orderedList' | 'undo' | 'redo'
const formats: { key: FormatAction; icon: string }[] = [
  { key: 'paragraph', icon: 'AlignLeftOutlined' }, { key: 'heading', icon: 'FontSizeOutlined' },
  { key: 'bold', icon: 'BoldOutlined' }, { key: 'italic', icon: 'ItalicOutlined' }, { key: 'underline', icon: 'UnderlineOutlined' },
  { key: 'bulletList', icon: 'UnorderedListOutlined' }, { key: 'orderedList', icon: 'OrderedListOutlined' },
  { key: 'undo', icon: 'UndoOutlined' }, { key: 'redo', icon: 'RedoOutlined' },
]

/** Quill owns document positions; the draft only receives accepted semantic HTML edits. */
export function useEmailRichTextEditor(props: EmailRichTextProps) {
  const editorElement = ref<HTMLDivElement>()
  const richEditor = shallowRef<Quill>()
  const limitReached = ref(false)
  const linkOpen = ref(false), linkUrl = ref(''), imageOpen = ref(false), imageUrl = ref('')
  const revision = ref(0)
  const bookmarks = new Set<EmailImageSelection>()
  let lastRange = { index: 0, length: 0 }, syncing = false, disposed = false
  let DeltaClass: typeof import('quill')['Delta'] | undefined
  let acceptedDelta: Delta, acceptedHtml = '', acceptedHistory: Quill['history']['stack']
  let loadedDelta: Delta, loadedText = props.draft.text, publishedText = props.draft.text
  let imageSelection: EmailImageSelection | undefined
  let uploadHandler: ((files: File[], selection: EmailImageSelection) => void) | undefined
  let unbindClipboard: (() => void) | undefined
  const enabled = () => !props.disabled && !disposed && !!richEditor.value
  const html = () => richEditor.value?.getSemanticHTML() ?? ''
  function remember() {
    const instance = richEditor.value
    if (!instance) return
    acceptedDelta = instance.getContents(); acceptedHtml = instance.getSemanticHTML(); acceptedHistory = copyHistory(instance.history.stack)
  }
  function invalidateImages() { for (const item of bookmarks) item.active = false; bookmarks.clear(); imageSelection = undefined }
  function loadContent() {
    const instance = richEditor.value
    if (!instance) return
    syncing = true
    try {
      instance.setContents(tokenizeTemplateDelta(instance.clipboard.convert({ html: toEmailBodyHtml(props.draft.text) }), DeltaClass!), 'silent')
      loadedDelta = instance.getContents(); loadedText = props.draft.text; publishedText = props.draft.text
      instance.history.clear(); lastRange = { index: 0, length: 0 }; remember()
    } finally { syncing = false }
    limitReached.value = false; revision.value++
  }
  function textChanged() {
    const instance = richEditor.value
    if (!instance || syncing || instance.composition.isComposing || !DeltaClass) return
    // 完整表达式键入后也使用变量节点；输入法可能合并多次变更，选区须相对上次接受的文档移动。
    syncing = true
    try { promoteTemplateVariables(instance, DeltaClass) }
    finally { syncing = false }
    const nextHtml = instance.getSemanticHTML()
    if (props.disabled || nextHtml.length > 5120 && nextHtml.length >= acceptedHtml.length) {
      syncing = true
      try { instance.setContents(acceptedDelta, 'silent'); instance.history.stack = copyHistory(acceptedHistory); instance.setSelection(lastRange, 'silent') }
      finally { syncing = false }
      limitReached.value = !props.disabled; revision.value++; return
    }
    const delta = acceptedDelta.diff(instance.getContents())
    for (const item of bookmarks) {
      const end = delta.transformPosition(item.range.index + item.range.length)
      item.range.index = delta.transformPosition(item.range.index); item.range.length = Math.max(0, end - item.range.index)
    }
    // 撤销到加载文档时恢复原始 HTML / 纯文本，不能把一次可撤销编辑变成历史模板格式迁移。
    publishedText = loadedDelta.diff(instance.getContents()).ops.length ? nextHtml : loadedText
    props.draft.text = publishedText; limitReached.value = false; remember(); revision.value++
    captureBodySelection()
  }
  function selectionChanged(range: Range | null) {
    if (!range || syncing) return
    lastRange = { index: range.index, length: range.length }; revision.value++; captureBodySelection()
  }
  function currentBodyRange() {
    const instance = richEditor.value
    const current = instance?.hasFocus() ? instance.getSelection() : null
    if (current) lastRange = { index: current.index, length: current.length }
    return { ...lastRange }
  }
  function editorChanged(eventName: string, value: Range | Delta | null) {
    // Enter/paste update Quill's selection silently and only emit editor-change.
    if (eventName === 'selection-change' && (value === null || 'index' in value)) selectionChanged(value)
  }
  function focusBody() { if (!syncing) { closeImage(); captureBodySelection() } }
  function compositionEnd() { queueMicrotask(() => { if (!disposed && DeltaClass) { richEditor.value?.update('user'); textChanged() } }) }
  onMounted(async () => {
    // Quill binds document listeners at import time, so keep it out of SSR/setup execution.
    const [{ default: QuillClass, Delta: QuillDelta, Parchment }, { default: Image }] = await Promise.all([import('quill'), import('quill/formats/image.js')])
    if (disposed || !editorElement.value) return
    DeltaClass = QuillDelta
    class TemplateImage extends Image {
      static sanitize(value: string) { return isEmailImageSource(value) ? value : '' }
      static create(value: string) {
        const node = super.create(value)
        if (/\$\{[^{}]+\}/.test(value)) { node.setAttribute('data-email-template-src', value); node.removeAttribute('src'); node.setAttribute('alt', templateVariableDisplayText(value, props.editor.variableNames.value)); node.setAttribute('title', value) }
        return node
      }
      static formats(node: Element) {
        const formats = super.formats(node)
        // This alt is an editor placeholder, not a Delta format; otherwise Quill removes it on insert.
        if (node.hasAttribute('data-email-template-src')) delete formats.alt
        return formats
      }
      static value(node: Element) { return node.getAttribute('data-email-template-src') ?? node.getAttribute('src') }
      html() {
        const node = document.createElement('img')
        node.setAttribute('src', TemplateImage.value(this.domNode) ?? '')
        for (const name of ['alt', 'height', 'width']) if (this.domNode.hasAttribute(name) && !this.domNode.hasAttribute('data-email-template-src')) node.setAttribute(name, this.domNode.getAttribute(name) ?? '')
        return node.outerHTML
      }
    }
    // A local registry preserves template image URLs without changing other Quill instances.
    const registry = new Parchment.Registry()
    for (const name of ['blots/scroll', 'blots/block', 'blots/break', 'blots/container', 'blots/cursor', 'blots/inline', 'blots/text',
      'formats/bold', 'formats/italic', 'formats/underline', 'formats/header', 'formats/list', 'formats/indent', 'formats/link']) {
      const definition = QuillClass.import(name) as Parameters<typeof registry.register>[0] & { requiredContainer?: Parameters<typeof registry.register>[0] }
      registry.register(definition)
      if (definition.requiredContainer) registry.register(definition.requiredContainer)
    }
    registry.register(TemplateImage)
    registry.register(createTemplateVariableBlot(QuillClass, () => props.editor.variableNames.value))
    const instance = new QuillClass(editorElement.value, { registry, readOnly: !!props.disabled, modules: {
      toolbar: false, history: { userOnly: true, delay: 500 },
      uploader: { mimetypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], handler: (range: Range, files: File[]) => {
        const selection = captureImageSelection(range)
        if (selection && enabled()) uploadHandler?.(files, selection)
      } },
    } })
    richEditor.value = instance
    instance.root.setAttribute('aria-label', props.editor.t('messageNotification.templates.richText.bodyLabel'))
    instance.root.setAttribute('aria-multiline', 'true')
    instance.clipboard.addMatcher('IMG', (node, delta) => node instanceof Element && isEmailImageSource(node.getAttribute('src') ?? '') ? delta : new QuillDelta())
    instance.clipboard.addMatcher(Node.TEXT_NODE, (_node, delta) => tokenizeTemplateDelta(delta, QuillDelta))
    loadContent()
    unbindClipboard = bindTemplateVariableClipboard(instance, enabled)
    instance.on('text-change', textChanged); instance.on('editor-change', editorChanged); instance.root.addEventListener('focus', focusBody)
    instance.root.addEventListener('compositionend', compositionEnd)
    captureBodySelection()
  })
  onBeforeUnmount(() => {
    disposed = true; invalidateImages(); unbindClipboard?.()
    const instance = richEditor.value
    if (instance) {
      instance.off('text-change', textChanged); instance.off('editor-change', editorChanged); instance.root.removeEventListener('focus', focusBody)
      instance.root.removeEventListener('compositionend', compositionEnd)
      instance.disable(); instance.scroll.observer.disconnect(); instance.emitter.removeAllListeners()
      instance.container.replaceChildren(); instance.container.classList.remove('ql-container')
    }
    richEditor.value = undefined
  })
  /** Variable insertion replaces the saved Quill range, retaining the selection's formatting. */
  function captureBodySelection() {
    const instance = richEditor.value, draft = props.draft
    if (!instance) return
    props.editor.captureCustomCaret({ start: 0, end: 0, read: html, write: () => false,
      editable: () => enabled() && richEditor.value === instance && props.draft === draft,
      insert: token => {
        if (!enabled() || props.draft !== draft || !DeltaClass) return false
        const range = currentBodyRange(), before = html(), attributes = instance.getFormat(range)
        instance.history.cutoff()
        const inserted = tokenizeTemplateDelta(new DeltaClass().insert(token, attributes), DeltaClass)
        instance.updateContents(new DeltaClass().retain(range.index).delete(range.length).concat(inserted), 'user')
        const accepted = html() !== before
        if (accepted) { lastRange = { index: range.index + inserted.length(), length: 0 }; instance.setSelection(lastRange, 'silent'); instance.focus({ preventScroll: true }) }
        instance.history.cutoff()
        return accepted
      },
    })
  }
  watch(() => props.draft.text, value => { if (richEditor.value && publishedText !== value) { if (imageOpen.value) closeImage(); invalidateImages(); loadContent() } })
  watch(props.editor.variableNames, names => {
    const instance = richEditor.value
    if (!instance) return
    refreshTemplateVariableLabels(instance, names)
    instance.root.querySelectorAll('img[data-email-template-src]').forEach(node => {
      node.setAttribute('alt', templateVariableDisplayText(node.getAttribute('data-email-template-src') || '', names))
    })
  })
  watch(() => props.disabled, disabled => { if (disabled) invalidateImages(); richEditor.value?.enable(!disabled); if (!disabled) captureBodySelection(); revision.value++ })
  watch(() => props.draft, () => { invalidateImages(); loadContent(); linkOpen.value = false; imageOpen.value = false; captureBodySelection() }, { flush: 'post' })
  const bodyLength = computed(() => toEmailBodyHtml(props.draft.text).length)
  const toolbarActions = computed(() => {
    revision.value
    const instance = richEditor.value, format = instance?.getFormat(lastRange) ?? {}
    return formats.map(item => ({ ...item, active: item.key === 'paragraph' ? !format.header : item.key === 'heading' ? format.header === 2
      : item.key === 'bulletList' ? format.list === 'bullet' : item.key === 'orderedList' ? format.list === 'ordered' : !!format[item.key],
      disabled: !enabled() || item.key === 'undo' && !instance?.history.stack.undo.length || item.key === 'redo' && !instance?.history.stack.redo.length }))
  })
  function runFormat(action: FormatAction) {
    const instance = richEditor.value
    if (!instance || !enabled()) return
    instance.setSelection(currentBodyRange(), 'silent'); instance.focus({ preventScroll: true })
    const format = instance.getFormat(lastRange)
    if (action === 'undo' || action === 'redo') instance.history[action]()
    else if (action === 'paragraph' || action === 'heading') instance.format('header', action === 'heading' && format.header !== 2 ? 2 : false, 'user')
    else if (action === 'bulletList' || action === 'orderedList') { const list = action === 'bulletList' ? 'bullet' : 'ordered'; instance.format('list', format.list === list ? false : list, 'user') }
    else instance.format(action, !format[action], 'user')
    revision.value++
  }
  const linkActive = computed(() => { revision.value; return !!richEditor.value?.getFormat(lastRange).link })
  const linkValid = computed(() => /^(https?:\/\/|mailto:|tel:)[^\s<>]+$/i.test(linkUrl.value.trim()))
  function openLink(open: boolean) { linkOpen.value = open; if (open) linkUrl.value = String(richEditor.value?.getFormat(lastRange).link ?? '') }
  function applyLink() {
    if (!enabled() || !linkValid.value) return
    richEditor.value?.formatText(lastRange.index, lastRange.length, 'link', linkUrl.value.trim(), 'user'); linkOpen.value = false
  }
  function removeLink() { if (enabled()) richEditor.value?.formatText(lastRange.index, lastRange.length, 'link', false, 'user'); linkOpen.value = false }
  function captureImageSelection(range = currentBodyRange()): EmailImageSelection | undefined {
    const instance = richEditor.value
    if (!instance || !enabled()) return
    const selection = { draft: props.draft, editor: instance, range: { index: range.index, length: range.length }, active: true }
    bookmarks.add(selection); return selection
  }
  function openImage(open: boolean) {
    // The variable panel is outside this popover; keep its editing context pinned.
    if (!open) return
    imageOpen.value = true
    if (!imageSelection?.active) { imageSelection = captureImageSelection(); imageUrl.value = '' }
  }
  function closeImage() {
    imageOpen.value = false
    if (imageSelection) { bookmarks.delete(imageSelection); imageSelection.active = false; imageSelection = undefined }
    captureBodySelection()
  }
  function toggleImage() { if (imageOpen.value) closeImage(); else openImage(true) }
  function captureImageCaret(event: Event) {
    const element = event.target as HTMLInputElement, draft = props.draft, selection = imageSelection
    if (typeof element.selectionStart !== 'number') return
    props.editor.captureCustomCaret({ start: element.selectionStart, end: element.selectionEnd ?? element.selectionStart, element,
      read: () => imageUrl.value, write: value => { imageUrl.value = value; imageOpen.value = true },
      editable: () => enabled() && props.draft === draft && !!selection?.active,
    })
  }
  function insertImage(url: string, captured?: EmailImageSelection): boolean {
    const selection = captured ?? imageSelection ?? captureImageSelection(), instance = richEditor.value
    if (!instance || !DeltaClass || !enabled() || !selection?.active || selection.draft !== props.draft || selection.editor !== instance || !isEmailImageSource(url)) return false
    const source = normalizeEmailImageSource(url, window.location.origin)
    if (!source) return false
    bookmarks.delete(selection); selection.active = false
    const before = html(), range = selection.range
    instance.updateContents(new DeltaClass().retain(range.index).delete(range.length).insert({ image: source }), 'user')
    if (html() === before) return false
    lastRange = { index: range.index + 1, length: 0 }; instance.setSelection(lastRange, 'silent'); instance.focus({ preventScroll: true }); captureBodySelection(); imageOpen.value = false
    return true
  }
  /** The attachment dialog uses the body's retained cursor, independently of a toolbar image draft. */
  function insertAttachmentImage(url: string): boolean {
    const selection = captureImageSelection()
    if (!selection) return false
    try { return insertImage(url, selection) }
    finally { bookmarks.delete(selection); selection.active = false }
  }
  function insertImageSource() { if (insertImage(imageUrl.value.trim())) imageOpen.value = false }
  function setImageUploadHandler(handler: (files: File[], selection: EmailImageSelection) => void) { uploadHandler = handler }
  const imageSourceValid = computed(() => isEmailImageSource(imageUrl.value.trim()))
  return { editorElement, richEditor, bodyLength, toolbarActions, runFormat, linkOpen, linkUrl, linkActive, linkValid, openLink, applyLink, removeLink, limitReached,
    imageOpen, imageUrl, imageSourceValid, openImage, closeImage, toggleImage, captureImageCaret, insertImageSource, captureImageSelection, insertImage, insertAttachmentImage, setImageUploadHandler }
}
