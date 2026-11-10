<template>
  <div class="template-directory">
    <a-input-search v-model:value="search" :placeholder="t('messageNotification.templates.search')" allow-clear />
    <a-spin wrapper-class-name="template-directory__list" :spinning="state === 'loading'">
      <a-alert v-if="failure" type="warning" show-icon :message="t(`messageNotification.templates.${state}`)">
        <template #action><a-button size="small" @click="reload">{{ t('messageNotification.templates.reload') }}</a-button></template>
      </a-alert>
      <CloudEmpty v-else-if="!visibleTemplates.length" :description="t('messageNotification.templates.empty')" />
      <a-menu v-else :selected-keys="[selectedId]" @click="select">
        <a-menu-item v-for="item in visibleTemplates" :key="item.id" :disabled="disabled">
          <div class="template-directory__name">{{ item.name }}</div>
          <div class="template-directory__provider">{{ item.typeText }} · {{ item.providerText }}</div>
        </a-menu-item>
      </a-menu>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { NotificationTemplate, NotificationLoadState } from '../../shared'
import { useTemplateDirectory } from '../hooks/useTemplateDirectory'

const props = defineProps({
  templates: { type: Array as PropType<NotificationTemplate[]>, default: () => [] },
  selectedId: { type: String, default: '' },
  state: { type: String as PropType<NotificationLoadState>, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits<{ (event: 'select', id: string): void; (event: 'reload'): void }>()
const { t, search, failure, visibleTemplates, select, reload } = useTemplateDirectory(props, emit)
</script>

<style scoped>
.template-directory { display: flex; flex-direction: column; gap: var(--space-4); overflow: hidden; }
.template-directory > .ant-input-search { flex-shrink: 0; }
.template-directory__list { flex: 1; min-height: 0; overflow: auto; }
.template-directory__name { overflow: hidden; text-overflow: ellipsis; font-weight: var(--chrome-label-font-weight); }
.template-directory__provider { color: var(--text-color-secondary); font-size: var(--fs-12); }
.template-directory :deep(.ant-menu-item) { height: auto; line-height: var(--lh-normal); padding: var(--space-2) var(--space-3); margin-inline: 0; width: 100%; }
</style>
