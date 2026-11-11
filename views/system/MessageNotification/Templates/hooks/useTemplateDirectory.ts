import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NotificationTemplate, NotificationLoadState } from '../../shared'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import { buildTemplateDirectory, filterTemplateDirectory, flattenTemplateDirectory } from '../templateDirectoryModel'

interface DirectoryProps {
  templates: NotificationTemplate[]; businessTypes: NoticeChannelConfig[]; selectedId: string
  state: NotificationLoadState; directoryState: NotificationLoadState; disabled?: boolean
}
interface DirectoryEvents { (event: 'select', id: string): void; (event: 'reload'): void }

export function useTemplateDirectory(props: DirectoryProps, emit: DirectoryEvents) {
  const { t } = useI18n()
  const search = ref('')
  const collapsedKeys = ref<string[]>([])
  const currentNodeKey = ref('')
  const failure = computed(() => ['unavailable', 'forbidden', 'error'].includes(props.state))
  const directoryFailure = computed(() => ['unavailable', 'forbidden', 'error'].includes(props.directoryState))
  const tree = computed(() => buildTemplateDirectory(props.templates, props.businessTypes, {
    other: t('messageNotification.templates.otherGroup'),
  }, t))
  const allNodes = computed(() => flattenTemplateDirectory(tree.value))
  const visibleTemplates = computed(() => filterTemplateDirectory(tree.value, search.value))
  const expandedKeys = computed(() => flattenTemplateDirectory(visibleTemplates.value)
    .filter(node => node.children?.length && (search.value.trim() || !collapsedKeys.value.includes(node.key)))
    .map(node => node.key))
  const selectedKeys = computed(() => {
    if (!props.selectedId) return []
    const matches = allNodes.value.filter(node => node.templateId === props.selectedId)
    const node = matches.find(item => item.key === currentNodeKey.value) || matches[0]
    return node ? [node.key] : []
  })
  // 深链或渠道切换定位子模板时展开其祖先；普通展开操作不改变当前编辑对象。
  watch([() => props.selectedId, tree], () => {
    const selected = selectedKeys.value[0]
    collapsedKeys.value = collapsedKeys.value.filter(key => {
      const node = allNodes.value.find(item => item.key === key)
      return !node || !flattenTemplateDirectory(node.children || []).some(child => child.key === selected)
    })
  })
  function expand(keys: (string | number)[]) {
    if (search.value.trim()) return
    collapsedKeys.value = allNodes.value.filter(node => node.children?.length && !keys.includes(node.key)).map(node => node.key)
  }
  function select(keys: (string | number)[]) {
    // 再次点击当前节点时保留编辑对象，不把树的取消选择传给工作区。
    const node = allNodes.value.find(item => item.key === keys[0])
    if (!props.disabled && node?.templateId) { currentNodeKey.value = node.key; emit('select', node.templateId) }
  }
  function reload() { emit('reload') }

  return { t, search, failure, directoryFailure, visibleTemplates, expandedKeys, selectedKeys, expand, select, reload }
}
