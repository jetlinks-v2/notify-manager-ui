<template>
  <div class="wechat-members-summary">
    <div class="wechat-members-summary__bar" :aria-busy="model.autoMatching">
      <div class="wechat-members-summary__stats" role="status">
        <a-spin v-if="model.state === 'loading'" size="small" />
        <i18n-t v-else-if="['ready', 'empty'].includes(model.state)" :keypath="summaryKey" scope="global" tag="span">
          <template #bound>{{ model.stats.bound }}</template>
          <template #total>{{ model.stats.total }}</template>
          <template #unbound>{{ model.stats.unbound }}</template>
          <template #invalid><span :class="{ 'wechat-members-summary__invalid': model.stats.invalid > 0 }">{{ model.stats.invalid }}</span></template>
        </i18n-t>
        <span v-else>{{ t(model.state === 'idle' ? 'messageNotification.common.loading' : `messageNotification.state.${model.state}`) }}</span>
      </div>
      <div class="wechat-members-summary__actions">
        <a-button size="small" :loading="model.autoMatching" :disabled="!model.canAutoMatch" @click="emit('match')">{{ t('messageNotification.members.autoMatch') }}</a-button>
        <slot />
      </div>
    </div>
    <a-alert v-if="failure" type="error" show-icon :message="failure">
      <template v-if="canReload" #action><a-button size="small" :disabled="model.busy || model.state === 'loading'" @click="emit('reload')">{{ t('messageNotification.members.retryRead') }}</a-button></template>
    </a-alert>
    <a-alert v-else-if="model.saved" type="success" show-icon :message="t('messageNotification.members.saved')" />
    <a-alert v-else-if="!model.busy && model.matchCount === 0" type="info" show-icon :message="t('messageNotification.members.noMatches')" />
  </div>
</template>
<script setup lang="ts">
import { useWechatMembersFeedback, type WechatMembersSummaryModel } from './useWechatMembersDrawer'
const props = withDefaults(defineProps<{ model: WechatMembersSummaryModel; summaryKey?: string }>(), { summaryKey: 'messageNotification.members.summary' })
const emit = defineEmits<{ (event: 'match' | 'reload'): void }>()
const { t, failure, canReload } = useWechatMembersFeedback(() => props.model)
</script>
<style scoped>
.wechat-members-summary { display: flex; flex-direction: column; gap: var(--space-3); }
.wechat-members-summary__bar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--r-2); }
.wechat-members-summary__stats { flex: 1 1 auto; min-width: 0; }
.wechat-members-summary__actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); margin-left: auto; }
.wechat-members-summary__invalid { color: var(--danger); }
</style>
