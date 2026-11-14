import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { applyTemplateFieldChange, getByPath, getTemplateFieldSchemas, resolveTemplateContext, type NoticeTemplateFieldSchema } from '../../../../notice/template/hooks/noticeTemplateFormModel'
import { insertTemplateVariable, parseTemplateObject, type TemplateDraft } from '../model'

/** Reuse provider form schemas; the vendor selector remains owned by the page's channel switch. */
export function useProviderTemplateFields(props: { draft: TemplateDraft; disabled?: boolean }) {
  const { t } = useI18n()
  const form = computed(() => ({ name: props.draft.name, type: props.draft.type, provider: props.draft.provider,
    template: parseTemplateObject(props.draft.templateJson), variableDefinitions: props.draft.variables }))
  const activePath = ref<string[]>([])
  const fields = computed(() => getTemplateFieldSchemas(resolveTemplateContext(undefined, {
    type: props.draft.type, provider: props.draft.provider,
  }), form.value).filter(field => field.key !== 'provider').map(field => ({ ...field, disabled: props.disabled || field.disabled })))
  function value(field: NoticeTemplateFieldSchema) { return getByPath(form.value.template, field.path) }
  function update(field: NoticeTemplateFieldSchema, value: unknown) {
    if (props.disabled) return
    const next = form.value
    applyTemplateFieldChange(next, field, value)
    props.draft.templateJson = JSON.stringify(next.template, null, 2)
  }
  function activate(path: string[]) { activePath.value = path }
  async function insertVariable(id: string) {
    const field = fields.value.find(item => item.path.join('.') === activePath.value.join('.'))
    if (!field || props.disabled || field.disabled) return
    const input = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
    const text = String(value(field) || '')
    const inserted = insertTemplateVariable(text, id, input?.selectionStart ?? text.length, input?.selectionEnd ?? text.length)
    update(field, inserted.text)
    await nextTick()
    input?.focus()
    input?.setSelectionRange?.(inserted.caret, inserted.caret)
  }
  return { t, fields, value, update, activate, activePath, insertVariable }
}
