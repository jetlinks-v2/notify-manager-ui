import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { notificationSecretMask } from '../shared'
import { channelConfigFields } from './channelSchema'
import type { ChannelDraftEntry } from './useChannelWorkspace'
import type { ConfigurationPairsModel } from './useConfigurationPairs'

export interface ChannelConfigurationProps {
  entry: ChannelDraftEntry
  disabled: boolean
}

export function useChannelConfiguration(props: ChannelConfigurationProps) {
  const { t } = useI18n()
  const fields = computed(() => channelConfigFields[`${props.entry.draft.type}:${props.entry.draft.provider}`] ?? [])
  const pairKind = computed(() => props.entry.draft.type === 'email' ? 'properties' : props.entry.draft.type === 'webhook' ? 'headers' : undefined)
  const savedHeaderKeys = computed(() => {
    const rows = props.entry.baseline?.configuration.headers
    return Array.isArray(rows) ? rows.filter(row => row && typeof row.key === 'string').map(row => row.key.toLowerCase()) : []
  })
  const pairEditor = computed<ConfigurationPairsModel | undefined>(() => pairKind.value ? {
    kind: pairKind.value,
    value: props.entry.draft.configuration[pairKind.value] as Record<string, string>[] | undefined,
    savedKeys: savedHeaderKeys.value,
    disabled: props.disabled,
  } : undefined)

  function stringValue(key: string): string { return typeof props.entry.draft.configuration[key] === 'string' ? props.entry.draft.configuration[key] as string : '' }
  function numberValue(key: string): number | undefined { return typeof props.entry.draft.configuration[key] === 'number' ? props.entry.draft.configuration[key] as number : undefined }
  function issue(path: string): string | undefined {
    const value = props.entry.issues.find(item => item.path === path)
    return value ? t(`messageNotification.channels.validation.${value.key}`) : undefined
  }
  function enterInlineEdit(event: KeyboardEvent) {
    if (props.disabled) return
    event.preventDefault()
    const target = event.target as HTMLElement | null
    if (target?.tagName === 'INPUT') target.blur()
    else (event.currentTarget as HTMLElement | null)?.click()
  }

  return { t, notificationSecretMask, fields, pairKind, pairEditor, stringValue, numberValue, issue, enterInlineEdit }
}
