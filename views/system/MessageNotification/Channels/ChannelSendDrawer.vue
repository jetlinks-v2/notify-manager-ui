<template>
  <JlDrawerShell :open="model.open" :title="t('messageNotification.channels.sendTitle')" :sub="model.configId" :width="560" @update:open="!$event && emit('close')">
    <a-alert v-if="model.state === 'unavailable' || model.state === 'forbidden' || model.state === 'error'" show-icon :type="model.state === 'error' ? 'error' : 'info'" :message="t(`messageNotification.state.${model.state}`)" />
    <CloudEmpty v-else-if="model.state === 'empty'" :description="t('messageNotification.channels.noSendTemplate')" />
    <a-spin v-else :spinning="model.state === 'loading'">
      <a-form layout="vertical" @submit.prevent>
        <a-form-item :label="t('messageNotification.channels.sendTemplate')">
          <a-select ref="templateSelect" :value="model.selected?.id" :options="templateOptions" :disabled="model.sending || model.state === 'loading'" :placeholder="t('messageNotification.channels.chooseTemplate')" :aria-label="t('messageNotification.channels.sendTemplate')" @change="emit('template', String($event))" />
        </a-form-item>
        <a-alert v-if="model.selected && model.invalidParameters" type="warning" show-icon :message="t('messageNotification.channels.validation.parameters')" />
        <a-form-item :label="t('messageNotification.channels.sendParameters')" :help="t('messageNotification.channels.sendParametersHelp')">
          <a-textarea :value="model.parameters" :rows="8" :disabled="model.sending || !model.selected" :aria-label="t('messageNotification.channels.sendParameters')" @update:value="emit('parameters', $event)" />
        </a-form-item>
        <a-alert v-if="model.missing.length" type="warning" show-icon :message="t('messageNotification.channels.missingParameters', { fields: model.missing.join(', ') })" />
        <a-alert v-if="model.error" type="error" show-icon :message="t(`messageNotification.state.${model.error}`)" />
        <a-alert v-if="model.sent" type="success" show-icon :message="t('messageNotification.channels.sendAccepted')" />
      </a-form>
    </a-spin>
    <template #foot>
      <StickyActionBar position="inline">
        <a-button :disabled="model.sending" @click="emit('close')">{{ t('messageNotification.common.close') }}</a-button>
        <a-popconfirm :title="t('messageNotification.channels.confirmSend')" :disabled="!model.canSend" @confirm="emit('send')">
          <a-button type="primary" :loading="model.sending" :disabled="!model.canSend">{{ t('messageNotification.channels.send') }}</a-button>
        </a-popconfirm>
      </StickyActionBar>
    </template>
  </JlDrawerShell>
</template>

<script setup lang="ts">
import { useChannelSendDrawer, type ChannelSendDrawerModel } from './useChannelSendDrawer'

const props = defineProps<{ model: ChannelSendDrawerModel }>()
const emit = defineEmits<{
  (event: 'close' | 'send'): void
  (event: 'template' | 'parameters', value: string): void
}>()
const { t, templateSelect, templateOptions } = useChannelSendDrawer(() => props.model)
</script>
