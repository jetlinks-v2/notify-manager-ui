<template>
  <TemplateFieldRenderer :field="field" :value="editor.fieldValue(field)" @update="editor.changeField(field, $event)"
    @activate="editor.activateProviderField" @load-options="editor.loadRemoteOptions">
    <template #text-input="input">
      <TemplateVariableInput :value="input.value" :placeholder="input.placeholder" :aria-label="editor.t(field.labelKey)"
        :disabled="field.disabled" :maxlength="field.maxLength" :multiline="field.kind !== 'input'" :rows="field.rows || 5"
        @update:value="editor.changeField(field, $event)" />
    </template>
  </TemplateFieldRenderer>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { TemplateEditorController } from '../channelViewTypes'
import type { NoticeTemplateFieldSchema } from '../../../../notice/template/hooks/noticeTemplateFormModel'
import TemplateFieldRenderer from '../../../../notice/template/components/TemplateFieldRenderer.vue'
import TemplateVariableInput from './TemplateVariableInput.vue'

defineProps({
  field: { type: Object as PropType<NoticeTemplateFieldSchema>, required: true },
  editor: { type: Object as PropType<TemplateEditorController>, required: true },
})
</script>
