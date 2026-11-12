import { computed, nextTick, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { cloneNotificationValue, type NotificationLoadState, type NotificationVariable } from '../../shared'
import { createTemplateDraft, insertTemplateVariable, isEmailDraft } from '../model'
import { builtinEmailTemplates } from '../../shared/builtinEmailTemplates'
import { matchesTemplateConfiguration } from './templatePresentation'
import { useTemplateProviderEditor, type ProviderEditorProps } from './useTemplateProviderEditor'

interface EditorProps extends ProviderEditorProps { configState: NotificationLoadState; availableVariables?: NotificationVariable[]; existing?: boolean; businessMode?: boolean }
type TextField = 'subject' | 'text' | 'templateJson'
interface Caret { field: TextField; path?: string[]; start: number; end: number; element?: HTMLInputElement | HTMLTextAreaElement; custom?: TemplateCustomCaret }
export interface TemplateCustomCaret {
  /** Rich-text editors own document positions; never insert into their serialized HTML by string offset. */
  insert?: (token: string) => boolean
  read: () => string
  write: (value: string) => boolean | void
  editable: () => boolean
  start: number
  end: number
  element?: HTMLInputElement | HTMLTextAreaElement
}
const textFieldKinds = ['input', 'textarea', 'monaco']

/** One editor context retains real config choices and the focused field's text selection. */
export function useTemplateEditor(props: EditorProps, emit: (event: 'uploading', value: boolean) => void) {
  const { t } = useI18n()
  const providerEditor = useTemplateProviderEditor(props)
  const emailDraft = computed(() => isEmailDraft(props.draft))
  const builtins = computed(() => builtinEmailTemplates(t))
  const builtinOptions = computed(() => builtins.value.map(item => ({ value: item.key, label: item.label })))
  /** 内置邮件只填充新建的独立模板，业务默认内容由业务原型提供。 */
  function selectBuiltin(key: string) {
    const definition = builtins.value.find(item => item.key === key)
    if (!definition || !emailDraft.value || props.existing || props.businessMode || props.disabled) return
    const draft = props.draft
    Object.assign(draft, createTemplateDraft({ ...definition.payload, id: draft.id, configId: draft.configId,
      template: { ...definition.payload.template, sendTo: draft.sendTo } }), { builtinKey: key })
  }
  const insertableVariables = computed(() => {
    const variables = new Map((props.availableVariables ?? []).filter(item => item.id).map(item => [item.id, item]))
    // A saved declaration retains its type and format even when the available catalog is refreshed.
    for (const variable of props.draft.variables) if (variable.id) variables.set(variable.id, variable)
    return [...variables.values()]
  })
  const configFailure = computed(() => ['forbidden', 'unavailable', 'error'].includes(props.configState))
  const configOptions = computed(() => {
    const options = props.configs.filter(item => matchesTemplateConfiguration(props.draft, item))
      .map(item => ({ label: `${item.name} (${item.id})`, value: item.id, disabled: false }))
    if (props.draft.configId && !options.some(item => item.value === props.draft.configId)) {
      options.push({ label: props.draft.configId, value: props.draft.configId, disabled: true })
    }
    return options
  })
  const caret = shallowRef<Caret>()
  function editablePath(path: string[]): boolean {
    return providerEditor.fields.value.some(field => field.path.join('.') === path.join('.')
      && !field.disabled && textFieldKinds.includes(field.kind))
      || !providerEditor.genericJson.value && providerEditor.metadataFields.value.some(property => property.id === path[0] && property.valueType.type === 'string')
  }
  const canInsertVariable = computed(() => {
    const target = caret.value
    return !props.disabled && !!target && (target.custom ? target.custom.editable() : target.path ? editablePath(target.path)
      : target.field !== 'templateJson' || providerEditor.genericJson.value)
  })
  // Only a real content field receives a default target; raw JSON requires an explicit cursor selection.
  function resetCaret() {
    caret.value = emailDraft.value ? { field: 'text', start: 0, end: 0 } : undefined
    if (emailDraft.value || providerEditor.genericJson.value) return
    const field = providerEditor.fields.value.find(item => ['message', 'body', 'ttsmessage'].includes(item.key) && editablePath(item.path))
    const property = providerEditor.metadataFields.value.find(item => ['message', 'content', 'text', 'body'].includes(item.id) && editablePath([item.id]))
    const path = field?.path ?? (property ? [property.id] : undefined)
    if (path) caret.value = { field: 'templateJson', path, start: providerEditor.valueAtPath(path).length, end: providerEditor.valueAtPath(path).length }
  }
  watch(() => props.draft, resetCaret)
  watch(() => providerEditor.fields.value.map(field => field.path.join('.')).join('|')
    + providerEditor.metadataFields.value.map(field => field.id).join('|'), resetCaret, { immediate: true })

  function clearConfiguration() { props.draft.configId = '' }
  const uploadSources = new Set<string>()
  /** Attachments and inline images can upload together; completion releases only its own source. */
  function setUploading(value: boolean, source = 'attachments') {
    if (value) uploadSources.add(source)
    else uploadSources.delete(source)
    emit('uploading', uploadSources.size > 0)
  }
  function captureCaret(event: Event, field: TextField) {
    const element = event.target as HTMLInputElement | HTMLTextAreaElement | null
    if (element && typeof element.selectionStart === 'number') caret.value = { field, start: element.selectionStart, end: element.selectionEnd ?? element.selectionStart, element }
  }
  /** Native field events preserve selection even when the renderer wraps an Ant Design input. */
  function captureProviderCaret(event: Event, path: string[]) {
    const element = event.target as HTMLInputElement | HTMLTextAreaElement | null
    if (element && typeof element.selectionStart === 'number' && editablePath(path)) {
      caret.value = { field: 'templateJson', path, start: element.selectionStart, end: element.selectionEnd ?? element.selectionStart, element }
    }
  }
  /** Split title/body views retain their own selections while their adapter writes one real supplier field. */
  function captureCustomCaret(target: TemplateCustomCaret) {
    if (!target.editable()) return
    caret.value = { field: 'templateJson', start: target.start, end: target.end, element: target.element, custom: target }
  }
  function activateProviderField(path: string[]) {
    if (!editablePath(path) || caret.value?.path?.join('.') === path.join('.')) return
    const length = providerEditor.valueAtPath(path).length
    caret.value = { field: 'templateJson', path, start: length, end: length }
  }
  /** Attachment and rich-text actions declare only real variables after their content change succeeds. */
  function registerVariable(id: string): boolean {
    if (props.disabled) return false
    if (props.draft.variables.some(variable => variable.id === id)) return true
    const available = insertableVariables.value.find(variable => variable.id === id)
    if (!available) return false
    const declaration = cloneNotificationValue(available)
    delete declaration.defaultValue
    props.draft.variables.push(declaration)
    return true
  }
  async function insertVariable(id: string) {
    const target = caret.value
    if (!canInsertVariable.value || !target) return
    let nextCaret: number | undefined
    if (target.custom?.insert) {
      if (!target.custom.insert('${' + id + '}')) return
    } else {
      const text = target.custom ? target.custom.read() : target.path ? providerEditor.valueAtPath(target.path) : props.draft[target.field]
      const result = insertTemplateVariable(text, id, target.start, target.end)
      if (target.custom) {
        if (target.custom.write(result.text) === false) return
      } else if (target.path) {
        if (!providerEditor.changePath(target.path, result.text)) return
      } else props.draft[target.field] = result.text
      nextCaret = result.caret
    }
    registerVariable(id)
    if (nextCaret === undefined) return
    target.start = nextCaret
    target.end = nextCaret
    await nextTick()
    if (caret.value !== target) return
    target.element?.focus()
    target.element?.setSelectionRange(nextCaret, nextCaret)
  }

  return { t, emailDraft, builtinOptions, selectBuiltin, insertableVariables, canInsertVariable, configFailure, configOptions, clearConfiguration, setUploading,
    captureCaret, captureProviderCaret, captureCustomCaret, activateProviderField, insertVariable, registerVariable, ...providerEditor }
}
