<template>
  <aside class="template-preview" :aria-label="t('messageNotification.templates.preview')">
    <h3>{{ t('messageNotification.templates.preview') }}</h3>
    <p class="template-preview__hint">{{ t('messageNotification.templates.previewHint') }}</p>
    <a-form v-if="variables.length" layout="vertical">
      <a-form-item v-for="variable in variables" :key="variable.id" :label="variable.name || variable.id">
        <a-input v-model:value="examples[variable.id]" :placeholder="t('messageNotification.templates.exampleValue')" />
      </a-form-item>
    </a-form>
    <template v-if="emailDraft">
      <h4>{{ subject || t('messageNotification.templates.subject') }}</h4>
      <pre>{{ text || t('messageNotification.templates.previewEmpty') }}</pre>
      <div v-if="attachmentNames" class="template-preview__hint">{{ t('messageNotification.templates.attachments') }}: {{ attachmentNames }}</div>
    </template>
    <pre v-else>{{ providerContent }}</pre>
  </aside>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { TemplateDraft } from '../model'
import { useTemplatePreview } from '../hooks/useTemplatePreview'

const props = defineProps({ draft: { type: Object as PropType<TemplateDraft>, required: true } })
const { t, examples, variables, emailDraft, subject, text, providerContent, attachmentNames } = useTemplatePreview(props)
</script>

<style scoped>
.template-preview { min-width: 0; padding-left: var(--space-4); border-left: 1px solid var(--line); }
.template-preview h3 { margin: 0 0 var(--space-2); font-size: var(--fs-h4); font-weight: var(--chrome-label-font-weight); }
.template-preview h4 { margin-block: var(--space-4); overflow-wrap: anywhere; }
.template-preview__hint { color: var(--text-color-secondary); font-size: var(--fs-12); }
.template-preview pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; margin: 0 0 var(--space-4); }
@media (max-width: 67.5rem) { .template-preview { padding: var(--space-4) 0 0; border-left: 0; border-top: 1px solid var(--line); } }
</style>
