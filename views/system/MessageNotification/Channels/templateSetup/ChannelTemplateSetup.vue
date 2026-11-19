<template>
  <section v-if="showFields || showFeedback" class="channel-template-setup" :aria-label="t(showFields ? prefix + 'title' : 'messageNotification.templates.title')">
    <h3 v-if="showFields && model.fields[0]?.key !== 'agentId'" class="channel-template-setup__title">{{ t(prefix + 'title') }}</h3>
    <InlineEditForm v-if="showFields" :groups="groups" :messages="formMessages"
      mode="form" :disabled="model.disabled" @change="(key, value) => emit('change', key, value)" @focus="emit('focus', $event)">
      <template #editor="{ field, value, inputId, disabled, update }">
        <a-input :id="inputId" :value="String(value ?? '')" :disabled="disabled" :maxlength="field.maxLength" inputmode="numeric"
          :aria-label="field.label" aria-required="true" :status="field.error ? 'error' : undefined" @update:value="update" />
      </template>
    </InlineEditForm>
    <template v-if="showFeedback">
      <a-alert v-if="summary" class="channel-template-setup__status" :type="failed ? 'warning' : 'info'"
        :message="summary" :description="details" show-icon />
      <p v-else-if="model.noPermission" class="channel-template-setup__hint">{{ t(prefix + 'noPermission') }}</p>
      <div v-if="canFill || canView" class="channel-template-setup__actions">
        <a-button v-if="canFill" size="small" :loading="model.generating" :disabled="model.disabled" @click="emit('fill')">
          {{ t(prefix + (failed ? 'retry' : 'fill')) }}
        </a-button>
        <a-button v-if="canView" type="link" size="small" :disabled="model.disabled" @click="emit('view')">
          {{ t('messageNotification.templates.title') }}
        </a-button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { InlineEditForm, type InlineEditGroup, type InlineEditMessages } from '@jetlinks-web-core/components/InlineEditForm'
import { templateSetupMessageTypes } from './templateDefaults'
import type { ChannelTemplateSetupModel } from './useChannelTemplateSetup'

const props = defineProps<{ model: ChannelTemplateSetupModel; mode?: 'fields' | 'feedback' }>()
const emit = defineEmits<{ change: [key: string, value: unknown]; focus: [key: string]; fill: []; view: [] }>()
const prefix = 'messageNotification.channels.templateSetup.'
const { t } = useI18n()
const failed = computed(() => !!(props.model.result?.failed.length || props.model.result?.loadFailure))
const canFill = computed(() => props.model.canFill && (props.mode !== 'feedback' || failed.value))
const canView = computed(() => !!(props.model.result?.created || props.model.result?.skipped))
const showFields = computed(() => props.mode !== 'feedback' && !!props.model.fields.length)
const showFeedback = computed(() => props.mode !== 'fields' && !!(props.model.result || props.model.noPermission || canFill.value))
const groups = computed<InlineEditGroup[]>(() => [{
  key: 'message-template',
  fields: props.model.fields.map(field => ({
    key: field.key, label: t(field.labelKey), editor: field.editor, maxLength: field.maxLength, required: true, fullWidth: true,
    value: field.value, initialValue: field.value, error: field.error ? t(field.error) : undefined,
    options: field.key === 'messageType' ? templateSetupMessageTypes : undefined,
  })),
}])
const formMessages = computed<InlineEditMessages>(() => ({
  save: t('messageNotification.common.save'),
  cancel: t('messageNotification.common.cancel'),
  empty: t('messageNotification.channels.notFilled'),
  saving: t('messageNotification.channels.savingField'),
  failed: t('messageNotification.state.error'),
}))
const summary = computed(() => {
  const result = props.model.result
  if (!result) return ''
  if (result.loadFailure) return t(prefix + 'loadFailure')
  if (!result.created && !result.skipped && !result.failed.length) return t(prefix + 'empty')
  return t(prefix + 'summary', { created: result.created, skipped: result.skipped, failed: result.failed.length })
})
const details = computed(() => {
  const result = props.model.result
  if (result?.loadFailure) return t(`messageNotification.state.${result.loadFailure}`)
  if (!result?.failed.length) return undefined
  const topics = result.failed.join(t(prefix + 'separator'))
  return t(prefix + (result.unknown ? 'unknown' : 'failed'), { topics })
})
</script>

<style scoped>
.channel-template-setup { display: grid; gap: var(--space-3); min-width: 0; max-width: 55rem; margin-top: var(--space-5); }
.channel-template-setup__title { margin: 0; color: var(--jet-theme-text-title); font-size: var(--fs-14); font-weight: 500; }
.channel-template-setup__hint { margin: 0; color: var(--text-color-secondary); font-size: var(--fs-12); }
.channel-template-setup__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.channel-template-setup__status { overflow-wrap: anywhere; }
</style>
