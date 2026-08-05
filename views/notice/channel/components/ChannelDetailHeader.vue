<template>
  <header class="channel-detail-head">
    <div class="channel-detail-head__icon" :class="`is-${channel.type}`">
      <AIcon :type="channel.icon" />
    </div>
    <div class="channel-detail-head__copy">
      <h2>{{ $t(channel.name) }}</h2>
      <p>
        <j-badge-status
          :status="channel.status"
          :text="$t(`NoticeCenter.channel.state.${channel.status}`)"
          :statusNames="statusNames"
        />
      </p>
    </div>
    <a-space class="channel-detail-head__actions">
<!--      <a-button-->
<!--        v-if="channel.status !== 'builtin'"-->
<!--        :disabled="!channel.config?.id"-->
<!--        :loading="testing"-->
<!--        @click="$emit('test')"-->
<!--      >-->
<!--        <AIcon type="SendOutlined" />-->
<!--        {{ $t('NoticeCenter.channel.action.testShort') }}-->
<!--      </a-button>-->
      <a-button type="primary" :loading="saving" @click="$emit('save')">
        <AIcon type="SaveOutlined" />
        {{ $t('NoticeCenter.channel.action.save') }}
      </a-button>
    </a-space>
  </header>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { NoticeChannelItem } from '../hooks/noticeChannelModel'

defineProps<{
  channel: NoticeChannelItem
  saving: boolean
  testing: boolean
}>()

defineEmits<{
  (e: 'save'): void
  (e: 'test'): void
}>()

const { t: $t } = useI18n()

const statusNames = {
  builtin: 'processing',
  configured: 'success',
  unconfigured: 'warning',
}
</script>

<style scoped lang="less">
.channel-detail-head {
  padding: var(--space-5);
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  border-bottom: 0.0625rem solid var(--jet-theme-border);
  background: var(--jet-theme-bg-container);
}

.channel-detail-head__icon {
  width: 3rem;
  height: 3rem;
  display: grid;
  place-items: center;
  border-radius: var(--jet-theme-radius);
  background: var(--jet-theme-primary-soft);
  color: var(--jet-theme-primary);
  font-size: var(--fs-18);

  &.is-sms {
    background: #fef3c7;
    color: #b45309;
  }

  &.is-email,
  &.is-dingTalk {
    background: #dbeafe;
    color: #1d4ed8;
  }

  &.is-weixin {
    background: #dcfce7;
    color: #15803d;
  }

  &.is-inside-mail {
    background: #f3e8ff;
    color: #7e22ce;
  }
}

.channel-detail-head__copy {
  min-width: 0;

  h2 {
    margin: 0;
    overflow: hidden;
    color: var(--jet-theme-text);
    font-size: var(--fs-20);
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: var(--space-2) 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
}

@media (max-width: 64rem) {
  .channel-detail-head {
    grid-template-columns: 3rem minmax(0, 1fr);
  }

  .channel-detail-head__actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>
