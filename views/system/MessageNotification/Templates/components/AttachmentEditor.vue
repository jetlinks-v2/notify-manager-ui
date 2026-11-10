<template>
  <div class="template-attachments">
    <FileUpload
      :value="files" :disabled="disabled" :size="10" :max-count="5"
      :btn-text="t('messageNotification.templates.uploadAttachment')"
      :before-upload="beforeUpload" @upload-change="uploadChanged" @remove="removeAttachment"
    />
    <span class="template-attachments__hint">{{ t('messageNotification.templates.attachmentHint') }}</span>
    <a-alert v-if="error" type="error" show-icon :message="t(`messageNotification.templates.${error}`)" />
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import FileUpload from '@jetlinks-web-core/components/Upload/File/index.vue'
import type { NotificationAttachment } from '../../shared'
import { useTemplateAttachments } from '../hooks/useTemplateAttachments'

const props = defineProps({
  attachments: { type: Array as PropType<NotificationAttachment[]>, default: () => [] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits<{ (event: 'update:attachments', value: NotificationAttachment[]): void; (event: 'uploading', value: boolean): void }>()
const { t, error, files, beforeUpload, uploadChanged, removeAttachment } = useTemplateAttachments(props, emit)
</script>

<style scoped>
.template-attachments { display: flex; flex-direction: column; gap: var(--space-2); }
.template-attachments__hint { color: var(--text-color-secondary); font-size: var(--fs-12); }
</style>
