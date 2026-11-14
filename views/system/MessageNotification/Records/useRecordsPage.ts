import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { notificationStates } from '../shared'
import { historyFilterFields } from './presentation'
import { useNotificationRecords } from './useNotificationRecords'
import { useHistorySelection } from './useHistorySelection'

/** Keep translated search, status and table presentation aligned with the records controller. */
export function useRecordsPage() {
  const { t } = useI18n()
  const fields = computed(() => historyFilterFields(t))
  const records = useNotificationRecords(fields)
  const selection = useHistorySelection(records.rows, records.selectionScope, computed(() => records.interactive.value && !['forbidden', 'unavailable'].includes(records.state.value)), t)
  const stateOptions = computed(() => [
    { value: 'all', label: t('messageNotification.records.all'), count: records.counts.value?.all ?? 0 },
    ...notificationStates.map(value => ({ value, label: t(`messageNotification.records.state.${value}`), count: records.counts.value?.[value] ?? 0 })),
  ])
  const columns = computed(() => [
    { title: t('messageNotification.records.field.notifyTime'), dataIndex: 'notifyTime', key: 'notifyTime', scopedSlots: true, width: 175 },
    { title: t('messageNotification.records.field.bizType'), dataIndex: 'bizType', key: 'bizType', scopedSlots: true, ellipsis: true, width: 120 },
    { title: t('messageNotification.records.field.channel'), dataIndex: 'channel', key: 'channel', scopedSlots: true, width: 140 },
    { title: t('messageNotification.records.field.receiver'), dataIndex: 'receiver', key: 'receiver', scopedSlots: true, ellipsis: true, width: 180 },
    { title: t('messageNotification.records.field.notifyMessage'), dataIndex: 'notifyMessage', key: 'notifyMessage', scopedSlots: true, ellipsis: true },
    { title: t('messageNotification.records.field.state'), dataIndex: 'state', key: 'state', scopedSlots: true, width: 100 },
    { title: t('messageNotification.records.field.errorMessage'), dataIndex: 'errorMessage', key: 'errorMessage', scopedSlots: true, ellipsis: true, width: 220 },
    { title: t('messageNotification.records.field.action'), dataIndex: 'action', key: 'action', scopedSlots: true, fixed: 'right', width: 100 },
  ])

  return { t, fields, stateOptions, columns, ...records, ...selection }
}
