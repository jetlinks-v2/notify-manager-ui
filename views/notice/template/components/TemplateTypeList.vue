<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getStateValue, type NoticeTemplateGroup, type NoticeTemplateAlarmNode } from '../hooks/noticeTemplateModel'
const props = defineProps<{ groups: NoticeTemplateGroup[]; selectedKey?: string; switchingKeys: string[]; disabled: boolean }>()
const emit = defineEmits<{
  (event: 'select', alarm: NoticeTemplateAlarmNode): void
  (event: 'toggle', alarm: NoticeTemplateAlarmNode): void
}>()
const { t } = useI18n()
const keyword = ref('')
const filtered = computed(() => props.groups.map(group => ({ ...group,
  alarms: group.alarms.filter(alarm => t(alarm.name).toLowerCase().includes(keyword.value.trim().toLowerCase())),
})).filter(group => group.alarms.length))
</script>
<template>
  <aside class="template-types">
    <a-input-search v-model:value="keyword" allow-clear :placeholder="$t('NoticeCenter.template.tree.searchPlaceholder')" />
    <nav :aria-label="$t('NoticeCenter.template.tree.title')">
      <section v-for="group in filtered" :key="group.key">
        <h3>{{ $t(group.name) }}</h3>
        <div v-for="alarm in group.alarms" :key="alarm.key" class="template-types__item" :class="{ selected: selectedKey === alarm.key }">
          <button class="template-types__select" type="button" :disabled="disabled" :aria-current="selectedKey === alarm.key ? 'true' : undefined" @click="emit('select', alarm)">{{ $t(alarm.name) }}</button>
          <a-tooltip :title="$t(getStateValue(alarm.raw.state) === 'enabled' ? 'NoticeCenter.template.state.enabled' : 'NoticeCenter.template.state.disabled')">
            <a-switch size="small" :checked="getStateValue(alarm.raw.state) === 'enabled'" :disabled="disabled"
              :loading="switchingKeys.includes(alarm.key)" :aria-label="$t(alarm.name)" @change="emit('toggle', alarm)" />
          </a-tooltip>
        </div>
      </section>
      <CloudEmpty v-if="!filtered.length" />
    </nav>
  </aside>
</template>
<style scoped>
.template-types { min-width: 0; padding: var(--space-4); border-right: 1px solid var(--jet-theme-border); }
.template-types h3 { color: var(--jet-theme-text-secondary); font-size: var(--fs-12); margin: var(--space-4) 0 var(--space-2); }
.template-types__item { display: flex; align-items: center; gap: var(--space-2); padding-right: var(--space-2); border-radius: var(--jet-theme-radius); }
.template-types__item.selected { background: var(--jet-theme-primary-soft); color: var(--jet-theme-primary); }
.template-types__select { flex: 1; min-width: 0; padding: var(--space-3) var(--space-2); background: transparent; border: 0; text-align: start; color: inherit; font: inherit; cursor: pointer; }
.template-types__select:focus-visible { outline: 2px solid var(--jet-theme-primary); border-radius: var(--jet-theme-radius); }
.template-types__select:disabled { cursor: not-allowed; }
@media (max-width: 767px) { .template-types { border-right: 0; border-bottom: 1px solid var(--jet-theme-border); } .template-types nav { max-height: 15rem; overflow: auto; } }
</style>
