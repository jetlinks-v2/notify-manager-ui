<template>
  <div class="template-channel-navigation">
    <a-button-group class="template-channel-navigation__primary" role="group" :aria-label="t('messageNotification.templates.channelFilter')">
      <a-button v-for="group in groups" :key="group.key" :disabled="disabled" :class="{ 'is-active': group.key === activeGroup?.key }" :aria-pressed="group.key === activeGroup?.key" :title="`${group.label} · ${group.statusText}`" :aria-label="`${group.label} · ${group.statusText}`" @click="selectGroup(group.key)">
        <a-badge :status="group.configurationState === 'ready' ? 'success' : 'default'" />
        <span>{{ group.label }}</span>
      </a-button>
    </a-button-group>
    <a-tabs v-if="subChannels.length" :active-key="value" size="small" @change="selectChannel">
      <a-tab-pane v-for="channel in subChannels" :key="channel.id" :tab="channel.label" :disabled="disabled" />
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import type { NotificationChannel, NotificationLoadState } from '../../shared'
import { useTemplateChannelNavigation } from '../hooks/useTemplateChannelNavigation'
const props = defineProps<{ channels: NotificationChannel[]; value: string; configurationStates: Readonly<Record<string, NotificationLoadState>>; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'change', id: string): void }>()
const { t, groups, activeGroup, subChannels, selectGroup, selectChannel } = useTemplateChannelNavigation(props, emit)
</script>

<style scoped>
.template-channel-navigation {
	min-width: 0;
}

.template-channel-navigation__primary {
	display: flex;
	width: max-content;
	max-width: 100%;
	overflow-x: auto;
	padding-bottom: var(--space-1);
}

.template-channel-navigation__primary .is-active {
	z-index: 1;
	color: var(--accent);
	background: var(--accent-soft, var(--bg-sunken));
}

.template-channel-navigation :deep(.ant-tabs-nav) {
	margin: var(--space-2) 0 0;
}

.template-channel-navigation :deep(.ant-tabs-tab) {
	padding: var(--space-2) 0;
}

.template-channel-navigation :deep(.ant-tabs-content-holder) {
	display: none;
}
</style>
