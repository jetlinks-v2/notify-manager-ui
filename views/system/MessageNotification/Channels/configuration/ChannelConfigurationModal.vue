<template>
  <a-modal class="channel-configuration-modal" :open="model.open" :title="title" :width="520" centered destroy-on-close :mask-closable="false" :closable="!model.busy" :keyboard="!model.busy" @cancel="emit('close')">
    <a-form layout="vertical" :required-mark="false" @submit.prevent="emit('save')">
      <a-form-item :label="nameLabel" :validate-status="model.nameError ? 'error' : undefined" :help="model.nameError" :extra="model.isRobot ? t('messageNotification.channels.robot.nameHint') : undefined">
        <a-input :value="model.name" :disabled="model.disabled" :aria-label="nameLabel" :aria-invalid="!!model.nameError" :placeholder="model.isRobot ? t('messageNotification.channels.robot.namePlaceholder') : undefined" autocomplete="off" autofocus @update:value="emit('change', 'name', $event)" />
      </a-form-item>
      <a-form-item v-if="model.isRobot" :label="t('messageNotification.channels.robot.webhook')" :validate-status="model.urlError ? 'error' : undefined" :help="model.urlError" :extra="t(model.isNew ? 'messageNotification.channels.robot.webhookHint' : 'messageNotification.channels.robot.keepWebhook')">
        <a-input-password :value="model.disabled ? '' : model.url" :disabled="model.disabled"
          :visible="model.open && !model.disabled ? undefined : false" :visibility-toggle="!model.disabled"
          :aria-label="t('messageNotification.channels.robot.webhook')" :aria-invalid="!!model.urlError"
          :placeholder="model.savedUrl || 'https://oapi.dingtalk.com/robot/send?access_token=…'" autocomplete="new-password"
          @update:value="emit('change', 'url', $event)" />
      </a-form-item>
      <slot />
      <a-alert v-if="model.error" type="error" show-icon :message="model.error" role="alert" />
    </a-form>
    <template #footer>
      <a-button :disabled="model.busy" @click="emit('close')">{{ t('messageNotification.common.cancel') }}</a-button>
      <j-permission-button type="primary" :has-permission="[model.isNew ? notificationPermissions.channels.add : notificationPermissions.channels.update]" :loading="model.busy" :disabled="!model.canSave" @click="emit('save')">{{ t(model.isNew ? 'messageNotification.common.add' : 'messageNotification.common.save') }}</j-permission-button>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { notificationPermissions } from '../../shared'
import type { ChannelConfigurationModalModel } from './useChannelConfigurations'
const props = defineProps<{ model: ChannelConfigurationModalModel }>()
const emit = defineEmits<{
  (event: 'close' | 'save'): void
  (event: 'change', key: 'name' | 'url', value: string): void
}>()
const { t } = useI18n()
const title = computed(() => t(`messageNotification.channels.${props.model.isRobot ? 'robot' : 'webhook'}.${props.model.isNew ? 'addTitle' : 'editTitle'}`))
const nameLabel = computed(() => t(props.model.isRobot ? 'messageNotification.channels.robot.name' : 'messageNotification.channels.fields.name'))
</script>

<style>
.channel-configuration-modal .ant-modal-header { background: transparent; }
.channel-configuration-modal .ant-modal-header .ant-modal-title { padding-bottom: 0; }
.channel-configuration-modal .ant-modal-footer { border-top: 1px solid var(--line); }
</style>
