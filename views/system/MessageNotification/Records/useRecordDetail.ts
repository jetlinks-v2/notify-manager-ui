import { computed, nextTick, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePermission } from '@jetlinks-web/hooks'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
import { messageNotificationApi } from '../../../../api/notice/messageNotification'
import { notificationEnumValue, notificationNavigationTarget, notificationPermissions, resolveNotificationChannel, type NotificationHistory } from '../shared'
import { historyChannelIcon, historyChannelLabel, historyTime } from './presentation'

/** Own the saved-detail presentation and transition focus, leaving the component to render and delegate. */
export function useRecordDetail(record: Ref<NotificationHistory | undefined>, open: Ref<boolean>, closed: () => void) {
  const { t } = useI18n()
  const menu = useMenuStore()
  const canViewChannels = usePermission(notificationPermissions.channels.query).hasPerm
  const canViewTemplates = usePermission(notificationPermissions.templates.query).hasPerm
  const channel = computed(() => resolveNotificationChannel(record.value?.notifyType, record.value?.provider))
  const channelId = computed(() => [notificationEnumValue(record.value?.notifyType), notificationEnumValue(record.value?.provider)].filter(Boolean).join(':'))
  const canGoChannel = computed(() => canViewChannels.value && !!record.value?.notifierId && !!notificationEnumValue(record.value?.notifyType) && !!notificationEnumValue(record.value?.provider))
  const canGoTemplate = computed(() => canViewTemplates.value && !!record.value?.templateId && !!channel.value)
  const closeButton = ref<{ focus: () => void }>()
  const templateName = ref('')
  const templateLoading = ref(false)
  // The link uses current template metadata; never replace the historical sent content with that template.
  watch([() => record.value?.templateId, canViewTemplates, open], async ([templateId, allowed, visible], _, onCleanup) => {
    let active = true
    // Switching records, closing, permission revocation and unmounting invalidate pending name lookups.
    onCleanup(() => { active = false })
    templateName.value = ''
    templateLoading.value = false
    if (!visible || !allowed || !templateId?.trim()) return
    templateLoading.value = true
    try {
      const template = await messageNotificationApi.getTemplate(templateId)
      if (active && template?.id === templateId) templateName.value = template.name?.trim() || ''
    } catch {
      // Deleted or inaccessible templates keep the reported-data placeholder, never expose the ID as the name.
      if (active) templateName.value = ''
    } finally {
      if (active) templateLoading.value = false
    }
  }, { immediate: true, flush: 'sync' })
  const channelIcon = computed(() => historyChannelIcon(record.value?.notifyType))
  const sentContent = computed(() => record.value?.notifyMessage?.trim() ? record.value.notifyMessage : t('messageNotification.records.detail.unreported'))
  const summary = computed(() => {
    const current = record.value
    const field = (key: string, label: string, value?: string, fallback = 'unreported') => ({
      key, label: t(`messageNotification.records.${label}`),
      value: value?.trim() ? value : t(`messageNotification.records.detail.${fallback}`), missing: !value?.trim(),
    })
    const time = historyTime(current?.notifyTime)
    const template = field('messageTemplate', 'detail.messageTemplate', templateName.value, current?.templateId?.trim() ? 'unreported' : 'unconfigured')
    if (templateLoading.value) template.value = t('messageNotification.common.loading')
    // Keep the requested fields visible without inferring absent historical names or retry counts.
    return [
      field('notifyTime', 'field.notifyTime', time === '—' ? undefined : time),
      field('notificationType', 'detail.notificationType', current?.bizType),
      field('channel', 'detail.channel', notificationEnumValue(current?.notifyType) ? historyChannelLabel(current?.notifyType, current?.provider, t) : undefined, 'unconfigured'),
      field('receiver', 'field.receiver', current?.receiver?.filter(value => value.trim()).join(', ')),
      field('relatedObject', 'detail.relatedObject', current?.bizId),
      template,
      field('retryCount', 'detail.retryCount'),
    ]
  })

  /** Resolve target pages through platform menus and carry the actual historical config/template identity. */
  function navigate(page: 'channels' | 'templates') {
    if (!record.value || (page === 'channels' ? !canGoChannel.value : !canGoTemplate.value)) return
    const target = notificationNavigationTarget(page, { channel: channel.value?.id, configId: record.value.notifierId, ...(page === 'templates' ? { templateId: record.value.templateId } : {}) })
    // Channels has a backend-driven catalog; preserve an unknown historical provider for its resolver.
    if (page === 'channels') target.options.query.channel = channelId.value
    void menu.jumpPage(target.name, target.options)
  }

  /** Ant's transition completes before focus enters the drawer or returns to the invoking control. */
  async function afterOpenChange(open: boolean) {
    if (!open) { closed(); return }
    await nextTick()
    closeButton.value?.focus()
  }

  return { summary, channelIcon, sentContent, closeButton, afterOpenChange, canGoChannel, canGoTemplate, navigate }
}
