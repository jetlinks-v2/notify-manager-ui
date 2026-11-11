<template>
  <div class="email-editor">
    <a-form-item>
      <template #label>
        <span class="email-editor__label"><span>{{ t('messageNotification.templates.visual.subject') }}</span><span class="email-editor__count">{{ draft.subject.length }} / 255</span></span>
      </template>
      <a-input v-model:value="draft.subject" :maxlength="255" :disabled="disabled" @focus="captureCaret($event, 'subject')" @click="captureCaret($event, 'subject')" @keyup="captureCaret($event, 'subject')" @input="captureCaret($event, 'subject')" />
    </a-form-item>
    <a-form-item>
      <template #label>
        <span class="email-editor__label"><span>{{ t('messageNotification.templates.visual.body') }}</span><span class="email-editor__count">{{ draft.text.length }} / 5120</span></span>
      </template>
      <a-textarea v-model:value="draft.text" :rows="13" :maxlength="5120" :disabled="disabled" @focus="captureCaret($event, 'text')" @click="captureCaret($event, 'text')" @keyup="captureCaret($event, 'text')" @input="captureCaret($event, 'text')" />
      <div class="email-editor__hint">{{ t('messageNotification.templates.visual.plainTextHint') }}</div>
    </a-form-item>
    <a-form-item :label="t('messageNotification.templates.attachments')">
      <AttachmentEditor v-model:attachments="draft.attachments" :disabled="disabled" @uploading="setUploading" />
    </a-form-item>
  </div>
</template>

<script setup lang="ts">
import type { TemplateDraft } from '../../model'
import type { TemplateEditorController } from '../../channelViewTypes'
import AttachmentEditor from '../AttachmentEditor.vue'

const props = defineProps<{ draft: TemplateDraft; editor: TemplateEditorController; disabled?: boolean }>()
const { t, captureCaret, setUploading } = props.editor
</script>

<style scoped>
.email-editor { min-width: 0; }
.email-editor :deep(.ant-form-item-label) { width: 100%; padding-bottom: var(--space-1); }
.email-editor :deep(.ant-form-item-label > label) { width: 100%; color: var(--jet-theme-text-secondary); font-size: var(--fs-12); }
.email-editor__label { display: flex; width: 100%; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
.email-editor__count { color: var(--text-color-secondary); font-size: var(--fs-12); font-weight: 400; }
.email-editor :deep(.ant-form-item) { margin-bottom: var(--space-4); }
.email-editor :deep(textarea) { line-height: 1.75; font-size: var(--fs-12); }
.email-editor__hint { margin-top: var(--space-1); color: var(--text-color-secondary); font-size: var(--fs-12); }
</style>
