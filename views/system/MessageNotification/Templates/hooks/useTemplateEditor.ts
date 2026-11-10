import { computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NotificationLoadState, NotifierConfig } from '../../shared'
import { insertTemplateVariable, isEmailDraft, type TemplateDraft } from '../model'

interface EditorProps { draft: TemplateDraft; configs: NotifierConfig[]; configState: NotificationLoadState }
type TextField = 'subject' | 'text' | 'templateJson'
interface Caret { field: TextField; start: number; end: number; element?: HTMLInputElement | HTMLTextAreaElement }

/** One editor context retains real config choices and the focused field's text selection. */
export function useTemplateEditor(props: EditorProps, emit: (event: 'uploading', value: boolean) => void) {
  const { t } = useI18n()
  const emailDraft = computed(() => isEmailDraft(props.draft))
  const insertableVariables = computed(() => props.draft.variables.filter(item => item.id))
  const configFailure = computed(() => ['forbidden', 'unavailable', 'error'].includes(props.configState))
  const configOptions = computed(() => {
    const options = props.configs.map(item => ({ label: `${item.name} (${item.id})`, value: item.id }))
    if (props.draft.configId && !options.some(item => item.value === props.draft.configId)) {
      options.push({ label: props.draft.configId, value: props.draft.configId })
    }
    return options
  })
  let caret: Caret = { field: isEmailDraft(props.draft) ? 'text' : 'templateJson', start: 0, end: 0 }
  watch(() => props.draft, () => { caret = { field: isEmailDraft(props.draft) ? 'text' : 'templateJson', start: 0, end: 0 } })

  function clearConfiguration() { props.draft.configId = '' }
  function setUploading(value: boolean) { emit('uploading', value) }
  function captureCaret(event: Event, field: TextField) {
    const element = event.target as HTMLInputElement | HTMLTextAreaElement | null
    if (element) caret = { field, start: element.selectionStart ?? 0, end: element.selectionEnd ?? 0, element }
  }
  async function insertVariable(id: string) {
    const result = insertTemplateVariable(props.draft[caret.field], id, caret.start, caret.end)
    props.draft[caret.field] = result.text
    caret.start = result.caret
    caret.end = result.caret
    await nextTick()
    caret.element?.focus()
    caret.element?.setSelectionRange(result.caret, result.caret)
  }

  return { t, emailDraft, insertableVariables, configFailure, configOptions, clearConfiguration, setUploading, captureCaret, insertVariable }
}
