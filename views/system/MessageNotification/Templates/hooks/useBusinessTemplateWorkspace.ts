import { computed, onScopeDispose, reactive, ref, type Ref } from 'vue'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../../api/notice/messageNotification'
import type { NoticeChannelConfig, NoticeChannelTemplateItem } from '../../../../../api/notice-center'
import { classifyNotificationFailure, cloneNotificationValue, findNotificationChannel, notificationEnumValue, NotificationRequestError, type NotificationLoadState } from '../../shared'
import { businessDraftKey, businessRecordId, businessTemplateDraft, buildBusinessTemplatePayload } from '../businessTemplateModel'
import { templateDraftFingerprint, type TemplateDraft } from '../model'

interface BusinessDraft { draft: TemplateDraft; baseline: string; existing: boolean; channel: NoticeChannelConfig; enabled: boolean }
const fingerprint = (item: BusinessDraft) => JSON.stringify([templateDraftFingerprint(item.draft), item.enabled])

/** Business record, delivery type and vendor jointly own a draft. Reading and saving never enable a business. */
export function useBusinessTemplateWorkspace(access: { query: Ref<boolean>; add: Ref<boolean>; update: Ref<boolean> }, api: MessageNotificationApi = messageNotificationApi) {
  const business = ref<NoticeChannelConfig>()
  const activeKey = ref('')
  const drafts = reactive(new Map<string, BusinessDraft>())
  const detailState = ref<NotificationLoadState>('idle')
  const saveState = ref<NotificationLoadState>('idle')
  const saving = ref(false)
  const entry = computed(() => drafts.get(activeKey.value))
  const draft = computed(() => detailState.value === 'ready' ? entry.value?.draft : undefined)
  const dirty = computed(() => !!entry.value && entry.value.baseline !== fingerprint(entry.value))
  const hasDirtyDrafts = computed(() => [...drafts.values()].some(item => item.baseline !== fingerprint(item)))
  const canSave = computed(() => !!business.value && !!businessRecordId(business.value) && access.query.value
    && detailState.value === 'ready' && !!entry.value && (entry.value.existing ? access.update.value : access.add.value))
  const channelEnabled = computed({ get: () => entry.value?.enabled ?? true, set: value => { if (entry.value && canSave.value) entry.value.enabled = value } })
  let revision = 0
  let disposed = false
  let selectedChannel = ''

  function cache(item: NoticeChannelTemplateItem | undefined, key: string, channelId: string, owner: NoticeChannelConfig) {
    const channel = findNotificationChannel(channelId)!
    const value: BusinessDraft = { draft: businessTemplateDraft(owner, channel, item), baseline: '', existing: !!item?.template,
      channel: cloneNotificationValue(item?.channel || owner.channels?.find(row => row.channelProvider === `notifier-${channel.type}`) || {}),
      enabled: (typeof item?.channel.state === 'string' ? item.channel.state : item?.channel.state?.value) !== 'disabled' }
    value.baseline = fingerprint(value)
    drafts.set(key, value)
  }

  async function selectBusiness(owner: NoticeChannelConfig | undefined, channelId: string, force = false) {
    const current = ++revision
    business.value = owner
    selectedChannel = channelId
    saveState.value = 'idle'
    const channel = findNotificationChannel(channelId)
    activeKey.value = owner && channel ? businessDraftKey(owner, channel) : ''
    if (!owner || !channel) { detailState.value = 'idle'; return }
    if (!access.query.value || !(access.add.value || access.update.value)) { detailState.value = 'forbidden'; return }
    if (!businessRecordId(owner)) { detailState.value = 'empty'; return }
    const key = activeKey.value
    if (drafts.has(key) && (!force || dirty.value)) { detailState.value = 'ready'; return }
    detailState.value = 'loading'
    try {
      const result = await api.getBusinessTemplate(businessRecordId(owner), `notifier-${channel.type}`)
      if (disposed || current !== revision || !access.query.value || !(access.add.value || access.update.value)) return
      if (result?.channel.providerId && result.channel.providerId !== businessRecordId(owner)
        || result?.channel.channelProvider && result.channel.channelProvider !== `notifier-${channel.type}`) throw new Error('Mismatched business binding')
      if (result?.channel.channelConfiguration?.templateId && !result.template) throw new NotificationRequestError('unavailable')
      cache(result, key, channelId, owner)
      detailState.value = 'ready'
    } catch (error) { if (!disposed && current === revision) detailState.value = classifyNotificationFailure(error) }
  }

  async function saveTemplate() {
    const value = entry.value
    const owner = business.value
    if (!value || !owner || !canSave.value || saving.value) return false
    const payload = buildBusinessTemplatePayload(owner, value.channel, value.draft, value.enabled)
    const key = activeKey.value
    const channelId = selectedChannel
    saving.value = true
    saveState.value = 'loading'
    try {
      const result = await api.saveBusinessTemplate(businessRecordId(owner), `notifier-${value.draft.type}`, payload)
      // Only the authoritative save response establishes the managed template ID and binding.
      if (!result?.template?.id || result.channel?.channelConfiguration?.templateId !== result.template.id
        || result.channel?.providerId !== businessRecordId(owner)) throw new Error('Invalid saved binding')
      if (disposed) return false
      cache(result, key, channelId, owner)
      if (activeKey.value === key) saveState.value = 'ready'
      return true
    } catch (error) { if (!disposed && activeKey.value === key) saveState.value = classifyNotificationFailure(error); return false }
    finally { saving.value = false }
  }

  async function discardDraft() {
    drafts.delete(activeKey.value)
    await selectBusiness(business.value, selectedChannel)
  }
  /** Independent historical templates supply content only; the existing business binding remains the save target. */
  async function importTemplate(id: string) {
    if (!canSave.value || saving.value || !business.value) return
    const key = activeKey.value
    const current = ++revision
    try {
      const record = await api.getTemplate(id)
      if (disposed || current !== revision || activeKey.value !== key || !canSave.value) return
      const channel = findNotificationChannel(selectedChannel)!
      if (notificationEnumValue(record.type) !== channel.type || notificationEnumValue(record.provider) !== channel.provider) throw new Error('Mismatched template provider')
      entry.value!.draft = businessTemplateDraft(business.value, channel, { channel: entry.value!.channel,
        template: { ...record, type: channel.type, provider: channel.provider } })
    } catch (error) { if (current === revision) saveState.value = classifyNotificationFailure(error) }
  }
  onScopeDispose(() => { disposed = true; ++revision })
  return { business, activeKey, detailState, saveState, saving, entry, draft, dirty, hasDirtyDrafts, canSave, channelEnabled,
    selectBusiness, saveTemplate, discardDraft, importTemplate }
}
