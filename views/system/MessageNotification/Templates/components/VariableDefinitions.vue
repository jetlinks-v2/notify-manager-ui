<template>
  <div class="template-variables">
    <p class="template-variables__hint">{{ t('messageNotification.templates.variableHint') }}</p>
    <div v-for="(variable, index) in variables" :key="index" class="template-variables__row">
      <a-input :value="variable.id" :aria-label="t('messageNotification.templates.variableId')" :placeholder="t('messageNotification.templates.variableId')" :disabled="disabled" @update:value="setField(index, 'id', $event)" />
      <a-input :value="variable.name" :aria-label="t('messageNotification.templates.variableName')" :placeholder="t('messageNotification.templates.variableName')" :disabled="disabled" @update:value="setField(index, 'name', $event)" />
      <a-input :value="variable.defaultValue" :aria-label="t('messageNotification.templates.variableDefault')" :placeholder="t('messageNotification.templates.variableDefault')" :disabled="disabled" @update:value="setField(index, 'defaultValue', $event)" />
      <a-checkbox :checked="variable.required" :disabled="disabled" @update:checked="setField(index, 'required', $event)">{{ t('messageNotification.templates.required') }}</a-checkbox>
      <a-button type="text" danger :disabled="disabled" :aria-label="t('messageNotification.templates.removeVariable')" @click="removeVariable(index)"><AIcon type="DeleteOutlined" /></a-button>
    </div>
    <a-button :disabled="disabled" @click="addVariable"><AIcon type="PlusOutlined" />{{ t('messageNotification.templates.addVariable') }}</a-button>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { NotificationVariable } from '../../shared'
import { useTemplateVariables } from '../hooks/useTemplateVariables'

const props = defineProps({
  variables: { type: Array as PropType<NotificationVariable[]>, default: () => [] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits<{ (event: 'update:variables', value: NotificationVariable[]): void }>()
const { t, setField, removeVariable, addVariable } = useTemplateVariables(props, emit)
</script>

<style scoped>
.template-variables { display: flex; flex-direction: column; gap: var(--space-3); }
.template-variables__hint { margin: 0; color: var(--text-color-secondary); }
.template-variables__row { display: grid; grid-template-columns: 1fr 1fr 1fr auto auto; align-items: center; gap: var(--space-2); }
@media (max-width: 768px) { .template-variables__row { grid-template-columns: 1fr 1fr; } }
</style>
