import { computed, reactive, ref, watch } from 'vue'
import {
  queryAliyunSmsSigns_api,
  queryAliyunSmsTemplates_api,
  queryWechatCorpDepartments_api,
  queryWechatCorpTags_api,
  queryWechatCorpUsers_api,
} from '@notify-manager-ui/api/notice-center'
import type {
  NoticeCorpDepartment,
  NoticeCorpTag,
  NoticeCorpUser,
  NoticeSmsSignOption,
  NoticeSmsTemplateOption,
} from '@notify-manager-ui/api/notice-center'
import type { NoticeTemplateChannelNode } from './noticeTemplateModel'
import type {
  NoticeTemplateEditorPayload,
  NoticeTemplateFieldOption,
  NoticeTemplateFieldSchema,
  NoticeTemplateFormContext,
} from './noticeTemplateFormModel'
import { createTemplateRemoteFieldResolver } from './noticeTemplateRemoteFieldResolver'
import {
  asList,
  asText,
  normalizeDepartments,
  normalizeSmsSigns,
  normalizeSmsTemplates,
  normalizeWechatTags,
  normalizeWechatUsers,
} from './noticeTemplateRemoteOptions'

type RemoteState = {
  options: NoticeTemplateFieldOption[]
  loading: boolean
}

const createRemoteState = (): RemoteState => reactive({
  options: [],
  loading: false,
})

export const useNoticeTemplateEditorOptions = (
  context: NoticeTemplateFormContext,
  form: NoticeTemplateEditorPayload,
  channel: () => NoticeTemplateChannelNode | undefined,
) => {
  const smsTemplates = createRemoteState()
  const smsSigns = createRemoteState()
  const wechatDepartments = createRemoteState()
  const wechatUsers = createRemoteState()
  const wechatTags = createRemoteState()
  const smsTemplateMap = ref(new Map<unknown, NoticeSmsTemplateOption>())
  const smsConfigVersion = ref(0)
  const wechatConfigVersion = ref(0)
  const wechatUserVersion = ref(0)

  const configId = computed(() =>
    asText(form.configId || channel()?.template?.configId || channel()?.notifierConfig?.id),
  )
  const isSms = computed(() => context.type === 'sms')
  const isCorpWeixin = computed(() => context.type === 'weixin' && context.provider === 'corpMessage')
  const agentId = computed(() => asText(form.template.agentId).trim())
  const selectedDepartmentId = computed(() => asText(form.template.toParty).trim())

  const loadSmsTemplates = async () => {
    const currentConfigId = configId.value
    if (!isSms.value || !currentConfigId) {
      smsTemplates.options = []
      smsTemplateMap.value = new Map()
      return
    }
    const response = await queryAliyunSmsTemplates_api(currentConfigId)
    if (!isSms.value || configId.value !== currentConfigId) {
      return
    }
    const list = asList<NoticeSmsTemplateOption>(response)
    smsTemplateMap.value = new Map(list.map(item => [item.templateCode, item]))
    smsTemplates.options = normalizeSmsTemplates(list)
  }

  const loadSmsSigns = async () => {
    const currentConfigId = configId.value
    if (!isSms.value || !currentConfigId) {
      smsSigns.options = []
      return
    }
    const response = await queryAliyunSmsSigns_api(currentConfigId)
    if (!isSms.value || configId.value !== currentConfigId) {
      return
    }
    smsSigns.options = normalizeSmsSigns(asList<NoticeSmsSignOption>(response))
  }

  const loadWechatDepartments = async () => {
    const currentConfigId = configId.value
    const currentAgentId = agentId.value
    if (!isCorpWeixin.value || !currentConfigId || !currentAgentId) {
      wechatDepartments.options = []
      return
    }
    const response = await queryWechatCorpDepartments_api(currentConfigId)
    if (!isCorpWeixin.value || configId.value !== currentConfigId || agentId.value !== currentAgentId) {
      return
    }
    wechatDepartments.options = normalizeDepartments(asList<NoticeCorpDepartment>(response))
  }

  const loadWechatTags = async () => {
    const currentConfigId = configId.value
    const currentAgentId = agentId.value
    if (!isCorpWeixin.value || !currentConfigId || !currentAgentId) {
      wechatTags.options = []
      return
    }
    const response = await queryWechatCorpTags_api(currentConfigId)
    if (!isCorpWeixin.value || configId.value !== currentConfigId || agentId.value !== currentAgentId) {
      return
    }
    wechatTags.options = normalizeWechatTags(asList<NoticeCorpTag>(response))
  }

  const loadWechatUsers = async () => {
    const currentConfigId = configId.value
    const currentAgentId = agentId.value
    const currentDepartmentId = selectedDepartmentId.value
    if (!isCorpWeixin.value || !currentConfigId || !currentAgentId || !currentDepartmentId) {
      wechatUsers.options = []
      return
    }
    const response = await queryWechatCorpUsers_api(currentConfigId, currentDepartmentId)
    if (
      !isCorpWeixin.value
      || configId.value !== currentConfigId
      || agentId.value !== currentAgentId
      || selectedDepartmentId.value !== currentDepartmentId
    ) {
      return
    }
    wechatUsers.options = normalizeWechatUsers(asList<NoticeCorpUser>(response))
  }

  const loadRemoteOptions = () => Promise.resolve()

  const {
    resolveField,
    onFieldChange,
  } = createTemplateRemoteFieldResolver(
    context,
    form,
    { smsTemplates, smsSigns, wechatDepartments, wechatUsers, wechatTags },
    () => configId.value,
    () => agentId.value,
    () => selectedDepartmentId.value,
    code => smsTemplateMap.value.get(code),
  )

  watch(
    () => [context.type, configId.value],
    async () => {
      const version = smsConfigVersion.value + 1
      smsConfigVersion.value = version
      if (isSms.value && configId.value) {
        smsTemplates.loading = true
        smsSigns.loading = true
        try {
          await Promise.all([loadSmsTemplates(), loadSmsSigns()])
        } finally {
          if (version === smsConfigVersion.value) {
            smsTemplates.loading = false
            smsSigns.loading = false
          }
        }
      } else {
        smsTemplates.options = []
        smsSigns.options = []
      }
    },
    { immediate: true },
  )

  watch(
    () => [context.type, context.provider, configId.value, agentId.value],
    async () => {
      const version = wechatConfigVersion.value + 1
      wechatConfigVersion.value = version
      if (isCorpWeixin.value && configId.value && agentId.value) {
        wechatDepartments.loading = true
        wechatTags.loading = true
        try {
          await Promise.all([loadWechatDepartments(), loadWechatTags()])
        } finally {
          if (version === wechatConfigVersion.value) {
            wechatDepartments.loading = false
            wechatTags.loading = false
          }
        }
      } else {
        wechatDepartments.options = []
        wechatUsers.options = []
        wechatTags.options = []
      }
    },
    { immediate: true },
  )

  watch(
    () => [context.type, context.provider, configId.value, agentId.value, selectedDepartmentId.value],
    async () => {
      const version = wechatUserVersion.value + 1
      wechatUserVersion.value = version
      if (isCorpWeixin.value && configId.value && agentId.value && selectedDepartmentId.value) {
        wechatUsers.loading = true
        try {
          await loadWechatUsers()
        } finally {
          if (version === wechatUserVersion.value) {
            wechatUsers.loading = false
          }
        }
      } else {
        wechatUsers.options = []
      }
    },
    { immediate: true },
  )

  return {
    resolveField,
    onFieldChange,
    loadRemoteOptions,
  }
}
