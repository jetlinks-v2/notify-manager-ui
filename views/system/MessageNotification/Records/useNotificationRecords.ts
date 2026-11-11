import { computed, inject, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePermission } from '@jetlinks-web/hooks'
import {
  buildQueryFilter, decodeConditionFilterQuery, encodeConditionFilterQuery,
  type ConditionFilterField, type ConditionFilterTerm,
} from '@jetlinks-web-core/components/ConditionFilter'
import {
  classifyNotificationFailure, cloneNotificationValue, normalizeNotificationNavigation,
  normalizeNotificationPage, notificationPermissions, notificationQuery,
  type NotificationHistory, type NotificationLoadState, type NotificationQuery, type NotifyState,
} from '../shared'
import {
  buildHistoryQuery, historyPage, notificationHistoryAdapterKey, replaceHistoryState, selectedHistoryState,
  notificationHistoryAdapter, type NotificationHistoryAdapter,
} from './recordQuery'
import { useHistoryCounts } from './useHistoryCounts'

/** One generation owns rows, totals and failures; permission/capability failures never become empty success. */
export function createNotificationRecordsController(adapter: NotificationHistoryAdapter, allowed: Ref<boolean>, query: Ref<NotificationQuery>) {
  const rows = shallowRef<NotificationHistory[]>([])
  const total = ref<number>()
  const state = ref<NotificationLoadState>('idle')
  const selected = shallowRef<NotificationHistory>()
  const detailOpen = ref(false)
  let generation = 0
  let controller: AbortController | undefined
  let focusOrigin: HTMLElement | undefined

  async function load() {
    const current = ++generation
    controller?.abort()
    controller = new AbortController()
    rows.value = []
    total.value = undefined
    detailOpen.value = false
    selected.value = undefined
    if (!allowed.value) { state.value = 'forbidden'; return }
    if (!adapter.available) { state.value = 'unavailable'; return }
    state.value = 'loading'
    try {
      const result = normalizeNotificationPage(await adapter.query(cloneNotificationValue(query.value), controller.signal))
      if (current !== generation) return
      rows.value = result.data
      total.value = result.total
      state.value = result.data.length ? 'ready' : 'empty'
    } catch (error) {
      if (current === generation) state.value = classifyNotificationFailure(error)
    }
  }

  /** The drawer receives a historical snapshot, independent of later row/cache changes. */
  function openDetail(record: NotificationHistory, event?: Event) {
    if (!allowed.value) return
    focusOrigin = typeof HTMLElement !== 'undefined' && event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
    selected.value = cloneNotificationValue(record)
    detailOpen.value = true
  }

  /** Called after the drawer exit transition, once its focus trap has been released. */
  function restoreDetailFocus() {
    if (focusOrigin?.isConnected) focusOrigin.focus()
    focusOrigin = undefined
  }

  watch([() => JSON.stringify(query.value), allowed], load, { immediate: true })
  onScopeDispose(() => { generation += 1; controller?.abort() })
  return { rows, total, state, selected, detailOpen, load, openDetail, restoreDetailFocus }
}

/** URL query is the committed search source; UI changes only replace that route. */
export function useNotificationRecords(fields: Ref<ConditionFilterField[]>) {
  const route = useRoute()
  const router = useRouter()
  const { hasPerm } = usePermission(notificationPermissions.records.query)
  const adapter = inject(notificationHistoryAdapterKey, notificationHistoryAdapter)
  const navigation = computed(() => normalizeNotificationNavigation(route.query))
  const pageIndex = computed(() => historyPage(route.query.page, 1) - 1)
  const pageSize = computed(() => historyPage(route.query.size, 12, 100))
  const terms = computed(() => {
    const decoded = decodeConditionFilterQuery(route.query.q, fields.value)
    if (navigation.value.state) return replaceHistoryState(decoded, navigation.value.state)
    // An explicit all/search URL survives reload; only an untouched entry defaults to failures.
    return route.query.state === 'all' || route.query.q ? decoded : replaceHistoryState(decoded, 'error')
  })
  const selectedState = computed(() => selectedHistoryState(terms.value))
  const query = computed(() => buildHistoryQuery(buildQueryFilter(terms.value, fields.value).terms, navigation.value, pageIndex.value, pageSize.value))
  const records = createNotificationRecordsController(adapter, hasPerm, query)
  const interactive = computed(() => hasPerm.value && adapter.available)
  const countFilter = computed(() => ({
    terms: buildHistoryQuery(buildQueryFilter(replaceHistoryState(terms.value), fields.value).terms, navigation.value, 0, 12).terms,
  }))
  const statistics = useHistoryCounts(adapter, hasPerm, countFilter)
  const selectionScope = computed(() => JSON.stringify(query.value.terms))

  /** Route encoding and adapter filters share field metadata; page resets atomically with search. */
  function changeTerms(value: ConditionFilterTerm[]) {
    const next = notificationQuery({ ...navigation.value, state: selectedHistoryState(value) }, route.query)
    void router.replace({ query: { ...next, state: selectedHistoryState(value) || 'all', q: encodeConditionFilterQuery(value, fields.value) || undefined, page: undefined } })
  }

  function changeState(value: string | number) {
    const state = value === selectedState.value || value === 'all' ? undefined : value as NotifyState
    changeTerms(replaceHistoryState(terms.value, state))
  }

  function changePage(page: number, size: number) {
    void router.replace({ query: { ...route.query, page: String(size === pageSize.value ? page : 1), size: String(size) } })
  }

  return { ...records, ...statistics, selectionScope, terms, selectedState, pageIndex, pageSize, interactive, changeTerms, changeState, changePage }
}
