import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../../api/notice/messageNotification'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import { classifyNotificationFailure, type NotificationLoadState } from '../../shared'

/** The optional business directory never blocks access to independently stored templates. */
export function useTemplateBusinessDirectory(canQuery: Ref<boolean>, api: MessageNotificationApi = messageNotificationApi) {
  const businessTypes = ref<NoticeChannelConfig[]>([])
  const directoryState = ref<NotificationLoadState>('idle')
  let revision = 0

  async function reloadDirectory() {
    const current = ++revision
    businessTypes.value = []
    if (!canQuery.value) { directoryState.value = 'forbidden'; return }
    directoryState.value = 'loading'
    try {
      const result = await api.queryTemplateDirectory()
      if (current !== revision || !canQuery.value) return
      businessTypes.value = result
      directoryState.value = result.length ? 'ready' : 'empty'
    } catch (error) {
      if (current === revision) directoryState.value = classifyNotificationFailure(error)
    }
  }

  watch(canQuery, reloadDirectory, { immediate: true })
  onScopeDispose(() => { ++revision })
  return { businessTypes, directoryState, reloadDirectory }
}
