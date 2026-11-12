<template>
  <TemplatePhoneFrame :title="t(robot ? 'messageNotification.templates.visual.groupMessage' : 'messageNotification.templates.visual.workNotification')" :time="statusTime">
    <div v-if="displayTime" class="ding-preview__time">{{ displayTime }}</div>
    <article class="ding-preview__card">
      <div class="ding-preview__sender"><span class="ding-preview__icon"><AIcon type="DingdingOutlined" /></span><span>{{ applicationName }}</span></div>
      <h4 v-if="title && (!robot || showInstantSubject)" class="ding-preview__title">{{ title }}</h4>
      <TemplateMessageText v-if="body" class="ding-preview__body" :text="body" :markdown="robot ? markdown : true" />
      <p v-if="!body && !title" class="ding-preview__empty">{{ t('messageNotification.templates.previewEmpty') }}</p>
      <div v-if="messageUrl" class="ding-preview__link">{{ messageUrl }}</div>
    </article>
  </TemplatePhoneFrame>
</template>

<script setup lang="ts">
import type { TemplatePreviewController } from '../../channelViewTypes'
import { useDingTalkTemplateView } from '../../hooks/useDingTalkTemplateView'
import TemplatePhoneFrame from '../TemplatePhoneFrame.vue'
import TemplateMessageText from '../TemplateMessageText.vue'

const props = defineProps<{ preview: TemplatePreviewController; editing?: boolean }>()
const { t, displayTime, applicationName, showInstantSubject, markdown, messageUrl } = props.preview
const { robot, title, body, statusTime } = useDingTalkTemplateView(props.preview)
</script>

<style scoped>
.ding-preview__time { margin: 0 0 var(--space-3); color: var(--text-color-secondary); font-size: var(--fs-12); text-align: center; }
.ding-preview__card { min-width: 0; padding: var(--space-3); border-radius: var(--r-2); background: var(--jet-theme-bg-container); }
.ding-preview__sender { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); color: var(--text-color-secondary); font-size: var(--fs-12); overflow-wrap: anywhere; }
.ding-preview__icon { display: inline-flex; align-items: center; justify-content: center; width: var(--space-5); height: var(--space-5); flex-shrink: 0; border-radius: var(--r-1); color: var(--jet-theme-bg-container); background: var(--primary-color, var(--accent)); }
.ding-preview__title { margin: 0 0 var(--space-2); color: var(--text-color); font-size: var(--fs-14); font-weight: 600; line-height: 1.6; overflow-wrap: anywhere; }
.ding-preview__body { color: var(--text-color-secondary); font-size: var(--fs-12); }
.ding-preview__body :deep(strong), .ding-preview__body :deep(h4) { color: var(--text-color); }
.ding-preview__empty { margin: 0; color: var(--text-color-secondary); font-size: var(--fs-12); }
.ding-preview__link { margin-top: var(--space-3); padding-top: var(--space-2); border-top: 1px solid var(--line); color: var(--accent); font-size: var(--fs-12); overflow-wrap: anywhere; }
</style>
