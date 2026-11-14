import { computed } from 'vue'
import type { TemplatePreviewController } from '../channelViewTypes'
import { splitTemplateMessage } from './useTemplateMessageEditor'

/** Work notifications persist a single message; its first line is the displayed card title. */
export function useDingTalkTemplateView(preview: TemplatePreviewController) {
  const robot = computed(() => preview.kind.value === 'robot')
  const message = computed(() => splitTemplateMessage(preview.text.value))
  const title = computed(() => robot.value ? preview.subject.value : message.value.title || preview.subject.value)
  const body = computed(() => robot.value ? preview.text.value : message.value.body)
  const statusTime = computed(() => preview.displayTime.value.match(/\b\d{2}:\d{2}\b/)?.[0] || '')
  return { robot, title, body, statusTime }
}
