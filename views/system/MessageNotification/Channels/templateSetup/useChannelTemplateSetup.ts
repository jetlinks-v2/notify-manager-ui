import { computed, onScopeDispose, ref, shallowRef, type Ref } from 'vue'
import { messageNotificationApi } from '../../../../../api/notice/messageNotification'
import type { PrototypeTranslate } from '../../Templates/definition/templateDefaults'
import { publishNotificationConfigurationChange, type NotificationChannel } from '../../shared'
import type { useChannelWorkspace } from '../useChannelWorkspace'
import { messageTemplateDefaultsKey, wechatCorpChannel } from '../wechat/templateDefaults'
import {
  channelTemplateDefaultsKey, dingTalkRobotChannel, dingTalkWorkChannel, readTemplateSetup, savedTemplateDefaults, supportsTemplateSetup,
  smsChannel, templateSetupFields, templateSetupIssues, voiceChannel,
} from './templateDefaults'
import { fillMessageTemplates, type TemplateFillResult } from './fillMessageTemplates'
import { useSmsTemplateOptions } from './useSmsTemplateOptions'

type Workspace = Pick<ReturnType<typeof useChannelWorkspace>, 'entry' | 'dirty' | 'canEdit' | 'changeField'>

export function useChannelTemplateSetup(
  workspace: Workspace,
  context: {
    channel: Ref<NotificationChannel | undefined>
    permitted: Ref<boolean>
    blocked: Ref<boolean>
    generating: Ref<boolean>
    translate: PrototypeTranslate
  },
) {
  const { entry, canEdit, dirty } = workspace
  const channelId = computed(() => context.channel.value?.id || '')
  const current = computed(() => supportsTemplateSetup(channelId.value) ? entry.value : undefined)
  const configId = computed(() => current.value?.baseline?.id)
  const isSms = computed(() => channelId.value === smsChannel)
  // 短信首次写入凭据后，继续完成同一份配置的模板和签名选择。
  const pendingSmsSetupId = ref<string>()
  const settingUp = computed(() => !!current.value?.isNew
    || (isSms.value && !!configId.value && configId.value === pendingSmsSetupId.value))
  const settingUpSms = computed(() => isSms.value && settingUp.value)
  // 企业微信的 AgentId 同时用于渠道试发和应用授权，已保存渠道也需要编辑入口。
  const showFields = computed(() => settingUp.value || channelId.value === wechatCorpChannel)
  const sms = useSmsTemplateOptions(computed(() => settingUpSms.value ? current.value : undefined), canEdit)
  const values = computed(() => readTemplateSetup(channelId.value, current.value?.draft.configuration))
  const fields = computed(() => showFields.value ? templateSetupFields(channelId.value, values.value) : [])
  const issues = computed(() => {
    const result = templateSetupIssues(channelId.value, values.value)
    if (settingUpSms.value) {
      for (const key of ['code', 'signName'] as const) {
        if (sms.state.value[key] === 'ready' && values.value[key] && !sms.choices.value[key].some(option => option.value === values.value[key])) {
          result[key] = 'messageNotification.channels.validation.invalidValue'
        }
      }
    }
    return result
  })
  const submittedId = ref<string>()
  const feedback = shallowRef<{ id: string; result: TemplateFillResult }>()
  const ready = computed(() => Boolean(configId.value && !dirty.value && !Object.keys(issues.value).length))
  let disposed = false
  onScopeDispose(() => { disposed = true })

  const model = computed(() => ({
    available: !!current.value,
    fields: fields.value.map(field => ({ ...field, value: sms.credentialsPending.value ? '' : values.value[field.key],
      options: field.key === 'code' || field.key === 'signName' ? sms.choices.value[field.key] : field.options,
      error: submittedId.value === current.value?.draft.id ? issues.value[field.key] : undefined })),
    saveCredentialsFirst: sms.credentialsPending.value,
    smsOptionsState: settingUpSms.value ? sms.state.value : undefined,
    saveBlocked: settingUpSms.value && !sms.credentialsPending.value && !sms.ready.value,
    disabled: !canEdit.value || context.blocked.value,
    generating: context.generating.value,
    canFill: ready.value && canEdit.value && context.permitted.value && (!settingUpSms.value || sms.ready.value),
    noPermission: ready.value && canEdit.value && !context.permitted.value,
    result: feedback.value && feedback.value.id === configId.value && !dirty.value ? feedback.value.result : undefined,
  }))

  function change(key: string, value: unknown) {
    const configuration = current.value?.draft.configuration
    if (!configuration || model.value.disabled || typeof value !== 'string' || !fields.value.some(field => field.key === key)) return
    if ((key === 'code' || key === 'signName') && !sms.choices.value[key].some(option => option.value === value)) return
    const storageKey = channelId.value === wechatCorpChannel ? messageTemplateDefaultsKey : channelTemplateDefaultsKey
    const defaults = { ...savedTemplateDefaults(configuration[storageKey]), [key]: key === 'agentId' ? value.trim() : value }
    // 录音文件和 TTS 模板使用不同的编号，切换类型后需填写对应编号。
    if (channelId.value === voiceChannel && key === 'templateType' && value !== values.value.templateType) {
      delete defaults.templateCode
    }
    workspace.changeField(storageKey, defaults)
  }

  /** 首次配置校验并保存默认模板值，企业微信继续校验渠道 AgentId。 */
  function prepareForSave() {
    const { value: selected } = current
    if (!selected || !showFields.value) return true
    if (sms.credentialsPending.value) {
      submittedId.value = undefined
      return true
    }
    submittedId.value = selected.draft.id
    if (model.value.saveBlocked) return false
    // 工作通知 AgentId 由现有渠道校验标记，错误显示在原字段上。
    if (Object.keys(issues.value).some(key => key !== 'agentId' || channelId.value !== dingTalkWorkChannel)) return false
    if (channelId.value === smsChannel || channelId.value === voiceChannel) {
      const defaults = Object.fromEntries(fields.value.map(({ key }) => [key, values.value[key].trim()]))
      workspace.changeField(channelTemplateDefaultsKey, { ...savedTemplateDefaults(selected.draft.configuration[channelTemplateDefaultsKey]), ...defaults })
    } else if (channelId.value === dingTalkRobotChannel) {
      const { messageType, title, message, messageUrl } = values.value
      workspace.changeField(channelTemplateDefaultsKey, {
        ...savedTemplateDefaults(selected.draft.configuration[channelTemplateDefaultsKey]),
        messageType,
        title,
        message,
        ...(messageType === 'link' ? { messageUrl } : {}),
      })
    }
    return true
  }

  /** 仅成功保存的短信凭据进入首次模板选择，保存模板默认值后结束该流程。 */
  function afterSmsSave(id: string, credentialsOnly: boolean) {
    if (credentialsOnly) pendingSmsSetupId.value = id
    else if (pendingSmsSetupId.value === id) pendingSmsSetupId.value = undefined
  }

  async function fill(expectedId?: string, canWrite = () => canEdit.value) {
    const channel = context.channel.value
    const baseline = current.value?.baseline
    if (!channel || !baseline || (expectedId && expectedId !== baseline.id) || context.blocked.value) return
    const active = () => !disposed && context.permitted.value && canWrite() && channelId.value === channel.id
      && configId.value === baseline.id && ready.value
    if (!active()) return
    context.generating.value = true
    feedback.value = undefined
    try {
      const result = await fillMessageTemplates(messageNotificationApi, baseline, channel, active, context.translate)
      if (result.created || result.skipped || result.unknown) {
        publishNotificationConfigurationChange({ channel: channel.id, id: baseline.id, action: 'message-templates-created' })
      }
      if (active()) feedback.value = { id: baseline.id, result }
    } finally {
      context.generating.value = false
    }
  }

  return { model, change, fill, prepareForSave, afterSmsSave, reloadSmsOptions: sms.reload }
}

export type ChannelTemplateSetupModel = ReturnType<typeof useChannelTemplateSetup>['model']['value']
