<template>
  <section class="webhook-preview" :aria-label="t('messageNotification.templates.visual.webhookRequest')">
    <div class="webhook-preview__request-line">
      <a-tag color="success">{{ webhookMethod }}</a-tag>
      <span class="webhook-preview__url">{{ webhookUrl || t('messageNotification.templates.visual.webhookUrlMissing') }}</span>
    </div>
    <div class="webhook-preview__headers"><span>Content-Type: application/json</span></div>
    <p v-if="contextAsBody" class="webhook-preview__context">{{ t('messageNotification.templates.presentation.contextBody') }}</p>
    <pre>{{ webhookBody || t('NoticeCenter.template.empty.noContent') }}</pre>
  </section>
</template>

<script setup lang="ts">
import type { TemplatePreviewController } from '../../channelViewTypes'
const props = defineProps<{ preview: TemplatePreviewController; editing?: boolean }>()
const { t, webhookMethod, webhookUrl, webhookBody, contextAsBody } = props.preview
</script>

<style scoped>
.webhook-preview { min-width: 0; width: 100%; max-width: 47.5rem; margin-inline: auto; overflow: hidden; border: 1px solid var(--line); border-radius: var(--r-2); background: var(--jet-theme-bg-container); }
.webhook-preview__request-line { display: flex; align-items: baseline; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--line); }
.webhook-preview__request-line .ant-tag { flex-shrink: 0; margin: 0; border: 0; font-family: var(--font-family-mono, monospace); font-size: var(--fs-12); font-weight: 600; }
.webhook-preview__url { min-width: 0; color: var(--text-color); font-family: var(--font-family-mono, monospace); font-size: var(--fs-12); overflow-wrap: anywhere; }
.webhook-preview__headers { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--line); color: var(--text-color-secondary); font-family: var(--font-family-mono, monospace); font-size: var(--fs-12); line-height: 1.75; }
.webhook-preview__context { margin: var(--space-3) var(--space-4) 0; color: var(--text-color-secondary); font-size: var(--fs-12); }
.webhook-preview pre { margin: 0; padding: var(--space-3) var(--space-4); color: var(--text-color); font-family: var(--font-family-mono, monospace); font-size: var(--fs-12); line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
