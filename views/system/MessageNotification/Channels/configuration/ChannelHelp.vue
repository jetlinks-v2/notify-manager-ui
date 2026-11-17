<template>
  <aside id="notification-channel-help" ref="container" class="channel-help" :aria-label="t('messageNotification.channels.helpTitle')">
    <div v-if="model.link" class="channel-help__platform">
      {{ model.link.label }} <a :href="model.link.href" target="_blank" rel="noopener noreferrer">{{ model.link.href }}</a>
    </div>
    <h4>{{ t('messageNotification.channels.document.overview') }}</h4>
    <p>{{ model.overview }}</p>
    <h4 v-if="model.sections.length">{{ t('messageNotification.channels.document.configuration') }}</h4>
    <section v-for="(section, index) in model.sections" :key="section.id" class="channel-help__section" :class="{ 'channel-help__section--active': activeSection === section.id }" :data-help-section="section.id" :aria-current="activeSection === section.id ? 'true' : undefined">
      <h5>{{ index + 1 }}、{{ section.title }}</h5>
      <template v-for="(block, blockIndex) in section.blocks" :key="blockIndex">
        <p v-if="block.type === 'text'">{{ block.text }}</p>
        <figure v-else-if="channelHelpImages[block.image]" class="channel-help__image" :style="{ aspectRatio: `${channelHelpImages[block.image].width} / ${channelHelpImages[block.image].height}` }">
          <Image :src="channelHelpImages[block.image].src" :alt="block.alt" width="100%" :height="'auto'" />
        </figure>
      </template>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { ref, type PropType } from 'vue'
import { Image } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { ChannelHelpModel } from './channelHelp'
import { channelHelpImages } from './channelHelpImages'
import { useChannelHelpNavigation } from './useChannelHelpNavigation'
const props = defineProps({
  model: { type: Object as PropType<ChannelHelpModel>, required: true },
  activeSection: { type: String, default: undefined },
  focusVersion: { type: Number, default: 0 },
})
const { t } = useI18n()
const container = ref<HTMLElement>()
useChannelHelpNavigation(container, props)
</script>

<style scoped>
.channel-help { padding: var(--space-4); border-radius: var(--jet-theme-button-r); background: var(--jet-theme-bg-elevated); min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; overflow-wrap: anywhere; }
.channel-help h4, .channel-help h5 { font-size: var(--fs-14); color: var(--jet-theme-text-title); }
.channel-help h4 { margin: var(--space-4) 0 var(--space-3); font-weight: 600; }
.channel-help h5 { margin: 0 0 var(--space-2); font-weight: 500; }
.channel-help p { margin: var(--space-2) 0; color: var(--jet-theme-text-title); font-size: var(--fs-14); line-height: 1.8; }
.channel-help__platform { padding: var(--space-3); color: var(--ant-color-primary); background: var(--ant-color-primary-bg, var(--jet-theme-bg-container)); font-size: var(--fs-14); }
.channel-help__section { margin-top: var(--space-4); padding: var(--space-2); border-radius: var(--jet-theme-button-r); }
.channel-help__section--active { background: var(--ant-color-primary-bg, var(--jet-theme-bg-container)); outline: 1px solid var(--ant-color-primary-border, var(--line)); }
.channel-help__image { width: 100%; margin: var(--space-3) 0; }
.channel-help__image :deep(.ant-image-img) { height: auto; }
@media (max-width: 64rem) { .channel-help { overflow: visible; } }
</style>
