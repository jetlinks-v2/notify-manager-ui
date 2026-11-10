import { computed, nextTick, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NotificationHistory } from '../shared'
import { historyChannelLabel, historySnapshot, historyStateLabel, historyTime } from './presentation'

/** Own the saved-detail presentation and transition focus, leaving the component to render and delegate. */
export function useRecordDetail(record: Ref<NotificationHistory | undefined>, closed: () => void) {
  const { t } = useI18n()
  const closeButton = ref<{ focus: () => void }>()
  const summary = computed(() => [
    { label: t('messageNotification.records.field.state'), value: historyStateLabel(record.value?.state, t) },
    { label: t('messageNotification.records.field.notifyTime'), value: historyTime(record.value?.notifyTime) },
    { label: t('messageNotification.records.field.channel'), value: historyChannelLabel(record.value?.notifyType, record.value?.provider, t) },
    { label: t('messageNotification.records.field.receiver'), value: record.value?.receiver?.join(', ') || '—' },
  ])
  const identifiers = computed(() => ['notifierId', 'templateId', 'bizType', 'bizId', 'callId', 'creatorId', 'description'].map(key => ({
    label: t(`messageNotification.records.field.${key}`), value: historySnapshot(record.value?.[key as keyof NotificationHistory]),
  })))
  const snapshots = computed(() => {
    const current = record.value
    if (!current) return []
    const items = [
      { key: 'sentContent', content: historySnapshot(current.notifyMessage) },
      { key: 'templateSnapshot', content: historySnapshot(current.template) },
      { key: 'context', content: historySnapshot(current.context) },
      { key: 'result', content: historySnapshot(current.result) },
      { key: 'bizExt', content: historySnapshot(current.bizExt) },
      { key: 'bindings', content: historySnapshot(current.bindings) },
    ]
    if (current.errorType || current.errorMessage || current.errorStack) {
      items.push({ key: 'error', content: [current.errorType, current.errorMessage, current.errorStack].filter(Boolean).join('\n') })
    }
    return items
  })

  /** Ant's transition completes before focus enters the drawer or returns to the invoking control. */
  async function afterOpenChange(open: boolean) {
    if (!open) { closed(); return }
    await nextTick()
    closeButton.value?.focus()
  }

  return { summary, identifiers, snapshots, closeButton, afterOpenChange }
}
