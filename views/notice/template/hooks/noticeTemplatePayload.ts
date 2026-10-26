import type {
  NoticeChannelConfig,
  NoticeTemplateEntity,
  NoticeTemplateVariable,
} from '@notify-manager-ui/api/notice-center'
import { needsTemplate } from './noticeTemplateModel'
import type {
  NoticeTemplateChannelNode,
  NoticeTemplateEditorPayload,
  NoticeTemplateGroup,
} from './noticeTemplateModel'
import { normalizeTemplateBeforeSubmit } from './noticeTemplateFormModel'
import { buildNoticeTemplateChannelVariables } from './noticeTemplateChannelVariables'

export const buildChannelPayload = (
  alarm: NoticeTemplateGroup['alarms'][number],
  channel: NoticeTemplateChannelNode,
  configId?: string,
  variableDefinitions: NoticeTemplateVariable[] = [],
): NoticeChannelConfig => {
  const original = channel.channel || {}
  const payload: NoticeChannelConfig = {
    ...original,
    providerId: alarm.detailProviderId,
    name: original.name || channel.channelName,
    channelProvider: channel.channelProvider,
    state: original.state || 'enabled',
    grant: original.grant,
  }
  if (original.channelConfiguration || needsTemplate(channel.channelProvider)) {
    payload.channelConfiguration = {
      ...original.channelConfiguration,
      notifierId: configId || original.channelConfiguration?.notifierId,
      variables: buildNoticeTemplateChannelVariables({
        channelProvider: channel.channelProvider,
        variableDefinitions,
        currentVariables: original.channelConfiguration?.variables || {},
      }),
    }
  }
  return payload
}

export const buildTemplatePayload = (
  input: NoticeTemplateEditorPayload,
  configId: string | undefined,
  template?: NoticeTemplateEntity,
): NoticeTemplateEntity | undefined => {
  if (!configId) {
    return undefined
  }
  const normalized = normalizeTemplateBeforeSubmit(input)
  // 单通道入口同时校验新旧 configId，保留精确关联，不能按服务商替换已有配置。
  return {
    ...template,
    id: template?.id,
    configId,
    name: normalized.name,
    description: normalized.description,
    type: normalized.type || template?.type,
    provider: normalized.provider || template?.provider,
    template: normalized.template,
    variableDefinitions: normalized.variableDefinitions,
  }
}

export const buildTemplateSavePayload = (
  input: NoticeTemplateEditorPayload,
  alarm: NoticeTemplateGroup['alarms'][number] | undefined,
  channel: NoticeTemplateChannelNode | undefined,
  template: NoticeTemplateEntity | undefined,
) => {
  if (!alarm || !channel) {
    return undefined
  }
  const configId = input.configId
    || template?.configId
    || channel.notifierConfigs?.find(item => item.provider === input.provider)?.id
    || (channel.notifierConfig?.provider === input.provider ? channel.notifierConfig?.id : undefined)
  const nextTemplate = needsTemplate(channel.channelProvider)
    ? buildTemplatePayload(input, configId, template)
    : undefined
  if (needsTemplate(channel.channelProvider) && !channel.hasNotifierConfig) {
    return undefined
  }
  if (needsTemplate(channel.channelProvider) && !nextTemplate) {
    return undefined
  }
  return {
    channel: buildChannelPayload(
      alarm,
      channel,
      configId,
      nextTemplate?.variableDefinitions || template?.variableDefinitions || [],
    ),
    template: nextTemplate || null,
  }
}
