<template>
  <span><template v-for="(part, index) in parts" :key="index"><span v-if="part.token" class="template-variable-token" :title="part.token">{{ part.label }}</span><template v-else>{{ part.label }}</template></template></span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTemplateVariableEditing } from './catalog'
import { variableLabel } from './quillVariables'
import './variableTokens.css'

const props = defineProps({ value: { type: String, default: '' } })
const context = useTemplateVariableEditing()
const parts = computed(() => {
  const result: { token?: string; label: string }[] = []
  let offset = 0
  for (const match of props.value.matchAll(/\$\{[^{}]+\}/g)) {
    result.push({ label: props.value.slice(offset, match.index) }, { token: match[0], label: variableLabel(match[0], context?.names.value ?? new Map()) })
    offset = match.index + match[0].length
  }
  result.push({ label: props.value.slice(offset) })
  return result
})
</script>
