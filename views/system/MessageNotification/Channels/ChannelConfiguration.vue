<template>
  <div class="channel-configuration">
    <InlineEditForm :key="entry.key" ref="form" :groups="formGroups" :mode="entry.isNew ? 'form' : 'detail'" :disabled="disabled" :busy="busy" :messages="formMessages" :submit="submitValue" @change="changeValue" @cancel="cancelValue" @focus="emit('focus', $event)">
      <template #editor="{ field, value, update, commit, blur, disabled: fieldDisabled }">
        <div v-if="customPairModel(field.key, value, fieldDisabled)" @focusout="blur"><ConfigurationPairs :model="customPairModel(field.key, value, fieldDisabled)!" @change="update" /></div>
        <MetadataValueItem v-else :key="`${entry.key}-${field.key}`" :item="metadataField(field.key)?.property" :model-value="value" :aria-label="field.label" :disabled="fieldDisabled" @update:model-value="!fieldDisabled && update($event)" @change="commit" />
      </template>
    </InlineEditForm>
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
const { formGroups, formMessages, changeValue, cancelValue, submitValue, metadataField, customPairModel } = useChannelConfiguration(props, (key, value, topLevel) => emit('field', key, value, topLevel), key => form.value?.editField(key))
</script>

<style scoped>
.channel-configuration { min-width: 0; width: 100%; max-width: 55rem; }
</style>
