import { computed } from 'vue'
import type { TemplateEditorController, TemplatePreviewController } from '../channelViewTypes'

/** Supplier variables are context keys, not aliases inferred from display names. */
export function useSmsTemplateEditorVisual(editor: TemplateEditorController) {
  const mainFields = computed(() => ['code', 'signName', 'message'].flatMap(key => {
    const field = editor.fields.value.find(item => item.key === key)
    return field ? [field] : []
  }))
  const advancedFields = computed(() => editor.fields.value.filter(field => !['code', 'signName', 'message'].includes(field.key)))
  const mappings = computed(() => {
    const message = editor.fields.value.find(field => field.key === 'message')
    const source = message ? String(editor.fieldValue(message) ?? '') : ''
    const ids = [...new Set([...source.matchAll(/\$\{([^{}]+)\}/g)].map(match => match[1].trim()).filter(Boolean))]
    return ids.map(id => {
      const variable = editor.insertableVariables.value.find(item => item.id === id)
      const contextKey = id.startsWith('detail.') || ['message', 'notifyTime', 'code', 'subscriber', 'topic', 'detailJson'].includes(id)
      return { id, label: variable?.name || id, available: contextKey }
    })
  })
  return { mainFields, advancedFields, mappings }
}

/** Count rendered characters; no supplier billing assumptions or invented sender number are added. */
export function useSmsTemplatePreviewVisual(preview: TemplatePreviewController) {
  const signedText = computed(() => `${preview.signature.value ? `【${preview.signature.value}】` : ''}${preview.text.value}`)
  const characterCount = computed(() => Array.from(signedText.value).length)
  return { signedText, characterCount }
}
