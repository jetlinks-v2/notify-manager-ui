import type { MessageNotificationApi } from '../../../../../api/notice/messageNotification'
import { NotificationRequestError } from '../../../../../api/notice/messageNotificationState'

const managedTemplatePrefix = 'stpl_'
type DeleteStep = 'inspect' | 'bindings' | 'templates' | 'config'

export class ChannelDeletionError extends Error {
  constructor(readonly step: DeleteStep, cause: unknown) {
    super(`messageNotification.channels.deleteCleanup.${step}`, { cause })
  }
}

/** 分步调用现有接口。托管模板要求确认实际绑定或本次页面已完成的解绑。 */
export async function deleteChannelConfiguration(
  api: Pick<MessageNotificationApi, 'queryTemplates' | 'queryTemplateDirectory' | 'getTemplate' | 'deleteBusinessChannel' | 'deleteTemplate' | 'deleteConfig'>,
  configId: string,
  channelProvider: string,
  removedBindings: Set<string>,
  canContinue: () => boolean,
) {
  let step: DeleteStep = 'inspect'
  const checkPermission = () => {
    if (!canContinue()) throw new NotificationRequestError('forbidden')
  }
  const checkTemplateOwner = async (id: string) => {
    checkPermission()
    const template = await api.getTemplate(id)
    if (template?.id !== id || template.configId !== configId) throw new NotificationRequestError('error')
    checkPermission()
  }
  try {
    const page = await api.queryTemplates({ paging: false, terms: [{ column: 'configId', termType: 'eq', value: configId }] })
    if (page.total !== undefined && page.total > page.data.length) throw new NotificationRequestError('error')
    const ids = new Set<string>()
    for (const template of page.data) {
      if (!template || typeof template.id !== 'string' || !template.id.trim()) throw new NotificationRequestError('error')
      if (template.configId === configId) ids.add(template.id)
    }

    if (ids.size) {
      checkPermission()
      const directory = await api.queryTemplateDirectory()
      const bindings = new Map<string, string>()
      for (const business of directory) {
        for (const channel of business.channels ?? []) {
          const binding = channel?.channelConfiguration
          if (!binding?.templateId || !ids.has(binding.templateId)) continue
          if (!business.id || !channel.id || channel.channelProvider !== channelProvider
            || (channel.providerId && channel.providerId !== business.id)
            || (binding.notifierId && binding.notifierId !== configId)) {
            throw new NotificationRequestError('error')
          }
          const knownTemplateId = bindings.get(channel.id)
          if (knownTemplateId && knownTemplateId !== binding.templateId) throw new NotificationRequestError('error')
          bindings.set(channel.id, binding.templateId)
        }
      }
      // 业务目录按权限过滤，缺少托管绑定时不能当作无绑定模板处理。
      for (const templateId of ids) {
        if (!templateId.startsWith(managedTemplatePrefix)) continue
        const bindingId = templateId.slice(managedTemplatePrefix.length)
        if (!bindings.has(bindingId) && !removedBindings.has(bindingId)) throw new NotificationRequestError('error')
      }

      step = 'bindings'
      for (const [id, templateId] of bindings) {
        await checkTemplateOwner(templateId)
        await api.deleteBusinessChannel(id)
        removedBindings.add(id)
      }

      step = 'templates'
      for (const id of ids) {
        await checkTemplateOwner(id)
        await api.deleteTemplate(id)
      }
    }

    step = 'config'
    checkPermission()
    await api.deleteConfig(configId)
  } catch (error) {
    throw new ChannelDeletionError(step, error)
  }
}
