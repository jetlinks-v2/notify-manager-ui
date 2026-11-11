<template>
  <JlDrawerShell
    :open="open" :width="520" :title="record?.notifyMessage || t('messageNotification.records.detail.title')"
    :keyboard="true" :autofocus="true"
    @update:open="emit('update:open', $event)" @after-open-change="afterOpenChange"
  >
    <template #head><b class="record-detail__title" :title="record?.notifyMessage">{{ record?.notifyMessage || t('messageNotification.records.detail.title') }}</b></template>
    <template #head-extra><a-tag v-if="record?.state" :color="notificationEnumValue(record.state) === 'error' ? 'error' : notificationEnumValue(record.state) === 'success' ? 'success' : 'default'">{{ historyStateLabel(record.state, t) }}</a-tag></template>
    <template v-if="record">
      <KvGrid class="record-detail__summary" :cols="2" :gap="16">
        <div v-for="item in summary" :key="item.key" class="kv-cell">
          <dt>{{ item.label }}</dt>
          <dd :class="{ 'record-detail__missing': item.missing }">
            <a-button v-if="item.key === 'messageTemplate' && !item.missing && canGoTemplate" type="link" class="record-detail__link" @click="navigate('templates')">{{ item.value }}<AIcon type="RightOutlined" /></a-button>
            <span v-else-if="item.key === 'channel' && !item.missing" class="record-detail__channel"><AIcon :type="channelIcon" />{{ item.value }}</span>
            <span v-else>{{ item.value }}</span>
          </dd>
        </div>
      </KvGrid>
      <section class="record-detail__section">
        <h3>{{ t('messageNotification.records.detail.sentContent') }}</h3>
        <CodeBlock variant="light" :content="sentContent" />
      </section>
    </template>
    <template #foot>
      <a-tooltip v-if="notificationEnumValue(record?.state) === 'error'" :title="t('messageNotification.records.retryUnavailable')">
        <a-button disabled>{{ t('messageNotification.records.retrySend') }}</a-button>
      </a-tooltip>
      <a-button v-if="canGoChannel" @click="navigate('channels')">{{ t('messageNotification.records.goChannel') }}</a-button>
      <a-button ref="closeButton" @click="emit('update:open', false)">{{ t('messageNotification.records.close') }}</a-button>
    </template>
  </JlDrawerShell>
</template>

<script setup lang="ts">
import { toRef, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { notificationEnumValue, type NotificationHistory } from '../../shared'
import { useRecordDetail } from '../useRecordDetail'
import { historyStateLabel } from '../presentation'

const props = defineProps({
  open: { type: Boolean, default: false },
  record: { type: Object as PropType<NotificationHistory>, default: undefined },
})
const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'closed'): void
}>()
const { t } = useI18n()
const { summary, channelIcon, sentContent, closeButton, afterOpenChange, canGoChannel, canGoTemplate, navigate } = useRecordDetail(toRef(props, 'record'), toRef(props, 'open'), () => emit('closed'))
</script>

<style scoped>
.record-detail__section { min-width: 0; margin-top: var(--space-2); }
.record-detail__summary .kv-cell { min-width: 0; }
.record-detail__summary dt { margin-bottom: var(--space-1); color: var(--ink-4); font-size: var(--fs-12); font-weight: 400; }
.record-detail__summary dd { margin: 0; color: var(--ink-1); font-size: var(--fs-14); overflow-wrap: anywhere; }
.record-detail__title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.record-detail__link { height: auto; padding: 0; white-space: normal; text-align: left; overflow-wrap: anywhere; }
.record-detail__channel { display: inline-flex; align-items: center; gap: var(--space-2); }
.kv-cell .record-detail__missing { color: var(--ink-4); }
.record-detail__section h3 { margin: 0 0 var(--space-2); font-size: var(--fs-14); font-weight: var(--chrome-label-font-weight); color: var(--text-color); }
</style>
