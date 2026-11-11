<template>
  <div class="template-directory">
    <a-input v-model:value="search" :placeholder="t('messageNotification.templates.search')" :aria-label="t('messageNotification.templates.search')" allow-clear>
      <template #prefix><AIcon type="SearchOutlined" aria-hidden="true" /></template>
    </a-input>
    <a-alert v-if="directoryFailure && !failure" type="warning" show-icon :message="t('messageNotification.templates.directoryError')">
      <template #action><a-button size="small" @click="reload">{{ t('messageNotification.templates.reload') }}</a-button></template>
    </a-alert>
    <a-spin wrapper-class-name="template-directory__list" :spinning="state === 'loading' || directoryState === 'loading'">
      <a-alert v-if="failure" type="warning" show-icon :message="t(`messageNotification.templates.${state}`)">
        <template #action><a-button size="small" @click="reload">{{ t('messageNotification.templates.reload') }}</a-button></template>
      </a-alert>
      <CloudEmpty v-else-if="!visibleTemplates.length" :description="t('messageNotification.templates.empty')" />
      <a-tree
        v-else
        class="template-directory__tree"
        block-node
        :show-line="false"
        :tree-data="visibleTemplates"
        :selected-keys="selectedKeys"
        :expanded-keys="expandedKeys"
        :auto-expand-parent="false"
        :disabled="disabled"
        @expand="expand"
        @select="select"
      >
        <template #title="node">
          <span class="template-directory__node" :class="{ 'template-directory__node--unconfigured': node.kind === 'business' && !node.templateId && !node.children?.length }" :title="node.kind === 'business' && !node.templateId && !node.children?.length ? t('messageNotification.templates.channelUnconfigured', { name: node.title }) : node.title">
            <span class="template-directory__name">{{ node.title }}</span>
          </span>
        </template>
      </a-tree>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { NotificationTemplate, NotificationLoadState } from '../../shared'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import { useTemplateDirectory } from '../hooks/useTemplateDirectory'

const props = defineProps({
  templates: { type: Array as PropType<NotificationTemplate[]>, default: () => [] },
  businessTypes: { type: Array as PropType<NoticeChannelConfig[]>, default: () => [] },
  directoryState: { type: String as PropType<NotificationLoadState>, default: 'idle' },
  selectedId: { type: String, default: '' },
  state: { type: String as PropType<NotificationLoadState>, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits<{ (event: 'select', id: string): void; (event: 'reload'): void }>()
const { t, search, failure, directoryFailure, visibleTemplates, expandedKeys, selectedKeys, expand, select, reload } = useTemplateDirectory(props, emit)
</script>

<style scoped>
.template-directory { display: flex; flex-direction: column; gap: var(--space-4); overflow: hidden; }
.template-directory > .ant-input-affix-wrapper { flex-shrink: 0; }
.template-directory__list { flex: 1; min-height: 0; overflow: auto; }
.template-directory :deep(.template-directory__tree) { background: transparent; }
.template-directory :deep(.template-directory__tree .ant-tree-treenode) { position: relative; align-items: center; width: 100%; min-height: 2.25rem; padding: 0; border: 0; background: transparent; }
.template-directory :deep(.template-directory__tree .ant-tree-node-content-wrapper) { min-width: 0; min-height: 2.25rem; padding: var(--space-1) var(--space-3); border: 1px solid transparent; border-radius: var(--r-2); line-height: 1.625rem; }
.template-directory :deep(.template-directory__tree .ant-tree-node-content-wrapper.ant-tree-node-selected) { color: var(--accent); background: var(--bg); border-color: var(--line); }
.template-directory :deep(.template-directory__tree .ant-tree-indent-unit) { width: var(--space-4); }
.template-directory :deep(.template-directory__tree .ant-tree-indent-unit:first-child) { width: 0; }
.template-directory :deep(.template-directory__tree .ant-tree-switcher) { position: absolute; right: var(--space-1); z-index: 2; width: var(--space-5); height: 2.25rem; line-height: 2.25rem; color: var(--jet-theme-text-secondary); }
.template-directory :deep(.template-directory__tree .ant-tree-switcher-noop) { display: none; }
.template-directory :deep(.template-directory__tree .ant-tree-treenode-switcher-open > .ant-tree-node-content-wrapper),
.template-directory :deep(.template-directory__tree .ant-tree-treenode-switcher-close > .ant-tree-node-content-wrapper) { padding-right: var(--space-6); }
.template-directory :deep(.template-directory__tree .template-directory__group) { min-height: 1.75rem; margin-top: var(--space-3); }
.template-directory :deep(.template-directory__tree .template-directory__group:first-child) { margin-top: 0; }
.template-directory :deep(.template-directory__tree .template-directory__group > .ant-tree-switcher) { display: none; }
.template-directory :deep(.template-directory__tree .template-directory__group > .ant-tree-node-content-wrapper) { min-height: 1.75rem; padding: 0 var(--space-3); color: var(--jet-theme-text-secondary); font-size: var(--fs-12); cursor: default; background: transparent; }
.template-directory :deep(.template-directory__group .template-directory__node) { color: var(--ink-3); }
.template-directory :deep(.template-directory__tree .ant-tree-title) { display: block; width: 100%; min-width: 0; }
.template-directory__node { display: flex; align-items: center; min-width: 0; }
.template-directory__node--unconfigured { color: var(--jet-theme-text-secondary); }
.template-directory__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
