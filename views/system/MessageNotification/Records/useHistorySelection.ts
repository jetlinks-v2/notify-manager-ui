import { computed, shallowRef, watch, type Ref } from 'vue'
import { downloadFileByUrl } from '@jetlinks-web/utils'
import { cloneNotificationValue, type NotificationHistory } from '../shared'
import { historyChannelLabel, historyStateLabel, historyTime } from './presentation'

type Translate = (key: string) => string

/** Quote every CSV cell and prevent stored text from being interpreted as a spreadsheet formula. */
export function historyCsv(rows: NotificationHistory[], t: Translate): string {
  const fields = ['notifyTime', 'bizType', 'channel', 'receiver', 'notifyMessage', 'state', 'errorMessage', 'notifierId', 'templateId', 'bizId']
  const cells = (values: unknown[]) => values.map(value => {
    const text = String(value ?? '')
    const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text
    return `"${safe.replace(/"/g, '""')}"`
  }).join(',')
  return '\uFEFF' + [cells(fields.map(key => t(`messageNotification.records.field.${key}`))), ...rows.map(row => cells([
    historyTime(row.notifyTime), row.bizType, historyChannelLabel(row.notifyType, row.provider, t), row.receiver?.join(', '),
    row.notifyMessage, historyStateLabel(row.state, t), row.errorMessage || row.errorType, row.notifierId, row.templateId, row.bizId,
  ]))].join('\r\n')
}

/** Keep selected snapshots across pages; changing the search scope or losing access clears them. */
export function useHistorySelection(rows: Ref<NotificationHistory[]>, scope: Ref<string>, allowed: Ref<boolean>, t: Translate) {
  const selectedRows = shallowRef<NotificationHistory[]>([])
  function clearSelection() { selectedRows.value = [] }
  function changeSelection(keys: (string | number)[], selected: NotificationHistory[]) {
    if (!allowed.value) return
    const available = new Map([...selectedRows.value, ...rows.value, ...selected.filter(Boolean)].map(row => [row.id, row]))
    selectedRows.value = keys.flatMap(key => {
      const row = available.get(String(key))
      return row ? [cloneNotificationValue(row)] : []
    })
  }
  const selectionCount = computed(() => selectedRows.value.length)
  const rowSelection = computed(() => allowed.value ? {
    selectedRowKeys: selectedRows.value.map(row => row.id), preserveSelectedRowKeys: true, onChange: changeSelection,
  } : undefined)
  function exportSelected() {
    if (!allowed.value || !selectedRows.value.length) return
    const url = URL.createObjectURL(new Blob([historyCsv(selectedRows.value, t)], { type: 'text/csv;charset=utf-8' }))
    try { downloadFileByUrl(url, `notification-records-${historyTime(Date.now()).slice(0, 10)}`, 'csv') }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000) }
  }
  watch(scope, clearSelection)
  watch(allowed, value => { if (!value) clearSelection() })
  return { selectionCount, rowSelection, clearSelection, exportSelected }
}
