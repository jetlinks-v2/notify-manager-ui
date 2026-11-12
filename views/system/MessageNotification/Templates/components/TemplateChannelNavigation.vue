<template>
  <div class="template-channel-navigation">
    <div class="template-channel-navigation__primary" role="group" :aria-label="t('messageNotification.templates.channelFilter')">
      <a-button v-for="group in groups" :key="group.key" :disabled="disabled" :class="{ 'is-active': group.key === activeGroup?.key }" :aria-pressed="group.key === activeGroup?.key" @click="selectGroup(group.key)">{{ group.label }}</a-button>
    </div>
    <a-tabs v-if="subChannels.length" :active-key="value" size="small" @change="selectChannel">
      <a-tab-pane v-for="channel in subChannels" :key="channel.id" :tab="channel.label" :disabled="disabled" />
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import type { NotificationChannel } from '../../shared'
import { useTemplateChannelNavigation } from '../hooks/useTemplateChannelNavigation'
const props = defineProps<{ channels: NotificationChannel[]; value: string; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'change', id: string): void }>()
const { t, groups, activeGroup, subChannels, selectGroup, selectChannel } = useTemplateChannelNavigation(props, emit)
</script>

<style scoped>
.template-channel-navigation { min-width: 0; }
.template-channel-navigation__primary { display: flex; width: max-content; max-width: 100%; overflow-x: auto; padding-bottom: var(--space-1); }
.template-channel-navigation__primary .ant-btn { flex-shrink: 0; border-radius: 0; font-size: var(--fs-12); }
.template-channel-navigation__primary .ant-btn + .ant-btn { margin-left: -1px; }
.template-channel-navigation__primary .ant-btn:first-child { border-radius: var(--r-1) 0 0 var(--r-1); }
.template-channel-navigation__primary .ant-btn:last-child { border-radius: 0 var(--r-1) var(--r-1) 0; }
.template-channel-navigation__primary .is-active { z-index: 1; color: var(--accent); background: var(--accent-soft, var(--bg-sunken)); }
.template-channel-navigation :deep(.ant-tabs-nav) { margin: var(--space-2) 0 0; }
.template-channel-navigation :deep(.ant-tabs-tab) { padding: var(--space-2) 0; font-size: var(--fs-12); }
.template-channel-navigation :deep(.ant-tabs-content-holder) { display: none; }
</style>
