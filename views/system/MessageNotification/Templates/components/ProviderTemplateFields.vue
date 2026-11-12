<template>
  <a-form-item v-for="field in fields" :key="field.key" :label="t(field.labelKey)" :required="field.required">
    <TemplateFieldRenderer :field="field" :value="value(field)" @update="update(field, $event)" @activate="activate" />
  </a-form-item>
  <a-space v-if="draft.variables.length" wrap>
    <span>{{ t('messageNotification.templates.insertVariable') }}</span>
    <a-button v-for="variable in draft.variables" :key="variable.id" size="small" :disabled="disabled || !activePath.length" @mousedown.prevent @click="insertVariable(variable.id)">{{ variable.name || variable.id }}</a-button>
  </a-space>
</template>

<script setup lang="ts">
import type { TemplateDraft } from '../model'
import TemplateFieldRenderer from '../../../../notice/template/components/TemplateFieldRenderer.vue'
import { useProviderTemplateFields } from '../hooks/useProviderTemplateFields'
const props = defineProps<{ draft: TemplateDraft; disabled?: boolean }>()
const { t, fields, value, update, activate, activePath, insertVariable } = useProviderTemplateFields(props)
</script>
