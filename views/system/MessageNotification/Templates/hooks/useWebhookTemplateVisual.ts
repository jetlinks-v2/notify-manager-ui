import { computed } from 'vue'
import type { TemplateEditorController } from '../channelViewTypes'

/** Keep the existing webhook mode and body paths; the visual editor only replaces Monaco with a textarea. */
export function useWebhookTemplateEditorVisual(editor: TemplateEditorController) {
  const modeField = computed(() => editor.fields.value.find(field => field.key === 'contextAsBody'))
  const bodyField = computed(() => editor.fields.value.find(field => field.key === 'body'))
  const contextAsBody = computed(() => modeField.value ? editor.fieldValue(modeField.value) === true : false)
  const body = computed(() => {
    const value = bodyField.value ? editor.fieldValue(bodyField.value) : ''
    return value && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '')
  })
  function changeBody(value: string) {
    if (bodyField.value) editor.changeField(bodyField.value, value)
  }
  function captureBody(event: Event) {
    if (bodyField.value) editor.captureProviderCaret(event, bodyField.value.path)
  }
  return { modeField, bodyField, contextAsBody, body, changeBody, captureBody }
}
