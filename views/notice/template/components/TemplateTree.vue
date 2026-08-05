<template>
  <aside class="template-tree">
    <header class="template-tree__head">
      <div>
        <h2>{{ $t('NoticeCenter.template.tree.title') }}</h2>
        <p>{{ $t('NoticeCenter.template.tree.subtitle') }}</p>
      </div>
      <span>{{ treeData.length }}</span>
    </header>

    <a-input
      v-model:value="keyword"
      class="template-tree__search"
      allow-clear
      size="small"
      :placeholder="$t('NoticeCenter.template.tree.searchPlaceholder')"
    >
      <template #prefix>
        <AIcon type="SearchOutlined" />
      </template>
    </a-input>

      <div class="template-tree__body">
          <a-tree
              v-if="filteredTreeData.length"
              class="template-tree__tree"
              block-node
              :tree-data="filteredTreeData"
              :expanded-keys="currentExpandedKeys"
              :selected-keys="selectedKeys"
              @expand="handleExpand"
              @select="handleSelect"
          >
              <template #title="node">
              <span class="template-tree__node" :class="`is-${node.nodeType}`">
                <span v-if="node.nodeType === 'alarm'" class="template-tree__node-avatar">
                  {{ getNodeInitial(node) }}
                </span>
                <span v-else class="template-tree__node-icon">
                  <AIcon :type="getNodeIcon(node)" />
                </span>
                <span class="template-tree__node-title">{{ $t(node.title) }}</span>
                <j-badge-status
                  v-if="node.nodeType === 'alarm'"
                  :status="node.enabled ? 'success' : 'warning'"
                  :text="node.enabled ? $t('NoticeCenter.template.state.enabled') : $t('NoticeCenter.template.state.disabled')"
                />
                <span
                  v-if="node.nodeType === 'alarm'"
                  class="template-tree__node-switch"
                  @click.stop
                >
                  <a-switch
                    size="small"
                    :checked="node.enabled"
                    :loading="switchingKeys.includes(node.key)"
                    @change="() => $emit('toggle-state', node)"
                  />
                </span>
              </span>
              </template>
          </a-tree>

          <a-spin v-else :spinning="loading">
              <CloudEmpty
                  class="template-tree__empty"
                  :description="$t('NoticeCenter.template.empty.noTree')"
              />
          </a-spin>
      </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoticeTemplateTreeNode } from '../hooks/useNoticeTemplateCenter'

const props = defineProps<{
  treeData: NoticeTemplateTreeNode[]
  expandedKeys: string[]
  selectedKeys: string[]
  switchingKeys: string[]
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'select', key: string): void
  (e: 'toggle-state', node: NoticeTemplateTreeNode): void
  (e: 'update:expandedKeys', keys: string[]): void
}>()

const { t: $t } = useI18n()
const keyword = ref('')
const localExpandedKeys = ref<string[]>([])

const currentExpandedKeys = computed(() =>
  keyword.value.trim() ? searchExpandedKeys.value : localExpandedKeys.value,
)

const getNodeIcon = (node: NoticeTemplateTreeNode) => {
  if (node.nodeType === 'group') return 'VideoCameraOutlined'
  if (node.channelProvider?.includes('sms')) return 'MessageOutlined'
  if (node.channelProvider?.includes('email')) return 'MailOutlined'
  if (node.channelProvider?.includes('dingTalk')) return 'DingdingOutlined'
  if (node.channelProvider?.includes('weixin')) return 'WechatOutlined'
  return 'NotificationOutlined'
}

const getNodeInitial = (node: NoticeTemplateTreeNode) => node.title.trim().slice(0, 1).toUpperCase()

const cloneMatchedTree = (
  nodes: NoticeTemplateTreeNode[],
  searchText: string,
  parents: string[] = [],
  expanded = new Set<string>(),
): NoticeTemplateTreeNode[] => {
  return nodes
    .map(node => {
      const matched = node.title.toLowerCase().includes(searchText)

      if (matched && node.children?.length) {
        parents.forEach(key => expanded.add(key))
        expanded.add(node.key)
        return node
      }

      const children = cloneMatchedTree(node.children || [], searchText, [...parents, node.key], expanded)
      if (!matched && !children.length) {
        return undefined
      }
      if (matched || children.length) {
        parents.forEach(key => expanded.add(key))
        if (children.length) {
          expanded.add(node.key)
        }
      }
      return { ...node, children }
    })
    .filter(Boolean) as NoticeTemplateTreeNode[]
}

const searchResult = computed(() => {
  const searchText = keyword.value.trim().toLowerCase()
  const expanded = new Set<string>()
  if (!searchText) {
    return {
      tree: props.treeData,
      expanded: [] as string[],
    }
  }
  return {
    tree: cloneMatchedTree(props.treeData, searchText, [], expanded),
    expanded: Array.from(expanded),
  }
})

const filteredTreeData = computed(() => searchResult.value.tree)
const searchExpandedKeys = computed(() => searchResult.value.expanded)

const handleSelect = (keys: (string | number)[]) => {
  const key = String(keys[0] || '')
  if (key) {
    emit('select', key)
  }
}

const handleExpand = (keys: (string | number)[]) => {
  const nextKeys = keys.map(String)
  localExpandedKeys.value = nextKeys
  emit('update:expandedKeys', nextKeys)
}

watch(
  () => props.expandedKeys,
  keys => {
    localExpandedKeys.value = [...keys]
  },
  { immediate: true },
)
</script>

<style scoped lang="less" src="./TemplateTree.less"></style>
