import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import {
  insideMailChannelProvider, isEnabledInsideMailChannel, messageNotificationApi, type MessageNotificationApi,
} from '../../../../../api/notice/messageNotification'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import { classifyNotificationFailure, NotificationRequestError, type NotificationLoadState } from '../../shared'

export function hasInsideMailChannel(business: NoticeChannelConfig): boolean {
  return Boolean(business.defaultNotifyChannels?.includes(insideMailChannelProvider)
    || business.channels?.some(channel => channel.channelProvider === insideMailChannelProvider))
}

/** The optional business directory never blocks access to independently stored templates. */
export function useTemplateBusinessDirectory(canQuery: Ref<boolean>, api: MessageNotificationApi = messageNotificationApi) {
  const businessTypes = ref<NoticeChannelConfig[]>([])
  const directoryState = ref<NotificationLoadState>('idle')
  const insideMailChannel = shallowRef<NoticeChannelConfig>()
  let revision = 0

  async function loadInsideMailChannel(current: number) {
    try {
      const channel = await api.queryInsideMailChannel()
      if (current === revision && canQuery.value) insideMailChannel.value = channel
    } catch {
      // Channel discovery is optional for the directory and retried on refresh.
      if (current === revision) insideMailChannel.value = undefined
    }
  }

  async function reloadDirectory() {
    const current = ++revision
    businessTypes.value = []
    insideMailChannel.value = undefined
    if (!canQuery.value) { directoryState.value = 'forbidden'; return }
    directoryState.value = 'loading'
    void loadInsideMailChannel(current)
    try {
      const result = await api.queryTemplateDirectory()
      if (current !== revision || !canQuery.value) return
      businessTypes.value = result.map(item => !item.id && item.providerId ? { ...item, id: item.providerId } : item)
      directoryState.value = result.length ? 'ready' : 'empty'
    } catch (error) {
      if (current === revision) directoryState.value = classifyNotificationFailure(error)
    }
  }

  async function readSavedBusiness(id: string): Promise<NoticeChannelConfig> {
    const rows = await api.queryTemplateDirectory()
    const matches = rows.filter(item => (item.id || item.providerId) === id)
    if (matches.length !== 1) throw new NotificationRequestError('unavailable')
    return { ...matches[0], id }
  }

  /** Recheck the exact business before writing, including disabled records and implicit defaults. */
  async function fillInsideMail(id: string, active: () => boolean) {
    const channel = insideMailChannel.value
    if (!channel || !canQuery.value || !active()) return
    let business = await readSavedBusiness(id)
    if (!active()) return
    const created = !hasInsideMailChannel(business)
    if (created) {
      await api.saveBusinessChannel(id, channel)
      if (!active()) return
      business = await readSavedBusiness(id)
      if (!business.channels?.some(item => isEnabledInsideMailChannel(item, id))) {
        throw new NotificationRequestError('unavailable')
      }
    }
    if (!active()) return
    const index = businessTypes.value.findIndex(item => item.id === id)
    if (index >= 0) businessTypes.value[index] = business
    return { business, created }
  }

  watch(canQuery, reloadDirectory, { immediate: true })
  onScopeDispose(() => { ++revision })
  return { businessTypes, directoryState, reloadDirectory, insideMailChannel, fillInsideMail }
}
