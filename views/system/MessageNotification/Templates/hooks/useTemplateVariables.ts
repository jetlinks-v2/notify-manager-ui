import { computed, type ComputedRef } from 'vue'
import type { NotificationVariable } from '../../shared'
import type { TemplateDraft } from '../model'
import { usedTemplateVariables, variableTypeFormats, type TemplateVariableType } from '../variables/definitions'

export function useTemplateVariables(
  props: { draft: TemplateDraft; availableVariables?: NotificationVariable[]; disabled?: boolean },
  names: ComputedRef<ReadonlyMap<string, string>>,
) {
  const definitions = computed(() => usedTemplateVariables(props.draft, props.availableVariables ?? []))
  const usedVariables = computed(() => definitions.value.map(item => ({ ...item, name: names.value.get(item.id) || item.name })))

  /** 表格的名称跟随面板语言，只有用户修改的类型和格式写入当前草稿。 */
  function changeVariable(id: string, format: string, type?: TemplateVariableType) {
    const variable = definitions.value.find(item => item.id === id)
    if (props.disabled || !variable) return
    const nextType = type ?? variable.type
    if (variable.type === nextType && variable.format === format) return
    const updated = { ...variable, type: nextType, format }
    if (updated.expands && Object.hasOwn(updated.expands, 'format')) updated.expands = { ...updated.expands, format }
    const index = props.draft.variables.findIndex(item => item.id === id)
    if (index < 0) props.draft.variables.push(updated)
    else props.draft.variables.splice(index, 1, updated)
  }
  function changeVariableType(id: string, type: TemplateVariableType) {
    changeVariable(id, variableTypeFormats[type], type)
  }
  function changeVariableFormat(id: string, format: string) {
    changeVariable(id, format)
  }
  return { usedVariables, changeVariableType, changeVariableFormat }
}
