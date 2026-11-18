<template>
  <div class="webhook-editor">
    <a-form-item v-if="modeField" :label="t(modeField.labelKey)">
      <TemplateFieldRenderer :field="modeField" :value="fieldValue(modeField)" @update="changeField(modeField, $event)" />
    </a-form-item>
    <a-alert v-if="contextAsBody" class="webhook-editor__context" type="info" :message="t('messageNotification.templates.presentation.contextBody')" />
    <a-form-item v-else-if="bodyField" :label="t('messageNotification.templates.presentation.requestBody')">
      <TemplateVariableInput :value="body" multiline :rows="20" :disabled="disabled" class="webhook-editor__body"
        :aria-label="t('messageNotification.templates.presentation.requestBody')" @update:value="changeBody" />
      <p class="webhook-editor__hint">{{ t('messageNotification.templates.visual.webhookJsonHint') }}</p>
    </a-form-item>
  </div>
</template>

<script setup lang="ts">
import TemplateVariableInput from '../../variables/TemplateVariableInput.vue'
import type { TemplateDraft } from '../../model'
import type { TemplateEditorController } from '../../channelViewTypes'
import { useWebhookTemplateEditorVisual } from '../../hooks/useWebhookTemplateVisual'
import TemplateFieldRenderer from '../../../../../notice/template/components/TemplateFieldRenderer.vue'

const props = defineProps<{ draft: TemplateDraft; editor: TemplateEditorController; disabled?: boolean }>()
const { t, fieldValue, changeField } = props.editor
const { modeField, bodyField, contextAsBody, body, changeBody } = useWebhookTemplateEditorVisual(props.editor)
</script>

<style scoped>
.webhook-editor { min-width: 0; }
.webhook-editor :deep(.ant-form-item) { margin-bottom: var(--space-4); }
.webhook-editor :deep(.ant-form-item-label > label) { color: var(--jet-theme-text-secondary); }
.webhook-editor__body { font-family: var(--font-family-mono, monospace); line-height: 1.75; tab-size: 2; }
.webhook-editor__hint { margin: var(--space-1) 0 0; color: var(--text-color-secondary); line-height: 1.6; }
.webhook-editor__context { background: var(--bg-sunken); border-color: var(--line); }
</style>
