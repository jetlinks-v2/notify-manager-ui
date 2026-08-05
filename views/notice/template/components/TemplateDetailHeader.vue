<template>
  <header class="template-detail-head">
<!--    <div class="template-detail-head__breadcrumb">-->
<!--      <span v-for="(item, index) in breadcrumb" :key="item">-->
<!--        {{ item }}<i v-if="index < breadcrumb.length - 1">/</i>-->
<!--      </span>-->
<!--    </div>-->

    <div class="template-detail-head__main">
      <div class="template-detail-head__icon" :class="channelToneClass">
        <AIcon :type="channelIcon" />
      </div>

      <div class="template-detail-head__copy">
        <div class="template-detail-head__title-row">
          <h1>{{ $t(alarm.name) }} · {{ $t(channel.channelName) }}</h1>
          <j-badge-status
            :status="channel.configured ? 'success' : 'warning'"
            :text="channel.configured ? $t('NoticeCenter.template.state.configured') : $t('NoticeCenter.template.state.missing')"
          />
        </div>
<!--        <p>-->
<!--          <MetaChip>-->
<!--            <AIcon type="NumberOutlined" />-->
<!--            {{ templateCode || '&#45;&#45;' }}-->
<!--          </MetaChip>-->
<!--          <MetaChip>-->
<!--            <AIcon type="NotificationOutlined" />-->
<!--            {{ $t('NoticeCenter.template.field.channel') }}：{{ channel.channelName }}-->
<!--          </MetaChip>-->
<!--        </p>-->
      </div>

      <a-space v-if="editing" class="template-detail-head__actions">
        <a-button :disabled="saving" @click="$emit('cancel')">
          {{ $t('NoticeCenter.template.action.cancel') }}
        </a-button>
        <a-button type="primary" :loading="saving" @click="$emit('save')">
          <AIcon type="CheckOutlined" />
          {{ $t('NoticeCenter.template.action.save') }}
        </a-button>
      </a-space>
      <a-space v-else class="template-detail-head__actions">
<!--        <a-button @click="$emit('copy')">-->
<!--          <AIcon type="CopyOutlined" />-->
<!--          {{ $t('NoticeCenter.template.action.copyRaw') }}-->
<!--        </a-button>-->
        <a-button type="primary" @click="$emit('primary')">
          <AIcon :type="channel.hasNotifierConfig ? 'EditOutlined' : 'SettingOutlined'" />
          {{ primaryActionText }}
        </a-button>
      </a-space>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  NoticeTemplateAlarmNode,
  NoticeTemplateChannelNode,
} from '../hooks/useNoticeTemplateCenter'

const props = defineProps<{
  alarm: NoticeTemplateAlarmNode
  channel: NoticeTemplateChannelNode
  breadcrumb: string[]
  templateCode: string
  editing: boolean
  saving: boolean
  primaryActionText: string
}>()

defineEmits<{
  (e: 'copy'): void
  (e: 'primary'): void
  (e: 'cancel'): void
  (e: 'save'): void
}>()

const { t: $t } = useI18n()

const channelIcon = computed(() => {
  const provider = props.channel.channelProvider
  if (provider.includes('sms')) return 'MessageOutlined'
  if (provider.includes('email')) return 'MailOutlined'
  if (provider.includes('dingTalk')) return 'DingdingOutlined'
  if (provider.includes('weixin')) return 'WechatOutlined'
  return 'NotificationOutlined'
})

const channelToneClass = computed(() => {
  const provider = props.channel.channelProvider
  if (provider.includes('sms')) return 'is-warn'
  if (provider.includes('weixin')) return 'is-ok'
  if (provider.includes('inside')) return 'is-soft'
  return 'is-info'
})
</script>

<style scoped lang="less">
.template-detail-head {
  padding: var(--space-5) var(--space-6);
  border-bottom: 0.0625rem solid var(--line);
  background: var(--bg);
}

.template-detail-head__breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  color: var(--ink-4);
  font-size: var(--fs-12);

  i {
    margin-left: var(--space-2);
    color: var(--line);
    font-style: normal;
  }
}

.template-detail-head__main {
  display: grid;
  grid-template-columns: 2.75rem minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4);
}

.template-detail-head__icon {
  width: 2.75rem;
  height: 2.75rem;
  display: grid;
  place-items: center;
  border-radius: var(--r-2);
  font-size: var(--fs-18);

  &.is-info {
    background: var(--info-bg);
    color: var(--info);
  }

  &.is-warn {
    background: var(--warn-bg);
    color: var(--warn);
  }

  &.is-ok {
    background: var(--ok-bg);
    color: var(--ok);
  }

  &.is-soft {
    background: var(--bg-sunken);
    color: var(--accent);
  }
}

.template-detail-head__copy {
  min-width: 0;

  p {
    margin: var(--space-2) 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
}

.template-detail-head__title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);

  h1 {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    color: var(--ink-1);
    font-size: var(--fs-20);
    font-weight: 650;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 64rem) {
  .template-detail-head__main {
    grid-template-columns: 2.75rem minmax(0, 1fr);
  }

  .template-detail-head__actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>
