<template>
  <section v-for="group in work.kinds.value" :key="group" class="notification-channels__members" :aria-label="t(`messageNotification.recipients.${group}`)">
    <h3>{{ t(`messageNotification.recipients.${group}`) }}</h3>
    <p>{{ t(`messageNotification.recipients.${group}Help`) }}</p>
    <WechatMembersSummary v-if="canManage" :model="summary(group)" summary-key="messageNotification.recipients.summary"
      @match="work.autoMatchAndSave(group)" @reload="work.refreshGroup(group)">
      <a-button size="small" :disabled="disabled || work.open.value || work.summaries.value[group].state === 'loading'" @click="work.show(group)">{{ t('messageNotification.members.manage') }} ›</a-button>
    </WechatMembersSummary>
    <a-space v-else wrap>
      <a-button size="small" disabled>{{ t('messageNotification.members.autoMatch') }}</a-button>
      <a-button size="small" disabled>{{ t('messageNotification.members.manage') }} ›</a-button>
    </a-space>
  </section>
  <div v-if="work.failed.value.length || (work.error.value && !work.open.value) || work.empty.value || work.saved.value" class="recipient-groups__feedback">
    <a-alert v-if="work.failed.value.length" type="warning" show-icon :message="t('messageNotification.recipients.partial', { names: work.failed.value.join('、') })">
      <template #action><a-button size="small" :disabled="disabled || !canManage" @click="work.retry()">{{ t('messageNotification.recipients.sync') }}</a-button></template>
    </a-alert>
    <a-alert v-if="work.error.value && !work.open.value" type="error" show-icon :message="failure">
      <template v-if="work.enabled.value && !work.failed.value.length" #action><a-button size="small" :disabled="disabled || !canManage" @click="work.retry()">{{ t('messageNotification.recipients.sync') }}</a-button></template>
    </a-alert>
    <a-alert v-else-if="work.empty.value" type="warning" show-icon :message="t('messageNotification.recipients.noTargets')" />
    <a-alert v-else-if="work.saved.value && !work.failed.value.length" type="success" show-icon :message="t('messageNotification.recipients.synced')" />
  </div>
  <JlDrawerShell :key="kind" :open="work.open.value" :title="t(`messageNotification.recipients.${kind}Manage`)" :width="900" @update:open="!$event && emit('close')">
    <WechatMembersSummary v-if="work.loaded.value" summary-key="messageNotification.recipients.summary"
      :model="{ ...work.summaries.value[kind], canAutoMatch: work.canAutoMatchDraft.value && !disabled }" @match="work.autoMatch()" />
    <a-alert v-if="work.error.value" type="error" show-icon :message="failure">
      <template v-if="!work.loaded.value || work.error.value === 'conflict'" #action>
        <a-button size="small" :disabled="work.loading.value || work.busy.value" @click="emit('reload')">{{ t('messageNotification.members.retryRead') }}</a-button>
      </template>
    </a-alert>
    <a-alert v-else-if="work.matchCount.value === 0" type="info" show-icon :message="t('messageNotification.members.noMatches')" />
    <RecipientMappingTable v-if="work.open.value" :work="work" />
    <template #foot><StickyActionBar position="inline">
      <a-button :disabled="work.busy.value" @click="emit('close')">{{ t('messageNotification.common.close') }}</a-button>
      <a-button v-if="work.enabled.value && work.loaded.value && !work.groupDirty.value" :disabled="work.busy.value" @click="work.retry()">{{ t('messageNotification.recipients.sync') }}</a-button>
      <a-button type="primary" :loading="work.busy.value" :disabled="!work.canSave.value" @click="work.requestSave()">{{ t('messageNotification.members.save') }}</a-button>
    </StickyActionBar></template>
  </JlDrawerShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GroupRecipientKind } from '../../shared/workRecipients'
import WechatMembersSummary from './WechatMembersSummary.vue'
import RecipientMappingTable from './RecipientMappingTable.vue'
import type { useWorkRecipients } from './useWorkRecipients'

const props = defineProps<{ work: ReturnType<typeof useWorkRecipients>; disabled: boolean; canManage: boolean }>()
const emit = defineEmits<{ (event: 'close' | 'reload'): void }>()
const { t } = useI18n()
const kind = computed(() => props.work.kind.value)
function summary(group: GroupRecipientKind) {
  const model = props.work.summaries.value[group]
  return { ...model, canAutoMatch: model.canAutoMatch && !props.disabled }
}
const failure = computed(() => {
  const error = props.work.error.value
  if (error === 'empty') return t('messageNotification.recipients.noTargets')
  if (error === 'conflict') return t('messageNotification.members.error.conflict')
  return t(`messageNotification.state.${error}`)
})
</script>

<style scoped>
.recipient-groups__feedback { display: grid; gap: var(--space-2); margin-top: var(--space-3); }
</style>
