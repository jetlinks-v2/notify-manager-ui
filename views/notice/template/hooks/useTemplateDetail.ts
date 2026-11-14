import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { onlyMessage } from '@jetlinks-web/utils'
import { useNoticeDraftGuard } from '../../hooks/useNoticeDraftGuard'
import { phoneRegEx } from '@jetlinks-web-core/utils/validate'
import type {
  NoticeTemplateAlarmNode,
  NoticeTemplateChannelNode,
  NoticeTemplateEditorPayload,
} from './useNoticeTemplateCenter'
import type { NoticeTemplateFormContext } from './noticeTemplateFormModel'
import {
  getByPath,
  getPreviewTexts,
  getTemplateFieldSchemas,
  resolveTemplateForm,
  syncVariableDefinitions,
  variableToken,
} from './noticeTemplateFormModel'
import type { NoticeTemplateEntity, NoticeTemplateVariable } from '@notify-manager-ui/api/notice-center'

export interface TemplateDetailProps {
  alarm?: NoticeTemplateAlarmNode
  channel?: NoticeTemplateChannelNode
  template?: NoticeTemplateEntity
  breadcrumb: string[]
  templateCode: string
  coveredAlarmNames: string[]
  usedVariables: NoticeTemplateVariable[]
  availableStats: Array<{ key: string; value: string }>
  referencedPolicies: Array<{ id: string; name: string; count?: unknown }>
  loading: boolean
  editable: boolean
  saving: boolean
  testing: boolean
  variables: NoticeTemplateVariable[]
  savedVersion: number
}

export function useTemplateDetail(props: TemplateDetailProps, emit: {
  (e: 'save', value: NoticeTemplateEditorPayload): void
  (e: 'test', params?: Record<string, unknown>): void
}) {
const { t: $t } = useI18n()
const router = useRouter()
const editing = ref(false)
const formContext = reactive<NoticeTemplateFormContext>({ type: '', provider: '' })
const form = reactive<NoticeTemplateEditorPayload>({
  name: '',
  description: '',
  type: '',
  provider: '',
  template: {},
  variableDefinitions: [],
})

const translateText = (value?: string) => value ? $t(value) : ''

const fallbackName = computed(() =>
  [translateText(props.alarm?.name), translateText(props.channel?.channelName)].filter(Boolean).join(' · '),
)

const primaryActionText = computed(() => {
  if (!props.channel?.hasNotifierConfig) {
    return $t('NoticeCenter.template.action.configureChannel')
  }
  return $t('NoticeCenter.template.action.edit')
})

const availableVariables = computed(() => {
  const map = new Map<string, NoticeTemplateVariable>()
  ;[...props.variables, ...props.usedVariables, ...form.variableDefinitions].forEach(item => {
    if (item?.id) {
      map.set(item.id, item)
    }
  })
  return Array.from(map.values())
})

const snapshot = ref('')
let submittedSnapshot = ''
const dirty = computed(() => editing.value && JSON.stringify(form) !== snapshot.value)
const { confirmDiscard } = useNoticeDraftGuard(() => dirty.value, () => props.saving)
const canLeave = async () => {
  if (!await confirmDiscard()) return false
  cancelEdit()
  return true
}

const resetForm = () => {
  const resolved = resolveTemplateForm(props.channel, props.template, fallbackName.value)
  formContext.type = resolved.type
  formContext.provider = resolved.provider
  form.name = resolved.payload.name
  form.description = resolved.payload.description
  form.type = resolved.payload.type
  form.provider = resolved.payload.provider
  form.configId = resolved.payload.configId
  form.template = resolved.payload.template
  form.variableDefinitions = syncVariableDefinitions(resolved.payload, props.variables)
  snapshot.value = JSON.stringify(form)
}

const writeClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  // 兼容无 Clipboard API 的内嵌浏览器环境，避免复制动作静默失败。
  const textarea = document.createElement('textarea')
  textarea.value = text
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

const copyTemplate = async () => {
  const preview = getPreviewTexts(form)
  await writeClipboard([preview.title, preview.message].filter(Boolean).join('\n\n'))
  onlyMessage($t('NoticeCenter.template.message.copyTemplateSuccess'), 'success')
}

const copyVariable = async (id: string) => {
  await writeClipboard(variableToken(id))
  onlyMessage($t('NoticeCenter.template.message.copyVariableSuccess', [variableToken(id)]), 'success')
}

const startEdit = () => {
  if (!props.editable) return
  resetForm()
  editing.value = true
}

const cancelEdit = () => {
  resetForm()
  editing.value = false
}

const goChannelConfig = () => {
  router.push({
    name: 'notice/channel',
    query: { topicProvider: props.alarm?.providerCode, channelProvider: props.channel?.channelProvider },
  })
}

const handlePrimaryAction = () => {
  if (!props.channel?.hasNotifierConfig) {
    goChannelConfig()
    return
  }
  startEdit()
}

const validateRequiredFields = () => {
  const missingField = getTemplateFieldSchemas(formContext, form)
    .filter(field => field.required)
    .find(field => {
      const value = field.key === 'provider' ? form.provider : getByPath(form.template, field.path)
      return value === undefined
        || value === null
        || value === ''
        || (Array.isArray(value) && !value.length)
    })
  if (missingField) {
    onlyMessage($t('NoticeCenter.template.validation.required', [$t(missingField.labelKey)]), 'error')
    return false
  }

  const invalidPhoneField = getTemplateFieldSchemas(formContext, form)
    .find(field => {
      if (field.validator !== 'phone') {
        return false
      }
      const value = getByPath(form.template, field.path)
      return Boolean(value) && !phoneRegEx(String(value))
    })
  if (invalidPhoneField) {
    onlyMessage($t('NoticeCenter.template.validation.phoneInvalid'), 'error')
    return false
  }

  const invalidVariable = form.variableDefinitions.find(item => !item.name || item.name.length > 64)
  if (invalidVariable) {
    onlyMessage($t('NoticeCenter.template.validation.variableNameRequired'), 'error')
    return false
  }
  return true
}

const submitEdit = () => {
  if (props.saving) return
  form.variableDefinitions = syncVariableDefinitions(form, props.variables)
  if (!validateRequiredFields()) {
    return
  }
  submittedSnapshot = JSON.stringify(form)
  emit('save', {
    name: form.name.trim() || fallbackName.value,
    description: form.description?.trim(),
    type: form.type,
    provider: form.provider,
    configId: form.configId,
    template: form.template,
    variableDefinitions: form.variableDefinitions,
  })
}

watch(
  () => [props.template?.id, props.channel?.key],
  (value, previous) => {
    if (editing.value && value[1] === previous?.[1]) return
    resetForm()
    editing.value = false
  },
  { immediate: true },
)

watch(
  () => props.savedVersion,
  () => {
    const latestDraft = JSON.stringify(form)
    resetForm()
    // 保存等待期间仍有新输入时保留草稿，成功快照只对应刚提交的版本。
    if (submittedSnapshot && latestDraft !== submittedSnapshot) {
      Object.assign(form, JSON.parse(latestDraft))
    } else {
      editing.value = false
    }
    submittedSnapshot = ''
  },
)

return { editing, formContext, form, primaryActionText, availableVariables, copyTemplate,
  copyVariable, cancelEdit, submitEdit, handlePrimaryAction, goChannelConfig, dirty, canLeave }
}
