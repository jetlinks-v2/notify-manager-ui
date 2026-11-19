import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web/utils'
import type { ChannelPermissions, useChannelWorkspace } from '../useChannelWorkspace'
import { robotWebhookSummary } from './robotPresentation'

interface RobotOptions {
  workspace: ReturnType<typeof useChannelWorkspace>
  permissions: ChannelPermissions
  blocked: Ref<boolean>
  pending: Ref<boolean>
  test: () => void
  remove: () => void
  prepareTemplates?: () => boolean
  saved?: (id: string, created: boolean) => Promise<void>
  fillTemplates?: (id: string) => Promise<void>
}

export interface RobotConfigurationModalModel {
  open: boolean
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

/** Adapt the existing workspace to modal editing and select the exact record before any row action. */
export function useRobotConfigurations(options: RobotOptions) {
  const { t } = useI18n()
  const { workspace, permissions } = options
  const isRobot = computed(() => workspace.channelId.value === 'dingTalk:dingTalkRobotWebHook')
  const editorKey = ref('')
  const open = computed(() => isRobot.value && !!editorKey.value && workspace.entry.value?.key === editorKey.value)
  let actionVersion = 0
  const rows = computed(() => workspace.configs.value.map(record => ({ id: record.id, name: record.name, webhook: robotWebhookSummary(record.configuration?.url) })))
  const canAdd = computed(() => permissions.query.value && permissions.add.value && ['ready', 'empty'].includes(workspace.state.value) && !options.blocked.value)
  const modal = computed<RobotConfigurationModalModel>(() => {
    const entry = open.value ? workspace.entry.value : undefined
    const issue = (key: string) => {
      const value = entry?.issues.find(item => item.path === key)
      return value ? t(`messageNotification.channels.validation.${value.key}`) : undefined
    }
    const hiddenIssue = entry?.issues.find(item => !['name', 'url'].includes(item.path))
    return {
      open: open.value, isNew: !!entry?.isNew, name: entry?.draft.name || '',
      url: String(entry?.draft.configuration.url || ''), savedUrl: robotWebhookSummary(entry?.baseline?.configuration.url),
      nameError: issue('name'), urlError: issue('url'),
      error: hiddenIssue ? t(hiddenIssue.key === 'secretRequired' ? 'messageNotification.channels.robot.protectedCredential' : 'messageNotification.channels.validation.invalidValue') : undefined,
      busy: options.blocked.value, disabled: !workspace.canEdit.value || options.blocked.value,
      canSave: workspace.canEdit.value && !options.blocked.value && (!!entry?.isNew || workspace.dirty.value),
    }
  })

  function add() {
    if (!isRobot.value || !canAdd.value || open.value) return
    workspace.createConfig()
    if (workspace.entry.value?.isNew) editorKey.value = workspace.entry.value.key
  }

  async function act(id: string, action: 'edit' | 'test' | 'delete' | 'fill') {
    const allowed = action === 'edit' || action === 'fill' ? permissions.update : action === 'test' ? permissions.action : permissions.delete
    if (!isRobot.value || options.blocked.value || open.value || !permissions.query.value || !allowed.value) return
    const version = ++actionVersion
    options.pending.value = true
    try {
      await workspace.selectConfig(id)
      if (version !== actionVersion || !isRobot.value || !permissions.query.value || !allowed.value
        || workspace.detailState.value !== 'ready' || workspace.entry.value?.baseline?.id !== id) return
      if (action === 'edit') {
        workspace.startEditing()
        if (workspace.editing.value) editorKey.value = workspace.entry.value.key
      } else {
        // Selection has settled; the existing test/delete guards may now accept the requested record.
        options.pending.value = false
        if (action === 'test') options.test()
        else if (action === 'fill') await options.fillTemplates?.(id)
        else options.remove()
      }
    } finally { if (version === actionVersion) options.pending.value = false }
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
    const id = entry.draft.id?.trim()
    const created = entry.isNew
    const version = ++actionVersion
    options.pending.value = true
    try {
      if (!await workspace.save() || version !== actionVersion) return
      editorKey.value = ''
      onlyMessage(t('messageNotification.channels.saveSuccess'), 'success')
    } finally { if (version === actionVersion) options.pending.value = false }
    if (id) await options.saved?.(id, created)
  }

  /** The test dialog's Fix action must return to this editor, rather than a hidden inline form. */
  function editSelected() {
    const entry = workspace.entry.value
    if (isRobot.value && entry?.baseline?.id) void act(entry.baseline.id, 'edit')
  }

  function release() {
    ++actionVersion
    options.pending.value = false
    workspace.discardConfig(editorKey.value)
    editorKey.value = ''
  }
  watch(workspace.channelId, release)
  watch(workspace.selectedConfigId, () => {
    // An external deep link may replace the current editor without changing the channel.
    if (editorKey.value && !options.pending.value && workspace.entry.value?.key !== editorKey.value) release()
  })
  watch([permissions.query, permissions.add, permissions.update], () => {
    if (!permissions.query.value || (open.value && !workspace.canEdit.value)) release()
  })
  onBeforeUnmount(release)
  return { isRobot, rows, modal, canAdd, add, act, close, change, save, editSelected }
}
