<template>
  <a-form layout="vertical" class="channel-configuration" :disabled="disabled" @submit.prevent>
    <div class="channel-configuration__identity">
      <a-form-item :label="t('messageNotification.channels.fields.id')" required :validate-status="issue('id') ? 'error' : undefined" :help="issue('id')">
        <a-input v-if="entry.isNew" :value="entry.draft.id" :disabled="disabled" :aria-label="t('messageNotification.channels.fields.id')" @update:value="emit('field', 'id', $event, true)" />
        <a-typography-text v-else copyable>{{ entry.draft.id }}</a-typography-text>
      </a-form-item>
      <a-form-item :label="t('messageNotification.channels.fields.name')" required :validate-status="issue('name') ? 'error' : undefined" :help="issue('name')">
        <a-input v-if="entry.isNew" :value="entry.draft.name" :disabled="disabled" :aria-label="t('messageNotification.channels.fields.name')" @update:value="emit('field', 'name', $event, true)" />
        <Editable v-else :key="`${entry.key}-name`" :value="entry.draft.name" :component-props="{ disabled, 'aria-label': t('messageNotification.channels.fields.name') }" :tabindex="disabled ? -1 : 0" role="textbox" :aria-label="t('messageNotification.channels.fields.name')" @keydown.enter="enterInlineEdit" @update:value="emit('field', 'name', $event, true)" />
      </a-form-item>
    </div>
    <a-form-item v-for="field in fields" :key="field.key" :label="t(`messageNotification.channels.fields.${field.key}`)" :required="field.required" :validate-status="issue(field.key) ? 'error' : undefined" :help="issue(field.key)">
      <template v-if="field.kind === 'secret'">
        <a-input-password :value="stringValue(field.key)" :disabled="disabled" autocomplete="new-password" :aria-label="t(`messageNotification.channels.fields.${field.key}`)" :placeholder="entry.baseline ? t('messageNotification.channels.keepSecret') : t('messageNotification.channels.enterSecret')" @update:value="emit('field', field.key, $event)" />
        <span v-if="entry.baseline?.configuration[field.key]" class="channel-configuration__secret-hint">{{ notificationSecretMask }} · {{ t('messageNotification.channels.secretSaved') }}</span>
      </template>
      <a-input-number v-else-if="field.kind === 'number'" :value="numberValue(field.key)" :min="1" :max="65535" :precision="0" :disabled="disabled" :aria-label="t(`messageNotification.channels.fields.${field.key}`)" @update:value="emit('field', field.key, $event ?? undefined)" />
      <a-input v-else-if="entry.isNew" :value="stringValue(field.key)" :disabled="disabled" :aria-label="t(`messageNotification.channels.fields.${field.key}`)" @update:value="emit('field', field.key, $event)" />
      <Editable v-else :key="`${entry.key}-${field.key}`" :value="stringValue(field.key)" :component-props="{ disabled, 'aria-label': t(`messageNotification.channels.fields.${field.key}`) }" :tabindex="disabled ? -1 : 0" role="textbox" :aria-label="t(`messageNotification.channels.fields.${field.key}`)" @keydown.enter="enterInlineEdit" @update:value="emit('field', field.key, $event)" />
    </a-form-item>
    <a-form-item v-if="pairEditor" :label="t(`messageNotification.channels.fields.${pairEditor.kind}`)" :validate-status="issue(pairEditor.kind) ? 'error' : undefined" :help="issue(pairEditor.kind)">
      <ConfigurationPairs :model="pairEditor" @change="emit('field', pairEditor!.kind, $event)" />
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { ChannelDraftEntry } from './useChannelWorkspace'
import { useChannelConfiguration } from './useChannelConfiguration'
import ConfigurationPairs from './ConfigurationPairs.vue'

const props = defineProps({
  entry: { type: Object as PropType<ChannelDraftEntry>, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits<{ (event: 'field', key: string, value: unknown, topLevel?: boolean): void }>()
const { t, notificationSecretMask, fields, pairEditor, stringValue, numberValue, issue, enterInlineEdit } = useChannelConfiguration(props)
</script>

<style scoped>
.channel-configuration { max-width: 56rem; }
.channel-configuration__identity { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
.channel-configuration :deep(.ant-input-number) { width: 100%; }
.channel-configuration__secret-hint { display: block; margin-top: var(--space-1); color: var(--text-color-secondary); font-size: var(--fs-12); }
@media (max-width: 48rem) { .channel-configuration__identity { grid-template-columns: minmax(0, 1fr); gap: 0; } }
</style>
