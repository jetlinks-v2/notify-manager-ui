import { computed, ref, shallowRef } from 'vue'
import { messageNotificationApi, type MessageNotificationApi } from '../../../../api/notice/messageNotification'
import { classifyNotificationFailure, resolveNotificationChannel, withNotificationChannel, type NotificationChannel, type NotificationLoadState, type NotificationObject, type NotificationTemplate } from '../shared'
import { parseChannelSendVariables } from './channelSchema'

/** Email receiver and attachment variables come from EmailTemplate#getEmbeddedVariables. */
export function missingChannelSendParameters(template: NotificationTemplate, variables: NotificationObject): string[] {
  const missing = new Set<string>()
  const hasValue = (value: unknown) => value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)
  for (const variable of template.variableDefinitions ?? []) {
    if (variable.required && !hasValue(variables[variable.id])) missing.add(variable.id)
  }
  const validRecipients = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && /^[^\s@]+@[^\s@]+$/.test(item))
  if (!validRecipients(template.template.sendTo) && !validRecipients(variables.sendTo)) missing.add('sendTo')
  const attachments = template.template.attachments
  if (Array.isArray(attachments)) attachments.forEach((attachment: unknown, index) => {
    if (!attachment || typeof attachment !== 'object') return
    const item = attachment as Record<string, unknown>
    if (item.name && !item.location && !hasValue(variables[`_attach_location_${index + 1}`])) missing.add(`_attach_location_${index + 1}`)
  })
  return [...missing]
}

/** No send happens on open/selection; a confirmed submit requires actual persisted IDs and parameters. */
export function useChannelSend(api: MessageNotificationApi = messageNotificationApi) {
  const open = ref(false)
  const configId = ref('')
  const state = ref<NotificationLoadState>('idle')
  const templates = shallowRef<NotificationTemplate[]>([])
  const selected = shallowRef<NotificationTemplate>()
  const parameters = ref('{}')
  const sending = ref(false)
  const sent = ref(false)
  const error = ref('')
  let context: { channel: NotificationChannel; configId: string; permitted: () => boolean; clean: () => boolean } | undefined
  let version = 0
  const parsed = computed(() => parseChannelSendVariables(parameters.value))
  const invalidParameters = computed(() => parsed.value === undefined)
  const missing = computed(() => selected.value && parsed.value ? missingChannelSendParameters(selected.value, parsed.value) : [])
  const canSend = computed(() => state.value === 'ready' && !!selected.value && !!parsed.value && !missing.value.length && !sending.value && !!context?.permitted() && !!context.clean())

  /** Other providers remain disabled until their complete trial parameter contract is verified. */
  async function show(next: NonNullable<typeof context>) {
    if (sending.value) return
    context = next
    configId.value = next.configId
    open.value = true
    sent.value = false
    error.value = ''
    parameters.value = '{}'
    selected.value = undefined
    templates.value = []
    const ticket = ++version
    if (!next.permitted()) { state.value = 'forbidden'; return }
    if (next.channel.id !== 'email:embedded') { state.value = 'unavailable'; return }
    state.value = 'loading'
    try {
      const result = await api.queryTemplates(withNotificationChannel({ paging: false }, next.channel))
      if (ticket !== version || !open.value) return
      templates.value = result.data.filter(template => resolveNotificationChannel(template.type, template.provider)?.id === next.channel.id && (!template.configId || template.configId === next.configId))
      state.value = templates.value.length ? 'ready' : 'empty'
    } catch (failure) {
      if (ticket === version) state.value = classifyNotificationFailure(failure)
    }
  }

  /** Fetch the selected actual template before deriving variable requirements. */
  async function selectTemplate(id: string) {
    if (!context || sending.value || !templates.value.some(template => template.id === id)) return
    const ticket = ++version
    selected.value = undefined
    error.value = ''
    sent.value = false
    state.value = 'loading'
    try {
      const template = await api.getTemplate(id)
      if (ticket !== version || !open.value) return
      if (!template || template.id !== id || resolveNotificationChannel(template.type, template.provider)?.id !== context.channel.id || (template.configId && template.configId !== context.configId)) throw new Error('invalid-template')
      selected.value = template
      parameters.value = JSON.stringify(Object.fromEntries((template.variableDefinitions ?? []).filter(variable => variable.defaultValue !== undefined).map(variable => [variable.id, variable.defaultValue])), null, 2)
      state.value = 'ready'
    } catch (failure) {
      if (ticket === version) state.value = classifyNotificationFailure(failure)
    }
  }

  /** The API acknowledges submission; the UI does not claim that recipients received the message. */
  async function send(): Promise<boolean> {
    if (!context || !context.permitted() || !context.clean() || !canSend.value || !selected.value || !parsed.value) return false
    sending.value = true
    sent.value = false
    error.value = ''
    try {
      await api.send(context.configId, selected.value.id, parsed.value)
      sent.value = true
      return true
    } catch (failure) {
      error.value = classifyNotificationFailure(failure)
      return false
    } finally { sending.value = false }
  }

  /** Invalidate pending reads and clear recipient/context input when the drawer is dismissed. */
  function close() {
    if (sending.value) return
    ++version
    open.value = false
    parameters.value = '{}'
    selected.value = undefined
    templates.value = []
    context = undefined
    configId.value = ''
  }

  return { open, configId, state, templates, selected, parameters, invalidParameters, sending, sent, error, missing, canSend, show, selectTemplate, send, close }
}

export type ChannelSendWorkspace = ReturnType<typeof useChannelSend>
