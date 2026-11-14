import { useI18n } from 'vue-i18n'
import type { NotificationVariable } from '../../shared'

type VariableField = 'id' | 'name' | 'defaultValue' | 'required'

export function useTemplateVariables(
  props: { variables: NotificationVariable[] },
  emit: (event: 'update:variables', value: NotificationVariable[]) => void,
) {
  const { t } = useI18n()
  /** Keep type, format and provider metadata when a visible field changes. */
  function setField(index: number, field: VariableField, value: string | boolean) {
    emit('update:variables', props.variables.map((variable, position) => position === index ? { ...variable, [field]: value } : variable))
  }
  function removeVariable(index: number) { emit('update:variables', props.variables.filter((_, position) => position !== index)) }
  function addVariable() { emit('update:variables', [...props.variables, { id: '', name: '', type: 'string', required: false }]) }

  return { t, setField, removeVariable, addVariable }
}
