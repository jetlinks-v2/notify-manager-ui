import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { readTestSettings, testSettingFields, type ChannelTestSettings } from './channelTestConfig'

/** Edit one nested test setting atomically through the existing inline form's change/commit contract. */
export function useChannelTestSettings(props: { channelId: string; value?: unknown; disabled?: boolean }, change: (value: ChannelTestSettings) => void) {
  const { t } = useI18n()
  const settings = computed(() => readTestSettings(props.value))
  const fields = computed(() => testSettingFields(props.channelId))
  const rows = computed(() => Array.isArray(settings.value.parameters) ? settings.value.parameters.filter(row => row && typeof row.name === 'string' && typeof row.value === 'string') : [])
  function update(key: string, value: unknown) {
    if (props.disabled) return
    change({ ...settings.value, [key]: value })
  }
  function updateParameter(index: number, key: 'name' | 'value', value: string) {
    update('parameters', rows.value.map((row, position) => position === index ? { ...row, [key]: value } : row))
  }
  function addParameter() { update('parameters', [...rows.value, { name: '', value: '' }]) }
  function removeParameter(index: number) { update('parameters', rows.value.filter((_row, position) => position !== index)) }
  return { t, settings, fields, rows, update, updateParameter, addParameter, removeParameter }
}
