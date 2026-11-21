import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type Quill from 'quill'
import type { Delta, Range } from 'quill'
import type { TemplateCustomCaret } from '../hooks/useTemplateEditor'
import { useTemplateVariableEditing } from './catalog'
import {
  bindTemplateVariableEvents, copyTemplateEditorHistory, createTemplateVariableBlot,
  promoteTemplateVariables, refreshTemplateVariableLabels, templateDeltaText, tokenizeTemplateDelta,
} from './quillVariables'

export interface TemplateVariableInputProps {
  value: string; disabled?: boolean; readonly?: boolean; multiline?: boolean
  rows?: number; maxlength?: number; placeholder?: string; ariaLabel?: string
}
interface InputEvents {
  (event: 'update:value', value: string): void
  (event: 'caret', value: TemplateCustomCaret): void
  (event: 'focus' | 'pressEnter' | 'escape'): void
}

/** 无格式的单行 / 多行输入；Quill 只管理光标与原子变量，草稿始终接收原表达式。 */
export function useTemplateVariableInput(props: TemplateVariableInputProps, emit: InputEvents) {
  const context = useTemplateVariableEditing()
  const names = computed(() => context?.names.value ?? new Map<string, string>())
  const editorElement = ref<HTMLDivElement>(), instance = shallowRef<Quill>()
  const loading = ref(true), limitReached = ref(false)
  let disposed = false, syncing = false, lastRange = { index: 0, length: 0 }
  let published = props.value, accepted: Delta, acceptedValue = ''
  let loadedValue = props.value, loadedText = ''
  let history: Quill['history']['stack'], DeltaClass: typeof import('quill')['Delta']
  let unbindVariableEvents: (() => void) | undefined
  const editable = () => !disposed && !props.disabled && !props.readonly && !!instance.value
  const normalize = (value: string) => props.multiline ? value.replace(/\r\n?/g, '\n') : value.replace(/[\r\n]+/g, ' ')
  const read = () => {
    if (!instance.value) return props.value
    const text = templateDeltaText(instance.value.getContents()).slice(0, -1)
    // 撤销回到加载内容时恢复原始换行编码，避免旧模板仅因 CRLF 归一化而变脏。
    return text === loadedText ? loadedValue : text
  }

  function remember() {
    if (!instance.value) return
    accepted = instance.value.getContents(); acceptedValue = read(); history = copyTemplateEditorHistory(instance.value.history.stack)
  }
  function load() {
    const editor = instance.value
    if (!editor) return
    syncing = true
    try {
      loadedValue = props.value; loadedText = normalize(props.value)
      editor.setContents(tokenizeTemplateDelta(new DeltaClass().insert(loadedText + '\n'), DeltaClass), 'silent')
      editor.history.clear(); lastRange = { index: 0, length: 0 }; published = props.value; remember()
    } finally { syncing = false }
    limitReached.value = false
  }
  function changed() {
    const editor = instance.value
    if (!editor || syncing || editor.composition.isComposing) return
    syncing = true
    try {
      promoteTemplateVariables(editor, DeltaClass)
      const value = read()
      if (!editable() || props.maxlength !== undefined && value.length > props.maxlength && value.length >= acceptedValue.length) {
        editor.setContents(accepted, 'silent'); editor.history.stack = copyTemplateEditorHistory(history)
        editor.setSelection(lastRange, 'silent'); limitReached.value = editable(); return
      }
      limitReached.value = false
      if (value !== acceptedValue) { published = value; emit('update:value', value) }
      remember()
    } finally { syncing = false }
    capture()
  }
  /** 节点占一个文档位置；不能用原始表达式字符串的长度恢复选区。 */
  function insert(token: string) {
    const editor = instance.value
    if (!editor || !editable()) return false
    const range = editor.hasFocus() ? editor.getSelection() ?? lastRange : lastRange
    const before = read(), inserted = tokenizeTemplateDelta(new DeltaClass().insert(token), DeltaClass)
    editor.history.cutoff()
    editor.updateContents(new DeltaClass().retain(range.index).delete(range.length).concat(inserted), 'user')
    if (read() === before) return false
    lastRange = { index: range.index + inserted.length(), length: 0 }
    editor.setSelection(lastRange, 'silent'); editor.focus({ preventScroll: true }); capture()
    editor.history.cutoff()
    return true
  }
  function capture() {
    const editor = instance.value, identity = context?.identity.value
    if (!editor || syncing || !editable()) return
    const caret: TemplateCustomCaret = {
      start: 0, end: 0, read, write: () => false, insert,
      editable: () => editable() && instance.value === editor && context?.identity.value === identity,
    }
    context?.captureCaret(caret); emit('caret', caret)
  }
  function editorChanged(event: string, range: Range | Delta | null) {
    if (event !== 'selection-change' || !range || !('index' in range) || syncing) return
    lastRange = { index: range.index, length: range.length }; capture()
  }
  function focus() { emit('focus'); capture() }
  function compositionEnd() { queueMicrotask(() => { if (!disposed) { instance.value?.update('user'); changed() } }) }
  function paste(event: ClipboardEvent) {
    if (!editable() || !event.clipboardData) return
    event.preventDefault(); event.stopImmediatePropagation()
    const text = event.clipboardData.getData('text/plain')
    if (text) insert(normalize(text))
  }
  function keydown(event: KeyboardEvent) {
    if (event.isComposing) return
    if (event.key === 'Enter' && !props.multiline) { event.preventDefault(); emit('pressEnter') }
    if (event.key === 'Escape') emit('escape')
  }
  function syncAccess() {
    const editor = instance.value
    if (!editor) return
    editor.enable(editable())
    editor.root.setAttribute('aria-disabled', String(!!props.disabled))
    editor.root.setAttribute('aria-readonly', String(!!props.disabled || !!props.readonly))
  }
  onMounted(async () => {
    // Quill 导入时访问 document，必须延后到挂载，保持服务端渲染可用。
    const { default: QuillClass, Delta: QuillDelta, Parchment } = await import('quill')
    if (disposed || !editorElement.value) return
    DeltaClass = QuillDelta
    const registry = new Parchment.Registry()
    for (const name of ['blots/scroll', 'blots/block', 'blots/break', 'blots/container', 'blots/cursor', 'blots/inline', 'blots/text']) {
      registry.register(QuillClass.import(name) as Parameters<typeof registry.register>[0])
    }
    registry.register(createTemplateVariableBlot(QuillClass, () => names.value))
    const editor = new QuillClass(editorElement.value, { registry, readOnly: !editable(), modules: {
      toolbar: false, history: { userOnly: true, delay: 500 },
      keyboard: { bindings: { singleLine: { key: 'Enter', handler: () => !!props.multiline } } },
    } })
    instance.value = editor
    editor.root.setAttribute('role', 'textbox'); editor.root.setAttribute('aria-multiline', String(!!props.multiline))
    editor.root.setAttribute('aria-label', props.ariaLabel || props.placeholder || '')
    editor.root.setAttribute('data-placeholder', props.placeholder || '')
    editor.root.setAttribute('spellcheck', 'false')
    load(); syncAccess(); loading.value = false
    unbindVariableEvents = bindTemplateVariableEvents(editor, editable)
    editor.on('text-change', changed); editor.on('editor-change', editorChanged)
    editor.root.addEventListener('focus', focus)
    editor.root.addEventListener('paste', paste, true)
    editor.root.addEventListener('compositionend', compositionEnd)
    editor.root.addEventListener('keydown', keydown)
  })
  watch(() => props.value, value => { if (value !== published) load() })
  watch(() => context?.identity.value, () => load())
  watch(() => [props.disabled, props.readonly], syncAccess)
  watch(names, value => { if (instance.value) refreshTemplateVariableLabels(instance.value, value) })
  watch(() => [props.ariaLabel, props.placeholder], () => {
    instance.value?.root.setAttribute('aria-label', props.ariaLabel || props.placeholder || '')
    instance.value?.root.setAttribute('data-placeholder', props.placeholder || '')
  })
  onBeforeUnmount(() => {
    disposed = true; unbindVariableEvents?.()
    const editor = instance.value
    if (editor) {
      editor.off('text-change', changed); editor.off('editor-change', editorChanged)
      editor.root.removeEventListener('focus', focus); editor.root.removeEventListener('paste', paste, true)
      editor.root.removeEventListener('compositionend', compositionEnd); editor.root.removeEventListener('keydown', keydown)
      editor.disable(); editor.scroll.observer.disconnect(); editor.emitter.removeAllListeners()
      editor.container.replaceChildren()
    }
    instance.value = undefined
  })
  return { editorElement, instance, loading, limitReached }
}
