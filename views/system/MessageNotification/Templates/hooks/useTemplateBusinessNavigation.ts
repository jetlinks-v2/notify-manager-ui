import { computed, type Ref } from 'vue'
import type { LocationQuery } from 'vue-router'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import { findNotificationChannel, notificationChannels, type NotificationLoadState } from '../../shared'
import { businessRecordId } from '../businessTemplateModel'
import { notifyVisualAlarmTemplateSaved, parseVisualAlarmTemplateContext } from '../../../../notice/template/hooks/visualAlarmTemplateBridge'

const queryValue = (value: LocationQuery[string]) => typeof value === 'string' ? value : ''

/** Resolve exact records first. A business code shared by multiple asset scopes requires an explicit tree selection. */
export function useTemplateBusinessNavigation(query: Ref<LocationQuery>, businessTypes: Ref<NoticeChannelConfig[]>, directoryState: Ref<NotificationLoadState>) {
  const topic = computed(() => queryValue(query.value.topicProvider) || queryValue(query.value.aiAlarmType))
  const firstAlarm = computed(() => !topic.value && !queryValue(query.value.templateId) && queryValue(query.value.businessSelection) === 'first-alarm')
  const requested = computed(() => firstAlarm.value || !!topic.value || !queryValue(query.value.templateId) && !!queryValue(query.value.channelProvider))
  const businesses = computed(() => {
    // 渠道入口按目录顺序选择首个告警，使用返回的记录身份区分同一业务的资产范围。
    if (firstAlarm.value) return businessTypes.value.filter(item => item.provider?.startsWith('alarm-') || ['aiComplianceAlarm', 'aiSecurityAlarm'].includes(item.provider || '')).slice(0, 1)
    const exact = businessTypes.value.filter(item => !!businessRecordId(item) && businessRecordId(item) === topic.value)
    return exact.length ? exact : businessTypes.value.filter(item => item.provider === topic.value)
  })
  const business = computed(() => businesses.value.length === 1 ? businesses.value[0] : undefined)
  const channel = computed(() => queryValue(query.value.channel) || notificationChannels.find(item => `notifier-${item.type}` === queryValue(query.value.channelProvider))?.id || 'email:embedded')
  const state = computed<NotificationLoadState>(() => {
    if (!requested.value) return 'idle'
    if (!['ready', 'empty'].includes(directoryState.value)) return directoryState.value
    if (firstAlarm.value && !business.value) return 'empty'
    if (!business.value || !findNotificationChannel(channel.value)) return 'unavailable'
    return 'ready'
  })
  function notifySaved(templateId: string | undefined) {
    const context = parseVisualAlarmTemplateContext(query.value)
    if (context && templateId && business.value?.provider === context.alarmType) notifyVisualAlarmTemplateSaved(context, business.value.provider)
  }
  return { requested, business, channel, state, notifySaved }
}
