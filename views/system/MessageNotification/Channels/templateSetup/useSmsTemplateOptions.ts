import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { messageNotificationApi } from '../../../../../api/notice/messageNotification'
import { classifyNotificationFailure, type NotificationLoadState } from '../../../../../api/notice/messageNotificationState'
import { normalizeSmsSigns, normalizeSmsTemplates } from '../../../../notice/template/hooks/noticeTemplateRemoteOptions'
import type { NoticeTemplateFieldOption } from '../../../../notice/template/hooks/noticeTemplateFormModel'
import type { ChannelDraftEntry } from '../useChannelWorkspace'
import { smsCredentialsChanged } from '../channelSchema'

type SmsChoices = { code: NoticeTemplateFieldOption[]; signName: NoticeTemplateFieldOption[] }
type SmsOptionKey = keyof SmsChoices

/** 候选项归当前已保存的阿里云账号。编辑凭据期间停用旧选项，保存成功后重新查询。 */
export function useSmsTemplateOptions(entry: Ref<ChannelDraftEntry | undefined>, canEdit: Ref<boolean>) {
  const credentialsPending = computed(() => {
    const current = entry.value
    return !!current && smsCredentialsChanged(current.draft.configuration, current.baseline?.configuration)
  })
  const lookupId = computed(() => !credentialsPending.value && canEdit.value ? entry.value?.baseline?.id : undefined)
  const choices = shallowRef<SmsChoices>({ code: [], signName: [] })
  const state = ref<Record<SmsOptionKey, NotificationLoadState>>({ code: 'idle', signName: 'idle' })
  const ready = computed(() => state.value.code === 'ready' && state.value.signName === 'ready')
  let generation = 0

  async function reload() {
    const version = ++generation
    const id = lookupId.value
    choices.value = { code: [], signName: [] }
    const initialState = id ? 'loading' : 'idle'
    state.value = { code: initialState, signName: initialState }
    if (!id) return
    const active = () => version === generation && lookupId.value === id
    async function load(key: SmsOptionKey, fetchOptions: () => Promise<NoticeTemplateFieldOption[]>) {
      try {
        const options = await fetchOptions()
        if (!active()) return
        choices.value = { ...choices.value, [key]: options }
        state.value[key] = options.length ? 'ready' : 'empty'
      } catch (error) {
        if (active()) state.value[key] = classifyNotificationFailure(error)
      }
    }
    // 模板和签名独立回显，单项查询失败也可以选择另一项。
    await Promise.all([
      load('code', async () => normalizeSmsTemplates(await messageNotificationApi.getSmsTemplates(id))),
      load('signName', async () => normalizeSmsSigns(await messageNotificationApi.getSmsSigns(id))),
    ])
  }
  watch(lookupId, reload, { immediate: true })
  onScopeDispose(() => { ++generation })
  return { credentialsPending, choices, state, ready, reload }
}
