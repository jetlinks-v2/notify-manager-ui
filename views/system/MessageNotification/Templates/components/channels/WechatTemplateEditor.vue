<template>
  <div class="wechat-template-editor">
    <template v-if="messageField">
      <a-form-item :label="t('messageNotification.templates.visual.title')">
        <a-input :value="title" :disabled="disabled" @update:value="changeTitle" @focus="captureTitleCaret" @click="captureTitleCaret" @keyup="captureTitleCaret" @input="captureTitleCaret" />
      </a-form-item>
      <a-form-item :label="t('messageNotification.templates.visual.description')" :required="messageField.required">
        <a-textarea :value="body" :rows="6" :disabled="disabled" @update:value="changeBody" @focus="captureBodyCaret" @click="captureBodyCaret" @keyup="captureBodyCaret" @input="captureBodyCaret" />
      </a-form-item>
    </template>
    <a-collapse v-if="advancedFields.length" ghost class="wechat-template-editor__advanced">
      <a-collapse-panel key="advanced" :header="t('messageNotification.templates.visual.advancedFields')">
        <a-form-item v-for="field in advancedFields" :key="field.key" :label="t(field.labelKey)" :required="field.required">
          <div @focusin="captureProviderCaret($event, field.path)" @click="captureProviderCaret($event, field.path)" @keyup="captureProviderCaret($event, field.path)" @input="captureProviderCaret($event, field.path)">
            <TemplateFieldRenderer :field="field" :value="fieldValue(field)" @update="changeField(field, $event)" @activate="activateProviderField" @load-options="loadRemoteOptions" />
          </div>
        </a-form-item>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { TemplateDraft } from '../../model'
import type { TemplateEditorController } from '../../channelViewTypes'
import { useTemplateMessageEditor } from '../../hooks/useTemplateMessageEditor'
import TemplateFieldRenderer from '../../../../../notice/template/components/TemplateFieldRenderer.vue'

const props = defineProps({
  draft: { type: Object as PropType<TemplateDraft>, required: true },
  editor: { type: Object as PropType<TemplateEditorController>, required: true },
  disabled: { type: Boolean, default: false },
})
const { t, fieldValue, changeField, captureProviderCaret, activateProviderField, loadRemoteOptions } = props.editor
const { title, body, messageField, advancedFields, changeTitle, changeBody, captureTitleCaret, captureBodyCaret } = useTemplateMessageEditor(props.editor)
</script>

<style scoped>
.wechat-template-editor { min-width: 0; }
.wechat-template-editor__advanced { border-top: 1px solid var(--line); }
</style>
