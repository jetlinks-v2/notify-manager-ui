<template>
  <div class="sms-preview">
    <TemplatePhoneFrame :title="caller || channelName">
      <div class="sms-preview__timestamp">{{ t('messageNotification.templates.visual.smsMessage') }}<span v-if="displayTime"> · {{ displayTime }}</span></div>
      <div class="sms-preview__bubble"><TemplateMessageText :text="signedText || t('NoticeCenter.template.empty.noContent')" /></div>
    </TemplatePhoneFrame>
    <p class="sms-preview__count">{{ t('messageNotification.templates.visual.characterCount', { count: characterCount }) }}</p>
    <p v-if="code" class="sms-preview__code">{{ t('messageNotification.templates.visual.supplierTemplateCode') }} <code>{{ code }}</code></p>
  </div>
</template>

<script setup lang="ts">
import type { TemplatePreviewController } from '../../channelViewTypes'
import { useSmsTemplatePreviewVisual } from '../../hooks/useSmsTemplateVisual'
import TemplatePhoneFrame from '../TemplatePhoneFrame.vue'
import TemplateMessageText from '../TemplateMessageText.vue'

const props = defineProps<{ preview: TemplatePreviewController; editing?: boolean }>()
const { t, caller, channelName, code, displayTime } = props.preview
const { signedText, characterCount } = useSmsTemplatePreviewVisual(props.preview)
</script>

<style scoped>
.sms-preview { min-width: 0; }
.sms-preview__timestamp { margin: var(--space-1) 0 var(--space-3); color: var(--text-color-secondary); font-size: var(--fs-12); text-align: center; }
.sms-preview__bubble { max-width: 93%; padding: var(--space-3); background: var(--jet-theme-bg-container); color: var(--text-color); border-radius: var(--r-3); font-size: var(--fs-12); }
.sms-preview__count { margin: var(--space-2) 0 0; color: var(--jet-theme-text-secondary); text-align: center; font-size: var(--fs-12); }
.sms-preview__code { margin: var(--space-3) 0 0; color: var(--text-color-secondary); font-size: var(--fs-12); text-align: center; overflow-wrap: anywhere; }
.sms-preview__code code { color: var(--jet-theme-text-secondary); font-size: var(--fs-12); }
</style>
