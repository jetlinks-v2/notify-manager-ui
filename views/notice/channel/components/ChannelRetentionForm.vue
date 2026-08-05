<template>
  <section class="channel-credential__section">
    <div class="channel-credential__title">
      <span>2</span>
      {{ $t('NoticeCenter.channel.retention.title') }}
    </div>
    <div class="channel-credential__grid">
      <a-form-item :label="$t('NoticeCenter.channel.retention.unread')">
        <a-select v-model:value="retention.unread" :options="unreadOptions" />
      </a-form-item>
      <a-form-item :label="$t('NoticeCenter.channel.retention.read')">
        <a-select v-model:value="retention.read" :options="readOptions" />
      </a-form-item>
      <a-form-item :label="$t('NoticeCenter.channel.retention.remind')">
        <a-select v-model:value="retention.remind" :options="remindOptions" />
      </a-form-item>
      <a-form-item :label="$t('NoticeCenter.channel.retention.digest')">
        <a-select v-model:value="retention.digest" :options="digestOptions" />
      </a-form-item>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

const unreadOptions = [
  { label: $t('NoticeCenter.channel.retention.day90'), value: '90' },
  { label: $t('NoticeCenter.channel.retention.day30'), value: '30' },
]

const readOptions = [
  { label: $t('NoticeCenter.channel.retention.day30'), value: '30' },
  { label: $t('NoticeCenter.channel.retention.day7'), value: '7' },
  { label: $t('NoticeCenter.channel.retention.clearNow'), value: 'clear' },
]

const remindOptions = [
  { label: $t('NoticeCenter.channel.retention.desktopAndBadge'), value: 'desktopAndBadge' },
  { label: $t('NoticeCenter.channel.retention.badgeOnly'), value: 'badgeOnly' },
  { label: $t('NoticeCenter.channel.retention.noRemind'), value: 'none' },
]

const digestOptions = [
  { label: $t('NoticeCenter.channel.retention.noDigest'), value: 'none' },
  { label: $t('NoticeCenter.channel.retention.digestMorning'), value: '09:00' },
  { label: $t('NoticeCenter.channel.retention.digestEvening'), value: '18:00' },
]

const retention = reactive({
  unread: '90',
  read: '30',
  remind: 'desktopAndBadge',
  digest: 'none',
})
</script>
