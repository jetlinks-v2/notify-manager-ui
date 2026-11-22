<template>
  <section class="template-used-variables" :aria-label="t('NoticeCenter.template.variable.title')">
    <h3>{{ t('NoticeCenter.template.variable.title') }}</h3>
    <a-table :columns="columns" :data-source="variables" row-key="id" size="small" table-layout="fixed" :pagination="false"
      :locale="{ emptyText: t('messageNotification.templates.noUsedVariables') }">
      <template #bodyCell="{ column, record }">
        <label v-if="column.dataIndex === 'type' || (column.dataIndex === 'format' && record.type === 'date')"
          class="template-used-variables__control-label" :for="`${listId}-${record.id}-${column.dataIndex}`">{{ record.name }} {{ column.title }}</label>
        <TemplateVariableText v-if="column.dataIndex === 'id'" :value="variableToken(record.id)" />
        <span v-else-if="column.dataIndex === 'name'">{{ record.name }}</span>
        <a-select v-else-if="column.dataIndex === 'type'" :id="`${listId}-${record.id}-type`" size="small"
          :value="record.type" :options="typeOptions" :disabled="disabled" :dropdown-match-select-width="false"
          @change="value => isTemplateVariableType(value) && emit('changeType', record.id, value)" />
        <template v-else-if="column.dataIndex === 'format'">
          <a-select v-if="record.type === 'date'" :id="`${listId}-${record.id}-format`" size="small"
            :value="record.format" :options="dateOptions" :disabled="disabled" :title="record.format" :dropdown-match-select-width="false"
            @change="value => typeof value === 'string' && emit('changeFormat', record.id, value)" />
          <a-input v-else-if="record.type === 'double'" size="small" :value="record.format" :disabled="disabled"
            :aria-label="record.name + ' ' + column.title" :placeholder="t('NoticeCenter.template.placeholder.variableFormat')"
            @update:value="emit('changeFormat', record.id, $event)" />
          <span v-else>{{ record.format || '—' }}</span>
        </template>
      </template>
    </a-table>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { variableToken } from '../../../../notice/template/hooks/noticeTemplateFormModel'
import { isTemplateVariableType, variableTypeFormats, type TemplateVariableType, type UsedTemplateVariable } from '../variables/definitions'
import TemplateVariableText from '../variables/TemplateVariableText.vue'

defineProps<{ variables: UsedTemplateVariable[]; disabled?: boolean }>()
const emit = defineEmits<{
  changeType: [id: string, type: TemplateVariableType]
  changeFormat: [id: string, format: string]
}>()
const { t } = useI18n()
const listId = useId()
const widths = { id: '27%', name: '20%', type: '28%', format: '25%' }
const columns = computed(() => Object.entries(widths).map(([dataIndex, width]) => ({
  dataIndex, width, title: t(`NoticeCenter.template.variable.${dataIndex}`), customHeaderCell: () => ({ scope: 'col' }),
})))
const typeOptions = computed(() => Object.keys(variableTypeFormats).map(value => ({
  value, label: t(`NoticeCenter.template.variable.type.${value}`),
})))
const dateOptions = [variableTypeFormats.date, 'yyyy-MM-dd', 'timestamp'].map(value => ({ value, label: value }))
</script>

<style scoped>
.template-used-variables { min-width: 0; margin-block: var(--space-4); container-type: inline-size; }
.template-used-variables h3 { margin: 0 0 var(--space-2); font: inherit; }
.template-used-variables :deep(.ant-table-cell) { overflow-wrap: anywhere; }
.template-used-variables :deep(.ant-select) { width: 100%; min-width: 0; }
.template-used-variables__control-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@container (max-width: 26rem) {
  .template-used-variables :deep(.ant-table.ant-table-small .ant-table-cell) { padding-inline: var(--space-1); }
}
</style>
