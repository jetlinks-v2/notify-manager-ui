import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { messageNotificationApi } from '../../../../../api/notice/messageNotification'
import { classifyNotificationFailure, type NotificationLoadState } from '../../../../../api/notice/messageNotificationState'
import { normalizeSmsSigns, normalizeSmsTemplates } from '../../../../notice/template/hooks/noticeTemplateRemoteOptions'
import type { NoticeTemplateFieldOption } from '../../../../notice/template/hooks/noticeTemplateFormModel'
import type { ChannelDraftEntry } from '../useChannelWorkspace'
import { smsCredentialsChanged } from '../channelSchema'

type SmsChoices = { code: NoticeTemplateFieldOption[]; signName: NoticeTemplateFieldOption[] }

/** 候选项归当前已保存的阿里云账号。编辑凭据期间停用旧选项，保存成功后重新查询。 */
export function useSmsTemplateOptions(entry: Ref<ChannelDraftEntry | undefined>, canEdit: Ref<boolean>) {
  const credentialsPending = computed(() => {
    const current = entry.value
    return !!current && smsCredentialsChanged(current.draft.configuration, current.baseline?.configuration)
  })
  const lookupId = computed(() => !credentialsPending.value && canEdit.value ? entry.value?.baseline?.id : undefined)
  const choices = shallowRef<SmsChoices>({ code: [], signName: [] })
  const state = ref<NotificationLoadState>('idle')
  let generation = 0

  async function reload() {
    const version = ++generation
    const id = lookupId.value
    choices.value = { code: [], signName: [] }
    state.value = id ? 'loading' : 'idle'
    if (!id) return
    try {
      const { templates, signs } = await messageNotificationApi.getSmsTemplateOptions(id)
      if (version !== generation || lookupId.value !== id) return
      choices.value = { code: normalizeSmsTemplates(templates), signName: normalizeSmsSigns(signs) }
      state.value = choices.value.code.length && choices.value.signName.length ? 'ready' : 'empty'
    } catch (error) {
      if (version === generation && lookupId.value === id) state.value = classifyNotificationFailure(error)
    }
  }
  watch(lookupId, reload, { immediate: true })
  onScopeDispose(() => { ++generation })
  return { credentialsPending, choices, state, reload }
}
