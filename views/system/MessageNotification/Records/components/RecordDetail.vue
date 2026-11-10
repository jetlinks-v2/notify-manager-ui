<template>
  <JlDrawerShell
    :open="open" :width="640" :title="t('messageNotification.records.detail.title')"
    :sub="record?.id" icon="FileTextOutlined" :keyboard="true" :autofocus="true"
    @update:open="emit('update:open', $event)" @after-open-change="afterOpenChange"
  >
    <template v-if="record">
      <KvGrid :items="summary" :gap="16" />
      <a-divider />
      <a-descriptions :column="1" size="small">
        <a-descriptions-item v-for="item in identifiers" :key="item.label" :label="item.label">
          {{ item.value }}
        </a-descriptions-item>
      </a-descriptions>
      <section v-for="section in snapshots" :key="section.key" class="record-detail__section">
        <h3>{{ t(`messageNotification.records.detail.${section.key}`) }}</h3>
        <CodeBlock variant="light" :content="section.content" />
      </section>
    </template>
    <template #foot>
      <a-tooltip :title="t('messageNotification.records.actionUnavailable')">
        <a-button disabled>{{ t('messageNotification.records.retrySend') }}</a-button>
      </a-tooltip>
      <a-button ref="closeButton" @click="emit('update:open', false)">{{ t('messageNotification.records.close') }}</a-button>
    </template>
  </JlDrawerShell>
</template>

<script setup lang="ts">
import { toRef, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NotificationHistory } from '../../shared'
import { useRecordDetail } from '../useRecordDetail'

const props = defineProps({
  open: { type: Boolean, default: false },
  record: { type: Object as PropType<NotificationHistory>, default: undefined },
})
const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'closed'): void
}>()
const { t } = useI18n()
const { summary, identifiers, snapshots, closeButton, afterOpenChange } = useRecordDetail(toRef(props, 'record'), () => emit('closed'))
</script>

<style scoped>
.record-detail__section { min-width: 0; }
.record-detail__section h3 { margin: 0 0 var(--space-2); font-size: var(--fs-14); font-weight: var(--chrome-label-font-weight); color: var(--text-color); }
</style>
