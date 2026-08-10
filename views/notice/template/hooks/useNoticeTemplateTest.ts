import { ref, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web/utils'
import { sendNotifierTest_api } from '@notify-manager-ui/api/notice-center'
import type { NoticeTemplateEntity } from '@notify-manager-ui/api/notice-center'
import { isInsideMailChannel, needsTemplate } from './noticeTemplateModel'
import type { NoticeTemplateChannelNode } from './noticeTemplateModel'

type TestTargetRefs = {
  channel: ComputedRef<NoticeTemplateChannelNode | undefined>
  template: Ref<NoticeTemplateEntity | undefined>
}

export const useNoticeTemplateTest = ({
  channel,
  template,
}: TestTargetRefs) => {
  const { t: $t } = useI18n()
  const testing = ref(false)

  const sendTest = async (params?: Record<string, unknown>) => {
    const currentChannel = channel.value
    const currentTemplate = template.value
    const configId = currentTemplate?.configId
      || currentChannel?.notifierConfigs?.find(item => item.provider === currentTemplate?.provider)?.id
      || (
        currentChannel?.notifierConfig?.provider === currentTemplate?.provider
          ? currentChannel?.notifierConfig?.id
          : undefined
      )
    const templateId = currentTemplate?.id

    if (!currentChannel || isInsideMailChannel(currentChannel.channelProvider) || !needsTemplate(currentChannel.channelProvider)) {
      onlyMessage($t('NoticeCenter.template.test.insideDisabled'), 'warning')
      return
    }
    if (!configId) {
      onlyMessage($t('NoticeCenter.template.message.missingConfig'), 'error')
      return
    }
    if (!templateId) {
      onlyMessage($t('NoticeCenter.template.test.noTemplate'), 'warning')
      return
    }

    testing.value = true
    try {
      await sendNotifierTest_api(configId, templateId, params || {})
      onlyMessage($t('NoticeCenter.template.message.testSuccess'), 'success')
    } finally {
      testing.value = false
    }
  }

  return {
    testing,
    sendTest,
  }
}
