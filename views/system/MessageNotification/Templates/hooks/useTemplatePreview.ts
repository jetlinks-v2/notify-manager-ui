import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isEmailDraft, previewTemplateText, type TemplateDraft } from '../model'
import { builtinEmailTemplates } from '../../shared/builtinEmailTemplates'

/** Automatic example values affect escaped preview text and never the persisted template defaults. */
export function useTemplatePreview(props: { draft: TemplateDraft }) {
  const { t } = useI18n()
  const examples = reactive<Record<string, string>>({})
  const emailDraft = computed(() => isEmailDraft(props.draft))
  const subject = computed(() => previewTemplateText(props.draft.subject, examples))
  const text = computed(() => previewTemplateText(props.draft.text, examples))
  const providerContent = computed(() => previewTemplateText(props.draft.templateJson, examples))
  const attachmentNames = computed(() => props.draft.attachments.map(item => item.name).join(', '))
  const recipients = computed(() => props.draft.sendTo.map(value => previewTemplateText(value, examples)).join(', '))
  watch([() => props.draft.variables, () => props.draft.builtinKey], ([definitions, key]) => {
    const builtin = builtinEmailTemplates(t).find(item => item.key === key)
    for (const key of Object.keys(examples)) if (!definitions.some(variable => variable.id === key)) delete examples[key]
    for (const variable of definitions) if (variable.id) {
      examples[variable.id] = variable.defaultValue ?? builtin?.examples[variable.id] ?? t('messageNotification.templates.sample', { name: variable.name || variable.id })
    }
  }, { deep: true, immediate: true })

  return { t, emailDraft, subject, text, providerContent, attachmentNames, recipients }
}
