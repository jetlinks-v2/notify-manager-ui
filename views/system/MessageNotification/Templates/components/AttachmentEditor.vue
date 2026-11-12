<template>
  <div class="template-attachments">
    <div class="template-attachments__actions">
      <FileUpload
        :value="files" :disabled="disabled" :size="10" :max-count="5"
        :btn-text="t('messageNotification.templates.uploadAttachment')"
        :before-upload="beforeUpload" @upload-change="uploadChanged" @remove="removeAttachment"
      />
      <a-button :disabled="disabled" @click="openVariable()"><template #icon><AIcon type="CodeOutlined" /></template>{{ t('messageNotification.templates.variableAttachment.useVariable') }}</a-button>
    </div>
    <div v-for="row in variableAttachments" :key="row.index" class="template-attachments__variable">
      <div class="template-attachments__reference">
        <span class="template-attachments__name">{{ row.item.name }}</span>
        <code>{{ row.item.location || t('messageNotification.templates.variableAttachment.runtimeSource') }}</code>
      </div>
      <div class="template-attachments__row-actions">
        <a-button type="link" size="small" :disabled="disabled" @click="openVariable(row.index)">{{ t('messageNotification.templates.variableAttachment.edit') }}</a-button>
        <a-button type="link" size="small" :disabled="disabled || !row.item.location" @click="insertAttachmentImage(row.index)">{{ t('messageNotification.templates.variableAttachment.insertBody') }}</a-button>
        <a-button type="text" size="small" danger :disabled="disabled" :aria-label="t('messageNotification.templates.variableAttachment.remove')" @click="removeVariableAttachment(row.index)"><template #icon><AIcon type="DeleteOutlined" /></template></a-button>
      </div>
    </div>
    <span class="template-attachments__hint">{{ t('messageNotification.templates.attachmentHint') }}</span>
    <a-alert v-if="error" type="error" show-icon :message="t(`messageNotification.templates.${error}`)" />
    <a-modal :open="modalOpen" :title="t('messageNotification.templates.variableAttachment.useVariable')" :ok-text="t('messageNotification.templates.variableAttachment.confirm')" :cancel-text="t('messageNotification.common.cancel')" :ok-button-props="{ disabled }" @ok="confirmVariable" @cancel="closeVariable">
      <a-form layout="vertical">
        <a-form-item :label="t('messageNotification.templates.variableAttachment.placement')">
          <a-radio-group v-model:value="placement" :disabled="disabled">
            <a-radio-button value="attachment">{{ t('messageNotification.templates.variableAttachment.asAttachment') }}</a-radio-button>
            <a-radio-button value="inline">{{ t('messageNotification.templates.variableAttachment.insertBody') }}</a-radio-button>
          </a-radio-group>
        </a-form-item>
        <a-form-item :label="t('messageNotification.templates.variableAttachment.variable')" required>
          <a-select v-model:value="variableSource" :options="variableOptions" :disabled="disabled" show-search option-filter-prop="label" :placeholder="t('messageNotification.templates.variableAttachment.selectVariable')" />
        </a-form-item>
        <a-form-item v-if="placement === 'attachment'" :label="t('messageNotification.templates.variableAttachment.filename')" required>
          <a-input v-model:value="filename" :disabled="disabled" :maxlength="255" :placeholder="t('messageNotification.templates.variableAttachment.filenameHint')" @press-enter="confirmVariable" />
        </a-form-item>
        <p class="template-attachments__hint">{{ t('messageNotification.templates.variableAttachment.' + (placement === 'inline' ? 'inlineHint' : 'attachmentHint')) }}</p>
        <a-alert v-if="modalError" type="error" show-icon :message="t('messageNotification.templates.variableAttachment.' + modalError)" />
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import FileUpload from '@jetlinks-web-core/components/Upload/File/index.vue'
import type { NotificationAttachment } from '../../shared'
import type { TemplateEditorController } from '../channelViewTypes'
import { useTemplateAttachments } from '../hooks/useTemplateAttachments'

const props = defineProps({
  attachments: { type: Array as PropType<NotificationAttachment[]>, default: () => [] },
  disabled: { type: Boolean, default: false },
  editor: { type: Object as PropType<TemplateEditorController>, required: true },
  insertInlineImage: { type: Function as PropType<(source: string) => boolean>, required: true },
})
const emit = defineEmits<{ (event: 'update:attachments', value: NotificationAttachment[]): void; (event: 'uploading', value: boolean): void }>()
const { t, error, files, beforeUpload, uploadChanged, removeAttachment, variableAttachments, variableOptions,
  modalOpen, modalError, placement, filename, variableSource, openVariable, closeVariable, confirmVariable, removeVariableAttachment, insertAttachmentImage } = useTemplateAttachments(props, emit)
</script>

<style scoped>
.template-attachments { display: flex; flex-direction: column; gap: var(--space-2); }
.template-attachments__actions { display: flex; align-items: flex-start; flex-wrap: wrap; gap: var(--space-2); }
.template-attachments__actions > :first-child { min-width: 0; flex: 1; }
.template-attachments__variable { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--line); border-radius: var(--r-2); }
.template-attachments__reference { min-width: 0; flex: 1; display: flex; flex-direction: column; overflow-wrap: anywhere; }
.template-attachments__reference code { color: var(--jet-theme-text-secondary); font-size: var(--fs-12); }
.template-attachments__name { color: var(--jet-theme-text); }
.template-attachments__row-actions { display: flex; align-items: center; flex-wrap: wrap; }
.template-attachments__hint { margin: 0; color: var(--text-color-secondary); font-size: var(--fs-12); }
</style>
