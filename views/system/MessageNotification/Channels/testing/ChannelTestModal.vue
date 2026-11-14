<template>
  <a-modal class="notification-channel-test" :open="model.open" :title="model.title" :width="460" centered :closable="model.stage !== 'sending'" :mask-closable="false" :keyboard="model.stage !== 'sending'" @cancel="emit('close')" :after-close="() => emit('closed')">
    <div class="notification-channel-test__preview">
      <template v-if="model.providerTemplate">
        <p>{{ t('messageNotification.channelTest.vendorContent') }}</p>
        <p v-if="model.templateCode">{{ t('messageNotification.channelTest.vendorTemplate', { code: model.templateCode }) }}</p>
        <p v-for="parameter in model.parameters" :key="parameter.name">{{ parameter.name }}: {{ parameter.value }}</p>
      </template>
      <p v-else>{{ t('messageNotification.channelTest.content', { message: model.message }) }}</p>
    </div>
    <a-alert v-if="!model.supported" type="warning" show-icon :message="t('messageNotification.channelTest.unsupported')" />
    <a-alert v-else-if="model.missing.length" type="warning" show-icon :message="t('messageNotification.channelTest.missing', { fields: model.missing.map(field => t(`messageNotification.channelTest.fields.${field}`)).join('、') })">
      <template #action><a-button type="link" size="small" @click="emit('fix')">{{ t('messageNotification.channelTest.fix') }}</a-button></template>
    </a-alert>
    <template v-if="model.supported && model.stage === 'form'">
      <div v-if="model.fixedTarget" class="notification-channel-test__target">{{ model.targetLabel }}</div>
      <a-radio-group v-else class="notification-channel-test__recipients" :value="model.recipientMode" :aria-label="t('messageNotification.channelTest.recipient')" @change="emit('recipient', $event.target.value)">
        <div class="notification-channel-test__option" :class="{ 'notification-channel-test__option--selected': model.recipientMode === 'self' }">
          <a-radio value="self" :disabled="!model.ownRecipient">
            {{ t('messageNotification.channelTest.self') }}
            <span class="notification-channel-test__hint">{{ model.ownRecipient ? [model.ownLabel, model.ownRecipient].filter(Boolean).join(' · ') : t(model.identityState === 'loading' ? 'messageNotification.common.loading' : model.identityState === 'empty' ? 'messageNotification.channelTest.unbound' : 'messageNotification.channelTest.identityFailed') }}</span>
          </a-radio>
          <a-button v-if="['error', 'forbidden', 'unavailable'].includes(model.identityState)" type="link" size="small" @click="emit('retry-identity')">{{ t('messageNotification.common.retry') }}</a-button>
        </div>
        <div class="notification-channel-test__option" :class="{ 'notification-channel-test__option--selected': model.recipientMode === 'other' }">
          <a-radio value="other">{{ t('messageNotification.channelTest.other') }}</a-radio>
          <a-form-item v-if="model.recipientMode === 'other'" class="notification-channel-test__address" :validate-status="model.recipientIssue ? 'error' : undefined" :help="model.recipientIssue ? t(`messageNotification.channelTest.${model.recipientIssue}`) : undefined">
            <a-input :value="model.address" :aria-label="t('messageNotification.channelTest.other')" :placeholder="t(`messageNotification.channelTest.placeholder.${model.kind}`)" :aria-invalid="!!model.recipientIssue" autocomplete="off" @update:value="emit('address', $event)" @blur="emit('validate')" />
          </a-form-item>
        </div>
      </a-radio-group>
      <a-alert v-if="model.recipientMode === 'self' && model.recipientIssue" type="warning" :message="t(`messageNotification.channelTest.${model.recipientIssue}`)" />
    </template>
    <a-alert v-else-if="model.stage !== 'form'" class="notification-channel-test__result" :type="model.stage === 'error' ? 'error' : model.stage === 'success' ? 'success' : 'info'" show-icon role="status">
      <template #message>{{ model.stage === 'error' ? model.error : t(`messageNotification.channelTest.${model.stage}`) }}</template>
      <template #description>{{ model.sentTo }}<template v-if="model.sentAt"> · {{ model.sentAt }}</template></template>
    </a-alert>
    <template #footer>
      <template v-if="model.stage === 'form' || model.stage === 'sending'">
        <a-button :disabled="model.stage === 'sending'" @click="emit('close')">{{ t('messageNotification.common.cancel') }}</a-button>
        <a-button type="primary" :loading="model.stage === 'sending'" :disabled="!model.canSend" @click="emit('send')">{{ t('messageNotification.channelTest.send') }}</a-button>
      </template>
      <template v-else>
        <a-button @click="emit('again')">{{ t('messageNotification.channelTest.again') }}</a-button>
        <a-button v-if="model.stage === 'error'" @click="emit('fix')">{{ t('messageNotification.channelTest.fix') }}</a-button>
        <a-button type="primary" @click="emit('close')">{{ t('messageNotification.common.close') }}</a-button>
      </template>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ChannelTestModel } from './useChannelTest'
defineProps<{ model: ChannelTestModel }>()
const emit = defineEmits<{
  (event: 'close' | 'closed' | 'retry-identity' | 'validate' | 'send' | 'again' | 'fix'): void
  (event: 'address', value: string): void
  (event: 'recipient', value: 'self' | 'other'): void
}>()
const { t } = useI18n()
</script>

<style scoped>
.notification-channel-test__preview { padding: var(--space-3); margin-bottom: var(--space-4); background: var(--bg-sunken); border-radius: var(--r-2); overflow-wrap: anywhere; color: var(--text-color-secondary); font-size: var(--fs-12); max-height: 220px; overflow-y: auto; }
.notification-channel-test__preview p { margin: 0; white-space: pre-wrap; }
.notification-channel-test__recipients { display: flex; flex-direction: column; gap: var(--space-3); width: 100%; margin-top: var(--space-4); }
.notification-channel-test__option { border: 1px solid var(--line); border-radius: var(--r-2); padding: var(--space-3); }
.notification-channel-test__option--selected { border-color: var(--primary-color); background: var(--primary-color-1); }
.notification-channel-test__hint { display: block; color: var(--text-color-secondary); font-size: var(--fs-12); overflow-wrap: anywhere; white-space: normal; }
.notification-channel-test__address { margin: var(--space-3) 0 0 var(--space-6); }
.notification-channel-test__result, .notification-channel-test__target { margin-top: var(--space-4); }
</style>
