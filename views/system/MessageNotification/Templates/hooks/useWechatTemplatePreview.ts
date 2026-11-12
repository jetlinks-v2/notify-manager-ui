import { computed } from 'vue'
import type { TemplatePreviewController } from '../channelViewTypes'
import { splitTemplateMessage } from './useTemplateMessageEditor'

/** Corp messages use one body; a first title line is a presentation convention, not a second backend field. */
export function useWechatTemplatePreview(preview: TemplatePreviewController) {
  const parts = computed(() => splitTemplateMessage(preview.text.value))
  const messageTitle = computed(() => preview.subject.value || parts.value.title)
  const messageBody = computed(() => preview.subject.value ? preview.text.value : parts.value.body)
  return { messageTitle, messageBody }
}
