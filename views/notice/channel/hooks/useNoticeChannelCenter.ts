import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web/utils'
import { useUserStore } from '@jetlinks-web-core/store/user'
import {
  queryNoticeChannelConfig_api,
  queryNoticeChannelProviders_api,
  queryNoticeChannelWithTemplates_api,
  queryNotifierConfig_api,
  queryNotifierConfigMetadata_api,
  queryNotifierTypeProviders_api,
  sendNotifierInlineTest_api,
  saveNotifierConfig_api,
  updateNotifierConfig_api,
} from '@notify-manager-ui/api/notice-center'
import type {
  NoticeChannelConfig,
  NoticeChannelProvider,
  NoticeProviderTemplateInfo,
  NotifierConfig,
  NotifierConfigMetadata,
  NotifierProviderInfo,
} from '@notify-manager-ui/api/notice-center'
import {
  buildInlineTestPayload,
  buildConfigPayload,
  createDraft,
  findBoundChannel,
  findTemplateInfo,
  getChannelIcon,
  getDisplayName,
  getFallbackProvider,
  getMetadataProperties,
  getNotifierType,
  getProviderName,
  getResponseResult,
  resolveCredentialProperties,
  isExternalChannel,
  isInsideMail,
  normalizeProviders,
  toListResult,
} from './noticeChannelModel'
import type { NotifierDraft, NoticeChannelItem } from './noticeChannelModel'

const configQuery = (type: string) => ({
  pageIndex: 0,
  pageSize: 50,
  terms: [{ column: 'type', termType: 'eq', value: type }],
  sorts: [{ name: 'createTime', order: 'desc' }],
})

const excludedServiceProviders = new Set(['officialMessage'])

const filterSupportedServiceProviders = <T extends { provider?: string; id?: string }>(list: T[]) =>
  list.filter(item => !excludedServiceProviders.has(item.provider || item.id || ''))

export const useNoticeChannelCenter = () => {
  const route = useRoute()
  const router = useRouter()
  const { t: $t } = useI18n()
  const userStore = useUserStore()
  const loading = ref(false)
  const detailLoading = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const tested = ref(false)
  const providers = ref<NoticeChannelProvider[]>([])
  const topics = ref<NoticeChannelConfig[]>([])
  const configMap = ref<Record<string, NotifierConfig[]>>({})
  const serviceProviders = ref<Record<string, NotifierProviderInfo[]>>({})
  const templateDetails = ref<Record<string, NoticeProviderTemplateInfo>>({})
  const selectedProviderId = ref('')
  const selectedProvider = ref('')
  const metadata = ref<NotifierConfigMetadata>()
  const draft = reactive<NotifierDraft>({ name: '', provider: '', configuration: {} })

  const selectedProviderInfo = computed(() =>
    providers.value.find(item => item.id === selectedProviderId.value),
  )

  const selectedType = computed(() => getNotifierType(selectedProviderId.value))
  const selectedBound = computed(() => findBoundChannel(topics.value, selectedProviderId.value))
  const selectedTemplateInfo = computed(() =>
    findTemplateInfo(
      templateDetails.value[selectedBound.value?.topic.id || ''],
      selectedProviderId.value,
    ),
  )

  const currentConfigs = computed(() => configMap.value[selectedType.value] || [])
  const selectedConfig = computed(() => {
    const id = selectedTemplateInfo.value?.template?.configId
      || selectedBound.value?.channel.channelConfiguration?.notifierId
    const configs = filterSupportedServiceProviders(currentConfigs.value)
    const boundConfig = configs.find(item => item.id === id)
    if (selectedProvider.value) {
      return configs.find(item => item.provider === selectedProvider.value)
        || (boundConfig?.provider === selectedProvider.value ? boundConfig : undefined)
    }
    return boundConfig || configs[0]
  })

  const selectedChannel = computed<NoticeChannelItem | undefined>(() => {
    const provider = selectedProviderInfo.value
    if (!provider) return undefined
    const type = getNotifierType(provider.id)
    const config = isInsideMail(provider.id) ? undefined : selectedConfig.value
    const template = selectedTemplateInfo.value?.template || null
    const providerOptions = serviceProviders.value[type] || []
    const status = isInsideMail(provider.id)
      ? 'builtin'
      : config?.id ? 'configured' : 'unconfigured'
    return {
      id: provider.id,
      name: $t(getDisplayName(provider)),
      type,
      icon: getChannelIcon(type),
      provider: selectedProvider.value,
      providerName: $t(getProviderName(
        serviceProviders.value[type]?.find(item => item.id === selectedProvider.value),
        selectedProvider.value,
        type,
      )),
      config,
      template,
      topic: selectedBound.value?.topic,
      channel: selectedBound.value?.channel,
      metadata: resolveCredentialProperties(
        type,
        selectedProvider.value,
        getMetadataProperties(metadata.value),
      ),
      providerOptions,
      status,
    }
  })

  const channelList = computed<NoticeChannelItem[]>(() =>
    providers.value.map(provider => {
      const type = getNotifierType(provider.id)
      const config = filterSupportedServiceProviders(configMap.value[type] || [])[0]
      const status = isInsideMail(provider.id)
        ? 'builtin'
        : config?.id ? 'configured' : 'unconfigured'
      return {
        id: provider.id,
        name: $t(getDisplayName(provider)),
        type,
        icon: getChannelIcon(type),
        config,
        metadata: [],
        provider: config?.provider,
        providerOptions: serviceProviders.value[type] || [],
        providerName: $t(getProviderName(
          serviceProviders.value[type]?.find(item => item.id === config?.provider),
          config?.provider || getFallbackProvider(type),
          type,
        )),
        status,
      }
    }),
  )

  const syncRoute = (providerId: string) => {
    if (route.query.channelProvider === providerId) return
    router.replace({ query: { ...route.query, channelProvider: providerId } })
  }

  const selectProvider = (providerId: string) => {
    selectedProviderId.value = providerId
    tested.value = false
    syncRoute(providerId)
  }

  const selectInitialProvider = () => {
    const queryProvider = String(route.query.channelProvider || '')
    const matched = providers.value.find(item => item.id === queryProvider)
    selectedProviderId.value = (matched || providers.value[0])?.id || ''
    if (selectedProviderId.value) syncRoute(selectedProviderId.value)
  }

  const loadConfigs = async (type: string, options: { force?: boolean } = {}) => {
    if (!type || type === 'inside-mail') return []
    if (!options.force && Object.prototype.hasOwnProperty.call(configMap.value, type)) {
      return configMap.value[type]
    }
    const response = await queryNotifierConfig_api(configQuery(type))
    const list = filterSupportedServiceProviders(toListResult<NotifierConfig>(response))
    configMap.value = { ...configMap.value, [type]: list }
    return list
  }

  const loadServiceProviders = async (type: string) => {
    if (!type || type === 'inside-mail') return
    const response = await queryNotifierTypeProviders_api(type)
    const list = filterSupportedServiceProviders(getResponseResult<NotifierProviderInfo[]>(response, []))
    serviceProviders.value = { ...serviceProviders.value, [type]: list }
  }

  const loadTemplateDetail = async () => {
    const topicId = selectedBound.value?.topic.id
    if (!topicId || templateDetails.value[topicId]) return
    const response = await queryNoticeChannelWithTemplates_api(topicId)
    templateDetails.value = {
      ...templateDetails.value,
      [topicId]: getResponseResult<NoticeProviderTemplateInfo>(response, { channels: [] }),
    }
  }

  const reload = async () => {
    loading.value = true
    try {
      const [providerResponse, topicResponse] = await Promise.all([
        queryNoticeChannelProviders_api(),
        queryNoticeChannelConfig_api(),
      ])
      providers.value = normalizeProviders(getResponseResult<NoticeChannelProvider[]>(providerResponse, [])).filter(item => item.id !== 'inside-mail')
      topics.value = getResponseResult<NoticeChannelConfig[]>(topicResponse, [])
      await Promise.all(
        Array.from(new Set(providers.value.map(item => getNotifierType(item.id))))
          .map(type => loadConfigs(type)),
      )
      selectInitialProvider()
    } finally {
      loading.value = false
    }
  }

  const reloadDetail = async () => {
    const requestKey = selectedProviderId.value
    if (!requestKey) return
    detailLoading.value = true
    try {
      await Promise.all([
        loadServiceProviders(selectedType.value),
        loadTemplateDetail(),
      ])
      if (requestKey !== selectedProviderId.value) return
      const providerList = serviceProviders.value[selectedType.value] || []
      selectedProvider.value = selectedConfig.value?.provider
        || providerList[0]?.id
        || getFallbackProvider(selectedType.value)
      await loadMetadata()
      Object.assign(draft, createDraft(selectedChannel.value, selectedProvider.value))
    } finally {
      if (requestKey === selectedProviderId.value) detailLoading.value = false
    }
  }

  const loadMetadata = async () => {
    if (!isExternalChannel(selectedProviderId.value) || !selectedProvider.value) {
      metadata.value = undefined
      return
    }
    const response = await queryNotifierConfigMetadata_api(selectedType.value, selectedProvider.value)
    metadata.value = getResponseResult<NotifierConfigMetadata | undefined>(response, undefined)
  }

  const saveCredential = async () => {
    const channel = selectedChannel.value
    if (!channel || isInsideMail(channel.id)) return
    saving.value = true
    try {
      const payload = buildConfigPayload(channel, draft)
      const response = payload.id
        ? await updateNotifierConfig_api(payload)
        : await saveNotifierConfig_api(payload)
      const saved = getResponseResult<NotifierConfig>(response, payload)
      onlyMessage($t('NoticeCenter.channel.message.saveSuccess', [saved.name || channel.name]), 'success')
      await loadConfigs(channel.type, { force: true })
      Object.assign(draft, createDraft(selectedChannel.value, selectedProvider.value))
      tested.value = false
    } finally {
      saving.value = false
    }
  }

  const sendTest = async (params?: Record<string, unknown>) => {
    const channel = selectedChannel.value
    const configId = channel?.config?.id
    if (!channel || !configId) return
    const currentUser = userStore.userInfo as { email?: string; telephone?: string }
    const receiver = {
      email: currentUser.email,
      telephone: currentUser.telephone,
    }
    if (channel.type === 'email' && !receiver.email) {
      onlyMessage($t('NoticeCenter.channel.test.noEmail'), 'warning')
      return
    }
    if (['sms', 'voice'].includes(channel.type) && !receiver.telephone) {
      onlyMessage($t('NoticeCenter.channel.test.noPhone'), 'warning')
      return
    }
    testing.value = true
    try {
      await sendNotifierInlineTest_api(
        configId,
        buildInlineTestPayload(
          channel,
          $t('NoticeCenter.channel.test.templateName'),
          $t(`NoticeCenter.channel.test.preview.${channel.type}`),
          receiver,
          params,
        ),
      )
      onlyMessage($t('NoticeCenter.channel.message.testSuccess'), 'success')
      tested.value = true
    } finally {
      testing.value = false
    }
  }

  watch(selectedProviderId, reloadDetail)
  watch(selectedProvider, async value => {
    await loadMetadata()
    if (!value || draft.provider !== value) return
    Object.assign(draft, createDraft(selectedChannel.value, value))
    tested.value = false
  })
  watch(() => draft.provider, value => {
    if (value && value !== selectedProvider.value) {
      selectedProvider.value = value
    }
  })
  watch(() => route.query.channelProvider, value => {
    const providerId = String(value || '')
    if (providerId && providerId !== selectedProviderId.value) selectProvider(providerId)
  })

  return {
    loading,
    detailLoading,
    saving,
    testing,
    tested,
    channelList,
    selectedProviderId,
    selectedChannel,
    draft,
    reload,
    selectProvider,
    saveCredential,
    sendTest,
  }
}
