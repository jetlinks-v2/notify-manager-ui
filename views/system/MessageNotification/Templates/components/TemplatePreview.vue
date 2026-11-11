<template>
  <aside class="template-preview" :class="{ 'template-preview--editing': editing }" :aria-label="t('messageNotification.templates.preview')">
    <div class="template-preview__canvas">
      <div class="template-preview__panels" :class="{ 'template-preview__panels--single': !emailDraft || editing }">
        <section v-if="emailDraft && !editing" class="template-preview__panel" :aria-label="t('messageNotification.templates.emailList')">
          <h3>{{ t('messageNotification.templates.emailList') }}</h3>
          <a-card size="small" class="template-preview__card">
            <div class="template-preview__summary">
              <AIcon type="MailOutlined" class="template-preview__icon" aria-hidden="true" />
              <div class="template-preview__summary-copy">
                <strong :title="subject">{{ subject || t('messageNotification.templates.subject') }}</strong>
                <p :title="text">{{ text || t('messageNotification.templates.previewEmpty') }}</p>
              </div>
            </div>
          </a-card>
        </section>
        <section class="template-preview__panel" :aria-label="t(emailDraft ? 'messageNotification.templates.body' : 'messageNotification.templates.providerContent')">
          <h3>{{ t(emailDraft ? 'messageNotification.templates.body' : 'messageNotification.templates.providerContent') }}</h3>
          <a-card size="small" class="template-preview__card template-preview__message">
            <template v-if="emailDraft">
              <h4>{{ subject || t('messageNotification.templates.subject') }}</h4>
              <p v-if="recipients" class="template-preview__recipients">{{ t('messageNotification.templates.recipients') }}：{{ recipients }}</p>
              <pre>{{ text || t('messageNotification.templates.previewEmpty') }}</pre>
              <div v-if="attachmentNames" class="template-preview__attachments">
                <AIcon type="PaperClipOutlined" aria-hidden="true" />
                <span>{{ t('messageNotification.templates.attachments') }}：{{ attachmentNames }}</span>
              </div>
            </template>
            <pre v-else>{{ providerContent }}</pre>
          </a-card>
        </section>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { TemplateDraft } from '../model'
import { useTemplatePreview } from '../hooks/useTemplatePreview'

const props = defineProps({
  draft: { type: Object as PropType<TemplateDraft>, required: true },
  editing: { type: Boolean, default: false },
})
const { t, emailDraft, subject, text, providerContent, attachmentNames, recipients } = useTemplatePreview(props)
</script>

<style scoped>
.template-preview { min-width: 0; }
.template-preview__canvas { padding: var(--space-8); background: var(--bg-sunken); border: 1px solid var(--line); border-radius: var(--r-2); }
.template-preview__panels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6); align-items: start; max-width: 48rem; margin-inline: auto; }
.template-preview__panels--single { grid-template-columns: minmax(0, 1fr); }
.template-preview__panel { min-width: 0; }
.template-preview h3 { margin: 0 0 var(--space-2); color: var(--jet-theme-text-secondary); font-size: var(--fs-12); font-weight: 400; }
.template-preview__card { background: var(--jet-theme-bg-container); }
.template-preview__summary { display: flex; align-items: flex-start; gap: var(--space-3); }
.template-preview__icon { flex-shrink: 0; color: var(--accent); font-size: var(--fs-16); }
.template-preview__summary-copy { min-width: 0; }
.template-preview__summary strong, .template-preview__summary p { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.template-preview__summary p { margin: var(--space-1) 0 0; color: var(--jet-theme-text-secondary); font-size: var(--fs-12); }
.template-preview h4 { margin: 0; padding-bottom: var(--space-3); border-bottom: 1px solid var(--line); font-size: var(--fs-14); font-weight: 600; overflow-wrap: anywhere; }
.template-preview pre { margin: var(--space-4) 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; color: var(--jet-theme-text-secondary); }
.template-preview__recipients { margin: var(--space-3) 0 0; color: var(--jet-theme-text-secondary); font-size: var(--fs-12); overflow-wrap: anywhere; }
.template-preview__attachments { display: flex; align-items: baseline; gap: var(--space-2); margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--line); font-size: var(--fs-12); overflow-wrap: anywhere; }
.template-preview--editing .template-preview__canvas { padding: var(--space-4); }
@media (max-width: 67.5rem) { .template-preview__panels { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 48rem) { .template-preview__canvas { padding: var(--space-4); } }
</style>
