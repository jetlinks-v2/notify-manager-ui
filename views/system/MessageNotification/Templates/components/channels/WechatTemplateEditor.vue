<template>
  <div class="wechat-template-editor">
    <a-form-item v-for="field in advancedFields" :key="field.key" :label="t(field.labelKey)" :required="field.required">
      <div @focusin="captureProviderCaret($event, field.path)" @click="captureProviderCaret($event, field.path)" @keyup="captureProviderCaret($event, field.path)" @input="captureProviderCaret($event, field.path)">
        <TemplateProviderField :field="field" :editor="editor" />
      </div>
    </a-form-item>
    <template v-if="messageField">
      <a-form-item :label="t('messageNotification.templates.visual.title')">
        <TemplateVariableInput :value="title" :disabled="disabled" :aria-label="t('messageNotification.templates.visual.title')" @update:value="changeTitle" />
      </a-form-item>
      <a-form-item :label="t('messageNotification.templates.visual.description')" :required="messageField.required">
        <TemplateVariableInput :value="body" multiline :rows="6" :disabled="disabled" :aria-label="t('messageNotification.templates.visual.body')" @update:value="changeBody" />
      </a-form-item>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { TemplateDraft } from '../../model'
import type { TemplateEditorController } from '../../channelViewTypes'
import { useTemplateMessageEditor } from '../../hooks/useTemplateMessageEditor'
import TemplateVariableInput from '../../variables/TemplateVariableInput.vue'
import TemplateProviderField from '../../variables/TemplateProviderField.vue'

const props = defineProps({
  draft: { type: Object as PropType<TemplateDraft>, required: true },
  editor: { type: Object as PropType<TemplateEditorController>, required: true },
  disabled: { type: Boolean, default: false },
})
const { t, captureProviderCaret } = props.editor
const { title, body, messageField, advancedFields, changeTitle, changeBody } = useTemplateMessageEditor(props.editor)
</script>

<style scoped>
.wechat-template-editor { min-width: 0; }
</style>
