<template>
  <div class="mapping-filter-bar">
    <ConditionFilter class="mapping-filter-bar__search" :model-value="terms" :fields="fields" :disabled="disabled" @update:model-value="emit('filter', $event)" />
    <a-button-group class="mapping-filter-bar__statuses" role="group" :aria-label="t('messageNotification.members.status')">
      <a-button v-for="status in mappingStatuses" :key="status" :type="selected === status ? 'primary' : 'default'" :ghost="selected === status"
        :aria-pressed="selected === status" :disabled="disabled" @click="emit('status', status)">
        <a-badge :status="tones[status]" />{{ t(`messageNotification.members.filter.${status}`) }} {{ counts[status] }}
      </a-button>
    </a-button-group>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ConditionFilter, { type ConditionFilterField } from '@jetlinks-web-core/components/ConditionFilter'
import { mappingStatuses, memberStatusFilter, type MemberFilterTerm, type MemberStatusFilter } from './wechatMemberFilters'

const props = defineProps<{ terms: MemberFilterTerm[]; fields: ConditionFilterField[]; counts: Record<MemberStatusFilter, number>; disabled: boolean }>()
const emit = defineEmits<{ (event: 'filter', terms: MemberFilterTerm[]): void; (event: 'status', value: MemberStatusFilter): void }>()
const { t } = useI18n()
const selected = computed(() => memberStatusFilter(props.terms))
const tones = { all: 'default', bound: 'success', unbound: 'default', invalid: 'error' } as const
</script>

<style scoped>
.mapping-filter-bar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); min-width: 0; }
.mapping-filter-bar__search { flex: 1 1 16rem; min-width: 0; }
.mapping-filter-bar__statuses { display: flex; max-width: 100%; overflow-x: auto; }
.mapping-filter-bar__statuses > .ant-btn { flex-shrink: 0; }
@media (max-width: 36rem) {
  .mapping-filter-bar__statuses { width: 100%; }
  .mapping-filter-bar__statuses > .ant-btn { flex-grow: 1; padding-inline: var(--space-2); }
}
</style>
