import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isEmailDraft, previewTemplateText, type TemplateDraft } from '../model'

/** Example values affect escaped preview text and never the persisted template defaults. */
export function useTemplatePreview(props: { draft: TemplateDraft }) {
  const { t } = useI18n()
  const examples = reactive<Record<string, string>>({})
  const variables = computed(() => props.draft.variables.filter(item => item.id))
  const emailDraft = computed(() => isEmailDraft(props.draft))
  const subject = computed(() => previewTemplateText(props.draft.subject, examples))
  const text = computed(() => previewTemplateText(props.draft.text, examples))
  const providerContent = computed(() => previewTemplateText(props.draft.templateJson, examples))
  const attachmentNames = computed(() => props.draft.attachments.map(item => item.name).join(', '))
  watch(() => props.draft.variables, definitions => {
    for (const key of Object.keys(examples)) if (!definitions.some(variable => variable.id === key)) delete examples[key]
    for (const variable of definitions) if (variable.id && !Object.hasOwn(examples, variable.id)) {
      examples[variable.id] = variable.defaultValue ?? t('messageNotification.templates.sample', { name: variable.name || variable.id })
    }
  }, { deep: true, immediate: true })

  return { t, examples, variables, emailDraft, subject, text, providerContent, attachmentNames }
}
