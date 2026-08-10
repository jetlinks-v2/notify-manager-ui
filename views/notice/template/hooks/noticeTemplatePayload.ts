import type {
  NoticeChannelConfig,
  NoticeProviderTemplateInfo,
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

export const buildProviderPayload = (
  alarm: NoticeTemplateGroup['alarms'][number],
  detail?: NoticeProviderTemplateInfo,
): NoticeChannelConfig => {
  const original = detail?.provider || alarm.raw
  return {
    ...original,
    id: original.id || alarm.detailProviderId,
    providerId: original.providerId || alarm.detailProviderId,
    name: original.name || alarm.raw.type?.name || alarm.name,
    provider: original.provider || alarm.provider || alarm.detailProviderId,
  }
}

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
  // 聚合接口按 configId 校验外部通知配置权限；前端只保留回显值，不在模板页选择通知配置。
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
  detail?: NoticeProviderTemplateInfo,
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
    provider: buildProviderPayload(alarm, detail),
    channels: [{
      channel: buildChannelPayload(
        alarm,
        channel,
        configId,
        nextTemplate?.variableDefinitions || template?.variableDefinitions || [],
      ),
      template: nextTemplate || null,
    }],
  }
}
