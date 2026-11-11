import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { notificationSecretMask, cloneNotificationValue, type NotifierConfigPayload } from '../shared'
import type { InlineEditFieldDefinition, InlineEditGroup, InlineEditMessages, InlineEditResult } from '@jetlinks-web-core/components/InlineEditForm'
import { channelConfigFields, type ChannelField } from './channelSchema'
import type { ChannelDraftEntry, ChannelFieldChange } from './useChannelWorkspace'
import type { ConfigurationPairsModel } from './useConfigurationPairs'
import { propertyRules } from './configuration/channelMetadata'
import { emailEncryption, emailEncryptionChanges, emailEncryptionProperties, emailPresets, type EmailEncryption } from './configuration/emailSettings'

export interface ChannelConfigurationProps {
  entry: ChannelDraftEntry
  disabled: boolean
  submit?: (changes: ChannelFieldChange[], errorPath: string) => Promise<boolean>
}

/** Adapt metadata into controls and semantic groups, keeping all draft writes in the workspace. */
export function useChannelConfiguration(props: ChannelConfigurationProps, change?: (key: string, value: unknown, topLevel?: boolean) => void, editField?: (key: string) => void) {
  const { t } = useI18n()
  const fields = computed(() => props.entry.definition?.fields ?? channelConfigFields[`${props.entry.draft.type}:${props.entry.draft.provider}`] ?? [])
  const groups = computed(() => [...new Set(fields.value.map(field => field.group || 'configuration'))].map(key => ({
    key, fields: fields.value.filter(field => (field.group || 'configuration') === key),
  })))
  const pairKind = computed(() => props.entry.draft.type === 'email' && props.entry.draft.provider === 'embedded' && fields.value.some(field => field.key === 'properties') ? 'properties' : props.entry.draft.type === 'webhook' && props.entry.draft.provider === 'http' && fields.value.some(field => field.key === 'headers') ? 'headers' : undefined)
  const savedHeaderKeys = computed(() => {
    const rows = props.entry.baseline?.configuration.headers
    return Array.isArray(rows) ? rows.filter(row => row && typeof row.key === 'string').map(row => row.key.toLowerCase()) : []
  })
  const emailOptionsVisible = computed(() => props.entry.draft.type === 'email' && props.entry.draft.provider === 'embedded' && ['host', 'port', 'properties'].every(key => fields.value.some(field => field.key === key)))
  const encryption = computed(() => emailEncryption(props.entry.draft.configuration))
  const customPreset = ref(false)
  watch(() => props.entry.key, () => { customPreset.value = false })
  const preset = computed(() => customPreset.value ? 'other' : emailPresets.find(item => item.host === props.entry.draft.configuration.host)?.id || 'other')
  const presetOptions = computed(() => [...emailPresets.map(item => ({ value: item.id, label: t(`messageNotification.channels.email.presets.${item.id}`) })), { value: 'other', label: t('messageNotification.channels.email.presets.other') }])
  const encryptionOptions = computed(() => ['ssl', 'starttls', 'none'].map(value => ({ value, label: t(`messageNotification.channels.email.encryption.${value}`) })))

  function issue(path: string): string | undefined {
    const value = props.entry.issues.find(item => item.path === path)
    return value ? t(`messageNotification.channels.validation.${value.key}`) : undefined
  }
  function label(field: ChannelField): string {
    const known = channelConfigFields[`${props.entry.draft.type}:${props.entry.draft.provider}`]
    const key = `messageNotification.channels.fields.${field.key}`
    return known && (known.some(item => item.key === field.key) || ['properties', 'headers'].includes(field.key)) ? t(key) : field.property?.name || field.key
  }
  function hint(field: ChannelField): string | undefined {
    const key = `messageNotification.channels.hints.${props.entry.draft.type}.${field.key}`
    return props.entry.draft.type === 'email' && props.entry.draft.provider === 'embedded' && ['host', 'username', 'password', 'sender'].includes(field.key) ? t(key) : field.property?.description
  }
  function fieldType(field: ChannelField) { return field.options?.length ? 'enum' : field.property?.valueType.type || (field.kind === 'number' ? 'int' : 'string') }
  function numberBounds(field: ChannelField) {
    const smtpPort = props.entry.draft.type === 'email' && props.entry.draft.provider === 'embedded' && field.key === 'port'
    return { min: field.property?.valueType.min ?? (smtpPort ? 1 : undefined), max: field.property?.valueType.max ?? (smtpPort ? 65535 : undefined) }
  }
  function rawSelectOptions(field: ChannelField) {
    // Known provider options restore localized selectors even when metadata declares a string.
    if (field.options?.length) return field.options.map(item => ({ value: item.value, label: item.label ? t(item.label) : item.text || String(item.value) }))
    const type = field.property?.valueType
    if (type?.type === 'boolean') return [{ value: type.trueValue ?? true, label: type.trueText || t('messageNotification.channels.boolean.true') }, { value: type.falseValue ?? false, label: type.falseText || t('messageNotification.channels.boolean.false') }]
    return type?.elements?.map(item => ({ value: item.value, label: item.text || item.label || String(item.value) })) || []
  }
  // Ant Select accepts string/number option values; indices preserve backend booleans and numeric enums.
  function selectOptions(field: ChannelField) { return rawSelectOptions(field).map((item, index) => ({ label: item.label, value: index })) }
  function selectedValue(field: ChannelField): number | undefined {
    const index = rawSelectOptions(field).findIndex(item => item.value === props.entry.draft.configuration[field.key])
    return index === -1 ? undefined : index
  }
  function setSelectedValue(field: ChannelField, index: unknown) {
    if (!props.disabled) change?.(field.key, typeof index === 'number' ? rawSelectOptions(field)[index]?.value : undefined)
  }
  function maxLength(field: ChannelField): number | undefined {
    const value = propertyRules(field.property).maxLength
    return typeof value === 'number' ? value : undefined
  }
  /** Transport presets update only the displayed SMTP fields and encryption properties. */
  function setEncryption(value: unknown) {
    if (!props.disabled && emailOptionsVisible.value && ['ssl', 'starttls', 'none'].includes(String(value))) {
      for (const [key, next] of Object.entries(emailEncryptionChanges(props.entry.draft.configuration, value as EmailEncryption))) change?.(key, next)
    }
  }
  function setPreset(id: string) {
    if (props.disabled || !emailOptionsVisible.value) return
    customPreset.value = id === 'other'
    const selected = emailPresets.find(item => item.id === id)
    if (!selected) return
    change?.('host', selected.host); change?.('port', selected.port)
    change?.('properties', emailEncryptionProperties(props.entry.draft.configuration, selected.encryption))
  }

  const initial = computed<NotifierConfigPayload>(() => JSON.parse(props.entry.snapshot))
  const formMessages = computed<InlineEditMessages>(() => ({
    save: t('messageNotification.common.save'), cancel: t('messageNotification.common.cancel'),
    empty: t('messageNotification.channels.notFilled'), saving: t('messageNotification.channels.savingField'), failed: t('messageNotification.state.error'),
  }))
  function fieldError(key: string) {
    const failure = props.entry.fieldFailures?.[key]
    return issue(key) || (failure ? t(`messageNotification.state.${failure}`) : undefined)
  }
  function metadataField(key: string) { return fields.value.find(field => `config:${field.key}` === key) }
  function mappedField(field: ChannelField): InlineEditFieldDefinition {
    const type = fieldType(field)
    const saved = initial.value.configuration[field.key]
    const value = props.entry.draft.configuration[field.key]
    const isSelect = ['boolean', 'enum'].includes(type)
    const pairs = pairKind.value === field.key
    const editor = field.kind === 'secret' ? 'password' : pairs || ['array', 'object', 'date', 'time'].includes(type) ? 'custom'
      : isSelect ? 'select' : ['int', 'long', 'float', 'double'].includes(type) ? 'number' : 'text'
    const pairDisplay = pairs && Array.isArray(saved) ? saved.map(row => `${row[pairKind.value === 'headers' ? 'key' : 'name']}: ${pairKind.value === 'headers' ? notificationSecretMask : row.value}`).join('\n') : undefined
    return {
      key: `config:${field.key}`, label: label(field), editor, required: field.required,
      value: isSelect ? selectedValue(field) : value,
      initialValue: isSelect ? (() => { const index = rawSelectOptions(field).findIndex(option => option.value === saved); return index < 0 ? undefined : index })() : saved,
      displayValue: pairDisplay, options: isSelect ? selectOptions(field) : undefined,
      secretSet: !!props.entry.baseline?.configuration[field.key],
      placeholder: field.kind === 'secret' ? t(props.entry.baseline ? 'messageNotification.channels.keepSecret' : 'messageNotification.channels.enterSecret') : undefined,
      hint: hint(field), error: fieldError(field.key), fullWidth: !['port', 'password', 'sender'].includes(field.key),
      ...numberBounds(field), precision: ['int', 'long'].includes(type) ? 0 : field.property?.valueType.scale, maxLength: maxLength(field),
    }
  }
  const formGroups = computed<InlineEditGroup[]>(() => {
    const result = groups.value.map(group => {
      const mapped = group.fields.flatMap(field => {
        const items = [mappedField(field)]
        if (emailOptionsVisible.value && field.key === 'port') items.push({ key: 'email:encryption', label: t('messageNotification.channels.email.encryptionTitle'),
          value: encryption.value, initialValue: emailEncryption(initial.value.configuration), editor: 'select', options: encryptionOptions.value,
          hint: t('messageNotification.channels.email.encryptionHint'), error: fieldError('email:encryption') } as InlineEditFieldDefinition)
        return items
      })
      if (emailOptionsVisible.value && group.key === 'server') mapped.unshift({ key: 'email:preset', label: t('messageNotification.channels.email.preset'),
        value: preset.value, initialValue: emailPresets.find(item => item.host === initial.value.configuration.host)?.id || 'other', editor: 'select',
        options: presetOptions.value, hint: t('messageNotification.channels.email.presetHint'), fullWidth: true, error: fieldError('email:preset') })
      return { key: group.key, title: t(`messageNotification.channels.groups.${group.key}`), fields: mapped }
    })
    return result
  })

  /** Translate the public form's field keys into business-owned drafts; option indices never reach the API. */
  function changeValue(key: string, value: unknown) {
    if (key === 'email:preset') setPreset(String(value))
    else if (key === 'email:encryption') setEncryption(value)
    else {
      const field = metadataField(key)
      if (!field) return
      if (['boolean', 'enum'].includes(fieldType(field))) setSelectedValue(field, value)
      else change?.(field.key, value)
    }
  }
  /** Restore the entire coupled email choice on cancellation, including custom transport settings. */
  function cancelValue(key: string) {
    if (key === 'email:preset') customPreset.value = false
    const keys = key === 'email:preset' ? ['host', 'port', 'properties'] : key === 'email:encryption' ? ['port', 'properties'] : []
    for (const path of keys) change?.(path, initial.value.configuration[path] === undefined ? undefined : cloneNotificationValue(initial.value.configuration[path]))
    if (props.entry.fieldFailures) delete props.entry.fieldFailures[key.startsWith('config:') ? key.slice(7) : key]
  }
  /** Submit one logical operation; presets and encryption intentionally couple multiple backend fields. */
  async function submitValue(key: string, value: unknown): Promise<InlineEditResult> {
    if (!props.submit) return { ok: false }
    let changes: ChannelFieldChange[]
    let errorPath = key
    if (key === 'email:preset') {
      const selected = emailPresets.find(item => item.id === value)
      // "Other" selects manual entry; it cannot change the saved provider without a new host.
      if (!selected) {
        customPreset.value = false
        editField?.('config:host')
        return { ok: true }
      }
      changes = Object.entries({ host: selected.host, port: selected.port, properties: emailEncryptionProperties(initial.value.configuration, selected.encryption) }).map(([key, value]) => ({ key, value }))
    } else if (key === 'email:encryption') {
      if (!['ssl', 'starttls', 'none'].includes(String(value))) return { ok: false, error: t('messageNotification.channels.validation.required') }
      changes = Object.entries(emailEncryptionChanges(initial.value.configuration, value as EmailEncryption)).map(([key, value]) => ({ key, value }))
    } else {
      const field = metadataField(key)
      if (!field) return { ok: false }
      errorPath = field.key
      changes = [{ key: field.key, value: ['boolean', 'enum'].includes(fieldType(field)) && typeof value === 'number' ? rawSelectOptions(field)[value]?.value : value }]
    }
    const ok = await props.submit(changes, errorPath)
    const validation = props.entry.issues[0]
    return { ok, error: ok ? undefined : fieldError(errorPath) || (validation ? `${label(fields.value.find(field => field.key === validation.path) || { key: validation.path })}: ${issue(validation.path)}` : t('messageNotification.state.error')) }
  }
  function customPairModel(key: string, value: unknown, disabled: boolean): ConfigurationPairsModel | undefined {
    return key === `config:${pairKind.value}` && pairKind.value ? { kind: pairKind.value, value: value as Record<string, string>[] | undefined, disabled, savedKeys: savedHeaderKeys.value } : undefined
  }
  return { t, numberBounds, selectedValue, setSelectedValue, preset, setPreset,
    formGroups, formMessages, changeValue, cancelValue, submitValue, metadataField, customPairModel }
}
