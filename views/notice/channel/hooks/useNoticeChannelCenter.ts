import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web/utils'
import { useUserStore } from '@jetlinks-web-core/store/user'
import {
  queryNoticeChannelConfig_api,
  queryNoticeChannelProviders_api,
  queryNoticeChannelWithTemplates_api,
  queryNotifierConfigNoPaging_api,
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

const configQuery = (types: string[]) => ({
  terms: [{ column: 'type', termType: 'in', value: types }],
  sorts: [{ name: 'createTime', order: 'desc' }],
})

const excludedServiceProviders = new Set(['officialMessage'])

const filterSupportedServiceProviders = <T extends { provider?: string; id?: string }>(list: T[]) =>
  list.filter(item => !excludedServiceProviders.has(item.provider || item.id || ''))

/** 渠道页持有当前权限的配置快照；详情请求按当前选择应用，缓存不跨页面共享。 */
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
  let reloadVersion = 0
  let detailVersion = 0
  const metadataRequests = new Map<string, Promise<NotifierConfigMetadata | undefined>>()

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

  // 首屏一次查询所有类型，保存后只替换受影响类型；空结果同样覆盖旧快照。
  const loadConfigs = async (types: string[], replace = false) => {
    const version = reloadVersion
    const grouped: Record<string, NotifierConfig[]> = Object.fromEntries(types.map(type => [type, []]))
    const response = types.length ? await queryNotifierConfigNoPaging_api(configQuery(types)) : undefined
    if (version !== reloadVersion) return
    const list = filterSupportedServiceProviders(toListResult<NotifierConfig>(response))
    list.forEach(item => {
      if (item.type && grouped[item.type]) grouped[item.type].push(item)
    })
    configMap.value = replace ? grouped : { ...configMap.value, ...grouped }
  }

  const loadServiceProviders = async (type: string) => {
    if (!type || type === 'inside-mail') return
    if (Object.prototype.hasOwnProperty.call(serviceProviders.value, type)) return
    const version = reloadVersion
    const response = await queryNotifierTypeProviders_api(type)
    if (version !== reloadVersion) return
    const list = filterSupportedServiceProviders(getResponseResult<NotifierProviderInfo[]>(response, []))
    serviceProviders.value = { ...serviceProviders.value, [type]: list }
  }

  const loadTemplateDetail = async () => {
    const topicId = selectedBound.value?.topic.id
    if (!topicId || templateDetails.value[topicId]) return
    const version = reloadVersion
    const response = await queryNoticeChannelWithTemplates_api(topicId)
    if (version !== reloadVersion) return
    templateDetails.value = {
      ...templateDetails.value,
      [topicId]: getResponseResult<NoticeProviderTemplateInfo>(response, { channels: [] }),
    }
  }

  // 显式刷新重新读取当前权限，不能沿用上一身份或范围的配置及详情快照。
  const reload = async () => {
    const version = ++reloadVersion
    ++detailVersion
    loading.value = true
    detailLoading.value = true
    configMap.value = {}
    topics.value = []
    serviceProviders.value = {}
    templateDetails.value = {}
    metadataRequests.clear()
    metadata.value = undefined
    selectedProvider.value = ''
    Object.assign(draft, { id: undefined, name: '', description: '', provider: '', configuration: {} })
    try {
      const [providerResponse, topicResponse] = await Promise.all([
        queryNoticeChannelProviders_api(),
        queryNoticeChannelConfig_api(),
      ])
      if (version !== reloadVersion) return
      providers.value = normalizeProviders(getResponseResult<NoticeChannelProvider[]>(providerResponse, [])).filter(item => item.id !== 'inside-mail')
      topics.value = getResponseResult<NoticeChannelConfig[]>(topicResponse, [])
      const types = Array.from(new Set(providers.value.map(item => getNotifierType(item.id))))
      await loadConfigs(types, true)
      if (version !== reloadVersion) return
      const previousProvider = selectedProviderId.value
      selectInitialProvider()
      if (previousProvider === selectedProviderId.value) await reloadDetail()
    } catch (error) {
      if (version === reloadVersion) detailLoading.value = false
      throw error
    } finally {
      if (version === reloadVersion) {
        loading.value = false
        if (!selectedProviderId.value) detailLoading.value = false
      }
    }
  }

  // 渠道选择与服务商选择共用此入口；版本号覆盖 A→B→A 和元数据返回阶段的竞态。
  const reloadDetail = async (provider?: string) => {
    const version = ++detailVersion
    const requestKey = selectedProviderId.value
    if (!requestKey) return
    const type = selectedType.value
    detailLoading.value = true
    selectedProvider.value = provider || ''
    metadata.value = undefined
    Object.assign(draft, { id: undefined, name: '', description: '', provider: provider || '', configuration: {} })
    try {
      await Promise.all([
        loadServiceProviders(type),
        loadTemplateDetail(),
      ])
      if (version !== detailVersion) return
      const providerList = serviceProviders.value[type] || []
      selectedProvider.value = provider || selectedConfig.value?.provider
        || providerList[0]?.id
        || getFallbackProvider(type)
      const result = isExternalChannel(requestKey) && selectedProvider.value
        ? await loadMetadata(type, selectedProvider.value) : undefined
      if (version !== detailVersion) return
      metadata.value = result
      Object.assign(draft, createDraft(selectedChannel.value, selectedProvider.value))
      tested.value = false
    } finally {
      if (version === detailVersion) detailLoading.value = false
    }
  }

  // 只合并同一 type/provider 进行中的请求；失败后可重试，不持有跨页面的凭证数据。
  const loadMetadata = (type: string, provider: string) => {
    const key = JSON.stringify([type, provider])
    const pending = metadataRequests.get(key)
    if (pending) return pending
    const request = queryNotifierConfigMetadata_api(type, provider)
      .then(response => getResponseResult<NotifierConfigMetadata | undefined>(response, undefined))
      .finally(() => {
        if (metadataRequests.get(key) === request) metadataRequests.delete(key)
      })
    metadataRequests.set(key, request)
    return request
  }

  const saveCredential = async () => {
    const channel = selectedChannel.value
    if (!channel || isInsideMail(channel.id)) return
    const version = reloadVersion
    const detail = detailVersion
    saving.value = true
    try {
      const payload = buildConfigPayload(channel, draft)
      const response = payload.id
        ? await updateNotifierConfig_api(payload)
        : await saveNotifierConfig_api(payload)
      const saved = getResponseResult<NotifierConfig>(response, payload)
      if (version !== reloadVersion) return
      onlyMessage($t('NoticeCenter.channel.message.saveSuccess', [saved.name || channel.name]), 'success')
      await loadConfigs([channel.type])
      if (version === reloadVersion && detail === detailVersion) {
        Object.assign(draft, createDraft(selectedChannel.value, selectedProvider.value))
        tested.value = false
      }
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

  watch(selectedProviderId, () => reloadDetail())
  watch(() => draft.provider, value => {
    if (value && value !== selectedProvider.value) {
      return reloadDetail(value)
    }
  })
  watch(() => route.query.channelProvider, value => {
    const providerId = String(value || '')
    if (providerId && providerId !== selectedProviderId.value) selectProvider(providerId)
  })

  onScopeDispose(() => {
    ++reloadVersion
    ++detailVersion
    metadataRequests.clear()
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
