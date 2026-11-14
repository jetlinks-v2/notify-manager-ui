import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export interface ConfigurationPairsModel {
  value?: Record<string, string>[]
  kind: 'properties' | 'headers'
  disabled: boolean
  savedKeys: string[]
}

export function useConfigurationPairs(model: () => ConfigurationPairsModel, change: (value: Record<string, string>[]) => void) {
  const { t } = useI18n()
  const nameKey = computed(() => model().kind === 'properties' ? 'name' : 'key')
  const validShape = computed(() => model().value === undefined || (Array.isArray(model().value) && model().value!.every(row => !!row && typeof row === 'object')))
  const rows = computed(() => validShape.value ? model().value ?? [] : [])
  function update(index: number, key: string, value: string) {
    change(rows.value.map((row, position) => position === index ? { ...row, [key]: value } : row))
  }
  function remove(index: number) { change(rows.value.filter((_, position) => position !== index)) }
  function add() { change([...rows.value, { [nameKey.value]: '', value: '', ...(model().kind === 'properties' ? { description: '' } : {}) }]) }
  return { t, nameKey, validShape, rows, update, remove, add }
}
