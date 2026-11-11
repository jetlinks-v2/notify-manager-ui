import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../../api/notice/messageNotification'
import { classifyNotificationFailure, notificationFailureMessage } from '../../../../../api/notice/messageNotificationState'
import { cloneNotificationValue, notificationEnumValue, type NotificationLoadState, type NotifierConfig } from '../../shared'
import { buildChannelTest, channelTestAdapters, configChannelId, fixedTestTarget, testRecipientIssue } from './channelTestAdapter'
import { readTestSettings, testText } from './channelTestConfig'

interface ChannelTestContext { config: NotifierConfig; channelName: string; systemName: string; permitted: () => boolean; clean: () => boolean }
type ChannelTestApi = Pick<MessageNotificationApi, 'sendInline' | 'getCurrentEmail' | 'getCurrentPhone' | 'getCurrentBindings'>

/** One modal lifecycle owns all trials; closing invalidates identity reads and send completions. */
export function useChannelTest(api: ChannelTestApi = messageNotificationApi) {
  const { t } = useI18n()
  const open = ref(false)
  const context = shallowRef<ChannelTestContext>()
  const stage = ref<'form' | 'sending' | 'success' | 'error'>('form')
  const recipientMode = ref<'self' | 'other'>('self')
  const address = ref('')
  const ownRecipient = ref('')
  const ownLabel = ref('')
  const identityState = ref<NotificationLoadState>('idle')
  const touched = ref(false)
  const error = ref('')
  const sentTo = ref('')
  const sentAt = ref('')
  let version = 0
  let identityVersion = 0
  const configId = computed(() => context.value?.config.id || '')
  const channelId = computed(() => context.value ? configChannelId(context.value.config) : '')
  const adapter = computed(() => channelTestAdapters[channelId.value])
  const fixedTarget = computed(() => fixedTestTarget(adapter.value?.recipient))
  const sending = computed(() => stage.value === 'sending')
  const recipient = computed(() => (recipientMode.value === 'self' ? ownRecipient.value : address.value).trim())
  const recipientIssue = computed(() => testRecipientIssue(adapter.value?.recipient, recipient.value))
  const missing = computed(() => context.value && adapter.value ? adapter.value.missing(context.value.config.configuration) : [])
  const canSend = computed(() => open.value && stage.value === 'form' && !!adapter.value && !missing.value.length && !recipientIssue.value
    && !!context.value?.permitted() && !!context.value.clean())
  const title = computed(() => t('messageNotification.channelTest.title', { channel: context.value?.channelName || '' }))
  const message = computed(() => t('messageNotification.channelTest.message', { system: context.value?.systemName || t('messageNotification.channelTest.system'), channel: context.value?.channelName || '' }))
  const settings = computed(() => readTestSettings(context.value?.config.configuration.testTemplate))
  const templateCode = computed(() => testText(settings.value.code || settings.value.templateCode || settings.value.wxTemplateId))
  const targetLabel = computed(() => fixedTarget.value ? t(`messageNotification.channelTest.${adapter.value?.recipient}`) : recipient.value)

  /** Bindings are scoped by both provider type and notifier ID; never reuse a different application binding. */
  async function loadIdentity() {
    const active = context.value
    if (!active || !open.value || !active.permitted() || sending.value || !adapter.value || fixedTarget.value) return
    const ticket = ++identityVersion
    const kind = adapter.value.recipient
    identityState.value = 'loading'; ownRecipient.value = ''; ownLabel.value = ''
    try {
      let value = ''; let label = ''
      if (kind === 'email') value = await api.getCurrentEmail()
      else if (kind === 'phone') value = await api.getCurrentPhone()
      else {
        const bindings = await api.getCurrentBindings()
        const type = `${notificationEnumValue(active.config.type)}_${notificationEnumValue(active.config.provider)}`
        const matches = bindings.filter(item => item.type === type && item.provider === active.config.id && testText(item.thirdPartyUserId))
        if (matches.length > 1) throw new Error('ambiguous-recipient')
        value = matches[0]?.thirdPartyUserId || ''; label = matches[0]?.providerName || ''
      }
      if (ticket !== identityVersion || context.value !== active || !open.value || !active.permitted()) return
      ownRecipient.value = value.trim(); ownLabel.value = label
      identityState.value = value.trim() ? 'ready' : 'empty'
      if (!value.trim() && recipientMode.value === 'self') recipientMode.value = 'other'
    } catch (failure) {
      if (ticket !== identityVersion || context.value !== active || !open.value || !active.permitted()) return
      identityState.value = classifyNotificationFailure(failure)
      if (recipientMode.value === 'self') recipientMode.value = 'other'
    }
  }
  function show(next: ChannelTestContext) {
    if (sending.value || !next.permitted() || !next.clean()) return
    close(true)
    context.value = { ...next, config: cloneNotificationValue(next.config) }
    open.value = true
    if (fixedTarget.value) identityState.value = 'ready'
    else void loadIdentity()
  }
  function selectRecipient(mode: 'self' | 'other') { if (stage.value === 'form') { recipientMode.value = mode; touched.value = false } }
  function setAddress(value: string) { if (stage.value === 'form') address.value = value }
  function validateRecipient() { touched.value = true }

  /** Only an explicit submit sends. Success means accepted, not confirmed delivery by the recipient. */
  async function send(): Promise<boolean> {
    touched.value = true
    const active = context.value
    if (!active || !canSend.value) return false
    const ticket = version
    const payload = buildChannelTest({ config: active.config, recipient: recipient.value, message: message.value, title: title.value })
    stage.value = 'sending'; error.value = ''; sentTo.value = targetLabel.value
    try {
      await api.sendInline(active.config.id, payload.template, payload.context)
      if (ticket !== version || context.value !== active || !active.permitted() || !active.clean()) return false
      stage.value = 'success'
      return true
    } catch (failure) {
      if (ticket !== version || context.value !== active || !active.permitted() || !active.clean()) return false
      error.value = notificationFailureMessage(failure) || t(`messageNotification.state.${classifyNotificationFailure(failure)}`)
      stage.value = 'error'
      return false
    } finally {
      if (ticket === version) {
        sentAt.value = new Date().toLocaleString()
        if (stage.value === 'sending') close(true)
      }
    }
  }
  function again() { if (!sending.value) { stage.value = 'form'; error.value = ''; sentTo.value = ''; sentAt.value = '' } }
  function close(force = false) {
    if (sending.value && !force) return
    ++version; ++identityVersion
    open.value = false; context.value = undefined; stage.value = 'form'; recipientMode.value = 'self'
    address.value = ''; ownRecipient.value = ''; ownLabel.value = ''; identityState.value = 'idle'
    touched.value = false; error.value = ''; sentTo.value = ''; sentAt.value = ''
  }
  const model = computed(() => ({
    open: open.value, title: title.value, message: message.value, supported: !!adapter.value,
    kind: adapter.value?.recipient, fixedTarget: fixedTarget.value, targetLabel: targetLabel.value,
    providerTemplate: !!adapter.value?.providerTemplate, templateCode: templateCode.value,
    parameters: Array.isArray(settings.value.parameters) ? settings.value.parameters.filter(row => row && typeof row.name === 'string' && typeof row.value === 'string') : [],
    missing: missing.value, stage: stage.value, error: error.value, canSend: canSend.value,
    recipientMode: recipientMode.value, address: address.value, ownRecipient: ownRecipient.value, ownLabel: ownLabel.value,
    identityState: identityState.value, recipientIssue: touched.value ? recipientIssue.value : '',
    sentTo: sentTo.value, sentAt: sentAt.value,
  }))
  return { model, open, configId, sending, show, loadIdentity, selectRecipient, setAddress, validateRecipient, send, again, close }
}
export type ChannelTestModel = ReturnType<typeof useChannelTest>['model']['value']
