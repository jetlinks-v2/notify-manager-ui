<template>
  <a-form layout="vertical" :model="draft" :disabled="disabled" class="template-editor">
    <a-form-item v-if="emailDraft && !existing && !businessMode" :label="t('messageNotification.emailTest.template')">
      <a-select :value="draft.builtinKey" :options="builtinOptions" @change="selectBuiltin(String($event))" />
    </a-form-item>
    <a-form-item v-if="!businessMode" :label="t('messageNotification.templates.name')" required>
      <a-input v-model:value="draft.name" :maxlength="128" />
    </a-form-item>
    <a-form-item v-if="!businessMode" :label="t('messageNotification.templates.templateId')">
      <a-input v-model:value="draft.id" :disabled="existing || disabled" :placeholder="t('messageNotification.templates.idHint')" />
    </a-form-item>
    <a-form-item v-if="!businessMode" :label="t('messageNotification.templates.description')">
      <a-textarea v-model:value="draft.description" :rows="2" />
    </a-form-item>
    <p class="template-editor__intro">{{ t('messageNotification.templates.visual.contentOnlyHint') }}</p>
    <a-form-item v-if="needsConfiguration" :label="t('messageNotification.templates.configuration')" required>
      <a-select v-model:value="draft.configId" :options="configOptions" :placeholder="t('messageNotification.templates.configPlaceholder')" />
      <a-alert v-if="configFailure" type="warning" show-icon :message="t(`messageNotification.templates.${configState}`)" />
      <div v-else-if="configState === 'empty'" class="template-editor__hint">{{ t('messageNotification.templates.noConfig') }}</div>
    </a-form-item>
    <component :is="channelEditor" v-if="channelEditor" :draft="draft" :editor="editor" :disabled="disabled" />
    <template v-else>
      <a-spin :spinning="metadataState === 'loading' && !known">
        <a-form-item v-for="field in fields" :key="field.key" :label="t(field.labelKey)" :required="field.required">
          <div @focusin="captureProviderCaret($event, field.path)" @click="captureProviderCaret($event, field.path)" @keyup="captureProviderCaret($event, field.path)" @input="captureProviderCaret($event, field.path)">
            <TemplateFieldRenderer :field="field" :value="fieldValue(field)" @update="changeField(field, $event)" @activate="activateProviderField" @load-options="loadRemoteOptions" />
          </div>
        </a-form-item>
        <template v-if="!genericJson">
          <a-form-item v-for="property in metadataFields" :key="property.id" :label="property.name || property.id" :required="metadataRequired(property)">
            <div @focusin="captureProviderCaret($event, [property.id])" @click="captureProviderCaret($event, [property.id])" @keyup="captureProviderCaret($event, [property.id])">
              <MetadataValueItem :item="property" :model-value="metadataValue(property)" :disabled="disabled" @update:model-value="changeMetadata(property.id, $event)" />
            </div>
            <div v-if="property.description" class="template-editor__hint">{{ property.description }}</div>
          </a-form-item>
        </template>
        <template v-else>
          <a-alert v-if="!parsed.valid" type="error" show-icon :message="t('messageNotification.templates.invalidJson')" />
          <a-alert v-else-if="!known && metadataState !== 'loading'" type="info" show-icon :message="t(`messageNotification.templates.presentation.${metadataFailure ? 'metadataError' : 'metadataUnavailable'}`)" />
          <a-form-item :label="t('messageNotification.templates.providerContent')" required>
            <div class="template-editor__hint">{{ t('messageNotification.templates.jsonHint') }}</div>
            <a-textarea v-model:value="draft.templateJson" :rows="14" @focus="captureCaret($event, 'templateJson')" @click="captureCaret($event, 'templateJson')" @keyup="captureCaret($event, 'templateJson')" @input="captureCaret($event, 'templateJson')" />
          </a-form-item>
        </template>
      </a-spin>
    </template>
  </a-form>
</template>

<script setup lang="ts">
import { computed, type Component, type PropType } from 'vue'
import type { NotificationConfigMetadata, NotificationLoadState, NotificationVariable, NotifierConfig } from '../../shared'
import type { TemplateDraft } from '../model'
import { useTemplateEditor } from '../hooks/useTemplateEditor'
import EmailTemplateEditor from './channels/EmailTemplateEditor.vue'
import DingTalkTemplateEditor from './channels/DingTalkTemplateEditor.vue'
import WechatTemplateEditor from './channels/WechatTemplateEditor.vue'
import VoiceTemplateEditor from './channels/VoiceTemplateEditor.vue'
import SmsTemplateEditor from './channels/SmsTemplateEditor.vue'
import WebhookTemplateEditor from './channels/WebhookTemplateEditor.vue'
import TemplateFieldRenderer from '../../../../notice/template/components/TemplateFieldRenderer.vue'

const props = defineProps({
  draft: { type: Object as PropType<TemplateDraft>, required: true },
  existing: { type: Boolean, default: false },
  businessMode: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  configs: { type: Array as PropType<NotifierConfig[]>, default: () => [] },
  configState: { type: String as PropType<NotificationLoadState>, required: true },
  metadata: { type: Object as PropType<NotificationConfigMetadata>, default: undefined },
  metadataState: { type: String as PropType<NotificationLoadState>, default: 'idle' },
  availableVariables: { type: Array as PropType<NotificationVariable[]>, default: () => [] },
})
const emit = defineEmits<{ (event: 'uploading', value: boolean): void }>()
const editor = useTemplateEditor(props, emit)
const {
  t, emailDraft, builtinOptions, selectBuiltin, canInsertVariable, configFailure, configOptions,
  setUploading, captureCaret, captureProviderCaret, activateProviderField, insertVariable,
  known, fields, metadataFields, genericJson, metadataFailure, parsed, fieldValue, changeField,
  changeMetadata, metadataValue, metadataRequired, loadRemoteOptions,
} = editor
const channelEditors: Record<string, Component> = {
  'email:embedded': EmailTemplateEditor, 'dingTalk:dingTalkMessage': DingTalkTemplateEditor,
  'dingTalk:dingTalkRobotWebHook': DingTalkTemplateEditor, 'weixin:corpMessage': WechatTemplateEditor,
  'voice:aliyun': VoiceTemplateEditor, 'sms:aliyunSms': SmsTemplateEditor, 'webhook:http': WebhookTemplateEditor,
}
const channelEditor = computed(() => parsed.value.valid || emailDraft.value ? channelEditors[`${props.draft.type}:${props.draft.provider}`] : undefined)
// 保留已有绑定；没有有效绑定时必须显式选择，避免多配置场景下无法保存或误选。
const needsConfiguration = computed(() => props.configState !== 'loading'
  && !configOptions.value.some(option => option.value === props.draft.configId && !option.disabled))
defineExpose({ insertVariable, canInsertVariable })
</script>

<style scoped>
.template-editor { min-width: 0; }
.template-editor__hint { margin-bottom: var(--space-2); color: var(--text-color-secondary); }
.template-editor__intro { margin: 0 0 var(--space-4); padding-bottom: var(--space-4); border-bottom: 1px solid var(--line); color: var(--text-color-secondary); }
.template-editor__tokens { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); }
.template-editor__tokens code { margin-left: var(--space-1); color: var(--jet-theme-text-secondary); }
</style>
