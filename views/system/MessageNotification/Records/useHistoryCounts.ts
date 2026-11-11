import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import type { NotificationHistoryCounts } from '../../../../api/notice/messageNotificationTypes'
import { classifyNotificationFailure, cloneNotificationValue, type NotificationLoadState, type NotificationQuery } from '../shared'
import type { NotificationHistoryAdapter } from './recordQuery'

/** Counts have their own lifecycle: paging/status changes reuse them, failed statistics never hide rows. */
export function useHistoryCounts(adapter: NotificationHistoryAdapter, allowed: Ref<boolean>, filter: Ref<NotificationQuery>) {
  const counts = shallowRef<NotificationHistoryCounts>()
  const countState = ref<NotificationLoadState>('idle')
  let generation = 0
  let controller: AbortController | undefined
  async function loadCounts() {
    const current = ++generation
    controller?.abort()
    controller = new AbortController()
    counts.value = undefined
    if (!allowed.value) { countState.value = 'forbidden'; return }
    if (!adapter.available || !adapter.count) { countState.value = 'unavailable'; return }
    countState.value = 'loading'
    try {
      const result = await adapter.count(cloneNotificationValue(filter.value), controller.signal)
      if (current !== generation) return
      counts.value = result
      countState.value = 'ready'
    } catch (error) {
      if (current === generation) countState.value = classifyNotificationFailure(error)
    }
  }
  watch([() => JSON.stringify(filter.value), allowed], loadCounts, { immediate: true })
  onScopeDispose(() => { ++generation; controller?.abort() })
  return { counts, countState, loadCounts }
}
