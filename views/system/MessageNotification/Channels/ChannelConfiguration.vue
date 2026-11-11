<template>
  <div class="channel-configuration">
    <InlineEditForm :key="entry.key" ref="form" :groups="formGroups" :mode="entry.isNew ? 'form' : 'detail'" :disabled="disabled" :busy="busy" :messages="formMessages" :submit="submitValue" @change="changeValue" @cancel="cancelValue" @focus="emit('focus', $event)">
      <template #editor="{ field, value, update, commit, blur, disabled: fieldDisabled }">
        <div v-if="customPairModel(field.key, value, fieldDisabled)" @focusout="blur"><ConfigurationPairs :model="customPairModel(field.key, value, fieldDisabled)!" @change="update" /></div>
        <MetadataValueItem v-else :key="`${entry.key}-${field.key}`" :item="metadataField(field.key)?.property" :model-value="value" :aria-label="field.label" :disabled="fieldDisabled" @update:model-value="!fieldDisabled && update($event)" @change="commit" />
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
import { ref, type PropType } from 'vue'
import { InlineEditForm } from '@jetlinks-web-core/components/InlineEditForm'
import type { ChannelDraftEntry, ChannelFieldChange } from './useChannelWorkspace'
import { useChannelConfiguration } from './useChannelConfiguration'
import ConfigurationPairs from './ConfigurationPairs.vue'
const props = defineProps({
  entry: { type: Object as PropType<ChannelDraftEntry>, required: true },
  disabled: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  submit: { type: Function as PropType<(changes: ChannelFieldChange[], errorPath: string) => Promise<boolean>>, default: undefined },
})
const emit = defineEmits<{ (event: 'field', key: string, value: unknown, topLevel?: boolean): void; (event: 'focus', key: string): void }>()
const form = ref<InstanceType<typeof InlineEditForm>>()
const {
  t, formGroups, formMessages, changeValue, cancelValue, submitValue, metadataField, customPairModel,
  canClearSigningSecret, clearSecretOpen, clearSecretPending, clearSecretError, requestClearSigningSecret, cancelClearSigningSecret, clearSigningSecret,
} = useChannelConfiguration(props, (key, value, topLevel) => emit('field', key, value, topLevel), key => form.value?.editField(key))
</script>

<style scoped>
.channel-configuration { min-width: 0; width: 100%; max-width: 55rem; }
</style>
