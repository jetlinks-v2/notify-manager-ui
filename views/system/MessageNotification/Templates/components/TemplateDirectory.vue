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
        :show-line="{ showLeafIcon: false }"
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
            <AIcon class="template-directory__icon" :type="node.kind === 'group' ? 'FolderFilled' : 'FileTextOutlined'" aria-hidden="true" />
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
  selectedBusiness: { type: String, default: '' },
  state: { type: String as PropType<NotificationLoadState>, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits<{ (event: 'select', id: string): void; (event: 'business', id: string): void; (event: 'reload'): void }>()
const { t, search, failure, directoryFailure, visibleTemplates, expandedKeys, selectedKeys, expand, select, reload } = useTemplateDirectory(props, emit)
</script>

<style scoped>
.template-directory { display: flex; flex-direction: column; gap: var(--space-4); overflow: hidden; }
.template-directory > .ant-input-affix-wrapper { flex-shrink: 0; }
.template-directory__list { flex: 1; min-height: 0; overflow: auto; }
.template-directory__node { display: flex; align-items: center; gap: var(--space-1); min-width: 0; }
.template-directory__node--unconfigured { color: var(--jet-theme-text-secondary); }
.template-directory__icon { flex: 0 0 auto; color: var(--accent); }
.template-directory__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
