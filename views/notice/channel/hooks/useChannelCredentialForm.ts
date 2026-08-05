import { computed, ref, type Ref } from 'vue'
import type { Rule } from 'ant-design-vue/es/form'
import type { ComposerTranslation } from 'vue-i18n'
import { getCredentialDefaults, getProviderName, normalizeMetadataItem } from './noticeChannelModel'
import type { NotifierDraft, NoticeChannelItem, NoticeCredentialProperty } from './noticeChannelModel'

export interface HeaderItem {
  key: string
  value: string
}

interface UseChannelCredentialFormOptions {
  channel: Ref<NoticeChannelItem>
  draft: NotifierDraft
  metadata: Ref<NoticeCredentialProperty[]>
  t: ComposerTranslation
}

export const emailHostOptions = [
  'smtp.163.com',
  'pop.163.com',
  'smtp.exmail.qq.com',
  'pop.exmail.qq.com',
  'smtp.qq.com',
  'pop.qq.com',
  'smtpdm.aliyun.com',
  'smtp.126.com',
  'pop.126.com',
].map(value => ({ label: value, value }))

export const useChannelCredentialForm = (options: UseChannelCredentialFormOptions) => {
  const formRef = ref()
  const headersEditorRef = ref()
  const emailServerError = ref('')
  const { t: $t } = options

  const formatMessage = (message?: string, fallback = '') => {
    if (!message) return fallback
    const translated = $t(message)

    return translated === message ? message : translated
  }

  const getHeaders = (): HeaderItem[] => {
    const headers = options.draft.configuration.headers

    return Array.isArray(headers) ? headers as HeaderItem[] : []
  }

  const setHeaders = (headers: HeaderItem[]) => {
    options.draft.configuration.headers = headers
  }

  const getRules = (item: NoticeCredentialProperty): Rule[] => {
    const label = formatMessage(item.name, item.id)
    const rules: Rule[] = []

    if (item.required) {
      rules.push({
        required: true,
        message: $t('NoticeCenter.channel.validation.required', [label]),
        trigger: 'blur',
      })
    }

    if (item.maxLength) {
      rules.push({
        max: item.maxLength,
        message: $t('NoticeCenter.channel.validation.maxLength', [label, item.maxLength]),
        trigger: 'change',
      })
    }

    if (item.pattern === 'email') {
      rules.push({
        pattern: /^\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/,
        message: $t('NoticeCenter.channel.validation.email'),
        trigger: 'blur',
      })
    }

    return rules
  }

  const handleProviderChange = () => {
    options.draft.configuration = getCredentialDefaults(
      options.channel.value.type,
      options.draft.provider,
    )
    emailServerError.value = ''
    formRef.value?.clearValidate?.()
  }

  const clearEmailServerError = () => {
    emailServerError.value = ''
  }

  const handleSslChange = () => {
    options.draft.configuration.port = options.draft.configuration.ssl ? 465 : 25
    clearEmailServerError()
  }

  const normalizedMetadata = computed(() => options.metadata.value.map(item => {
    const metadataItem = normalizeMetadataItem(item)
    const elements = metadataItem.valueType?.elements

    if (!Array.isArray(elements)) return metadataItem

    return {
      ...metadataItem,
      valueType: {
        ...metadataItem.valueType,
        elements: elements.map(element => ({
          ...element,
          label: formatMessage(element.label || element.text, String(element.value)),
        })),
      },
    }
  }))

  const providerOptions = computed(() =>
    (options.channel.value.providerOptions || []).map(item => ({
      label: $t(getProviderName(item, item.id, options.channel.value.type)),
      value: item.id,
    })),
  )

  const showProviderSelector = computed(() => providerOptions.value.length > 1)

  const visibleMetadata = computed(() => {
    const hiddenInEmailServer = new Set(['port', 'ssl'])

    return normalizedMetadata.value.filter(item => !hiddenInEmailServer.has(item.id))
  })

  const validateEmailServer = () => {
    if (options.channel.value.type !== 'email') return Promise.resolve()
    if (!options.draft.configuration.host) {
      emailServerError.value = $t('NoticeCenter.channel.validation.required', [
        $t('NoticeCenter.channel.credential.field.serverAddress'),
      ])
      return Promise.reject(new Error(emailServerError.value))
    }
    const port = Number(options.draft.configuration.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      emailServerError.value = $t('NoticeCenter.channel.validation.portRange')
      return Promise.reject(new Error(emailServerError.value))
    }

    return Promise.resolve()
  }

  const validateHeaders = () =>
    (Array.isArray(headersEditorRef.value)
      ? headersEditorRef.value[0]
      : headersEditorRef.value
    )?.validate?.() || Promise.resolve()

  const validate = async () => {
    await validateEmailServer()
    await formRef.value?.validate?.()
    await validateHeaders()
  }

  return {
    formRef,
    headersEditorRef,
    emailServerError,
    emailHostOptions,
    providerOptions,
    showProviderSelector,
    normalizedMetadata,
    visibleMetadata,
    formatMessage,
    getHeaders,
    setHeaders,
    getRules,
    handleProviderChange,
    handleSslChange,
    clearEmailServerError,
    validate,
  }
}
