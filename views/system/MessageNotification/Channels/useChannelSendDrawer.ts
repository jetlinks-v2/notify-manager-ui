import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NotificationLoadState, NotificationTemplate } from '../shared'

export interface ChannelSendDrawerModel {
  open: boolean
  configId: string
  state: NotificationLoadState
  templates: NotificationTemplate[]
  selected?: NotificationTemplate
  parameters: string
  missing: string[]
  sending: boolean
  sent: boolean
  error?: string
  canSend: boolean
  invalidParameters: boolean
}

export function useChannelSendDrawer(model: () => ChannelSendDrawerModel) {
  const { t } = useI18n()
  const templateSelect = ref<{ focus: () => void }>()
  const templateOptions = computed(() => model().templates.map(item => ({ value: item.id, label: `${item.name} · ${item.id}` })))
  watch(() => model().open && model().state === 'ready', async value => {
    if (value) { await nextTick(); templateSelect.value?.focus() }
  })
  return { t, templateSelect, templateOptions }
}
