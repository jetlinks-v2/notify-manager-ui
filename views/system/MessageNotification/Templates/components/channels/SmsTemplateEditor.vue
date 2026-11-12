<template>
  <div class="sms-editor">
    <a-alert class="sms-editor__notice" type="info" :message="t('messageNotification.templates.visual.smsApprovalHint')" />
    <a-form-item v-for="field in mainFields" :key="field.key" :label="field.key === 'code' ? t('messageNotification.templates.visual.supplierTemplateCode') : field.key === 'message' ? t('messageNotification.templates.visual.approvedContent') : t(field.labelKey)" :required="field.required">
      <TemplateFieldRenderer :field="field" :value="fieldValue(field)" @update="changeField(field, $event)" @activate="activateProviderField" @load-options="loadRemoteOptions" />
      <p v-if="field.key === 'message'" class="sms-editor__hint">{{ t('messageNotification.templates.visual.smsApprovedContentHint') }}</p>
    </a-form-item>
    <section class="sms-editor__mapping" :aria-label="t('messageNotification.templates.visual.variableMapping')">
      <h3>{{ t('messageNotification.templates.visual.variableMapping') }}</h3>
      <table v-if="mappings.length">
        <thead><tr><th>{{ t('messageNotification.templates.visual.supplierVariable') }}</th><th>{{ t('messageNotification.templates.visual.platformVariable') }}</th></tr></thead>
        <tbody><tr v-for="row in mappings" :key="row.id"><td><code>{{ '${' + row.id + '}' }}</code></td><td>{{ row.available ? row.label : t('messageNotification.templates.visual.providedAtSendTime') }}</td></tr></tbody>
      </table>
      <p v-else class="sms-editor__hint">{{ t('messageNotification.templates.visual.noSupplierVariables') }}</p>
      <p class="sms-editor__hint">{{ t('messageNotification.templates.visual.smsMappingHint') }}</p>
    </section>
    <a-collapse v-if="advancedFields.length" ghost class="sms-editor__advanced">
      <a-collapse-panel key="supplier" :header="t('messageNotification.templates.visual.deliveryOptions')">
        <a-form-item v-for="field in advancedFields" :key="field.key" :label="t(field.labelKey)" :required="field.required">
          <TemplateFieldRenderer :field="field" :value="fieldValue(field)" @update="changeField(field, $event)" @activate="activateProviderField" @load-options="loadRemoteOptions" />
        </a-form-item>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import type { TemplateDraft } from '../../model'
import type { TemplateEditorController } from '../../channelViewTypes'
import { useSmsTemplateEditorVisual } from '../../hooks/useSmsTemplateVisual'
import TemplateFieldRenderer from '../../../../../notice/template/components/TemplateFieldRenderer.vue'

const props = defineProps<{ draft: TemplateDraft; editor: TemplateEditorController; disabled?: boolean }>()
const { t, fieldValue, changeField, activateProviderField, loadRemoteOptions } = props.editor
const { mainFields, advancedFields, mappings } = useSmsTemplateEditorVisual(props.editor)
</script>

<style scoped>
.sms-editor { min-width: 0; }
.sms-editor__notice { margin-bottom: var(--space-4); background: var(--bg-sunken); border-color: var(--line); color: var(--jet-theme-text-secondary); font-size: var(--fs-12); }
.sms-editor :deep(.ant-form-item) { margin-bottom: var(--space-4); }
.sms-editor :deep(.ant-form-item-label > label) { color: var(--jet-theme-text-secondary); font-size: var(--fs-12); }
.sms-editor :deep(textarea) { color: var(--text-color); line-height: 1.75; font-size: var(--fs-12); }
.sms-editor__hint { margin: var(--space-1) 0 0; color: var(--text-color-secondary); font-size: var(--fs-12); line-height: 1.6; }
.sms-editor__mapping h3 { margin: 0 0 var(--space-2); color: var(--jet-theme-text-secondary); font-size: var(--fs-12); font-weight: 400; }
.sms-editor__mapping table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: var(--fs-12); }
.sms-editor__mapping th { padding: var(--space-2); background: var(--bg-sunken); color: var(--jet-theme-text-secondary); font-weight: 400; text-align: left; }
.sms-editor__mapping td { padding: var(--space-3) var(--space-2); border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.sms-editor__mapping code { font-size: var(--fs-12); }
.sms-editor__advanced { margin-top: var(--space-4); }
.sms-editor__advanced :deep(.ant-collapse-header) { padding-inline: 0; }
</style>
