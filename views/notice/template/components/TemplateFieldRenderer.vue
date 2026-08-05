<template>
  <a-input
    v-if="field.kind === 'input'"
    :value="stringValue"
    :placeholder="placeholder"
    :disabled="field.disabled"
    :maxlength="field.maxLength"
    @update:value="emitUpdate"
    @focus="emitActivate"
  >
    <template v-if="field.copyable" #suffix>
      <a-button
        type="text"
        size="small"
        :title="$t('NoticeCenter.template.editor.insertVariable')"
        @click.stop="emitActivate"
      >
        <AIcon type="EditOutlined" />
      </a-button>
    </template>
  </a-input>

  <a-select
    v-else-if="field.kind === 'select'"
    :value="value"
    :placeholder="placeholder"
    :disabled="field.disabled"
    :loading="field.loading"
    :show-search="field.showSearch"
    :filter-option="filterOption"
    :not-found-content="field.loading ? $t('NoticeCenter.template.option.loading') : $t('NoticeCenter.template.option.empty')"
    @update:value="emitUpdate"
  >
    <a-select-option
      v-for="option in field.options"
      :key="String(option.value)"
      :value="option.value"
    >
      {{ option.labelKey ? $t(option.labelKey) : option.label }}
    </a-select-option>
  </a-select>

  <a-select
    v-else-if="field.kind === 'remoteSelect'"
    :value="value"
    :placeholder="placeholder"
    :disabled="field.disabled"
    :loading="field.loading"
    :show-search="true"
    :filter-option="false"
    :not-found-content="field.loading ? $t('NoticeCenter.template.option.loading') : $t('NoticeCenter.template.option.empty')"
    allow-clear
    @focus="() => emitLoadOptions('')"
    @search="emitLoadOptions"
    @update:value="emitUpdate"
  >
    <a-select-option
      v-for="option in field.options"
      :key="String(option.value)"
      :value="option.value"
    >
      {{ option.labelKey ? $t(option.labelKey) : option.label }}
    </a-select-option>
  </a-select>

  <a-tree-select
    v-else-if="field.kind === 'treeSelect'"
    :value="value"
    :tree-data="field.options"
    :field-names="{ label: 'label', value: 'value', children: 'children' }"
    :placeholder="placeholder"
    :disabled="field.disabled"
    :loading="field.loading"
    :not-found-content="field.loading ? $t('NoticeCenter.template.option.loading') : $t('NoticeCenter.template.option.empty')"
    show-search
    tree-default-expand-all
    allow-clear
    @update:value="emitUpdate"
  />

  <a-select
    v-else-if="field.kind === 'tags'"
    mode="tags"
    :value="arrayValue"
    :placeholder="placeholder"
    :disabled="field.disabled"
    @update:value="emitUpdate"
  />

  <a-input-number
    v-else-if="field.kind === 'number'"
    class="template-field-renderer__full"
    :value="numberValue"
    :placeholder="placeholder"
    :min="field.min"
    :max="field.max"
    :precision="0"
    :disabled="field.disabled"
    @update:value="emitUpdate"
  />

  <a-radio-group
    v-else-if="field.kind === 'radio'"
    :value="value"
    :disabled="field.disabled"
    @update:value="emitUpdate"
  >
    <a-radio
      v-for="option in field.options"
      :key="String(option.value)"
      :value="option.value"
    >
      {{ option.labelKey ? $t(option.labelKey) : option.label }}
    </a-radio>
  </a-radio-group>

  <!-- Avoid auto-size: Ant Design Vue may measure an unmounted textarea during field switches. -->
  <a-textarea
    v-else-if="field.kind === 'textarea'"
    :ref="el => emit('register-textarea', field, el)"
    :value="stringValue"
    class="template-field-renderer__textarea"
    :rows="field.rows || 5"
    :placeholder="placeholder"
    :disabled="field.disabled"
    @update:value="emitUpdate"
    @focus="emitActivate"
  />

  <TemplateAttachmentsEditor
    v-else-if="field.kind === 'attachments'"
    :model-value="attachmentsValue"
    @update:model-value="emitUpdate"
  />

  <div
    v-else-if="field.kind === 'monaco'"
    class="template-field-renderer__monaco"
    @focusin="emitActivate"
  >
    <MonacoEditor
      :modelValue="stringValue"
      theme="vs"
      language="javascript"
      :options="{ minimap: { enabled: false } }"
      @update:modelValue="emitUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateAttachmentsEditor from './TemplateAttachmentsEditor.vue'
import type {
  NoticeTemplateAttachment,
  NoticeTemplateFieldSchema,
} from '../hooks/noticeTemplateFormModel'

const props = defineProps<{
  field: NoticeTemplateFieldSchema
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update', value: unknown): void
  (e: 'activate', path: string[]): void
  (e: 'load-options', field: NoticeTemplateFieldSchema, keyword?: string): void
  (e: 'register-textarea', field: NoticeTemplateFieldSchema, element: unknown): void
}>()

const { t: $t } = useI18n()

const placeholder = computed(() =>
  props.field.placeholderKey ? $t(props.field.placeholderKey) : undefined,
)

const stringValue = computed(() =>
  props.value === undefined || props.value === null ? '' : String(props.value),
)

const numberValue = computed(() =>
  typeof props.value === 'number' ? props.value : undefined,
)

const arrayValue = computed(() =>
  Array.isArray(props.value) ? props.value : [],
)

const attachmentsValue = computed<NoticeTemplateAttachment[]>(() =>
  Array.isArray(props.value) ? props.value as NoticeTemplateAttachment[] : [],
)

const emitUpdate = (value: unknown) => {
  emit('update', value)
}

const emitActivate = () => {
  emit('activate', props.field.path)
}

const emitLoadOptions = (keyword?: string) => {
  emit('load-options', props.field, keyword)
}

const filterOption = (input: string, option: any) => {
  const value = option?.value
  const matched = props.field.options?.find(item => item.value === value)
  const label = matched?.labelKey ? $t(matched.labelKey) : matched?.label || value || ''
  return String(label).toLowerCase().includes(input.toLowerCase())
}
</script>

<style scoped lang="less">
.template-field-renderer__full {
  width: 100%;
}

.template-field-renderer__textarea {
  font-size: var(--fs-14);
}

.template-field-renderer__monaco {
  height: 25rem;
  overflow: hidden;
  border: 0.0625rem solid var(--line);
  border-radius: var(--r-2);
}
</style>
