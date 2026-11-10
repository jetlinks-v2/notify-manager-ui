<template>
  <FullPage :flex="true" transparentBackground class="notification-page notification-records">
    <j-pro-table
      class="notification-records__table pro-table__no-padding" mode="TABLE" row-key="id" :columns="columns"
      :data-source="rows" :loading="state === 'loading'" :no-pagination="true" :scroll="{ x: 1050 }"
    >
      <template #headerLeftRender>
        <div class="notification-page__toolbar notification-records__toolbar">
          <ConditionFilter
            :model-value="terms" :fields="fields" :common-fields="['notifyMessage', 'receiver', 'notifyTime']"
            :disabled="!interactive" class="notification-records__filter"
            :placeholder="t('messageNotification.records.searchPlaceholder')" @change="({ terms: value }) => changeTerms(value)"
          />
          <div class="notification-page__actions notification-records__actions">
            <SwitchGroup
              :model-value="selectedState || 'all'" :options="stateOptions" :disabled="!interactive"
              :aria-label="t('messageNotification.records.field.state')" @change="changeState"
            />
            <a-tooltip :title="t('messageNotification.records.actionUnavailable')">
              <a-button disabled><AIcon type="ExportOutlined" />{{ t('messageNotification.records.export') }}</a-button>
            </a-tooltip>
          </div>
        </div>
      </template>
      <template #notifyTime="row">{{ historyTime(row.notifyTime) }}</template>
      <template #channel="row">{{ historyChannelLabel(row.notifyType, row.provider, t) }}</template>
      <template #state="row"><j-badge-status class="notification-records__status" :text="historyStateLabel(row.state, t)" :status="notificationEnumValue(row.state)" :status-names="{ success: 'success', error: 'error', retrying: 'processing', cancel: 'default' }" /></template>
      <template #receiver="row"><span :title="row.receiver?.join(', ')">{{ row.receiver?.join(', ') || '—' }}</span></template>
      <template #notifyMessage="row"><span :title="row.notifyMessage">{{ row.notifyMessage || '—' }}</span></template>
      <template #action="row">
        <TableActions>
          <TableActionsItem common>
            <j-permission-button
              type="link" size="small" :has-permission="notificationPermissions.records.query"
              :tooltip="{ title: t('messageNotification.records.viewDetail') }" @click="openDetail(row, $event)"
            ><template #icon><span role="img" :aria-label="t('messageNotification.records.viewDetail')"><AIcon type="EyeOutlined" /></span></template></j-permission-button>
          </TableActionsItem>
        </TableActions>
      </template>
      <template #emptyText>
        <a-result
          v-if="state === 'unavailable' || state === 'forbidden' || state === 'error'"
          :status="state === 'error' ? 'error' : state === 'forbidden' ? '403' : 'info'"
          :title="t(`messageNotification.records.feedback.${state}`)"
          :sub-title="t(`messageNotification.records.feedback.${state}Description`)"
        >
          <template v-if="state === 'error'" #extra>
            <a-button @click="load">{{ t('messageNotification.records.reload') }}</a-button>
          </template>
        </a-result>
        <CloudEmpty v-else-if="state === 'empty'" :description="t('messageNotification.records.feedback.empty')" />
      </template>
    </j-pro-table>
    <div v-if="state === 'ready' || state === 'empty'" class="notification-records__pagination">
      <a-pagination
        v-if="total !== undefined && total > 0" :current="pageIndex + 1" :page-size="pageSize"
        :total="total" :show-size-changer="true" :page-size-options="['12', '24', '48']" @change="changePage"
      />
      <a-space v-else-if="total === undefined">
        <a-button :disabled="pageIndex === 0" @click="changePage(pageIndex, pageSize)">{{ t('messageNotification.records.previous') }}</a-button>
        <span>{{ t('messageNotification.records.pageNumber', { page: pageIndex + 1 }) }}</span>
        <a-button :disabled="rows.length < pageSize" @click="changePage(pageIndex + 2, pageSize)">{{ t('messageNotification.records.next') }}</a-button>
      </a-space>
    </div>
    <RecordDetail v-model:open="detailOpen" :record="selected" @closed="restoreDetailFocus" />
  </FullPage>
</template>

<script setup lang="ts">
import ConditionFilter from '@jetlinks-web-core/components/ConditionFilter'
import { notificationEnumValue, notificationPermissions } from '../shared'
import RecordDetail from './components/RecordDetail.vue'
import { historyChannelLabel, historyStateLabel, historyTime } from './presentation'
import { useRecordsPage } from './useRecordsPage'

defineOptions({ name: 'MessageNotificationRecords' })
const {
  t, fields, stateOptions, columns,
  rows, total, state, selected, detailOpen, terms, selectedState, pageIndex, pageSize,
  interactive, changeTerms, changeState, changePage, load, openDetail, restoreDetailFocus,
} = useRecordsPage()
</script>

<style scoped src="../shared/layout.css"></style>
<style scoped>
.notification-records__filter { flex: 0 1 28rem; max-width: 28rem; min-width: 0; }
.notification-records__table { flex: 1 1 0; min-height: 0; overflow: hidden; }
.notification-records__status { white-space: nowrap; }
.notification-records__pagination { display: flex; flex-shrink: 0; justify-content: flex-end; }
@media (max-width: 48rem) {
  .notification-records__filter { flex-basis: 100%; max-width: none; }
  .notification-records__actions { max-width: 100%; }
  .notification-records__actions :deep(.switch-group) { overflow-x: auto; max-width: 100%; }
  .notification-records__pagination { justify-content: center; }
}
</style>
