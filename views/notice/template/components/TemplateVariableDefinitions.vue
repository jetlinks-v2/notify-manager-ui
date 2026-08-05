<template>
  <section class="template-variable-definitions">
    <header>
      <h2>{{ $t('NoticeCenter.template.variable.title') }}</h2>
      <span>{{ $t('NoticeCenter.template.variable.sub') }}</span>
    </header>

    <a-table
      bordered
      size="small"
      :columns="columns"
      :data-source="model"
      :pagination="false"
      :row-key="record => record.id"
    >
      <template #bodyCell="{ column, record }">
        <code v-if="column.dataIndex === 'id'">{{ variableToken(record.id) }}</code>
        <template v-if="column.dataIndex === 'name'">
          <span v-if="readonly">{{ record.name || $t('NoticeCenter.template.empty.noContent') }}</span>
          <TemplateVariableCellInput
            v-else
            :value="record.name"
            :placeholder="$t('NoticeCenter.template.placeholder.variableName')"
            validate-name
            @commit="value => updateRecordName(record, value)"
          />
        </template>
        <span v-if="column.dataIndex === 'type' && readonly">
          {{ getTypeLabel(record.type) }}
        </span>
        <a-select
          v-if="column.dataIndex === 'type' && !readonly"
          v-model:value="record.type"
          class="template-variable-definitions__select"
          @change="handleTypeChange(record)"
        >
          <a-select-option value="string">
            {{ $t('NoticeCenter.template.variable.type.string') }}
          </a-select-option>
          <a-select-option value="date">
            {{ $t('NoticeCenter.template.variable.type.date') }}
          </a-select-option>
          <a-select-option value="double">
            {{ $t('NoticeCenter.template.variable.type.double') }}
          </a-select-option>
        </a-select>
        <template v-if="column.dataIndex === 'format'">
          <span v-if="record.type === 'string'">{{ record.format }}</span>
          <a-select
            v-if="record.type === 'date' && !readonly"
            v-model:value="record.format"
            class="template-variable-definitions__select"
          >
            <a-select-option value="timestamp">timestamp</a-select-option>
            <a-select-option value="yyyy-MM-dd">yyyy-MM-dd</a-select-option>
            <a-select-option value="yyyy-MM-dd HH:mm:ss">
              yyyy-MM-dd HH:mm:ss
            </a-select-option>
          </a-select>
          <span v-if="record.type === 'date' && readonly">{{ record.format }}</span>
          <TemplateVariableCellInput
            v-if="record.type === 'double' && !readonly"
            :value="record.format"
            :placeholder="$t('NoticeCenter.template.placeholder.variableFormat')"
            @commit="value => updateRecordFormat(record, value)"
          />
          <span v-if="record.type === 'double' && readonly">{{ record.format }}</span>
        </template>
      </template>
    </a-table>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateVariableCellInput from './TemplateVariableCellInput.vue'
import type { NoticeVariableDefinition } from '../hooks/noticeTemplateFormModel'
import { variableToken } from '../hooks/noticeTemplateFormModel'

const model = defineModel<NoticeVariableDefinition[]>({ required: true })
defineProps<{
  readonly?: boolean
}>()
const { t: $t } = useI18n()

const columns = computed(() => [
  {
    title: $t('NoticeCenter.template.variable.id'),
    dataIndex: 'id',
    width: 160,
  },
  {
    title: $t('NoticeCenter.template.variable.name'),
    dataIndex: 'name',
    width: 180,
  },
  {
    title: $t('NoticeCenter.template.variable.type'),
    dataIndex: 'type',
    width: 140,
  },
  {
    title: $t('NoticeCenter.template.variable.format'),
    dataIndex: 'format',
    width: 220,
  },
])

const updateRecordName = (record: NoticeVariableDefinition, value: string) => {
  record.name = value
}

const updateRecordFormat = (record: NoticeVariableDefinition, value: string) => {
  record.format = value
}

const handleTypeChange = (record: NoticeVariableDefinition) => {
  if (record.type === 'string') {
    record.format = '%s'
  }
  if (record.type === 'date') {
    record.format = 'timestamp'
  }
  if (record.type === 'double') {
    record.format = '%.2f'
  }
}

const getTypeLabel = (type?: string) => {
  if (type === 'date') return $t('NoticeCenter.template.variable.type.date')
  if (type === 'double') return $t('NoticeCenter.template.variable.type.double')
  return $t('NoticeCenter.template.variable.type.string')
}
</script>

<style scoped lang="less">
.template-variable-definitions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h2 {
    margin: 0;
    color: #647794;
    font-size: var(--fs-13);
    font-weight: 700;
    letter-spacing: 0.12em;
    line-height: 1.25rem;
  }

  header span {
    color: var(--ink-4);
    font-size: var(--fs-12);
  }

  code {
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: var(--fs-13);
  }
}

.template-variable-definitions__select {
  width: 100%;
}

</style>
