import { computed } from 'vue'
import type { TemplateEditorController } from '../channelViewTypes'

/** Keep the supplier's voice/TTS mode and canonical field paths while changing only their layout. */
export function useVoiceTemplateEditorVisual(editor: TemplateEditorController) {
  const mainFields = computed(() => ['templateCode', 'ttsmessage'].flatMap(key => {
    const field = editor.fields.value.find(item => item.key === key)
    return field ? [field] : []
  }))
  const playTimesField = computed(() => editor.fields.value.find(item => item.key === 'playTimes'))
  const advancedFields = computed(() => editor.fields.value.filter(item => !['templateCode', 'ttsmessage', 'playTimes'].includes(item.key)))
  const playTimes = computed(() => playTimesField.value ? Number(editor.fieldValue(playTimesField.value)) || 1 : 1)
  function changePlayTimes(value: number) {
    if (playTimesField.value) editor.changeField(playTimesField.value, value)
  }
  return { mainFields, playTimesField, advancedFields, playTimes, changePlayTimes }
}
