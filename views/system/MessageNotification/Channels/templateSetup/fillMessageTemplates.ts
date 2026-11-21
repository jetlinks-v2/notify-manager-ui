import type { NoticeChannelConfig, NoticeChannelTemplateItem } from '../../../../../api/notice-center'
import type { MessageNotificationApi } from '../../../../../api/notice/messageNotification'
import { buildNoticeTemplateChannelVariables } from '../../../../notice/template/hooks/noticeTemplateChannelVariables'
import type { PrototypeTranslate } from '../../Templates/definition/templateDefaults'
import { channelProviderFor, hasDefiniteSaveRejection, readBusinessTemplate } from '../../Templates/workspace/businessTemplates'
import {
  classifyNotificationFailure, NotificationRequestError, resolveNotificationChannel,
  type NotificationChannel, type NotificationFailureKind, type NotifierConfig,
} from '../../shared'
import { applyWorkRecipients, isWorkChannel, readWorkRecipients } from '../../shared/workRecipients'
import { wechatCorpChannel } from '../wechat/templateDefaults'
import { createChannelMessageTemplate, dingTalkRobotChannel, readTemplateSetup, smsChannel, supportsTemplateSetup, templateSetupIssues } from './templateDefaults'

type TemplateFillApi = Pick<MessageNotificationApi, 'getConfig' | 'getSmsTemplateContent' | 'queryTemplateDirectory' |
  'getBusinessTemplate' | 'queryInsideMailChannel' | 'saveBusinessTemplate' | 'saveBusinessTemplates'>

export interface TemplateFillResult {
  created: number
  skipped: number
  failed: string[]
  unknown: boolean
  loadFailure?: NotificationFailureKind | 'smsDefaults'
}

function readBusiness(directory: NoticeChannelConfig[], code: string): NoticeChannelConfig | undefined {
  const matches = directory.filter(item => item.provider === code)
  if (matches.length > 1) throw new NotificationRequestError('error')
  const selected = matches[0]
  if (selected && !selected.id && selected.providerId) return { ...selected, id: selected.providerId }
  return selected
}

function hasBinding(business: NoticeChannelConfig, channelProvider: string): boolean {
  return Boolean(business.channels?.some(item => item.channelProvider === channelProvider
    && (item.id || item.channelConfiguration?.templateId || item.channelConfiguration?.notifierId)))
}

function isEnabled({ state }: NoticeChannelConfig): boolean {
  return (typeof state === 'string' ? state : state?.value) === 'enabled'
}

/** The existing PUTs are upserts. Only a confirmed empty slot is eligible for a write. */
export async function fillMessageTemplates(
  api: TemplateFillApi,
  config: NotifierConfig,
  channel: NotificationChannel,
  active: () => boolean,
  translate: PrototypeTranslate,
): Promise<TemplateFillResult> {
  const result: TemplateFillResult = { created: 0, skipped: 0, failed: [], unknown: false }
  const values = readTemplateSetup(channel.id, config.configuration)
  if (!supportsTemplateSetup(channel.id) || Object.keys(templateSetupIssues(channel.id, values)).length || !active()) return result
  const channelProvider = channelProviderFor(channel)
  let directory: NoticeChannelConfig[]
  let recipients: ReturnType<typeof readWorkRecipients>
  try {
    const saved = await api.getConfig(config.id)
    // Confirm the defaults survived the channel write before creating any business record.
    if (!saved?.configuration || saved.id !== config.id || resolveNotificationChannel(saved.type, saved.provider)?.id !== channel.id
      || (channel.id === wechatCorpChannel && saved.configuration.corpId !== config.configuration.corpId)
      || JSON.stringify(readTemplateSetup(channel.id, saved.configuration)) !== JSON.stringify(values)) {
      throw new NotificationRequestError('error')
    }
    if (!active()) return result
    recipients = isWorkChannel(channel.id) ? readWorkRecipients(saved.configuration) : undefined
    directory = await api.queryTemplateDirectory()
  } catch (error) {
    result.loadFailure = classifyNotificationFailure(error)
    return result
  }

  const channelName = channel.name || translate(channel.labelKey)
  let smsContent: string | undefined
  let insideMailRequest: Promise<NoticeChannelConfig | undefined> | undefined
  // The same directory powers the template page and already applies the current business permissions.
  for (const code of new Set(directory.map(item => item.provider))) {
    if (!active()) break
    if (!code) continue
    let business: NoticeChannelConfig | undefined
    let writing = false
    try {
      business = readBusiness(directory, code)
      if (!business) continue
      // A placeholder may have become a persisted topic since the batch started.
      if (!business.id) business = readBusiness(await api.queryTemplateDirectory(), code)
      if (!business || !active()) continue
      if (hasBinding(business, channelProvider)
        || (business.id && await api.getBusinessTemplate(business.id, channelProvider))) {
        result.skipped += 1
        continue
      }
      if (!active()) break
      // 首个缺失绑定才查询供应商，整批模板使用同一份审核原文。
      if (channel.id === smsChannel && smsContent === undefined) {
        try {
          smsContent = await api.getSmsTemplateContent(config.id, values.code.trim(), values.signName.trim())
        } catch (error) {
          result.loadFailure = classifyNotificationFailure(error)
          break
        }
        if (!smsContent) {
          result.loadFailure = 'smsDefaults'
          break
        }
        if (!active()) break
      }
      const defaults = smsContent === undefined ? values : { ...values, message: smsContent }
      const template = createChannelMessageTemplate(business, channel, config.id, defaults, translate)
      const base: NoticeChannelTemplateItem = {
        channel: {
          providerId: business.id,
          name: channelName,
          channelProvider,
          state: 'enabled',
          channelConfiguration: {
            notifierId: config.id,
            variables: buildNoticeTemplateChannelVariables({
              channelProvider: channel.id === dingTalkRobotChannel ? undefined : channelProvider,
              variableDefinitions: template.variableDefinitions,
            }),
          },
        },
        template: { ...template },
      }

      const item = recipients && isWorkChannel(channel.id) ? applyWorkRecipients(base, channel.id, recipients) : base
      const insideMail = business.id ? undefined : await (insideMailRequest ??= api.queryInsideMailChannel())
      if (!active()) break
      writing = true
      let written: NoticeChannelTemplateItem | undefined
      if (business.id) {
        written = await api.saveBusinessTemplate(business.id, channelProvider, item)
      } else {
        const response = await api.saveBusinessTemplates(code, {
          // 新消息类型立即可供选择，个人订阅由用户勾选。
          provider: { provider: code, name: business.name, state: 'enabled', defaultSubscribed: false },
          channels: insideMail ? [item, { channel: insideMail }] : [item],
        })
        if (!response.provider?.id || response.provider.provider !== code || !isEnabled(response.provider)) {
          throw new NotificationRequestError('error', response)
        }
        business = response.provider
        written = response.channels.find(row => row.channel.channelProvider === channelProvider)
      }
      const stored = readBusinessTemplate(business, channel, written).template
      if (!written || !isEnabled(written.channel) || stored?.configId !== config.id) {
        throw new NotificationRequestError('error', written)
      }
      result.created += 1
    } catch (error) {
      result.failed.push(business?.name || code)
      // A timeout or malformed save response can follow a committed write. Only retry after fresh reads.
      if (writing && !hasDefiniteSaveRejection(error)) {
        result.unknown = true
        break
      }
      if (classifyNotificationFailure(error) === 'forbidden') break
    }
  }
  return result
}
