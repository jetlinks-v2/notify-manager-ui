import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web/utils'
import {
  disableNoticeChannel_api,
  enableNoticeChannel_api,
  queryNoticeChannelConfig_api,
  queryNoticeChannelProviders_api,
  queryNoticeChannelVariables_api,
  queryNoticeChannelWithTemplates_api,
  queryNotifierConfig_api,
  saveNoticeChannelWithTemplates_api,
} from '@notice-center-ui/api/notice-center'
import type {
  NoticeChannelConfig,
  NoticeChannelProvider,
  NoticeProviderTemplateInfo,
  NoticeTemplateEntity,
  NoticeTemplateVariable,
  NotifierConfig,
} from '@notice-center-ui/api/notice-center'
import {
  buildTreeData,
  configQuery,
  findFirstChannel,
  findTreeNode,
  getAvailableStats,
  getBreadcrumb,
  getCoveredAlarmNames,
  getNotifierType,
  getReferencedPolicies,
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
  const selectedDetailProviderId = computed(() => selectedAlarm.value?.detailProviderId || '')
  const templateCode = computed(() => getTemplateCode(selectedAlarm.value, selectedChannel.value))
  const breadcrumb = computed(() => getBreadcrumb(selectedAlarm.value, selectedChannel.value))
  const coveredAlarmNames = computed(() => getCoveredAlarmNames(selectedAlarm.value))
  const usedVariables = computed(() => getUsedVariables(templateDetail.value, channelVariables.value))
  const availableStats = computed(() => getAvailableStats(templateDetail.value, selectedChannel.value))
  const referencedPolicies = computed(() => getReferencedPolicies(templateDetail.value, selectedChannel.value))
  const selectedAlarmDisabled = computed(() => getStateValue(selectedAlarm.value?.raw.state) === 'disabled')
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

  const loadNotifierConfigs = async () => {
    const types = Array.from(new Set(
      providers.value
        .filter(item => item.id?.startsWith('notifier-'))
        .map(item => getNotifierType(item.id)),
    ))
    const entries = await Promise.all(types.map(async type => {
      const response = await queryNotifierConfig_api(configQuery(type))
      return [type, toListResult<NotifierConfig>(response)] as const
    }))
    notifierConfigs.value = Object.fromEntries(entries)
  }

  const applyTemplateDetail = (providerId: string, detail?: NoticeProviderTemplateInfo) => {
    if (!detail) {
      return
    }
    providerTemplateDetails.value = {
      ...providerTemplateDetails.value,
      [providerId]: detail,
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
    loading.value = true
    try {
      const [providerResponse, configResponse] = await Promise.all([
        queryNoticeChannelProviders_api(),
        queryNoticeChannelConfig_api(),
      ])
      normalizeProviders(getResponseResult<NoticeChannelProvider[]>(providerResponse, []))
      await loadNotifierConfigs()
      providerTemplateDetails.value = {}
      normalizeGroups(getResponseResult<NoticeChannelConfig[]>(configResponse, []))
      selectFirstAvailable()
    } finally {
      loading.value = false
    }
  }

  const selectChannel = (alarmKey: string, channelProvider: string) => {
    selectedAlarmKey.value = alarmKey
    selectedChannelProvider.value = channelProvider
    templateDetail.value = selectedChannel.value?.template
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
    const alarm = selectedAlarm.value
    const channel = selectedChannel.value
    const requestKey = selectedKey.value

    templateDetail.value = undefined
    channelVariables.value = []
    if (!alarm || !channel || !alarm.detailProviderId) {
      return
    }
    if (selectedAlarmDisabled.value) {
      return
    }

    detailLoading.value = true
    try {
      const providerId = alarm.detailProviderId
      const cachedDetail = !force ? providerTemplateDetails.value[providerId] : undefined
      const [detailResponse, variableResponse] = await Promise.all([
        cachedDetail
          ? Promise.resolve({ result: cachedDetail })
          : queryNoticeChannelWithTemplates_api(providerId),
        queryNoticeChannelVariables_api(providerId),
      ])

      // 选择节点时存在并发请求，落后响应不能覆盖用户后来选中的模板。
      if (requestKey !== selectedKey.value) {
        return
      }

      applyTemplateDetail(
        providerId,
        getResponseResult<NoticeProviderTemplateInfo | undefined>(detailResponse, cachedDetail),
      )
      channelVariables.value = getResponseResult<NoticeTemplateVariable[]>(variableResponse, [])
    } finally {
      if (requestKey === selectedKey.value) {
        detailLoading.value = false
      }
    }
  }

  const buildSavePayload = (input: NoticeTemplateEditorPayload): NoticeProviderTemplateInfo | undefined => {
    const payload = buildTemplateSavePayload(
      input,
      selectedAlarm.value,
      selectedChannel.value,
      templateDetail.value,
      providerTemplateDetails.value[selectedDetailProviderId.value],
    )
    if (!payload && selectedChannel.value?.hasNotifierConfig === false) {
      onlyMessage($t('NoticeCenter.template.message.missingConfig'), 'error')
    }
    return payload
  }

  const saveTemplate = async (input: NoticeTemplateEditorPayload) => {
    const alarm = selectedAlarm.value
    const channelProvider = selectedChannel.value?.channelProvider
    if (!alarm || !channelProvider) {
      return
    }

    let currentAlarmKey = alarm.key
    saving.value = true
    try {
      let providerId = alarm.detailProviderId
      const providerCode = alarm.providerCode
      if (getStateValue(alarm.raw.state) === 'disabled') {
        // Disabled topic providers may not have a persisted id yet; enable first, then reload before building the save payload.
        await enableNoticeChannel_api(providerId || providerCode)
        await reload()
        const enabledAlarm = findAlarmByProvider(providerId, providerCode)
        if (enabledAlarm) {
          selectedAlarmKey.value = enabledAlarm.key
          selectedChannelProvider.value = channelProvider
          currentAlarmKey = enabledAlarm.key
          providerId = enabledAlarm.detailProviderId
        }
        await loadDetail(true)
      }
      const payload = buildSavePayload(input)
      providerId = selectedAlarm.value?.detailProviderId || providerId
      if (!providerId) {
        return
      }
      const response = await saveNoticeChannelWithTemplates_api(providerId, payload)
      applyTemplateDetail(
        providerId,
        getResponseResult<NoticeProviderTemplateInfo | undefined>(response, undefined),
      )
      onlyMessage($t('NoticeCenter.template.message.saveSuccess'), 'success')
      await reload()
      restoreSelection(currentAlarmKey, channelProvider)
      await loadDetail(true)
    } finally {
      saving.value = false
    }
  }

  watch(selectedKey, () => {
    loadDetail()
  })

  return {
    loading,
    detailLoading,
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
