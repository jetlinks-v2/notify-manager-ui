<template>
  <JlDrawerShell :open="model.open" :title="t('messageNotification.members.title')" :sub="t('messageNotification.members.description')" :width="1000" @update:open="!$event && emit('close')">
    <a-alert v-if="failure" type="error" show-icon :message="failure" />
    <a-alert v-if="model.saved" type="success" show-icon :message="t('messageNotification.members.saved')" />
    <WechatMembersSummary :model="model" @match="emit('match')" />
    <p class="wechat-members__secondary">{{ t('messageNotification.members.matchHelp') }}</p>
    <a-alert v-if="model.matchCount === 0" type="info" show-icon :message="t('messageNotification.members.matchResult', { count: model.matchCount })" />
    <div class="wechat-members__toolbar">
      <a-tree-select :value="model.departmentId || undefined" :tree-data="departmentOptions" allow-clear :disabled="model.busy" :placeholder="t('messageNotification.members.allDepartments')" :aria-label="t('messageNotification.members.allDepartments')" @change="emit('department', $event ? String($event) : '')" />
      <a-input :value="model.search" allow-clear :disabled="model.busy" :placeholder="t('messageNotification.members.search')" :aria-label="t('messageNotification.members.search')" @update:value="emit('search', $event)" />
      <a-button :disabled="model.busy || model.state === 'loading'" @click="emit('reload')">{{ t('messageNotification.members.reload') }}</a-button>
    </div>
    <a-spin v-if="model.state === 'loading'" :tip="t('messageNotification.common.loading')" />
    <CloudEmpty v-else-if="['error', 'forbidden', 'unavailable'].includes(model.state)" :description="t(`messageNotification.state.${model.state}`)" />
    <CloudEmpty v-else-if="model.state === 'empty'" :description="t('messageNotification.members.empty')" />
    <template v-else-if="model.state === 'ready'">
      <a-radio-group :value="model.statusFilter" class="wechat-members__statuses" :options="statusOptions" option-type="button" :aria-label="t('messageNotification.members.status')" @change="emit('status', $event.target.value)" />
      <a-alert v-if="model.pendingCount" type="info" show-icon :message="t('messageNotification.members.preview', { count: model.pendingCount })" />
      <CloudEmpty v-if="!model.rows.length" :description="t('messageNotification.members.noResults')"><a-button type="link" @click="emit('resetFilters')">{{ t('messageNotification.members.showAll') }}</a-button></CloudEmpty>
      <a-table v-else :columns="columns" :data-source="model.rows" row-key="id" size="small" :scroll="{ x: 990 }" :pagination="pagination">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'member'"><div>{{ record.name || record.id }}</div><span class="wechat-members__secondary">{{ record.memberAvailable ? record.id : t('messageNotification.members.memberUnavailable') }}</span></template>
          <template v-else-if="column.key === 'contact'"><div>{{ record.mobile || t('messageNotification.members.noPhone') }}</div><div class="wechat-members__email">{{ record.email || record.bizMail || t('messageNotification.members.noEmail') }}</div></template>
          <template v-else-if="column.key === 'user'">
            <a-select v-if="editingMember === record.id" class="wechat-members__user" :value="record.userId" :options="userOptions(record.id, record.userId)" show-search option-filter-prop="label" :open="true" :allow-clear="!record.binding" :disabled="model.busy || model.refreshRequired" :placeholder="t('messageNotification.members.chooseUser')" :aria-label="`${t('messageNotification.members.platformUser')} · ${record.name || record.id}`" @change="emit('assign', record.id, $event ? String($event) : undefined); stopEditing()" @dropdown-visible-change="!$event && stopEditing()" />
            <template v-else-if="record.userId"><div>{{ record.user?.name || record.userId }}</div><span class="wechat-members__secondary">{{ record.user?.username || (!record.user ? t('messageNotification.members.userUnavailable') : '') }}</span></template>
            <span v-else class="wechat-members__secondary">—</span>
          </template>
          <span v-else-if="column.key === 'method'">{{ t(`messageNotification.members.state.${record.status}`) }}</span>
          <a-tag v-else-if="column.key === 'status'" :color="record.mappingStatus === 'bound' ? 'success' : record.mappingStatus === 'invalid' ? 'error' : 'default'">{{ t(`messageNotification.members.filter.${record.mappingStatus}`) }}</a-tag>
          <div v-else-if="column.key === 'actions'" class="wechat-members__actions">
            <a-button v-if="record.memberAvailable" type="link" :disabled="model.busy || model.refreshRequired" @click="editingMember === record.id ? stopEditing() : edit(record.id)">{{ t(editingMember === record.id ? 'messageNotification.common.cancel' : record.userId ? 'messageNotification.members.change' : 'messageNotification.members.chooseUser') }}</a-button>
            <a-popconfirm v-if="record.binding" :title="t('messageNotification.members.confirmUnbind')" :ok-text="t('messageNotification.members.unbind')" :cancel-text="t('messageNotification.common.cancel')" :disabled="model.busy || model.refreshRequired" @confirm="emit('unbind', record.binding.id)">
              <a-button type="link" danger :disabled="model.busy || model.refreshRequired">{{ t('messageNotification.members.unbind') }}</a-button>
            </a-popconfirm>
          </div>
        </template>
      </a-table>
    </template>
    <template #foot><StickyActionBar position="inline">
      <a-button :disabled="model.busy" @click="emit('close')">{{ t('messageNotification.common.close') }}</a-button>
      <a-button type="primary" :loading="model.busy" :disabled="!model.canSave" @click="emit('save')">{{ t('messageNotification.members.save') }}</a-button>
    </StickyActionBar></template>
  </JlDrawerShell>
</template>

<script setup lang="ts">
import { useWechatMembersDrawer, type WechatMembersDrawerModel } from './useWechatMembersDrawer'
import type { MemberStatusFilter } from './useWechatMembers'
import WechatMembersSummary from './WechatMembersSummary.vue'
const props = defineProps<{ model: WechatMembersDrawerModel }>()
const emit = defineEmits<{
  (event: 'close' | 'reload' | 'save' | 'match' | 'resetFilters'): void
  (event: 'status', value: MemberStatusFilter): void
  (event: 'search' | 'department' | 'unbind', value: string): void
  (event: 'assign', memberId: string, userId?: string): void
}>()
const { t, columns, departmentOptions, userOptions, failure, statusOptions, editingMember, edit, stopEditing, pagination } = useWechatMembersDrawer(() => props.model)
</script>

<style scoped>
.wechat-members__toolbar { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.wechat-members__toolbar > :first-child { flex: 1 1 12rem; min-width: 0; }
.wechat-members__toolbar > :nth-child(2) { flex: 1 1 16rem; min-width: 0; }
.wechat-members__user { width: 100%; }
.wechat-members__secondary { color: var(--text-color-secondary); font-size: var(--fs-12); }
.wechat-members__email { overflow-wrap: anywhere; }
.wechat-members__statuses { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.wechat-members__actions { display: flex; align-items: center; }
</style>
