<template>
  <div class="configuration-pairs">
    <a-alert v-if="!validShape" type="error" :message="t('messageNotification.channels.invalidPairs')" show-icon />
    <div v-for="(row, index) in rows" :key="index" class="configuration-pairs__row">
      <a-input :value="row[nameKey]" :aria-label="t('messageNotification.channels.fields.propertyName')" :placeholder="t('messageNotification.channels.fields.propertyName')" :disabled="model.disabled" @update:value="update(index, nameKey, $event)" />
      <a-input-password v-if="model.kind === 'headers'" :value="row.value" autocomplete="new-password" :aria-label="t('messageNotification.channels.fields.propertyValue')" :placeholder="model.savedKeys.includes(String(row[nameKey] || '').toLowerCase()) ? t('messageNotification.channels.keepSecret') : t('messageNotification.channels.fields.propertyValue')" :disabled="model.disabled" @update:value="update(index, 'value', $event)" />
      <a-input v-else :value="row.value" :aria-label="t('messageNotification.channels.fields.propertyValue')" :placeholder="t('messageNotification.channels.fields.propertyValue')" :disabled="model.disabled" @update:value="update(index, 'value', $event)" />
      <a-input v-if="model.kind === 'properties'" :value="row.description" :aria-label="t('messageNotification.channels.fields.propertyDescription')" :placeholder="t('messageNotification.channels.fields.propertyDescription')" :disabled="model.disabled" @update:value="update(index, 'description', $event)" />
      <a-button :disabled="model.disabled" danger type="text" :aria-label="t('messageNotification.channels.removeProperty')" @click="remove(index)">
        <AIcon type="DeleteOutlined" />
      </a-button>
    </div>
    <a-button :disabled="model.disabled || !validShape" type="dashed" @click="add">{{ t('messageNotification.channels.addProperty') }}</a-button>
  </div>
</template>

<script setup lang="ts">
import { useConfigurationPairs, type ConfigurationPairsModel } from './useConfigurationPairs'

const props = defineProps<{ model: ConfigurationPairsModel }>()
const emit = defineEmits<{ (event: 'change', value: Record<string, string>[]): void }>()
const { t, nameKey, validShape, rows, update, remove, add } = useConfigurationPairs(() => props.model, value => emit('change', value))
</script>

<style scoped>
.configuration-pairs { display: flex; flex-direction: column; gap: var(--space-2); }
.configuration-pairs__row { display: flex; gap: var(--space-2); align-items: center; }
.configuration-pairs__row > :not(button) { flex: 1; min-width: 0; }
@media (max-width: 48rem) { .configuration-pairs__row { flex-wrap: wrap; } .configuration-pairs__row > :not(button) { flex-basis: 40%; } }
</style>
