<template>
  <section class="webhook-preview" :aria-label="t('messageNotification.channels.webhook.preview')">
    <h3>{{ t('messageNotification.channels.webhook.preview') }}</h3>
    <CodeBlock variant="light" :content="model.content" copyable :copy-title="t('messageNotification.channels.webhook.copy')" />
  </section>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import CodeBlock from '@jetlinks-web-core/components/CodeBlock/index.vue'
import type { WebhookPreviewModel } from './useWebhookPreview'
defineProps({ model: { type: Object as PropType<WebhookPreviewModel>, required: true } })
const { t } = useI18n()
</script>

<style scoped>
.webhook-preview { display: grid; gap: var(--space-3); margin-top: var(--space-6); min-width: 0; max-width: 55rem; }
.webhook-preview h3 { margin: 0; font-size: var(--fs-14); font-weight: 500; }
</style>
