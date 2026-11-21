<template>
  <div class="recipient-mapping">
    <MappingFilterBar :terms="terms" :fields="fields" :counts="counts" :disabled="!ready"
      @filter="terms = $event" @status="setStatus" />
    <a-spin v-if="work.loading.value" />
    <j-pro-table v-else-if="tableRows.length" class="recipient-mapping__table" mode="TABLE" type="TREE" row-key="id" size="small" no-pagination
      :columns="columns" :data-source="tableRows" :body-style="{ padding: 0 }" :pagination="pagination" :scroll="{ x: 690 }"
      :expanded-row-keys="expandedKeys" @expandedRowsChange="expandedKeys = $event">
      <template #label="row">
        {{ row.label }}
        <small v-if="!isDepartment && duplicateRoleNames.has(row.label)" class="recipient-mapping__role-id">{{ row.id }}</small>
      </template>
      <template #external="row">
        <span v-if="row.externalId">{{ row.externalLabel ? `${row.externalName} · ${row.externalId}` : row.externalId }}</span>
        <span v-else>—</span>
        <a-tag v-if="row.pending" color="processing">{{ t('messageNotification.channels.draft') }}</a-tag>
      </template>
      <template #status="row">
        <a-tag :color="row.mappingStatus === 'bound' ? 'success' : row.mappingStatus === 'invalid' ? 'error' : 'default'">{{ t(`messageNotification.members.filter.${row.mappingStatus}`) }}</a-tag>
      </template>
      <template #action="row">
        <div v-if="!row.contextOnly" class="recipient-mapping__actions">
          <component :is="isDepartment ? TreeSelect : Select" v-if="editingId === row.id" v-bind="pickerProps" autofocus show-search open
            class="recipient-mapping__picker" :value="row.externalId" :disabled="!ready" :aria-label="chooseLabel" :placeholder="chooseLabel"
            :dropdown-match-select-width="false" @change="choose(row.id, $event)" @dropdown-visible-change="!$event && closePicker(row.id)" @keydown.esc="closePicker(row.id)" />
          <a-button v-else-if="row.available" type="link" :disabled="!ready" @click="editingId = row.id">
            {{ row.externalId ? t('messageNotification.members.change') : chooseLabel }}
          </a-button>
          <a-popconfirm v-if="row.externalId && editingId !== row.id" :title="unbindTitle"
            :disabled="!ready" :ok-text="t('messageNotification.members.unbind')" :cancel-text="t('messageNotification.common.cancel')" @confirm="work.assign(row.id)">
            <a-button type="link" danger :disabled="!ready">{{ t('messageNotification.members.unbind') }}</a-button>
          </a-popconfirm>
        </div>
      </template>
    </j-pro-table>
    <CloudEmpty v-else-if="work.loaded.value" :description="t('messageNotification.recipients.noOptions')">
      <a-button v-if="terms.length" type="link" @click="terms = []">{{ t('messageNotification.recipients.clearFilters') }}</a-button>
    </CloudEmpty>
  </div>
</template>

<script setup lang="ts">
import { Select, TreeSelect } from 'ant-design-vue'
import MappingFilterBar from './MappingFilterBar.vue'
import { useRecipientMappingTable } from './useRecipientMappingTable'
import type { WorkRecipientsWorkspace } from './useWorkRecipients'

const props = defineProps<{ work: WorkRecipientsWorkspace }>()
const { t, terms, ready, isDepartment, fields, counts, columns, tableRows, expandedKeys, pagination,
  editingId, duplicateRoleNames, pickerProps, chooseLabel, unbindTitle, choose, closePicker, setStatus } = useRecipientMappingTable(props.work)
</script>

<style scoped>
.recipient-mapping { display: grid; gap: var(--space-3); min-width: 0; }
.recipient-mapping__table { min-width: 0; }
.recipient-mapping__actions { display: flex; align-items: center; gap: var(--space-2); }
.recipient-mapping__actions > .ant-btn { padding-inline: 0; }
.recipient-mapping__picker { width: 100%; }
.recipient-mapping__role-id { display: block; color: var(--text-color-secondary); overflow-wrap: anywhere; }
</style>
