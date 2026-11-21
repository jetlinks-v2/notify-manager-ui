import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web/utils'
import { dingTalkRobotChannelId } from '../../shared'
import type { ChannelPermissions, useChannelWorkspace } from '../useChannelWorkspace'
import { configurationAddressSummary, type ChannelConfigurationAction, type ChannelConfigurationRow } from './configurationPresentation'

interface ChannelConfigurationsOptions {
  workspace: ReturnType<typeof useChannelWorkspace>
  permissions: ChannelPermissions
  blocked: Ref<boolean>
  pending: Ref<boolean>
  test: () => void
  prepareTemplates?: () => boolean
  saved?: (channelId: string, id: string, created: boolean) => Promise<void>
  fillTemplates?: (id: string) => Promise<void>
}

export interface ChannelConfigurationModalModel {
  open: boolean
  isRobot: boolean
  isNew: boolean
  name: string
  url: string
  savedUrl: string
  nameError?: string
  urlError?: string
  error?: string
  busy: boolean
  disabled: boolean
  canSave: boolean
}

/** 多配置渠道按行选择记录，弹窗只管理当前配置的草稿。 */
export function useChannelConfigurations(options: ChannelConfigurationsOptions) {
  const { t } = useI18n()
  const { workspace, permissions } = options
  const { multipleConfigurations } = workspace
  const isRobot = computed(() => workspace.channelId.value === dingTalkRobotChannelId)
  const editorKey = ref('')
  const deleteTarget = ref<Pick<ChannelConfigurationRow, 'id' | 'name'>>()
  const open = computed(() => multipleConfigurations.value && !!editorKey.value && workspace.entry.value?.key === editorKey.value)
  let actionVersion = 0
  const rows = computed<ChannelConfigurationRow[]>(() => workspace.configs.value.map(record => ({
    id: record.id, name: record.name, address: configurationAddressSummary(record.configuration?.url, isRobot.value),
  })))
  const canAdd = computed(() => permissions.query.value && permissions.add.value && ['ready', 'empty'].includes(workspace.state.value) && !options.blocked.value)
  const modal = computed<ChannelConfigurationModalModel>(() => {
    const entry = open.value ? workspace.entry.value : undefined
    const issue = (key: string) => {
      const value = entry?.issues.find(item => item.path === key)
      return value ? t(`messageNotification.channels.validation.${value.key}`) : undefined
    }
    const hiddenIssue = isRobot.value && entry?.issues.find(item => !['name', 'url'].includes(item.path))
    return {
      open: open.value, isRobot: isRobot.value, isNew: !!entry?.isNew, name: entry?.draft.name || '',
      url: String(entry?.draft.configuration.url || ''), savedUrl: configurationAddressSummary(entry?.baseline?.configuration?.url, isRobot.value),
      nameError: issue('name'), urlError: issue('url'),
      error: hiddenIssue ? t(hiddenIssue.key === 'secretRequired' ? 'messageNotification.channels.robot.protectedCredential' : 'messageNotification.channels.validation.invalidValue') : undefined,
      busy: options.blocked.value, disabled: !workspace.canEdit.value || options.blocked.value,
      canSave: workspace.canEdit.value && !options.blocked.value && (!!entry?.isNew || workspace.dirty.value),
    }
  })

  function add() {
    if (!multipleConfigurations.value || !canAdd.value || open.value || deleteTarget.value) return
    workspace.createConfig()
    if (workspace.entry.value?.isNew) editorKey.value = workspace.entry.value.key
  }

  const actionPermissions = { edit: permissions.update, test: permissions.action, fill: permissions.update, delete: permissions.delete }

  async function act(id: string, action: ChannelConfigurationAction) {
    const allowed = actionPermissions[action]
    if (!multipleConfigurations.value || options.blocked.value || open.value || deleteTarget.value || !permissions.query.value || !allowed.value) return
    const version = ++actionVersion
    options.pending.value = true
    try {
      await workspace.selectConfig(id)
      const entry = workspace.entry.value
      if (version !== actionVersion || !multipleConfigurations.value || !permissions.query.value || !allowed.value
        || workspace.detailState.value !== 'ready' || entry?.baseline?.id !== id) return
      if (action === 'edit') {
        workspace.startEditing()
        if (workspace.editing.value) editorKey.value = entry.key
      } else {
        options.pending.value = false
        if (action === 'delete') deleteTarget.value = { id, name: entry.baseline.name }
        else if (action === 'test') options.test()
        else await options.fillTemplates?.(id)
      }
    } finally { if (version === actionVersion) options.pending.value = false }
  }

  function cancelDelete() { deleteTarget.value = undefined }

  async function confirmDelete() {
    const target = deleteTarget.value
    cancelDelete()
    // A route change can replace the selected record before confirmation.
    if (!target || !multipleConfigurations.value || options.blocked.value || workspace.entry.value?.baseline?.id !== target.id) return
    const successKey = isRobot.value ? 'messageNotification.channels.robot.deleteSuccess' : 'messageNotification.channels.webhook.deleteSuccess'
    if (await workspace.deleteConfig()) onlyMessage(t(successKey), 'success')
  }

  function close() {
    if (options.blocked.value) return
    workspace.discardConfig(editorKey.value)
    editorKey.value = ''
  }

  function change(key: 'name' | 'url', value: string) {
    if (open.value && !options.blocked.value) workspace.changeField(key, value, key === 'name')
  }

  async function save() {
    const entry = workspace.entry.value
    if (!open.value || !modal.value.canSave || !entry || options.prepareTemplates?.() === false) return
    const savedChannel = workspace.channelId.value
    const id = entry.draft.id?.trim()
    const created = entry.isNew
    const version = ++actionVersion
    options.pending.value = true
    try {
      if (!await workspace.save() || version !== actionVersion) return
      editorKey.value = ''
      onlyMessage(t('messageNotification.channels.saveSuccess'), 'success')
    } finally { if (version === actionVersion) options.pending.value = false }
    if (id) await options.saved?.(savedChannel, id, created)
  }

  /** The test dialog's Fix action must return to this editor, rather than a hidden inline form. */
  function editSelected() {
    const entry = workspace.entry.value
    if (multipleConfigurations.value && entry?.baseline?.id) void act(entry.baseline.id, 'edit')
  }

  function release() {
    ++actionVersion
    cancelDelete()
    options.pending.value = false
    workspace.discardConfig(editorKey.value)
    editorKey.value = ''
  }
  watch(workspace.channelId, release)
  watch(workspace.selectedConfigId, id => {
    if (deleteTarget.value && deleteTarget.value.id !== id) cancelDelete()
    // An external deep link may replace the current editor without changing the channel.
    if (editorKey.value && !options.pending.value && workspace.entry.value?.key !== editorKey.value) release()
  })
  watch([permissions.query, permissions.add, permissions.update, permissions.delete], () => {
    if (!permissions.delete.value) cancelDelete()
    if (!permissions.query.value || (open.value && !workspace.canEdit.value)) release()
  })
  onBeforeUnmount(release)
  return { isRobot, rows, modal, canAdd, deleteTarget, add, act, close, change, save, editSelected, cancelDelete, confirmDelete }
}
