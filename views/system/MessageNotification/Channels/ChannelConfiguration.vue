<template>
  <div class="channel-configuration">
    <a-alert v-if="editing && hiddenErrors.length" type="error" show-icon :message="hiddenErrors.join('；')" class="channel-configuration__error" />
    <InlineEditForm :key="`${entry.key}:${editing}`" :groups="formGroups" :mode="editing ? 'form' : 'detail'" :disabled="disabled || !editing" :busy="busy" :messages="formMessages" @change="changeValue" @focus="emit('focus', $event)">
      <template #editor="{ field, value, update, disabled: fieldDisabled }">
        <div v-if="field.key === 'config:testTemplate'">
          <ChannelTestSettings :channel-id="`${entry.draft.type}:${entry.draft.provider}`" :value="value" :disabled="fieldDisabled" @change="update" />
        </div>
        <div v-else-if="customPairModel(field.key, value, fieldDisabled)"><ConfigurationPairs :model="customPairModel(field.key, value, fieldDisabled)!" @change="update" /></div>
        <MetadataValueItem v-else :key="`${entry.key}-${field.key}`" :item="metadataField(field.key)?.property" :model-value="value" :aria-label="field.label" :disabled="fieldDisabled" @update:model-value="!fieldDisabled && update($event)" />
      </template>
    </InlineEditForm>
    <a-button v-if="canClearSigningSecret" type="link" danger :disabled="disabled || busy || clearSecretPending" @click="requestClearSigningSecret">{{ t('messageNotification.channels.robot.clearSecret') }}</a-button>
    <a-modal :open="clearSecretOpen" :title="t('messageNotification.channels.robot.clearSecretTitle')" centered :mask-closable="false" :closable="false" :keyboard="!clearSecretPending" :confirm-loading="clearSecretPending" :ok-text="t('messageNotification.channels.robot.clearSecret')" :cancel-text="t('messageNotification.common.cancel')" :ok-button-props="{ danger: true, disabled: disabled || busy || clearSecretPending }" :cancel-button-props="{ disabled: clearSecretPending }" @ok="clearSigningSecret" @cancel="cancelClearSigningSecret">
      <p>{{ t('messageNotification.channels.robot.clearSecretDescription') }}</p>
      <a-alert v-if="clearSecretError" type="error" show-icon :message="clearSecretError" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { InlineEditForm } from '@jetlinks-web-core/components/InlineEditForm'
import type { ChannelDraftEntry, ChannelFieldChange } from './useChannelWorkspace'
import { useChannelConfiguration } from './useChannelConfiguration'
import ConfigurationPairs from './ConfigurationPairs.vue'
import ChannelTestSettings from './testing/ChannelTestSettings.vue'
const props = defineProps({
  entry: { type: Object as PropType<ChannelDraftEntry>, required: true },
  disabled: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  submit: { type: Function as PropType<(changes: ChannelFieldChange[], errorPath: string) => Promise<boolean>>, default: undefined },
})
const emit = defineEmits<{ (event: 'field', key: string, value: unknown, topLevel?: boolean): void; (event: 'focus', key: string): void }>()
const {
  t, editing, hiddenErrors, formGroups, formMessages, changeValue, metadataField, customPairModel,
  canClearSigningSecret, clearSecretOpen, clearSecretPending, clearSecretError, requestClearSigningSecret, cancelClearSigningSecret, clearSigningSecret,
} = useChannelConfiguration(props, (key, value, topLevel) => emit('field', key, value, topLevel))
</script>

<style scoped>
.channel-configuration { min-width: 0; width: 100%; max-width: 55rem; }
.channel-configuration__error { margin-bottom: var(--space-4); }
</style>
