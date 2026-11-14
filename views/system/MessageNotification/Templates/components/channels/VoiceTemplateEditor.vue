<template>
  <div class="voice-editor">
    <a-alert class="voice-editor__notice" type="info" :message="t('messageNotification.templates.visual.voiceApprovalHint')" />
    <a-form-item v-for="field in advancedFields" :key="field.key" :label="t(field.labelKey)" :required="field.required">
      <TemplateFieldRenderer :field="field" :value="fieldValue(field)" @update="changeField(field, $event)" @activate="activateProviderField" @load-options="loadRemoteOptions" />
    </a-form-item>
    <a-form-item v-for="field in mainFields" :key="field.key" :label="t(field.key === 'templateCode' ? 'messageNotification.templates.visual.supplierTemplateCode' : 'messageNotification.templates.visual.approvedContent')" :required="field.required">
      <div @focusin="captureProviderCaret($event, field.path)" @click="captureProviderCaret($event, field.path)" @keyup="captureProviderCaret($event, field.path)" @input="captureProviderCaret($event, field.path)">
        <TemplateFieldRenderer :field="field" :value="fieldValue(field)" @update="changeField(field, $event)" @activate="activateProviderField" @load-options="loadRemoteOptions" />
      </div>
      <p v-if="field.key === 'ttsmessage'" class="voice-editor__hint">{{ t('messageNotification.templates.visual.voiceContentHint') }}</p>
    </a-form-item>
    <section v-if="mappings.length" class="voice-editor__mapping" :aria-label="t('messageNotification.templates.visual.variableMapping')">
      <h3>{{ t('messageNotification.templates.visual.variableMapping') }}</h3>
      <table>
        <thead><tr><th>{{ t('messageNotification.templates.visual.supplierVariable') }}</th><th>{{ t('messageNotification.templates.visual.platformVariable') }}</th></tr></thead>
        <tbody><tr v-for="row in mappings" :key="row.id"><td><code>{{ '${' + row.id + '}' }}</code></td><td>{{ row.available ? row.label : t('messageNotification.templates.visual.providedAtSendTime') }}</td></tr></tbody>
      </table>
      <p class="voice-editor__hint">{{ t('messageNotification.templates.visual.smsMappingHint') }}</p>
    </section>
    <a-form-item v-if="playTimesField" :label="t('messageNotification.templates.visual.playTimes')">
      <a-radio-group :value="playTimes" :disabled="disabled" @update:value="changePlayTimes">
        <a-radio-button v-for="count in [1, 2, 3]" :key="count" :value="count">{{ t('messageNotification.templates.visual.playCount', { count }) }}</a-radio-button>
      </a-radio-group>
    </a-form-item>
  </div>
</template>

<script setup lang="ts">
import type { TemplateDraft } from '../../model'
import type { TemplateEditorController } from '../../channelViewTypes'
import { useVoiceTemplateEditorVisual } from '../../hooks/useVoiceTemplateVisual'
import TemplateFieldRenderer from '../../../../../notice/template/components/TemplateFieldRenderer.vue'

const props = defineProps<{ draft: TemplateDraft; editor: TemplateEditorController; disabled?: boolean }>()
const { t, fieldValue, changeField, captureProviderCaret, activateProviderField, loadRemoteOptions } = props.editor
const { mainFields, playTimesField, advancedFields, playTimes, mappings, changePlayTimes } = useVoiceTemplateEditorVisual(props.editor)
</script>

<style scoped>
.voice-editor { min-width: 0; }
.voice-editor__notice { margin-bottom: var(--space-4); background: var(--bg-sunken); border-color: var(--line); color: var(--text-color-secondary); }
.voice-editor :deep(.ant-form-item) { margin-bottom: var(--space-4); }
.voice-editor :deep(.ant-form-item-label > label) { color: var(--text-color-secondary); }
.voice-editor :deep(textarea) { line-height: 1.75; }
.voice-editor__hint { margin: var(--space-1) 0 0; color: var(--text-color-secondary); line-height: 1.6; }
.voice-editor__mapping { margin-bottom: var(--space-4); }
.voice-editor__mapping h3 { margin: 0 0 var(--space-2); color: var(--text-color-secondary); font-weight: 400; }
.voice-editor__mapping table { width: 100%; table-layout: fixed; border-collapse: collapse; }
.voice-editor__mapping th { padding: var(--space-2); text-align: left; font-weight: 400; background: var(--bg-sunken); color: var(--text-color-secondary); }
.voice-editor__mapping td { padding: var(--space-3) var(--space-2); border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
</style>
