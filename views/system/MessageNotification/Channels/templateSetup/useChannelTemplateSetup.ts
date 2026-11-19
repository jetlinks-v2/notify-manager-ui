import { computed, onScopeDispose, ref, shallowRef, type Ref } from 'vue'
import { messageNotificationApi } from '../../../../../api/notice/messageNotification'
import type { PrototypeTranslate } from '../../Templates/definition/templateDefaults'
import { publishNotificationConfigurationChange, type NotificationChannel } from '../../shared'
import type { useChannelWorkspace } from '../useChannelWorkspace'
import { messageTemplateDefaultsKey, wechatCorpChannel } from '../wechat/templateDefaults'
import {
  channelTemplateDefaultsKey, dingTalkWorkChannel, readTemplateSetup, savedTemplateDefaults, supportsTemplateSetup,
  templateSetupFields, templateSetupIssues,
} from './templateDefaults'
import { fillMessageTemplates, type TemplateFillResult } from './fillMessageTemplates'

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
  const values = computed(() => readTemplateSetup(channelId.value, current.value?.draft.configuration))
  const fields = computed(() => templateSetupFields(channelId.value, values.value))
  const issues = computed(() => templateSetupIssues(channelId.value, values.value))
  const configId = computed(() => current.value?.baseline?.id)
  const submittedId = ref<string>()
  const feedback = shallowRef<{ id: string; result: TemplateFillResult }>()
  const ready = computed(() => Boolean(configId.value && !dirty.value && !Object.keys(issues.value).length))
  let disposed = false
  onScopeDispose(() => { disposed = true })

  const model = computed(() => ({
    available: !!current.value,
    fields: fields.value.map(field => ({ ...field, value: values.value[field.key],
      error: submittedId.value === current.value?.draft.id ? issues.value[field.key] : undefined })),
    disabled: !canEdit.value || context.blocked.value,
    generating: context.generating.value,
    canFill: ready.value && canEdit.value && context.permitted.value,
    noPermission: ready.value && canEdit.value && !context.permitted.value,
    result: feedback.value && feedback.value.id === configId.value && !dirty.value ? feedback.value.result : undefined,
  }))

  function change(key: string, value: unknown) {
    const configuration = current.value?.draft.configuration
    if (!configuration || model.value.disabled || typeof value !== 'string' || !fields.value.some(field => field.key === key)) return
    const storageKey = channelId.value === wechatCorpChannel ? messageTemplateDefaultsKey : channelTemplateDefaultsKey
    workspace.changeField(storageKey, { ...savedTemplateDefaults(configuration[storageKey]), [key]: key === 'agentId' ? value.trim() : value })
  }

  function prepareForSave() {
    const { value: selected } = current
    if (!selected) return true
    submittedId.value = selected.draft.id
    // 工作通知 AgentId 由现有渠道校验标记，错误显示在原字段上。
    if (Object.keys(issues.value).some(key => key !== 'agentId' || channelId.value !== dingTalkWorkChannel)) return false
    if (channelId.value !== wechatCorpChannel && fields.value.length) {
      const defaults = Object.fromEntries(fields.value.map(({ key }) => [key, values.value[key]]))
      workspace.changeField(channelTemplateDefaultsKey, {
        ...savedTemplateDefaults(selected.draft.configuration[channelTemplateDefaultsKey]), ...defaults,
      })
    }
    return true
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

  return { model, change, fill, prepareForSave }
}

export type ChannelTemplateSetupModel = ReturnType<typeof useChannelTemplateSetup>['model']['value']
