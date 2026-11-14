import { computed } from 'vue'
import type { TemplateEditorController } from '../channelViewTypes'
import { useTemplateMessageEditor } from './useTemplateMessageEditor'

/** Keep the supplier's robot title fields and the work-notification message adapter separate. */
export function useDingTalkTemplateEditor(editor: TemplateEditorController) {
  const message = useTemplateMessageEditor(editor)
  const robot = computed(() => editor.fields.value.some(field => field.key === 'messageType'))
  const primaryKeys = new Set(['markdownTitle', 'linkTitle', 'message'])
  const mainFields = computed(() => editor.fields.value.filter(field => primaryKeys.has(field.key)))
  const advancedFields = computed(() => robot.value
    ? editor.fields.value.filter(field => !primaryKeys.has(field.key))
    : message.advancedFields.value)
  return { ...message, robot, mainFields, advancedFields }
}
