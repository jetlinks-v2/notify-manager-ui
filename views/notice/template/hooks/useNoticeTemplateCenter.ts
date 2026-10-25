import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web/utils'
import {
  disableNoticeChannel_api,
  enableNoticeChannel_api,
  queryNoticeChannelConfig_api,
  queryNoticeChannelProviders_api,
  queryNoticeChannelVariables_api,
  queryNoticeChannelTemplate_api,
  queryNotifierConfigNoPaging_api,
  saveNoticeChannelTemplate_api,
} from '@notify-manager-ui/api/notice-center'
import type {
  NoticeChannelConfig,
  NoticeChannelProvider,
  NoticeChannelTemplateItem,
  NoticeProviderTemplateInfo,
  NoticeTemplateEntity,
  NoticeTemplateVariable,
  NotifierConfig,
} from '@notify-manager-ui/api/notice-center'
import {
  buildTreeData,
  findFirstChannel,
  findTreeNode,
  filterUnsupportedRecommendedVariables,
  getAvailableStats,
  getBreadcrumb,
  getCoveredAlarmNames,
  getNotifierType,
  getReferencedPolicies,
  getRecommendedVariables,
  mergeRecommendedVariables,
  getResponseResult,
  getStateValue,
  getTemplateCode,
  getTemplateMessage,
  getTemplateSubject,
  getUsedVariables,
  normalizeGroupList,
  normalizeProviderList,
  toListResult,
} from './noticeTemplateModel'
import type {
  NoticeTemplateEditorPayload,
  NoticeTemplateGroup,
} from './noticeTemplateModel'
import { applyProviderTemplateInfo } from './noticeTemplateAggregate'
import { buildTemplateSavePayload } from './noticeTemplatePayload'
import { useNoticeTemplateTest } from './useNoticeTemplateTest'

export type {
  NoticeTemplateAlarmNode,
  NoticeTemplateChannelNode,
  NoticeTemplateEditorPayload,
  NoticeTemplateTreeNode,
} from './noticeTemplateModel'

export const useNoticeTemplateCenter = () => {
  const { t: $t } = useI18n()
  const loading = ref(false)
  const detailLoading = ref(false)
  const saving = ref(false)
  const switchingKeys = ref<string[]>([])
  const groups = ref<NoticeTemplateGroup[]>([])
  const providers = ref<NoticeChannelProvider[]>([])
  const notifierConfigs = ref<Record<string, NotifierConfig[]>>({})
  const providerTemplateDetails = ref<Record<string, NoticeProviderTemplateInfo>>({})
  const selectedAlarmKey = ref('')
  const selectedChannelProvider = ref('')
  const templateDetail = ref<NoticeTemplateEntity>()
  const channelVariables = ref<NoticeTemplateVariable[]>([])
  const expandedKeys = ref<string[]>([])
  let detailVersion = 0
  let reloadVersion = 0
  const detailReady = ref(false)
  const detailKey = (providerId: string, channelProvider: string) => JSON.stringify([providerId, channelProvider])

  const selectedAlarm = computed(() =>
    groups.value.flatMap(group => group.alarms).find(item => item.key === selectedAlarmKey.value),
  )

  const selectedChannel = computed(() =>
    selectedAlarm.value?.channels.find(item => item.channelProvider === selectedChannelProvider.value),
  )

  const selectedKey = computed(() =>
    selectedAlarm.value && selectedChannel.value
      ? `${selectedAlarm.value.key}:${selectedChannel.value.channelProvider}`
      : '',
  )

  const selectedKeys = computed(() => selectedKey.value ? [selectedKey.value] : [])

  const treeData = computed(() => buildTreeData(groups.value))
  const templateCode = computed(() => getTemplateCode(selectedAlarm.value, selectedChannel.value))
  const breadcrumb = computed(() => getBreadcrumb(selectedAlarm.value, selectedChannel.value))
  const coveredAlarmNames = computed(() => getCoveredAlarmNames(selectedAlarm.value))
  const usedVariables = computed(() => getUsedVariables(templateDetail.value, channelVariables.value))
  const availableStats = computed(() => getAvailableStats(templateDetail.value, selectedChannel.value))
  const referencedPolicies = computed(() => getReferencedPolicies(templateDetail.value, selectedChannel.value))
  const {
    testing,
    sendTest,
  } = useNoticeTemplateTest({
    channel: selectedChannel,
    template: templateDetail,
  })

  const normalizeProviders = (list: NoticeChannelProvider[]) => {
    providers.value = normalizeProviderList(list).filter(item => item.id !== 'inside-mail')
  }

  const normalizeGroups = (list: NoticeChannelConfig[]) => {
    const result = normalizeGroupList(
      list,
      providers.value,
      $t('NoticeCenter.template.group.default'),
      notifierConfigs.value,
    )
    groups.value = result.groups
    expandedKeys.value = result.expandedKeys
  }

  const loadNotifierConfigs = async (version: number) => {
    const types = Array.from(new Set(
      providers.value
        .filter(item => item.id?.startsWith('notifier-'))
        .map(item => getNotifierType(item.id)),
    ))
    const response = types.length ? await queryNotifierConfigNoPaging_api({
      terms: [{ column: 'type', termType: 'in', value: types }],
      sorts: [{ name: 'createTime', order: 'desc' }],
    }) : undefined
    if (version !== reloadVersion) return
    const grouped: Record<string, NotifierConfig[]> = Object.fromEntries(types.map(type => [type, []]))
    toListResult<NotifierConfig>(response).forEach(config => {
      if (config.type && grouped[config.type]) grouped[config.type].push(config)
    })
    notifierConfigs.value = grouped
  }

  const applyTemplateDetail = (providerId: string, channelProvider: string, item?: NoticeChannelTemplateItem) => {
    const detail: NoticeProviderTemplateInfo = {
      channels: [item || { channel: { providerId, channelProvider }, template: null }],
    }
    providerTemplateDetails.value = {
      ...providerTemplateDetails.value,
      [detailKey(providerId, channelProvider)]: detail,
    }
    groups.value = applyProviderTemplateInfo(groups.value, providerId, detail)
    templateDetail.value = selectedChannel.value?.template
  }

  const selectFirstAvailable = () => {
    if (selectedKey.value) {
      return
    }
    const alarm = groups.value[0]?.alarms[0]
    const channel = alarm?.channels.find(item => item.configured) || alarm?.channels[0]
    if (alarm && channel) {
      selectedAlarmKey.value = alarm.key
      selectedChannelProvider.value = channel.channelProvider
    }
  }

  const findAlarmByProvider = (providerId: string, providerCode: string) =>
    groups.value
      .flatMap(group => group.alarms)
      .find(item =>
        (providerId && item.detailProviderId === providerId)
        || (providerCode && item.providerCode === providerCode),
      )

  const reload = async () => {
    const version = ++reloadVersion
    ++detailVersion
    detailReady.value = false
    templateDetail.value = undefined
    providerTemplateDetails.value = {}
    notifierConfigs.value = {}
    groups.value = []
    loading.value = true
    try {
      const [providerResponse, configResponse] = await Promise.all([
        queryNoticeChannelProviders_api(),
        queryNoticeChannelConfig_api(),
      ])
      if (version !== reloadVersion) return
      normalizeProviders(getResponseResult<NoticeChannelProvider[]>(providerResponse, []))
      await loadNotifierConfigs(version)
      if (version !== reloadVersion) return
      normalizeGroups(getResponseResult<NoticeChannelConfig[]>(configResponse, []))
      selectFirstAvailable()
    } finally {
      if (version === reloadVersion) loading.value = false
    }
  }

  const selectChannel = (alarmKey: string, channelProvider: string) => {
    selectedAlarmKey.value = alarmKey
    selectedChannelProvider.value = channelProvider
    templateDetail.value = undefined
    detailReady.value = false
    channelVariables.value = []
  }

  const restoreSelection = (alarmKey: string, channelProvider: string) => {
    const alarm = groups.value
      .flatMap(group => group.alarms)
      .find(item => item.key === alarmKey)
    const channel = alarm?.channels.find(item => item.channelProvider === channelProvider)
    if (alarm && channel) {
      selectChannel(alarm.key, channel.channelProvider)
    }
  }

  const withSwitching = async (key: string, action: () => Promise<void>) => {
    switchingKeys.value = Array.from(new Set([...switchingKeys.value, key]))
    try {
      await action()
    } finally {
      switchingKeys.value = switchingKeys.value.filter(item => item !== key)
    }
  }

  const toggleAlarmState = async (node: { key: string; providerId?: string; providerCode?: string; enabled?: boolean }) => {
    const providerId = node.providerId || node.providerCode
    if (!providerId) {
      return
    }
    const currentAlarmKey = selectedAlarmKey.value
    const currentChannelProvider = selectedChannelProvider.value
    await withSwitching(node.key, async () => {
      if (node.enabled) {
        await disableNoticeChannel_api(providerId)
      } else {
        await enableNoticeChannel_api(providerId)
      }
      await reload()
      restoreSelection(currentAlarmKey, currentChannelProvider)
      await loadDetail(true)
    })
  }

  const selectTreeNode = (key: string) => {
    const node = findTreeNode(treeData.value, key)
    const target = node?.nodeType === 'channel' ? node : findFirstChannel(node?.children)
    if (target?.alarmKey && target.channelProvider) {
      selectChannel(target.alarmKey, target.channelProvider)
    }
  }

  const loadDetail = async (force = false) => {
    const version = ++detailVersion
    const alarm = selectedAlarm.value
    const channel = selectedChannel.value
    const requestKey = selectedKey.value

    templateDetail.value = undefined
    detailReady.value = false
    channelVariables.value = []
    if (!alarm || !channel) {
      return
    }
    // 推荐变量只由通知类型决定；待配置的 provider 尚无持久化 ID 时也必须可用。
    const fallbackVariables = getRecommendedVariables(alarm.providerCode, $t)
    channelVariables.value = fallbackVariables
    if (!alarm.detailProviderId) {
      detailReady.value = true
      return
    }

    detailLoading.value = true
    try {
      const providerId = alarm.detailProviderId
      const channelProvider = channel.channelProvider
      const cachedDetail = !force ? providerTemplateDetails.value[detailKey(providerId, channelProvider)] : undefined
      const [detailResponse, variableResponse] = await Promise.all([
        cachedDetail
          ? Promise.resolve({ result: cachedDetail.channels[0] })
          : queryNoticeChannelTemplate_api(providerId, channelProvider),
        queryNoticeChannelVariables_api(providerId).catch(() => ({ result: [] })),
      ])

      // 选择节点时存在并发请求，落后响应不能覆盖用户后来选中的模板。
      if (version !== detailVersion || requestKey !== selectedKey.value) {
        return
      }

      channelVariables.value = filterUnsupportedRecommendedVariables(
        alarm.providerCode,
        mergeRecommendedVariables(
          fallbackVariables,
          getResponseResult<NoticeTemplateVariable[]>(variableResponse, []),
        ),
      )

      applyTemplateDetail(
        providerId,
        channelProvider,
        getResponseResult<NoticeChannelTemplateItem | undefined>(detailResponse, undefined),
      )
      detailReady.value = true
    } finally {
      if (version === detailVersion) {
        detailLoading.value = false
      }
    }
  }

  const buildSavePayload = (input: NoticeTemplateEditorPayload): NoticeChannelTemplateItem | undefined => {
    const payload = buildTemplateSavePayload(
      input,
      selectedAlarm.value,
      selectedChannel.value,
      templateDetail.value,
    )
    if (!payload && selectedChannel.value?.hasNotifierConfig === false) {
      onlyMessage($t('NoticeCenter.template.message.missingConfig'), 'error')
    }
    return payload
  }

  const saveTemplate = async (input: NoticeTemplateEditorPayload) => {
    const alarm = selectedAlarm.value
    const channelProvider = selectedChannel.value?.channelProvider
    if (!alarm || !channelProvider || !detailReady.value || saving.value) {
      return
    }

    let scopeVersion = reloadVersion
    let selectionVersion = detailVersion
    saving.value = true
    try {
      let providerId = alarm.detailProviderId
      const providerCode = alarm.providerCode
      if (!providerId) {
        // 尚未创建的主题需先显式创建；已有主题的单通道编辑不修改全局启用状态。
        await enableNoticeChannel_api(providerId || providerCode)
        if (scopeVersion !== reloadVersion || selectionVersion !== detailVersion) return
        await reload()
        const enabledAlarm = findAlarmByProvider(providerId, providerCode)
        if (enabledAlarm) {
          selectedAlarmKey.value = enabledAlarm.key
          selectedChannelProvider.value = channelProvider
          providerId = enabledAlarm.detailProviderId
        }
        await loadDetail(true)
        if (selectedAlarm.value?.providerCode !== providerCode || selectedChannelProvider.value !== channelProvider) return
        scopeVersion = reloadVersion
        selectionVersion = detailVersion
      }
      const payload = buildSavePayload(input)
      providerId = selectedAlarm.value?.detailProviderId || providerId
      if (!providerId) {
        return
      }
      if (!payload) return
      const response = await saveNoticeChannelTemplate_api(providerId, channelProvider, payload)
      // 保存响应只应用到发起时的选择；单通道返回值足够回显，不再重载整个主题树。
      if (scopeVersion !== reloadVersion || selectionVersion !== detailVersion) return
      applyTemplateDetail(
        providerId,
        channelProvider,
        getResponseResult<NoticeChannelTemplateItem | undefined>(response, undefined),
      )
      onlyMessage($t('NoticeCenter.template.message.saveSuccess'), 'success')
    } finally {
      saving.value = false
    }
  }

  watch(selectedKey, () => loadDetail())

  onScopeDispose(() => { ++detailVersion; ++reloadVersion })

  return {
    loading,
    detailLoading,
    detailReady,
    saving,
    testing,
    switchingKeys,
    groups,
    providers,
    treeData,
    expandedKeys,
    selectedKeys,
    selectedAlarm,
    selectedChannel,
    templateDetail,
    channelVariables,
    breadcrumb,
    templateCode,
    coveredAlarmNames,
    usedVariables,
    availableStats,
    referencedPolicies,
    getTemplateMessage,
    getTemplateSubject,
    reload,
    selectChannel,
    selectTreeNode,
    saveTemplate,
    sendTest,
    toggleAlarmState,
  }
}
