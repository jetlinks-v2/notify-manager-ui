<template>
  <a-modal class="robot-configuration-modal" :open="model.open" :title="t(model.isNew ? 'messageNotification.channels.robot.addTitle' : 'messageNotification.channels.robot.editTitle')" :width="520" centered destroy-on-close :mask-closable="false" :closable="!model.busy" :keyboard="!model.busy" @cancel="emit('close')">
    <a-form layout="vertical" :required-mark="false" @submit.prevent="emit('save')">
      <a-form-item :label="t('messageNotification.channels.robot.name')" :validate-status="model.nameError ? 'error' : undefined" :help="model.nameError" :extra="t('messageNotification.channels.robot.nameHint')">
        <a-input :value="model.name" :disabled="model.disabled" :aria-label="t('messageNotification.channels.robot.name')" :aria-invalid="!!model.nameError" :placeholder="t('messageNotification.channels.robot.namePlaceholder')" autocomplete="off" autofocus @update:value="emit('change', 'name', $event)" />
      </a-form-item>
      <a-form-item :label="t('messageNotification.channels.robot.webhook')" :validate-status="model.urlError ? 'error' : undefined" :help="model.urlError" :extra="t(model.isNew ? 'messageNotification.channels.robot.webhookHint' : 'messageNotification.channels.robot.keepWebhook')">
        <a-input :value="model.url" :disabled="model.disabled" :aria-label="t('messageNotification.channels.robot.webhook')" :aria-invalid="!!model.urlError" :placeholder="model.savedUrl || 'https://oapi.dingtalk.com/robot/send?access_token=…'" autocomplete="off" @update:value="emit('change', 'url', $event)" />
      </a-form-item>
      <a-alert v-if="model.error" type="error" show-icon :message="model.error" role="alert" />
    </a-form>
    <template #footer>
      <a-button :disabled="model.busy" @click="emit('close')">{{ t('messageNotification.common.cancel') }}</a-button>
      <j-permission-button type="primary" :has-permission="[model.isNew ? notificationPermissions.channels.add : notificationPermissions.channels.update]" :loading="model.busy" :disabled="!model.canSave" @click="emit('save')">{{ t(model.isNew ? 'messageNotification.common.add' : 'messageNotification.common.save') }}</j-permission-button>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { notificationPermissions } from '../../shared'
import type { RobotConfigurationModalModel } from './useRobotConfigurations'
defineProps<{ model: RobotConfigurationModalModel }>()
const emit = defineEmits<{
  (event: 'close' | 'save'): void
  (event: 'change', key: 'name' | 'url', value: string): void
}>()
const { t } = useI18n()
</script>

<style>
.robot-configuration-modal .ant-modal-header { background: transparent; }
.robot-configuration-modal .ant-modal-header .ant-modal-title { padding-bottom: 0; }
.robot-configuration-modal .ant-modal-footer { border-top: 1px solid var(--line); }
</style>
