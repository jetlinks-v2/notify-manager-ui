import { computed, reactive, watch } from 'vue'
import type { NotificationConfigMetadata, NotificationConfigProperty, NotificationLoadState, NotifierConfig } from '../../shared'
import type { TemplateDraft } from '../model'
import {
  applyTemplateFieldChange, getByPath, getTemplateFieldSchemas, normalizeTemplateBeforeSubmit,
  resolveTemplateForm, setByPath, type NoticeTemplateEditorPayload, type NoticeTemplateFieldSchema,
  type NoticeTemplateFormContext,
} from '../../../../notice/template/hooks/noticeTemplateFormModel'
import { useNoticeTemplateEditorOptions } from '../../../../notice/template/hooks/useNoticeTemplateEditorOptions'
import { hasKnownTemplatePresentation, matchesTemplateConfiguration, readPresentationTemplate } from './templatePresentation'

export interface ProviderEditorProps {
  draft: TemplateDraft
  configs: NotifierConfig[]
  disabled?: boolean
  metadata?: NotificationConfigMetadata
  metadataState?: NotificationLoadState
}

/** Adapt provider fields to the existing JSON draft without mutating its saved baseline on mount. */
export function useTemplateProviderEditor(props: ProviderEditorProps) {
  const context = reactive<NoticeTemplateFormContext>({ type: '', provider: '' })
  const form = reactive<NoticeTemplateEditorPayload>({ name: '', template: {}, variableDefinitions: [] })
  const known = computed(() => hasKnownTemplatePresentation(props.draft))
  const parsed = computed(() => readPresentationTemplate(props.draft))
  let publishedJson = ''
  let hydratedDraft: TemplateDraft | undefined

  /** Legacy normalization stays local until the user changes a field; extension fields are retained. */
  function hydrate() {
    const draft = props.draft
    if (hydratedDraft === draft && draft.templateJson === publishedJson) return
    hydratedDraft = draft
    publishedJson = draft.templateJson
    if (!known.value || !parsed.value.valid) {
      context.type = ''; context.provider = ''
      form.template = parsed.value.template
      return
    }
    const template = { ...parsed.value.template }
    // The backend persists ttsCode; populate the editor alias before legacy defaults can mask it.
    if (draft.type === 'voice' && draft.provider === 'aliyun' && template.templateCode === undefined && template.ttsCode !== undefined) {
      template.templateCode = template.ttsCode
    }
    const resolved = resolveTemplateForm(undefined, {
      id: draft.id, name: draft.name, type: draft.type, provider: draft.provider,
      configId: draft.configId, template, variableDefinitions: draft.variables,
    }, draft.name)
    context.type = resolved.type
    context.provider = resolved.provider
    Object.assign(form, resolved.payload, { configId: props.configs.some(item => item.id === draft.configId && matchesTemplateConfiguration(draft, item)) ? draft.configId : undefined })
  }
  watch(() => [props.draft, props.draft.templateJson], hydrate, { immediate: true, flush: 'sync' })
  // A configuration must be readable and match both identities before remote recipient options load.
  watch(() => [props.draft.configId, props.configs, props.draft.type, props.draft.provider], () => {
    form.configId = props.configs.some(item => item.id === props.draft.configId && matchesTemplateConfiguration(props.draft, item))
      ? props.draft.configId : undefined
  }, { immediate: true, flush: 'sync' })
  const remote = useNoticeTemplateEditorOptions(context, form, () => undefined)
  const fields = computed(() => known.value && parsed.value.valid ? getTemplateFieldSchemas(context, form)
    .filter(field => field.key !== 'provider' && field.kind !== 'attachments')
    .map(field => remote.resolveField({ ...field, disabled: props.disabled || field.disabled }))
    .filter(field => !field.hidden) : [])
  const metadataFields = computed(() => known.value ? [] : props.metadata?.properties ?? [])
  const genericJson = computed(() => (!known.value && !metadataFields.value.length) || !parsed.value.valid)
  const metadataFailure = computed(() => ['error', 'forbidden', 'unavailable'].includes(props.metadataState ?? ''))

  /** Only an explicit edit publishes the canonical supplier payload back to the current draft. */
  function publish() {
    form.name = props.draft.name
    form.variableDefinitions = props.draft.variables
    const template = normalizeTemplateBeforeSubmit(form).template
    publishedJson = JSON.stringify(template, null, 2)
    props.draft.templateJson = publishedJson
  }
  function fieldValue(field: NoticeTemplateFieldSchema): unknown { return getByPath(form.template, field.path) }
  /** Provider switches are channel navigation, never a side effect of a content field. */
  function changeField(field: NoticeTemplateFieldSchema, value: unknown) {
    if (props.disabled || field.disabled || field.key === 'provider') return false
    applyTemplateFieldChange(form, field, value)
    remote.onFieldChange(field, value)
    publish()
    return true
  }
  /** Text editors and variable insertion share the same JSON text for legacy object-valued bodies. */
  function valueAtPath(path: string[]): string {
    const value = getByPath(form.template, path)
    return value && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '')
  }
  function changePath(path: string[], value: string) {
    const field = fields.value.find(item => item.path.join('.') === path.join('.'))
    if (field) return changeField(field, value)
    if (!known.value && metadataFields.value.some(item => item.id === path[0])) return changeMetadata(path[0], value)
    return false
  }
  /** Template metadata has its own property IDs; do not reuse the notifier credential schema. */
  function changeMetadata(key: string, value: unknown) {
    if (props.disabled || !parsed.value.valid) return false
    const template = { ...parsed.value.template }
    setByPath(template, [key], value)
    publishedJson = JSON.stringify(template, null, 2)
    props.draft.templateJson = publishedJson
    form.template = template
    return true
  }
  function metadataValue(property: NotificationConfigProperty): unknown { return parsed.value.template[property.id] }
  function metadataRequired(property: NotificationConfigProperty): boolean {
    const required = property.valueType.expands?.required ?? property.expands?.required
    return required === true || required === 'true'
  }
  return {
    known, fields, metadataFields, genericJson, metadataFailure, parsed, fieldValue, changeField,
    valueAtPath, changePath, changeMetadata, metadataValue, metadataRequired, loadRemoteOptions: remote.loadRemoteOptions,
  }
}
