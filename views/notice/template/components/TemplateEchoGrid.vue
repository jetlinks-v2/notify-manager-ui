<template>
  <div class="template-echo-grid">
    <div
      v-for="field in visibleFields"
      :key="field.key"
      class="template-echo-grid__item"
    >
      <span>{{ $t(field.labelKey) }}</span>
      <j-ellipsis
        :line-clamp="3"
        :tooltip="{ placement: 'topLeft' }"
        class="template-echo-grid__value"
      >
        {{ formatFieldValue(field) }}
      </j-ellipsis>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  NoticeTemplateAttachment,
  NoticeTemplateEditorPayload,
  NoticeTemplateFieldSchema,
} from '../hooks/noticeTemplateFormModel'
import type { NoticeTemplateVariable } from '@notify-manager-ui/api/notice-center'
import { getByPath } from '../hooks/noticeTemplateFormModel'
import { findOptionByValue } from '../hooks/noticeTemplateRemoteOptions'
import { replaceTemplateVariablesWithNames } from '../hooks/useTemplatePreviewSegments'

const props = defineProps<{
  fields: NoticeTemplateFieldSchema[]
  form: NoticeTemplateEditorPayload
  variables: NoticeTemplateVariable[]
}>()

const { t: $t } = useI18n()

const getFieldValue = (field: NoticeTemplateFieldSchema) =>
  field.key === 'provider' ? props.form.provider : getByPath(props.form.template, field.path)

const getAttachments = (field: NoticeTemplateFieldSchema): NoticeTemplateAttachment[] => {
  const value = getFieldValue(field)
  return Array.isArray(value) ? value as NoticeTemplateAttachment[] : []
}

const visibleFields = computed(() =>
  props.fields.filter(field => field.kind !== 'attachments' || getAttachments(field).length),
)

const formatOptionValue = (field: NoticeTemplateFieldSchema, value: unknown) => {
  const option = findOptionByValue(field.options, value)
  return option?.labelKey ? $t(option.labelKey) : option?.label || String(value ?? '')
}

const formatFieldValue = (field: NoticeTemplateFieldSchema) => {
  const value = getFieldValue(field)
  if (field.kind === 'radio' || field.kind === 'select' || field.kind === 'remoteSelect' || field.kind === 'treeSelect') {
    return formatOptionValue(field, value)
  }
  if (field.kind === 'tags') {
    return Array.isArray(value) && value.length
      ? value.join(', ')
      : $t('NoticeCenter.template.empty.noContent')
  }
  if (field.kind === 'attachments') {
    const attachments = getAttachments(field)
    return attachments.length
      ? attachments.map(item => item.name || item.location).filter(Boolean).join(', ')
      : $t('NoticeCenter.template.empty.noContent')
  }
  if (value === undefined || value === null || value === '') {
    return $t('NoticeCenter.template.empty.noContent')
  }
  // 只读字段展示变量名称，不改动表单内保存的占位符。
  return replaceTemplateVariablesWithNames(String(value), props.variables)
}
</script>

<style scoped lang="less">
.template-echo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--space-3);
}

.template-echo-grid__item {
  display: flex;
  min-height: 4rem;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-1);
  border: 0.0625rem solid var(--line);
  border-radius: var(--r-2);
  background: var(--bg);
  padding: var(--space-3);

  span {
    color: var(--ink-4);
    font-size: var(--fs-12);
    line-height: 1.25rem;
  }
}

.template-echo-grid__value {
  min-width: 0;
  color: var(--ink-1);
  font-size: var(--fs-14);
  font-weight: 600;
  line-height: 1.5rem;
}
</style>
