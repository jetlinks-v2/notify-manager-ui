<template>
  <JlDrawerShell :open="model.open" :title="t('messageNotification.members.title')" :sub="t('messageNotification.members.description')" :width="1000" @update:open="!$event && emit('close')">
    <WechatMembersSummary :model="model" @match="emit('match')" @reload="emit('reload')" />
    <p class="wechat-members__secondary">{{ t('messageNotification.members.matchHelp') }}</p>
    <MappingFilterBar :terms="model.filterTerms" :fields="filterFields" :counts="model.filterCounts" :disabled="model.busy || model.state !== 'ready'"
      @filter="emit('filter', $event)" @status="emit('status', $event)" />
    <a-spin v-if="model.state === 'loading'" :tip="t('messageNotification.common.loading')" />
    <CloudEmpty v-else-if="['error', 'forbidden', 'unavailable'].includes(model.state)" :description="t(`messageNotification.state.${model.state}`)" />
    <CloudEmpty v-else-if="model.state === 'empty'" :description="t('messageNotification.members.empty')" />
    <template v-else-if="model.state === 'ready'">
      <a-alert v-if="model.pendingCount" type="info" show-icon :message="t('messageNotification.members.preview', { count: model.pendingCount })" />
      <CloudEmpty v-if="!model.rows.length" :description="t('messageNotification.members.noResults')"><a-button type="link" @click="emit('resetFilters')">{{ t('messageNotification.members.showAll') }}</a-button></CloudEmpty>
      <a-table v-else :columns="columns" :data-source="model.rows" row-key="id" size="small" :scroll="{ x: 890 }" :pagination="pagination">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'member'">
            <template v-if="record.memberId"><div>{{ record.member?.name || record.binding?.providerName || record.memberId }}</div><span class="wechat-members__secondary">{{ record.memberAvailable ? record.member?.mobile || record.memberId : t('messageNotification.members.memberUnavailable') }}</span></template>
            <span v-else class="wechat-members__secondary">—</span>
          </template>
          <template v-else-if="column.key === 'user'">
            <div>{{ record.user.name || record.id }}</div><span class="wechat-members__secondary">{{ record.userAvailable ? record.user.username : t('messageNotification.members.userUnavailable') }}</span>
          </template>
          <span v-else-if="column.key === 'method'">{{ t(`messageNotification.members.state.${record.status}`) }}</span>
          <a-tag v-else-if="column.key === 'status'" :color="record.mappingStatus === 'bound' ? 'success' : record.mappingStatus === 'invalid' ? 'error' : 'default'">{{ t(`messageNotification.members.filter.${record.mappingStatus}`) }}</a-tag>
          <div v-else-if="column.key === 'actions'" class="wechat-members__actions">
            <a-popover v-if="record.userAvailable" :open="editingUser === record.id" trigger="click" placement="bottomRight" :destroy-tooltip-on-hide="true" @open-change="setEditing(record.id, $event)">
              <template #content>
                <div v-if="editingUser === record.id" class="wechat-members__member-picker" role="dialog" :aria-label="`${t('messageNotification.members.chooseMember')} · ${record.user.name || record.id}`" @keydown.esc.stop.prevent="stopEditing()">
                  <a-input ref="searchInput" v-model:value="memberKeyword" :placeholder="t('messageNotification.members.searchMember')" :aria-label="t('messageNotification.members.searchMember')" allow-clear><template #prefix><AIcon type="SearchOutlined" /></template></a-input>
                  <div v-if="memberTree.length" class="wechat-members__tree">
                    <AutoTree block-node :tree-data="memberTree" :expanded-keys="expandedKeys" :selected-keys="selectedKeys" :auto-expand-parent="false" :disabled="model.busy || model.refreshRequired" @expand="expand" @select="selectNode">
                      <template #title="node"><span class="wechat-members__tree-node" :title="node.disabled ? t('messageNotification.members.memberOccupied') : node.title">
                        <span class="wechat-members__tree-label"><span>{{ node.title }}</span><span v-if="node.description" class="wechat-members__secondary">{{ node.description }}</span></span>
                        <span v-if="node.kind === 'department'" class="wechat-members__secondary">{{ t('messageNotification.members.departmentCount', { count: node.count }) }}</span>
                        <span v-else-if="node.disabled" class="wechat-members__secondary">{{ t('messageNotification.members.memberOccupied') }}</span>
                      </span></template>
                    </AutoTree>
                  </div>
                  <CloudEmpty v-else :description="t('messageNotification.members.noMemberResults')" />
                  <a-button v-if="record.memberId && !record.binding" type="link" :disabled="model.busy || model.refreshRequired" @click="selectMember()">{{ t('messageNotification.members.clearSelection') }}</a-button>
                </div>
              </template>
              <a-button type="link" :disabled="model.busy || model.refreshRequired" :aria-expanded="editingUser === record.id" aria-haspopup="dialog">{{ t(record.memberId ? 'messageNotification.members.change' : 'messageNotification.members.chooseMember') }}</a-button>
            </a-popover>
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
import type { MemberFilterTerm, MemberStatusFilter } from './useWechatMembers'
import MappingFilterBar from './MappingFilterBar.vue'
import AutoTree from '@jetlinks-web-core/components/AutoTree'
import WechatMembersSummary from './WechatMembersSummary.vue'
const props = defineProps<{ model: WechatMembersDrawerModel }>()
const emit = defineEmits<{
  (event: 'close' | 'reload' | 'save' | 'match' | 'resetFilters'): void
  (event: 'status', value: MemberStatusFilter): void
  (event: 'filter', value: MemberFilterTerm[]): void
  (event: 'unbind', value: string): void
  (event: 'assign', userId: string, memberId?: string): void
}>()
const { t, columns, filterFields, editingUser, setEditing, selectMember, selectNode, stopEditing, pagination, memberTree, memberKeyword, expandedKeys, selectedKeys, expand, searchInput } = useWechatMembersDrawer(() => props.model, (userId, memberId) => emit('assign', userId, memberId))
</script>

<style scoped>
.wechat-members__member-picker { display: flex; flex-direction: column; gap: var(--space-3); width: 20rem; max-width: calc(100vw - 3rem); }
.wechat-members__tree { height: 16rem; max-height: 40vh; overflow: hidden; }
.wechat-members__tree-node { display: flex; align-items: center; gap: var(--space-2); }
.wechat-members__tree-label { display: flex; flex: 1; min-width: 0; flex-direction: column; overflow-wrap: anywhere; }
.wechat-members__tree-node > .wechat-members__secondary { flex-shrink: 0; }
.wechat-members__secondary { color: var(--text-color-secondary); font-size: var(--fs-12); }
.wechat-members__actions { display: flex; align-items: center; }
</style>
