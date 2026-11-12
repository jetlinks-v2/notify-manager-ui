<template>
  <div class="voice-preview" :class="{ 'voice-preview--editing': editing }" :aria-label="t('messageNotification.templates.visual.voiceMessage')">
    <div class="voice-preview__layout">
      <div class="voice-preview__call">
        <strong class="voice-preview__number">{{ caller || t('messageNotification.templates.visual.voiceMessage') }}</strong>
        <div class="voice-preview__call-label">{{ t('messageNotification.templates.visual.incomingVoice') }}</div>
        <div class="voice-preview__wave" aria-hidden="true"><i v-for="(height, index) in waveHeights" :key="index" :style="{ height: height + '%' }" /></div>
        <div class="voice-preview__actions" aria-hidden="true">
          <div><span class="voice-preview__action voice-preview__action--decline"><AIcon type="PhoneOutlined" /></span><span>{{ t('messageNotification.templates.visual.hangUp') }}</span></div>
          <div><span class="voice-preview__action voice-preview__action--answer"><AIcon type="PhoneOutlined" /></span><span>{{ t('messageNotification.templates.visual.answerCall') }}</span></div>
        </div>
      </div>
      <section class="voice-preview__transcript">
        <h3>{{ t('messageNotification.templates.visual.voiceTranscript') }}</h3>
        <TemplateMessageText :text="text || t('messageNotification.templates.visual.supplierVoiceFile')" />
        <p>{{ t('messageNotification.templates.visual.voicePlayHint', { count: playTimes }) }}</p>
      </section>
    </div>
    <p v-if="code" class="voice-preview__code">{{ channelName }} · {{ t('messageNotification.templates.visual.supplierTemplateCode') }} <code>{{ code }}</code></p>
  </div>
</template>

<script setup lang="ts">
import type { TemplatePreviewController } from '../../channelViewTypes'
import TemplateMessageText from '../TemplateMessageText.vue'
const props = defineProps<{ preview: TemplatePreviewController; editing?: boolean }>()
const { t, caller, text, playTimes, code, channelName } = props.preview
const waveHeights = [20, 38, 60, 43, 74, 34, 57, 29, 66, 45, 72, 38, 56, 26, 68, 42, 24]
</script>

<style scoped>
.voice-preview { min-width: 0; }
.voice-preview__layout { display: flex; justify-content: center; align-items: flex-start; gap: var(--space-6); }
.voice-preview__call { display: flex; flex: 0 0 auto; flex-direction: column; align-items: center; width: min(100%, 16.25rem); min-height: 27.5rem; padding: var(--space-12) var(--space-6) var(--space-6); border-radius: var(--r-6); background: var(--text-color); color: var(--jet-theme-bg-container); }
.voice-preview__number { max-width: 100%; font-size: var(--fs-20); font-weight: 600; overflow-wrap: anywhere; text-align: center; }
.voice-preview__call-label { margin-top: var(--space-1); opacity: .6; font-size: var(--fs-12); }
.voice-preview__wave { display: flex; align-items: center; justify-content: center; gap: var(--space-1); width: 10rem; height: 3rem; margin-top: var(--space-section); }
.voice-preview__wave i { width: var(--space-1); min-height: var(--space-1); border-radius: var(--r-1); background: var(--accent); }
.voice-preview__actions { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: auto; padding-top: var(--space-section); }
.voice-preview__actions > div { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); font-size: var(--fs-12); }
.voice-preview__actions > div > span:last-child { opacity: .6; }
.voice-preview__action { display: flex; align-items: center; justify-content: center; width: 3.5rem; height: 3.5rem; border-radius: 50%; font-size: var(--fs-24); }
.voice-preview__action--decline { background: var(--danger); }
.voice-preview__action--decline .anticon { transform: rotate(135deg); }
.voice-preview__action--answer { background: var(--success); }
.voice-preview__transcript { flex: 0 1 20rem; min-width: 0; padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--r-2); background: var(--jet-theme-bg-container); font-size: var(--fs-12); }
.voice-preview__transcript h3 { margin: 0 0 var(--space-2); color: var(--text-color-secondary); font-size: var(--fs-12); font-weight: 400; }
.voice-preview__transcript > p { margin: var(--space-3) 0 0; padding-top: var(--space-3); border-top: 1px solid var(--line); color: var(--text-color-secondary); }
.voice-preview__code { margin: var(--space-3) 0 0; color: var(--text-color-secondary); font-size: var(--fs-12); overflow-wrap: anywhere; }
.voice-preview__code code { color: var(--text-color-secondary); font-size: var(--fs-12); }
.voice-preview--editing .voice-preview__layout { flex-direction: column; align-items: center; gap: var(--space-4); }
.voice-preview--editing .voice-preview__transcript { flex-basis: auto; width: 100%; }
@media (max-width: 48rem) { .voice-preview__layout { flex-direction: column; align-items: center; } .voice-preview__transcript { flex-basis: auto; width: 100%; } }
</style>
