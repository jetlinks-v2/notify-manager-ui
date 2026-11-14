<template>
  <div class="ding-editor">
    <a-form-item v-for="field in advancedFields" :key="field.key" :label="t(field.labelKey)" :required="field.required">
      <div @focusin="captureProviderCaret($event, field.path)" @click="captureProviderCaret($event, field.path)" @keyup="captureProviderCaret($event, field.path)" @input="captureProviderCaret($event, field.path)">
        <TemplateFieldRenderer :field="field" :value="fieldValue(field)" @update="changeField(field, $event)" @activate="activateProviderField" @load-options="loadRemoteOptions" />
      </div>
    </a-form-item>
    <template v-if="!robot">
      <div class="ding-editor__field">
        <div class="ding-editor__label"><label>{{ t('NoticeCenter.template.field.title') }}</label><span>{{ title.length }}</span></div>
        <a-input :value="title" :disabled="disabled" @update:value="changeTitle" @focus="captureTitleCaret" @click="captureTitleCaret" @keyup="captureTitleCaret" @input="captureTitleCaret" />
      </div>
      <div class="ding-editor__field">
        <div class="ding-editor__label"><label>{{ t('messageNotification.templates.visual.body') }}</label></div>
        <a-textarea :value="body" :rows="7" :disabled="disabled" @update:value="changeBody" @focus="captureBodyCaret" @click="captureBodyCaret" @keyup="captureBodyCaret" @input="captureBodyCaret" />
        <p class="ding-editor__hint">{{ t('messageNotification.templates.visual.markdownHint') }}</p>
      </div>
    </template>
    <template v-else>
      <div v-for="field in mainFields" :key="field.key" class="ding-editor__field">
        <div class="ding-editor__label"><label>{{ field.key === 'message' ? t('messageNotification.templates.visual.body') : t(field.labelKey) }}</label><span v-if="field.kind === 'input'">{{ String(fieldValue(field) ?? '').length }}</span></div>
        <div @focusin="captureProviderCaret($event, field.path)" @click="captureProviderCaret($event, field.path)" @keyup="captureProviderCaret($event, field.path)" @input="captureProviderCaret($event, field.path)">
          <TemplateFieldRenderer :field="field" :value="fieldValue(field)" @update="changeField(field, $event)" @activate="activateProviderField" @load-options="loadRemoteOptions" />
        </div>
        <p v-if="field.key === 'message'" class="ding-editor__hint">{{ t('messageNotification.templates.visual.markdownHint') }}</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { TemplateDraft } from '../../model'
import type { TemplateEditorController } from '../../channelViewTypes'
import { useDingTalkTemplateEditor } from '../../hooks/useDingTalkTemplateEditor'
import TemplateFieldRenderer from '../../../../../notice/template/components/TemplateFieldRenderer.vue'

const props = defineProps<{ draft: TemplateDraft; editor: TemplateEditorController; disabled?: boolean }>()
const { t, fieldValue, changeField, captureProviderCaret, activateProviderField, loadRemoteOptions } = props.editor
const { title, body, robot, mainFields, advancedFields, changeTitle, changeBody, captureTitleCaret, captureBodyCaret } = useDingTalkTemplateEditor(props.editor)
</script>

<style scoped>
.ding-editor { min-width: 0; }
.ding-editor__field { margin-bottom: var(--space-4); }
.ding-editor__label { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-2); color: var(--text-color-secondary); }
.ding-editor__label > span { color: var(--text-color-disabled); }
.ding-editor__hint { margin: var(--space-1) 0 0; color: var(--text-color-secondary); line-height: 1.6; }
.ding-editor__field :deep(textarea) { min-height: 8.75rem; line-height: 1.65; }
</style>
