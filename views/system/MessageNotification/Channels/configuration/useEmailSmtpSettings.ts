import { computed, ref, watch, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChannelConfigurationProps } from '../useChannelConfiguration'
import { emailEncryption, emailEncryptionChanges, emailEncryptionProperties, type EmailEncryption } from './emailSettings'
import { emailBrandDefaults, emailBrandForHost, emailBrands, emailSmtpEndpoints, findEmailSmtpEndpoint, type EmailBrand, type EmailSmtpEndpoint } from './emailSmtpCatalog'

/** SMTP controls edit the current workspace draft; loading and brand recognition never apply defaults. */
export function useEmailSmtpSettings(props: ChannelConfigurationProps, enabled: ComputedRef<boolean>, change?: (key: string, value: unknown) => void) {
  const { t } = useI18n()
  const explicitBrand = ref<EmailBrand>()
  const editing = computed(() => props.entry.isNew || !!props.entry.editing)
  const locked = computed(() => props.disabled || props.busy || !editing.value || !enabled.value)
  watch([() => props.entry.key, editing], () => { explicitBrand.value = undefined }, { flush: 'sync' })
  const preset = computed(() => explicitBrand.value || emailBrandForHost(props.entry.draft.configuration.host))
  const presetOptions = computed(() => emailBrands.map(value => ({ value, label: t(`messageNotification.channels.email.presets.${value}`) })))
  const endpoints = computed(() => emailSmtpEndpoints.filter(endpoint => endpoint.brand === preset.value))
  const smtpOptions = computed(() => endpoints.value.map(endpoint => ({ value: endpoint.host, label: `${t(endpoint.labelKey)} · ${endpoint.host}` })))
  const smtpHint = computed(() => {
    const endpoint = findEmailSmtpEndpoint(props.entry.draft.configuration.host)
    return endpoint?.hintKey ? t(endpoint.hintKey) : t(`messageNotification.channels.email.${preset.value === 'other' ? 'customHostHint' : 'hostHint'}`)
  })
  const encryption = computed(() => emailEncryption(props.entry.draft.configuration))
  const encryptionOptions = computed(() => ['ssl', 'starttls', 'none'].map(value => ({ value, label: t(`messageNotification.channels.email.encryption.${value}`) })))

  function applyEndpoint(endpoint: EmailSmtpEndpoint) {
    change?.('host', endpoint.host)
    change?.('port', endpoint.port)
    change?.('properties', emailEncryptionProperties(props.entry.draft.configuration, endpoint.encryption))
  }
  function setPreset(id: string) {
    const brand = emailBrands.find(value => value === id)
    if (locked.value || !brand) return
    explicitBrand.value = brand
    // "Other" retains the input, including a known brand address, but never adds it to suggestions.
    if (brand === 'other' || emailBrandForHost(props.entry.draft.configuration.host) === brand) return
    const endpoint = findEmailSmtpEndpoint(emailBrandDefaults[brand])
    if (endpoint) applyEndpoint(endpoint)
  }
  function selectSmtpHost(value: unknown) {
    if (locked.value || typeof value !== 'string') return
    const endpoint = endpoints.value.find(item => item.host === value)
    if (endpoint) applyEndpoint(endpoint)
  }
  function setSmtpHost(value: unknown) {
    if (locked.value || typeof value !== 'string') return
    // AutoComplete typing must not reset an intentionally chosen custom port or encryption mode.
    if (preset.value === 'other') {
      explicitBrand.value = 'other'
      change?.('host', value)
    } else selectSmtpHost(value)
  }
  function setEncryption(value: unknown) {
    if (locked.value || !['ssl', 'starttls', 'none'].includes(String(value))) return
    for (const [key, next] of Object.entries(emailEncryptionChanges(props.entry.draft.configuration, value as EmailEncryption))) change?.(key, next)
  }
  function filterSmtpOption(input: string, option?: { label?: unknown; value?: unknown }): boolean {
    return `${option?.label ?? ''} ${option?.value ?? ''}`.toLowerCase().includes(input.trim().toLowerCase())
  }
  return { preset, presetOptions, smtpOptions, smtpHint, encryption, encryptionOptions, setPreset, setSmtpHost, selectSmtpHost, setEncryption, filterSmtpOption }
}
