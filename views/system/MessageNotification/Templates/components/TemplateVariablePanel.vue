<template>
  <aside class="template-variables" :aria-label="t('messageNotification.templates.visual.availableVariables')">
    <header><strong>{{ t('messageNotification.templates.visual.availableVariables') }}</strong><p>{{ t('messageNotification.templates.visual.variableHint') }}</p></header>
    <section v-for="group in groups" :key="group.key">
      <div class="template-variables__group">{{ group.title }}</div>
      <button v-for="variable in group.rows" :key="variable.id" type="button" :disabled="disabled" :title="'${' + variable.id + '} · ' + variable.sample" @mousedown.prevent @click="$emit('insert', variable.id)">
        <span class="template-variables__name">{{ '{' + (variable.name || variable.id) + '}' }}</span><span class="template-variables__sample">{{ variable.sample }}</span>
      </button>
    </section>
  </aside>
</template>

<script setup lang="ts">
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import type { NotificationVariable } from '../../shared'
import type { TemplateDraft } from '../model'
import { useTemplateVariablePanel } from '../hooks/useTemplateVariablePanel'
const props = defineProps<{ draft: TemplateDraft; business?: NoticeChannelConfig; variables: NotificationVariable[]; disabled?: boolean }>()
defineEmits<{ (event: 'insert', id: string): void }>()
const { t, groups } = useTemplateVariablePanel(props)
</script>

<style scoped>
.template-variables { min-width: 0; border: 1px solid var(--line); border-radius: var(--r-2); background: var(--jet-theme-bg-container); overflow: hidden; }
.template-variables header { padding: var(--space-3); border-bottom: 1px solid var(--line); font-size: var(--fs-12); }
.template-variables header p { margin: var(--space-1) 0 0; color: var(--text-color-secondary); }
.template-variables section { padding-block: var(--space-2); }
.template-variables__group { padding: 0 var(--space-3) var(--space-1); color: var(--text-color-secondary); font-size: var(--fs-12); }
.template-variables button { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); width: 100%; min-height: 1.875rem; padding: var(--space-1) var(--space-3); border: 0; background: transparent; font-size: var(--fs-12); text-align: left; cursor: pointer; }
.template-variables button:hover, .template-variables button:focus-visible { background: var(--bg-sunken); }
.template-variables button:disabled { cursor: default; opacity: .6; }
.template-variables__name { min-width: 0; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.template-variables__sample { min-width: 0; max-width: 52%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--text-color-secondary); }
</style>
