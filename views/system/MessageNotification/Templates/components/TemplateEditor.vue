<template>
  <a-form layout="vertical" :model="draft" :disabled="disabled" class="template-editor">
    <a-form-item v-if="emailDraft && !existing" :label="t('messageNotification.emailTest.template')">
      <a-select :value="draft.builtinKey" :options="builtinOptions" @change="selectBuiltin(String($event))" />
    </a-form-item>
    <a-form-item :label="t('messageNotification.templates.name')" required>
      <a-input v-model:value="draft.name" :maxlength="128" />
    </a-form-item>
    <a-form-item :label="t('messageNotification.templates.templateId')">
      <a-input v-model:value="draft.id" :disabled="managed || existing || disabled" :placeholder="t('messageNotification.templates.idHint')" />
    </a-form-item>
    <a-form-item :label="t('messageNotification.templates.configuration')">
      <a-select v-model:value="draft.configId" :options="configOptions" allow-clear :placeholder="t('messageNotification.templates.configPlaceholder')" @clear="clearConfiguration" />
      <a-alert v-if="configFailure" type="warning" show-icon :message="t(`messageNotification.templates.${configState}`)" />
      <div v-else-if="configState === 'empty'" class="template-editor__hint">{{ t('messageNotification.templates.noConfig') }}</div>
    </a-form-item>
    <a-form-item :label="t('messageNotification.templates.description')">
      <a-textarea v-model:value="draft.description" :rows="2" />
    </a-form-item>
    <template v-if="emailDraft">
      <a-form-item :label="t('messageNotification.templates.recipients')">
        <a-select v-model:value="draft.sendTo" mode="tags" :token-separators="[',', ';']" :placeholder="t('messageNotification.templates.recipientHint')" />
      </a-form-item>
      <div v-if="draft.variables.length" class="template-editor__tokens">
        <span class="template-editor__hint">{{ t('messageNotification.templates.insertVariable') }}</span>
        <a-button v-for="variable in insertableVariables" :key="variable.id" size="small" :disabled="disabled" @mousedown.prevent @click="insertVariable(variable.id)">{{ variable.name || variable.id }}</a-button>
      </div>
      <a-form-item :label="t('messageNotification.templates.subject')" required>
        <a-input v-model:value="draft.subject" :maxlength="255" @focus="captureCaret($event, 'subject')" @click="captureCaret($event, 'subject')" @keyup="captureCaret($event, 'subject')" @input="captureCaret($event, 'subject')" />
      </a-form-item>
      <a-form-item :label="t('messageNotification.templates.body')" required>
        <a-textarea v-model:value="draft.text" :rows="10" :maxlength="5120" @focus="captureCaret($event, 'text')" @click="captureCaret($event, 'text')" @keyup="captureCaret($event, 'text')" @input="captureCaret($event, 'text')" />
      </a-form-item>
      <a-form-item :label="t('messageNotification.templates.attachments')">
        <AttachmentEditor v-model:attachments="draft.attachments" :disabled="disabled" @uploading="setUploading" />
      </a-form-item>
    </template>
    <ProviderTemplateFields v-else-if="managed" :draft="draft" :disabled="disabled" />
    <a-form-item v-else :label="t('messageNotification.templates.providerContent')" required>
      <div class="template-editor__hint">{{ t('messageNotification.templates.jsonHint') }}</div>
      <a-textarea v-model:value="draft.templateJson" :rows="14" @focus="captureCaret($event, 'templateJson')" @click="captureCaret($event, 'templateJson')" @keyup="captureCaret($event, 'templateJson')" />
      <a-space wrap>
        <a-button v-for="variable in insertableVariables" :key="variable.id" size="small" @mousedown.prevent @click="insertVariable(variable.id)">{{ variable.name || variable.id }}</a-button>
      </a-space>
    </a-form-item>
    <a-collapse ghost>
      <a-collapse-panel key="variables" :header="t('messageNotification.templates.variables')">
        <VariableDefinitions v-model:variables="draft.variables" :disabled="disabled" />
      </a-collapse-panel>
    </a-collapse>
  </a-form>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { NotificationLoadState, NotifierConfig } from '../../shared'
import type { TemplateDraft } from '../model'
import { useTemplateEditor } from '../hooks/useTemplateEditor'
import AttachmentEditor from './AttachmentEditor.vue'
import VariableDefinitions from './VariableDefinitions.vue'
import ProviderTemplateFields from './ProviderTemplateFields.vue'

const props = defineProps({
  draft: { type: Object as PropType<TemplateDraft>, required: true },
  managed: { type: Boolean, default: false },
  existing: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  configs: { type: Array as PropType<NotifierConfig[]>, default: () => [] },
  configState: { type: String as PropType<NotificationLoadState>, required: true },
})
const emit = defineEmits<{ (event: 'uploading', value: boolean): void }>()
const {
  t, emailDraft, builtinOptions, selectBuiltin, insertableVariables, configFailure, configOptions, clearConfiguration,
  setUploading, captureCaret, insertVariable,
} = useTemplateEditor(props, emit)
</script>

<style scoped>
.template-editor { min-width: 0; }
.template-editor__hint { margin-bottom: var(--space-2); color: var(--text-color-secondary); font-size: var(--fs-12); }
.template-editor__tokens { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); }
</style>
