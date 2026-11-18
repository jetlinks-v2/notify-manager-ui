<template>
  <div class="template-variable-input" :class="{ 'template-variable-input--disabled': disabled || readonly, 'template-variable-input--multiline': multiline }"
    :aria-busy="loading" :style="{ '--template-input-rows': rows }">
    <div ref="editorElement" class="template-variable-input__editor" />
    <span v-if="loading" class="template-variable-input__loading">{{ t('messageNotification.common.loading') }}</span>
    <span v-if="limitReached" class="template-variable-input__limit" role="status">{{ t('messageNotification.templates.variableLimit', { max: maxlength }) }}</span>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import 'quill/dist/quill.core.css'
import './variableTokens.css'
import type { TemplateCustomCaret } from '../hooks/useTemplateEditor'
import { useTemplateVariableInput } from './useTemplateVariableInput'

const props = defineProps({
  value: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  multiline: { type: Boolean, default: false },
  rows: { type: Number, default: 5 },
  maxlength: { type: Number, default: undefined },
  placeholder: { type: String, default: undefined },
  ariaLabel: { type: String, default: undefined },
})
const emit = defineEmits<{
  (event: 'update:value', value: string): void
  (event: 'caret', value: TemplateCustomCaret): void
  (event: 'focus' | 'pressEnter' | 'escape'): void
}>()
const { t } = useI18n()
const { editorElement, instance, loading, limitReached } = useTemplateVariableInput(props, emit)
defineExpose({ instance })
</script>

<style scoped>
.template-variable-input { position: relative; width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: var(--r-2); background: var(--jet-theme-bg-container); }
.template-variable-input:focus-within { border-color: var(--jet-theme-primary); }
.template-variable-input__editor { font: inherit; }
.template-variable-input__editor :deep(.ql-editor) { padding: var(--space-1) var(--space-3); min-height: 2rem; outline: none; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.75; color: var(--jet-theme-text); }
.template-variable-input__editor :deep(.ql-editor.ql-blank::before) { left: var(--space-3); right: var(--space-3); font-style: normal; color: var(--text-color-disabled); }
.template-variable-input--multiline :deep(.ql-editor) { min-height: calc(var(--template-input-rows) * 1.75em + var(--space-2)); max-height: 35rem; overflow-y: auto; }
.template-variable-input--disabled { background: var(--jet-theme-bg-layout); cursor: not-allowed; }
.template-variable-input--disabled :deep(.ql-editor) { cursor: not-allowed; }
.template-variable-input__loading { display: block; padding: var(--space-1) var(--space-3); color: var(--text-color-secondary); }
.template-variable-input__limit { display: block; padding: var(--space-1) var(--space-3); color: var(--jet-theme-error); }
</style>
