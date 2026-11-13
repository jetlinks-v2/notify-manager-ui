<template>
  <aside class="template-preview" :class="{ 'template-preview--editing': editing }" :aria-label="t('messageNotification.templates.preview')">
    <p v-if="editing" class="template-preview__label">{{ t('messageNotification.templates.preview') }}</p>
    <div class="template-preview__canvas">
      <a-alert v-if="!parsed.valid && !emailDraft" type="warning" show-icon :message="t('messageNotification.templates.invalidJson')" />
      <component :is="channelPreview" v-if="channelPreview" :preview="preview" :editing="editing" />
      <section v-else class="template-preview__payload">
        <div class="template-preview__payload-head"><AIcon type="NotificationOutlined" /><strong>{{ channelName }}</strong></div>
        <h4 v-if="subject">{{ subject }}</h4>
        <TemplateMessageText v-if="text" class="template-preview__body" :text="text" />
        <h3>{{ t('messageNotification.templates.presentation.fieldSummary') }}</h3>
        <dl v-if="parsed.valid && summary.length" class="template-preview__fields"><template v-for="field in summary" :key="field.key"><dt>{{ field.key }}</dt><dd>{{ field.value }}</dd></template></dl>
        <pre v-else>{{ providerContent || t('NoticeCenter.template.empty.noContent') }}</pre>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, type Component, type PropType } from 'vue'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import type { NotificationChannel, NotifierConfig } from '../../shared'
import type { TemplateDraft } from '../model'
import { useTemplatePreview } from '../hooks/useTemplatePreview'
import TemplateMessageText from './TemplateMessageText.vue'
import EmailTemplatePreview from './channels/EmailTemplatePreview.vue'
import DingTalkTemplatePreview from './channels/DingTalkTemplatePreview.vue'
import WechatTemplatePreview from './channels/WechatTemplatePreview.vue'
import VoiceTemplatePreview from './channels/VoiceTemplatePreview.vue'
import SmsTemplatePreview from './channels/SmsTemplatePreview.vue'
import WebhookTemplatePreview from './channels/WebhookTemplatePreview.vue'

const props = defineProps({
  draft: { type: Object as PropType<TemplateDraft>, required: true },
  editing: { type: Boolean, default: false },
  business: { type: Object as PropType<NoticeChannelConfig>, default: undefined },
  channel: { type: Object as PropType<NotificationChannel>, default: undefined },
  config: { type: Object as PropType<NotifierConfig>, default: undefined },
})
const preview = useTemplatePreview(props)
const { t, parsed, emailDraft, subject, text, providerContent, channelName, summary } = preview
const channelPreviews: Record<string, Component> = {
  email: EmailTemplatePreview, dingTalk: DingTalkTemplatePreview, robot: DingTalkTemplatePreview,
  wechat: WechatTemplatePreview, voice: VoiceTemplatePreview, sms: SmsTemplatePreview, webhook: WebhookTemplatePreview,
}
const channelPreview = computed(() => channelPreviews[preview.kind.value])
</script>

<style scoped>
.template-preview { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.template-preview__label { margin: 0 0 var(--space-2); }
.template-preview__canvas { flex: 1; min-height: 30rem; padding: var(--space-6); background: var(--bg-sunken); border: 1px solid var(--line); border-radius: var(--r-2); }
.template-preview__payload { width: 100%; max-width: 47.5rem; margin-inline: auto; border: 1px solid var(--line); border-radius: var(--r-2); background: var(--jet-theme-bg-container); overflow: hidden; }
.template-preview__payload-head { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-4); border-bottom: 1px solid var(--line); }
.template-preview__payload > h3, .template-preview__payload > h4, .template-preview__payload > .template-preview__body { margin: var(--space-4); }
.template-preview pre { margin: var(--space-4); white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-color-secondary); }
.template-preview__fields { display: grid; grid-template-columns: minmax(5rem, 1fr) minmax(0, 2fr); gap: var(--space-2) var(--space-3); margin: var(--space-4); }
.template-preview__fields dt { color: var(--text-color-secondary); overflow-wrap: anywhere; }
.template-preview__fields dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.template-preview--editing .template-preview__canvas { padding: var(--space-4); }
@media (max-width: 48rem) { .template-preview__canvas { padding: var(--space-3); } }
</style>
