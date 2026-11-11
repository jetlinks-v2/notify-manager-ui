<template>
  <div class="channel-test-settings">
    <div v-for="field in fields" :key="field.key" class="channel-test-settings__field">
      <label>{{ t(`messageNotification.channelTest.fields.${field.key}`) }}<span v-if="field.required"> *</span></label>
      <a-select v-if="field.key === 'templateType'" :value="settings.templateType || 'tts'" :options="voiceOptions" :disabled="disabled" :aria-label="t(`messageNotification.channelTest.fields.${field.key}`)" :get-popup-container="popupContainer" @change="update(field.key, $event)" />
      <a-input v-else :value="settings[field.key]" :disabled="disabled" :aria-label="t(`messageNotification.channelTest.fields.${field.key}`)" @update:value="update(field.key, $event)" />
    </div>
    <div class="channel-test-settings__field">
      <label>{{ t('messageNotification.channelTest.fields.parameters') }}</label>
      <span class="channel-test-settings__hint">{{ t('messageNotification.channelTest.settings.parametersHint') }}</span>
      <div v-for="(row, index) in rows" :key="index" class="channel-test-settings__parameter">
        <a-input :value="row.name" :disabled="disabled" :aria-label="t('messageNotification.channelTest.settings.parameterName')" :placeholder="t('messageNotification.channelTest.settings.parameterName')" @update:value="updateParameter(index, 'name', $event)" />
        <a-input :value="row.value" :disabled="disabled" :aria-label="t('messageNotification.channelTest.settings.parameterValue')" :placeholder="t('messageNotification.channelTest.settings.parameterValue')" @update:value="updateParameter(index, 'value', $event)" />
        <a-button type="text" danger :disabled="disabled" :aria-label="t('messageNotification.channelTest.settings.removeParameter')" @click="removeParameter(index)"><AIcon type="DeleteOutlined" /></a-button>
      </div>
      <a-button class="channel-test-settings__add" :disabled="disabled" @click="addParameter">{{ t('messageNotification.channelTest.settings.addParameter') }}</a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChannelTestSettings } from './useChannelTestSettings'
import type { ChannelTestSettings } from './channelTestConfig'
const props = defineProps<{ channelId: string; value?: unknown; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'change', value: ChannelTestSettings): void }>()
const { t, settings, fields, rows, voiceOptions, update, updateParameter, addParameter, removeParameter, popupContainer } = useChannelTestSettings(props, value => emit('change', value))
</script>

<style scoped>
.channel-test-settings { display: grid; gap: var(--space-4); min-width: 0; }
.channel-test-settings__field { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.channel-test-settings__hint { color: var(--text-color-secondary); font-size: var(--fs-12); }
.channel-test-settings__parameter { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: start; gap: var(--space-2); }
.channel-test-settings__add { align-self: flex-start; }
</style>
