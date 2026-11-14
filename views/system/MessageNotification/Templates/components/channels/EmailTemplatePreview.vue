<template>
  <article class="email-template" :class="{ 'email-template--editing': editing }" :aria-label="t('messageNotification.templates.visual.emailMessage')">
    <header class="email-template__header">
      <h4>{{ subject || t('messageNotification.templates.visual.subject') }}</h4>
      <dl class="email-template__metadata">
        <dt>{{ t('messageNotification.templates.visual.sender') }}</dt><dd>{{ sender || t('messageNotification.templates.visual.notConfigured') }}</dd>
        <dt>{{ t('messageNotification.templates.visual.recipient') }}</dt><dd>{{ recipients || t('messageNotification.templates.visual.dynamicRecipient') }}</dd>
        <dt>{{ t('messageNotification.templates.visual.time') }}</dt><dd>{{ displayTime }}</dd>
      </dl>
    </header>
    <div class="email-template__body">
      <div class="email-template__content" v-html="safeBody" />
      <div v-if="attachmentNames" class="email-template__attachments">
        <AIcon type="PaperClipOutlined" aria-hidden="true" /><span>{{ attachmentNames }}</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TemplatePreviewController } from '../../channelViewTypes'
import { sanitizeEmailPreview } from '../../definition/emailTemplateContent'

const props = defineProps<{ preview: TemplatePreviewController; editing?: boolean }>()
const { t, subject, text, sender, recipients, attachmentNames, displayTime } = props.preview
const safeBody = computed(() => sanitizeEmailPreview(text.value || t('messageNotification.templates.previewEmpty')))
</script>

<style scoped>
.email-template { width: 100%; max-width: 40rem; margin-inline: auto; border: 1px solid var(--line); border-radius: var(--r-2); background: var(--jet-theme-bg-container); overflow: hidden; }
.email-template__header { padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--line); }
.email-template__header h4 { margin: 0 0 var(--space-3); color: var(--jet-theme-text); font-weight: 600; line-height: 1.6; overflow-wrap: anywhere; }
.email-template__metadata { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--space-1) var(--space-4); margin: 0; line-height: 1.6; }
.email-template__metadata dt { color: var(--text-color-secondary); font-weight: 400; }
.email-template__metadata dd { margin: 0; color: var(--jet-theme-text-secondary); overflow-wrap: anywhere; }
.email-template__body { padding: var(--space-4) var(--space-5) var(--space-5); color: var(--jet-theme-text); }
.email-template__content { line-height: 1.8; overflow-wrap: anywhere; }
.email-template__content :deep(p) { margin: 0 0 var(--space-3); }
.email-template__content :deep(p:last-child) { margin-bottom: 0; }
.email-template__content :deep(ul), .email-template__content :deep(ol) { margin: var(--space-3) 0; padding-inline-start: var(--space-5); }
.email-template__content :deep(li[data-list='checked']) { list-style-type: '☑ '; }
.email-template__content :deep(li[data-list='unchecked']) { list-style-type: '☐ '; }
.email-template__content :deep(img) { max-width: 100%; height: auto; vertical-align: middle; }
.email-template__content :deep(blockquote) { margin: var(--space-3) 0; padding-inline-start: var(--space-3); border-inline-start: 3px solid var(--line); color: var(--jet-theme-text-secondary); }
.email-template__content :deep(pre) { max-width: 100%; margin: var(--space-3) 0; padding: var(--space-3); border-radius: var(--r-1); background: var(--jet-theme-bg-layout); white-space: pre-wrap; }
.email-template__content :deep(table) { border-collapse: collapse; max-width: 100%; }
.email-template__content :deep(th), .email-template__content :deep(td) { padding: var(--space-2); border: 1px solid var(--line); }
.email-template__attachments { display: flex; align-items: baseline; gap: var(--space-2); margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--line); color: var(--jet-theme-text-secondary); overflow-wrap: anywhere; }
.email-template--editing .email-template__header { padding: var(--space-4) var(--space-5); }
@media (max-width: 48rem) { .email-template__header, .email-template__body { padding-inline: var(--space-4); } }
</style>
