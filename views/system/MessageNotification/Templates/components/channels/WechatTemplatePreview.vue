<template>
  <TemplatePhoneFrame :title="applicationName || channelName">
    <p v-if="displayTime" class="wechat-template__time">{{ displayTime }}</p>
    <article class="wechat-template__card">
      <h4 v-if="messageTitle">{{ messageTitle }}</h4>
      <p v-if="displayTime" class="wechat-template__card-time">{{ displayTime }}</p>
      <TemplateMessageText class="wechat-template__body" :text="messageBody || t('NoticeCenter.template.empty.noContent')" />
    </article>
  </TemplatePhoneFrame>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { useWechatTemplatePreview } from '../../hooks/useWechatTemplatePreview'
import type { TemplatePreviewController } from '../../channelViewTypes'
import TemplateMessageText from '../TemplateMessageText.vue'
import TemplatePhoneFrame from '../TemplatePhoneFrame.vue'

const props = defineProps({
  preview: { type: Object as PropType<TemplatePreviewController>, required: true },
  editing: { type: Boolean, default: false },
})
const { t, applicationName, channelName, displayTime } = props.preview
const { messageTitle, messageBody } = useWechatTemplatePreview(props.preview)
</script>

<style scoped>
.wechat-template__time { margin: var(--space-1) 0 var(--space-4); color: var(--text-color-secondary); text-align: center; }
.wechat-template__card { padding: var(--space-4); border-radius: var(--r-2); background: var(--jet-theme-bg-container); }
.wechat-template__card h4 { margin: 0 0 var(--space-2); color: var(--text-color); font-weight: 600; overflow-wrap: anywhere; }
.wechat-template__card-time { margin: 0 0 var(--space-2); color: var(--text-color-secondary); }
.wechat-template__body { color: var(--text-color-secondary); }
</style>
