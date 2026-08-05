<template>
  <a-modal
    :open="open"
    :title="$t('NoticeCenter.template.record.title')"
    :footer="null"
    width="72rem"
    destroy-on-close
    class="template-notify-record-modal"
    @update:open="emit('update:open', $event)"
  >
    <ConditionFilter
      ref="filterRef"
      class="template-notify-record-modal__filter"
      :fields="filterFields"
      @change="handleSearch"
    />
    <j-pro-table
      ref="tableRef"
      mode="TABLE"
      :columns="columns"
      :request="queryRecords"
      :defaultParams="defaultParams"
      :params="params"
      :bodyStyle="{ padding: 0 }"
      :scroll="{ y: 420 }"
    >
      <template #notifyTime="slotProps">
        {{ formatTime(slotProps) }}
      </template>
      <template #message="slotProps">
        <j-ellipsis>{{ slotProps.context?.message || fallbackText }}</j-ellipsis>
      </template>
      <template #state="slotProps">
        <a-space>
          <a-badge
            :status="slotProps.state?.value"
            :text="slotProps.state?.text"
          />
          <AIcon
            v-if="isErrorRecord(slotProps)"
            type="ExclamationCircleOutlined"
            class="template-notify-record-modal__error"
            @click="showError(slotProps)"
          />
        </a-space>
      </template>
      <template #action="slotProps">
        <AIcon
          type="ExclamationCircleOutlined"
          :class="hasContext(slotProps.context)
            ? 'template-notify-record-modal__action'
            : 'template-notify-record-modal__action--disabled'"
          @click="showContext(slotProps)"
        />
      </template>
    </j-pro-table>
  </a-modal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Modal } from 'ant-design-vue'
import dayjs from 'dayjs'
import { JsonViewer } from 'vue3-json-viewer'
import 'vue3-json-viewer/dist/index.css'
import ConditionFilter, {
  type ConditionFilterChangePayload,
  type ConditionFilterExpose,
  type ConditionFilterField,
} from '@jetlinks-web-core/components/ConditionFilter'
import { queryNotifyHistoryByTemplate_api } from '@notice-center-ui/api/notice-center'

type EnumValue = string | {
  value?: string
  text?: string
}

interface NotifyHistoryRecord {
  notifyTime?: number | string
  context?: Record<string, unknown>
  result?: unknown
  state?: EnumValue
  errorStack?: unknown
}

const props = defineProps<{
  open: boolean
  templateId?: string
  templateType?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t: $t } = useI18n()
const tableRef = ref<{ reload?: () => void }>()
const filterRef = ref<ConditionFilterExpose>()
const params = ref<Record<string, unknown>>({})

const stateSearchOptions = computed(() => [
  { label: $t('NoticeCenter.template.record.success'), value: 'success' },
  { label: $t('NoticeCenter.template.record.error'), value: 'error' },
])

const stateSearchConfig = computed(() => ({
  type: 'select',
  options: stateSearchOptions.value,
}))

const notifyTimeSearchConfig = {
  type: 'date',
}

const idSearchConfig = {
  type: 'string',
}

const columns = computed(() => [
  {
    title: 'ID',
    dataIndex: 'id',
    key: 'id',
    search: idSearchConfig,
  },
  {
    title: $t('NoticeCenter.template.record.time'),
    dataIndex: 'notifyTime',
    key: 'notifyTime',
    width: 200,
    scopedSlots: true,
    search: notifyTimeSearchConfig,
  },
  {
    title: $t('NoticeCenter.template.record.content'),
    dataIndex: 'context.message',
    key: 'message',
    scopedSlots: true,
    ellipsis: true,
  },
  {
    title: $t('NoticeCenter.template.record.state'),
    dataIndex: 'state',
    key: 'state',
    width: 120,
    scopedSlots: true,
    search: stateSearchConfig.value,
  },
  {
    title: $t('NoticeCenter.template.record.action'),
    dataIndex: 'action',
    key: 'action',
    width: 80,
    scopedSlots: true,
  },
])

const filterFields = computed<ConditionFilterField[]>(() =>
  [
    {
      title: 'ID',
      dataIndex: 'id',
      search: idSearchConfig,
    },
    {
      title: $t('NoticeCenter.template.record.time'),
      dataIndex: 'notifyTime',
      search: notifyTimeSearchConfig,
    },
    {
      title: $t('NoticeCenter.template.record.state'),
      dataIndex: 'state',
      search: stateSearchConfig.value,
    },
  ],
)

const defaultParams = computed(() => ({
  sorts: [{ name: 'notifyTime', order: 'desc' }],
  terms: props.templateType
    ? [{ column: 'notifyType$IN', value: props.templateType }]
    : [],
}))

const fallbackText = computed(() => $t('NoticeCenter.template.empty.noContent'))

const queryRecords = (params: Record<string, unknown>) => {
  if (!props.templateId) {
    return Promise.resolve({ success: true, result: { data: [], total: 0 } })
  }
  return queryNotifyHistoryByTemplate_api(props.templateId, params)
}

const handleSearch = (payload: ConditionFilterChangePayload) => {
  // `change` only carries effective query terms; ConditionFilter owns the draft edit state.
  params.value = { terms: payload.terms }
}

const formatTime = (record: NotifyHistoryRecord) => {
  if (!record.notifyTime) return fallbackText.value
  return dayjs(record.notifyTime).isValid()
    ? dayjs(record.notifyTime).format('YYYY-MM-DD HH:mm:ss')
    : String(record.notifyTime)
}

const isErrorRecord = (record: NotifyHistoryRecord) =>
  record.state?.value === 'error'

const getErrorContent = (record: NotifyHistoryRecord) => {
  const value = record.errorStack || record.result
  if (value === undefined || value === null || value === '') {
    return $t('NoticeCenter.template.record.errorEmpty')
  }
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

const showError = (record: NotifyHistoryRecord) => {
  Modal.info({
    title: $t('NoticeCenter.template.record.errorTitle'),
    content: h(
      'pre',
      { class: 'template-notify-record-modal__error-content' },
      getErrorContent(record),
    ),
  })
}

const hasContext = (context?: Record<string, unknown>) =>
  Boolean(context && Object.keys(context).length)

const normalizeContext = (context: Record<string, unknown>) => {
  if (typeof context.detailJson !== 'string') {
    return context
  }
  return {
    ...context,
    detailJson: context.detailJson.replace(/\\"/g, '"'),
  }
}

const showContext = (record: NotifyHistoryRecord) => {
  if (!hasContext(record.context)) {
    Modal.info({
      title: $t('NoticeCenter.template.record.contextTitle'),
      content: h('p', $t('NoticeCenter.template.record.contextEmpty')),
    })
    return
  }

  Modal.info({
    title: $t('NoticeCenter.template.record.contextTitle'),
    content: h(JsonViewer, {
      value: normalizeContext(record.context!),
      expanded: true,
      expandDepth: 4,
      style: {
        maxHeight: '18.75rem',
        overflowY: 'auto',
      },
    }),
  })
}

watch(
  () => [props.open, props.templateId, props.templateType],
  ([open]) => {
    if (open) {
      tableRef.value?.reload?.()
    } else {
      params.value = {}
      filterRef.value?.clear()
    }
  },
)
</script>

<style scoped lang="less" src="./TemplateNotifyRecordModal.less"></style>
