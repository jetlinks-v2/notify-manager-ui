<template>
  <aside id="notification-channel-help" class="channel-help" :aria-label="t('messageNotification.channels.helpTitle')">
    <div class="channel-help__heading">
      <h3>{{ t('messageNotification.channels.helpTitle') }}</h3>
      <a-button type="link" size="small" @click="emit('close')">{{ t('messageNotification.channels.collapseHelp') }}</a-button>
    </div>
    <ol v-if="model.steps.length" class="channel-help__steps">
      <li v-for="(step, index) in model.steps" :key="index" :class="{ 'channel-help__active': activeStep === index }" :aria-current="activeStep === index ? 'step' : undefined">
        <span class="channel-help__number" aria-hidden="true">{{ index + 1 }}</span>
        <div><h4>{{ step.title }}</h4><p>{{ step.description }}</p></div>
      </li>
    </ol>
    <p v-else>{{ model.description }}</p>
    <div v-if="model.questions.length" class="channel-help__faq">
      <h4>{{ t('messageNotification.channels.faq') }}</h4>
      <dl><template v-for="(question, index) in model.questions" :key="index"><dt>{{ question.title }}</dt><dd>{{ question.description }}</dd></template></dl>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChannelHelpModel } from './channelHelp'
defineProps({ model: { type: Object as PropType<ChannelHelpModel>, required: true }, activeStep: { type: Number, default: undefined } })
const emit = defineEmits<{ (event: 'close'): void }>()
const { t } = useI18n()
</script>

<style scoped>
.channel-help { padding: var(--space-4); border-radius: var(--jet-theme-button-r); background: var(--jet-theme-bg-elevated); min-width: 0; }
.channel-help__heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-3); }
.channel-help h3, .channel-help h4 { margin: 0; font-size: var(--fs-14); font-weight: 500; color: var(--jet-theme-text-title); }
.channel-help p, .channel-help dd { margin: var(--space-1) 0 0; color: var(--text-color-secondary); font-size: var(--fs-12); line-height: 1.75; overflow-wrap: anywhere; }
.channel-help__steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-4); }
.channel-help__steps li { display: flex; align-items: flex-start; gap: var(--space-2); }
.channel-help__steps li.channel-help__active { background: var(--ant-color-primary-bg, var(--jet-theme-bg-container)); outline: var(--space-1) solid var(--ant-color-primary-bg, var(--jet-theme-bg-container)); border-radius: var(--jet-theme-button-r); }
.channel-help__number { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 var(--space-5); height: var(--space-5); border: 1px solid var(--line); border-radius: 50%; font-size: var(--fs-12); background: var(--jet-theme-bg-container); }
.channel-help__faq { margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--line); }
.channel-help dl { margin: 0; }
.channel-help dt { margin-top: var(--space-3); color: var(--jet-theme-text-title); font-size: var(--fs-12); }
</style>
