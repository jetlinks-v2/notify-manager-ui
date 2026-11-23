<template>
  <div class="channel-configuration">
    <a-alert v-if="hiddenErrors.length" type="error" show-icon :message="hiddenErrors.join('；')" class="channel-configuration__error" />
    <InlineEditForm :key="entry.key" :groups="formGroups" mode="form" :disabled="disabled" :busy="busy" :messages="formMessages" @change="changeValue" @focus="emit('focus', $event)">
      <template #editor="{ field, inputId, value, update, disabled: fieldDisabled }">
        <a-input-password v-if="metadataField(field.key)?.kind === 'secret'" :id="inputId"
          :value="!fieldDisabled && typeof value === 'string' ? value : ''" :disabled="fieldDisabled"
          :visible="fieldDisabled ? false : undefined" :visibility-toggle="!fieldDisabled"
          :aria-label="field.label" :placeholder="field.placeholder" :status="field.error ? 'error' : undefined"
          autocomplete="new-password" @update:value="update" />
        <a-select v-else-if="field.key === 'email:preset'" :id="inputId"
          :value="typeof value === 'string' ? value : undefined" :options="field.options" :disabled="fieldDisabled"
          :aria-label="field.label" @change="update" />
        <template v-else-if="emailOptionsVisible && field.key === 'config:host'">
          <a-auto-complete v-if="preset === 'other'" :value="typeof value === 'string' ? value : ''" :options="smtpOptions" :filter-option="filterSmtpOption" :disabled="fieldDisabled" :aria-label="field.label" class="channel-configuration__host" @change="update" @select="selectSmtpHost" />
          <a-select v-else :value="typeof value === 'string' ? value : undefined" :options="smtpOptions" show-search :filter-option="filterSmtpOption" :disabled="fieldDisabled" :aria-label="field.label" class="channel-configuration__host" @change="update" />
        </template>
        <div v-else-if="field.key === 'config:testTemplate'">
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
  externalFields: { type: Array as PropType<readonly string[]>, default: undefined },
  submit: { type: Function as PropType<(changes: ChannelFieldChange[], errorPath: string) => Promise<boolean>>, default: undefined },
})
const emit = defineEmits<{ (event: 'field', key: string, value: unknown, topLevel?: boolean): void; (event: 'focus', key: string): void }>()
const {
  t, hiddenErrors, formGroups, formMessages, changeValue, metadataField, customPairModel,
  preset, emailOptionsVisible, smtpOptions, selectSmtpHost, filterSmtpOption,
  canClearSigningSecret, clearSecretOpen, clearSecretPending, clearSecretError, requestClearSigningSecret, cancelClearSigningSecret, clearSigningSecret,
} = useChannelConfiguration(props, (key, value, topLevel) => emit('field', key, value, topLevel))
</script>

<style scoped>
.channel-configuration { min-width: 0; width: 100%; max-width: 55rem; }
.channel-configuration__error { margin-bottom: var(--space-4); }
.channel-configuration__host { width: 100%; }
</style>
