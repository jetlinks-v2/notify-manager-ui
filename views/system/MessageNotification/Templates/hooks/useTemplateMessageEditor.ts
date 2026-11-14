import { computed } from 'vue'
import type { TemplateEditorController } from '../channelViewTypes'

/** A title line is explicit only when the stored message has a newline; legacy one-line bodies stay intact. */
export function splitTemplateMessage(message: string) {
  const separator = message.indexOf('\n')
  return separator < 0
    ? { title: '', body: message, bodyOffset: 0, hasTitleLine: false }
    : { title: message.slice(0, separator), body: message.slice(separator + 1), bodyOffset: separator + 1, hasTitleLine: true }
}

/** Present a single supplier message as title/body without persisting invented template fields. */
export function useTemplateMessageEditor(editor: TemplateEditorController) {
  const messageField = computed(() => editor.fields.value.find(field => field.key === 'message'))
  const message = computed(() => messageField.value ? editor.valueAtPath(messageField.value.path) : '')
  const parts = computed(() => splitTemplateMessage(message.value))
  const title = computed(() => parts.value.title)
  const body = computed(() => parts.value.body)
  const advancedFields = computed(() => editor.fields.value.filter(field => field.key !== 'message'))

  function publish(nextTitle: string, nextBody: string) {
    const field = messageField.value
    if (!field) return
    const hasTitleLine = Boolean(nextTitle) || parts.value.hasTitleLine
    editor.changeField(field, hasTitleLine ? `${nextTitle}\n${nextBody}` : nextBody)
  }
  function changeTitle(value: string) { publish(value, body.value) }
  function changeBody(value: string) { publish(title.value, value) }

  /** Insert into the visible part, then merge through the adapter; focusing never rewrites a legacy draft. */
  function captureMessageCaret(event: Event, part: 'title' | 'body') {
    const element = event.target as HTMLInputElement | HTMLTextAreaElement | null
    const field = messageField.value
    if (!field || !element || typeof element.selectionStart !== 'number') return
    editor.captureCustomCaret({
      read: () => part === 'title' ? title.value : body.value,
      write: value => part === 'title' ? changeTitle(value) : changeBody(value),
      editable: () => Boolean(messageField.value && !messageField.value.disabled),
      start: element.selectionStart,
      end: element.selectionEnd ?? element.selectionStart,
      element,
    })
  }
  function captureTitleCaret(event: Event) { captureMessageCaret(event, 'title') }
  function captureBodyCaret(event: Event) { captureMessageCaret(event, 'body') }

  return { title, body, messageField, advancedFields, changeTitle, changeBody, captureTitleCaret, captureBodyCaret }
}
