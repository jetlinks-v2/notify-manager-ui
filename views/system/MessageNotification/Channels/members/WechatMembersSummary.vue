<template>
  <div class="wechat-members-summary" role="status">
    <a-spin v-if="model.state === 'loading'" size="small" />
    <span v-else-if="['ready', 'empty'].includes(model.state)">{{ t('messageNotification.members.summary', model.stats) }}</span>
    <span v-else>{{ t(model.state === 'idle' ? 'messageNotification.common.loading' : `messageNotification.state.${model.state}`) }}</span>
    <span v-if="model.state === 'ready' && !model.stats.unbound && !model.stats.invalid" class="wechat-members-summary__hint">{{ t('messageNotification.members.allMatched') }}</span>
    <a-button size="small" :disabled="!model.canAutoMatch" @click="emit('match')">{{ t('messageNotification.members.autoMatch') }}</a-button>
    <slot />
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { WechatMembersDrawerModel } from './useWechatMembersDrawer'
defineProps<{ model: Pick<WechatMembersDrawerModel, 'state' | 'stats' | 'canAutoMatch'> }>()
const emit = defineEmits<{ (event: 'match'): void }>()
const { t } = useI18n()
</script>
<style scoped>
.wechat-members-summary { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); }
.wechat-members-summary__hint { color: var(--text-color-secondary); font-size: var(--fs-12); }
</style>
