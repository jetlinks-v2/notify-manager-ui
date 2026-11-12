import { computed, type Ref } from 'vue'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../api/notice/messageNotification'
import { useIndependentTemplateWorkspace } from './hooks/useIndependentTemplateWorkspace'
import { useBusinessTemplateWorkspace } from './hooks/useBusinessTemplateWorkspace'

/** Keep independent deep links and business bindings in separate stores while sharing provider choices and the editor. */
export function useTemplateWorkspace(access: { query: Ref<boolean>; add: Ref<boolean>; update: Ref<boolean> }, api: MessageNotificationApi = messageNotificationApi) {
  const independent = useIndependentTemplateWorkspace(access, api)
  const binding = useBusinessTemplateWorkspace(access, api)
  const managed = computed(() => !!binding.business.value)
  const active = computed(() => managed.value ? binding : independent)
  return { ...independent, binding, managed,
    activeKey: computed(() => active.value.activeKey.value),
    detailState: computed(() => active.value.detailState.value),
    saveState: computed(() => active.value.saveState.value),
    entry: computed(() => active.value.entry.value), draft: computed(() => active.value.draft.value),
    dirty: computed(() => active.value.dirty.value), canSave: computed(() => active.value.canSave.value),
    saving: computed(() => binding.saving.value || independent.saving.value),
    hasDirtyDrafts: computed(() => binding.hasDirtyDrafts.value || independent.hasDirtyDrafts.value),
    saveTemplate: () => active.value.saveTemplate(), discardDraft: () => active.value.discardDraft(),
  }
}
