<template>
  <div class="sms-editor">
    <a-alert class="sms-editor__notice" type="info" :message="t('messageNotification.templates.visual.smsApprovalHint')" />
    <a-form-item v-for="field in advancedFields" :key="field.key" :label="t(field.labelKey)" :required="field.required">
      <TemplateProviderField :field="field" :editor="editor" />
    </a-form-item>
    <a-form-item v-for="field in mainFields" :key="field.key" :label="field.key === 'code' ? t('messageNotification.templates.visual.supplierTemplateCode') : field.key === 'message' ? t('messageNotification.templates.visual.approvedContent') : t(field.labelKey)" :required="field.required">
      <TemplateProviderField :field="field" :editor="editor" />
      <p v-if="field.key === 'message'" class="sms-editor__hint">{{ t('messageNotification.templates.visual.smsApprovedContentHint') }}</p>
    </a-form-item>
  </div>
</template>

<script setup lang="ts">
import type { TemplateDraft } from '../../model'
import type { TemplateEditorController } from '../../channelViewTypes'
import { useSmsTemplateEditorVisual } from '../../hooks/useSmsTemplateVisual'
import TemplateProviderField from '../../variables/TemplateProviderField.vue'

const props = defineProps<{ draft: TemplateDraft; editor: TemplateEditorController; disabled?: boolean }>()
const { t } = props.editor
const { mainFields, advancedFields } = useSmsTemplateEditorVisual(props.editor)
</script>

<style scoped>
.sms-editor { min-width: 0; }
.sms-editor__notice { margin-bottom: var(--space-4); background: var(--bg-sunken); border-color: var(--line); color: var(--jet-theme-text-secondary); }
.sms-editor :deep(.ant-form-item) { margin-bottom: var(--space-4); }
.sms-editor :deep(.ant-form-item-label > label) { color: var(--jet-theme-text-secondary); }
.sms-editor :deep(textarea) { color: var(--text-color); line-height: 1.75; }
.sms-editor__hint { margin: var(--space-1) 0 0; color: var(--text-color-secondary); line-height: 1.6; }
</style>
