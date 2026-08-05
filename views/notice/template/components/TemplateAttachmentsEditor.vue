<template>
  <div class="template-attachments-editor">
    <div
      v-for="(item, index) in model"
      :key="item.id || index"
      class="template-attachments-editor__item"
    >
      <a-input
        v-model:value="item.name"
        :placeholder="$t('NoticeCenter.template.placeholder.attachmentName')"
      >
        <template #addonAfter>
          <a-upload
            name="file"
            :custom-request="uploadCustomRequest"
            :showUploadList="false"
            @change="file => handleUpload(file, index)"
          >
            <AIcon type="UploadOutlined" />
          </a-upload>
        </template>
      </a-input>
      <a-button
        type="text"
        :title="$t('NoticeCenter.template.action.remove')"
        @click="removeAttachment(index)"
      >
        <template #icon>
          <AIcon type="DeleteOutlined" />
        </template>
      </a-button>
    </div>

    <a-button type="dashed" block @click="addAttachment">
      <template #icon>
        <AIcon type="UploadOutlined" />
      </template>
      {{ $t('NoticeCenter.template.action.addAttachment') }}
    </a-button>
  </div>
</template>

<script setup lang="ts">
import type { UploadChangeParam, UploadProps } from 'ant-design-vue'
import { createFileUploadCustomRequest } from '@jetlinks-web-core/components/Upload/utils'
import type { NoticeTemplateAttachment } from '../hooks/noticeTemplateFormModel'

const model = defineModel<NoticeTemplateAttachment[]>({ required: true })
const uploadCustomRequest: UploadProps['customRequest'] = createFileUploadCustomRequest()

const addAttachment = () => {
  model.value = [
    ...model.value,
    { id: String(Date.now() + Math.random()), name: '', location: '' },
  ]
}

const removeAttachment = (index: number) => {
  model.value = model.value.filter((_, currentIndex) => currentIndex !== index)
}

const handleUpload = (info: UploadChangeParam, index: number) => {
  if (info.file.status !== 'done') {
    return
  }
  const result = info.file.response?.result
  const location = result?.id || result?.accessUrl || result
  const next = [...model.value]
  next[index] = {
    ...next[index],
    name: info.file.name,
    location,
  }
  model.value = next
}
</script>

<style scoped lang="less">
.template-attachments-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.template-attachments-editor__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
}
</style>
