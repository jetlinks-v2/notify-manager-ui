import { computed, onBeforeUnmount, ref, shallowReactive, watch } from 'vue'
import { Upload, type UploadChangeParam, type UploadFile, type UploadProps } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { getFileDownloadUrl } from '@jetlinks-web-core/components/Upload/File/useFileDownload'
import type { NotificationAttachment } from '../../shared'
import type { TemplateEditorController } from '../channelViewTypes'
import { attachmentFromUpload, attachmentToUploadFile } from '../model'

interface AttachmentProps {
  attachments: NotificationAttachment[]
  disabled?: boolean
  editor?: TemplateEditorController
  insertInlineImage?: (source: string) => boolean
}
interface AttachmentEvents {
  (event: 'update:attachments', value: NotificationAttachment[]): void
  (event: 'uploading', value: boolean): void
}
const isVariableAttachment = (item: NotificationAttachment) => !item.location.trim() || /\$\{[^{}]+\}/.test(item.location)
const fingerprint = (items: NotificationAttachment[]) => JSON.stringify(items)

/** Keep upload references and variable attachments in one list while modal edits stay local. */
export function useTemplateAttachments(props: AttachmentProps, emit: AttachmentEvents) {
  const { t } = useI18n()
  const error = ref(''), modalError = ref(''), modalOpen = ref(false)
  const placement = ref<'attachment' | 'inline'>('attachment'), filename = ref(''), variableSource = ref('')
  const pending = shallowReactive(new Map<string, UploadFile>())
  const reserved = new Map<string, string>(), invalidated = new Set<string>(), ownSnapshots = new Set<string>()
  const accepted = ref<NotificationAttachment[]>(props.attachments.map(item => ({ ...item })))
  let active = true, editingIndex: number | undefined
  const editable = () => active && !props.disabled
  const uploadingCount = () => new Set([...pending.keys(), ...reserved.keys()]).size
  // Variable sources never become download links; retain the original index for fixed-file removal.
  const files = computed<UploadFile[]>(() => [...accepted.value.flatMap((item, index) => isVariableAttachment(item) ? [] : [attachmentToUploadFile(item, index)]), ...pending.values()])
  const variableAttachments = computed(() => accepted.value.flatMap((item, index) => isVariableAttachment(item) ? [{ item, index }] : []))
  const variableOptions = computed(() => {
    const options = (props.editor?.insertableVariables.value ?? []).map(item => ({ label: item.name ? `${item.name} (${item.id})` : item.id, value: '${' + item.id + '}' }))
    // A stored expression remains editable even if its variable is no longer in the current catalog.
    if (variableSource.value && !options.some(item => item.value === variableSource.value)) options.unshift({ label: variableSource.value, value: variableSource.value })
    return options
  })

  function closeVariable() { modalOpen.value = false; modalError.value = ''; editingIndex = undefined }
  /** External reset invalidates old upload callbacks; our own v-model acknowledgement keeps newer edits. */
  function reset(value: NotificationAttachment[]) {
    const signature = fingerprint(value)
    if (ownSnapshots.has(signature)) {
      if (signature === fingerprint(accepted.value)) ownSnapshots.clear()
      else ownSnapshots.delete(signature)
      return
    }
    for (const uid of [...pending.keys(), ...reserved.keys()]) invalidated.add(uid)
    pending.clear(); reserved.clear(); ownSnapshots.clear(); error.value = ''
    accepted.value = value.map(item => ({ ...item })); closeVariable(); emit('uploading', false)
  }
  watch(() => props.attachments, reset, { deep: true })
  watch(() => props.disabled, disabled => { if (disabled) { closeVariable(); for (const uid of [...pending.keys(), ...reserved.keys()]) invalidated.add(uid); pending.clear(); reserved.clear(); emit('uploading', false) } })
  onBeforeUnmount(() => { active = false; for (const uid of [...pending.keys(), ...reserved.keys()]) invalidated.add(uid); pending.clear(); reserved.clear(); emit('uploading', false) })

  function publish(items: NotificationAttachment[]) {
    accepted.value = items
    ownSnapshots.add(fingerprint(items))
    emit('update:attachments', items.map(item => ({ ...item })))
  }
  function registerSource(source: string) {
    for (const match of source.matchAll(/\$\{([^{}]+)\}/g)) props.editor?.registerVariable(match[1])
  }

  const beforeUpload: UploadProps['beforeUpload'] = (file, batch) => {
    if (!editable()) return Upload.LIST_IGNORE
    const uid = String(file.uid ?? file.name)
    const batchFiles = batch.length ? batch : [file]
    const additional = batchFiles.filter(item => !pending.has(String(item.uid ?? item.name)) && !reserved.has(String(item.uid ?? item.name))).length
    if (accepted.value.length + uploadingCount() + additional > 5 || file.size >= 10 * 1024 * 1024) {
      error.value = 'attachmentLimit'; invalidated.add(uid)
      return Upload.LIST_IGNORE
    }
    const name = file.name.trim()
    if (accepted.value.some(item => item.name.trim() === name) || [...reserved.entries()].some(([key, value]) => key !== uid && value === name)) {
      error.value = 'duplicateAttachment'; invalidated.add(uid); return Upload.LIST_IGNORE
    }
    invalidated.delete(uid); reserved.set(uid, name)
    return true
  }

  /** Only a current, completed platform upload may append a new attachment. */
  function uploadChanged(info: UploadChangeParam) {
    const file = info.file
    if (!editable() || invalidated.has(file.uid)) return
    if (file.status === 'uploading') pending.set(file.uid, file)
    else { pending.delete(file.uid); reserved.delete(file.uid) }
    emit('uploading', pending.size > 0)
    if (file.status === 'error') { error.value = 'uploadFailed'; return }
    if (file.status !== 'done') return
    const attachment = attachmentFromUpload(file, () => getFileDownloadUrl(file))
    if (!attachment) { error.value = 'uploadFailed'; return }
    if (accepted.value.some(item => item.name.trim() === attachment.name.trim())) { error.value = 'duplicateAttachment'; return }
    if (accepted.value.length >= 5) { error.value = 'attachmentLimit'; return }
    error.value = ''
    publish([...accepted.value, attachment])
  }

  function removeAttachment(file: UploadFile) {
    if (!editable()) return
    if (pending.has(file.uid) || reserved.has(file.uid)) { invalidated.add(file.uid); pending.delete(file.uid); reserved.delete(file.uid); emit('uploading', pending.size > 0); return }
    const match = /^saved-(\d+)$/.exec(file.uid)
    const index = match ? Number(match[1]) : accepted.value.findIndex(item => item.name === file.name)
    if (index < 0 || !accepted.value[index]) return
    publish(accepted.value.filter((_, current) => current !== index))
  }
  function removeVariableAttachment(index: number) {
    if (editable() && accepted.value[index] && isVariableAttachment(accepted.value[index])) publish(accepted.value.filter((_, current) => current !== index))
  }

  /** Modal cancellation and placement changes never mutate the accepted attachment list. */
  function openVariable(index?: number) {
    if (!editable()) return
    const item = index === undefined ? undefined : accepted.value[index]
    if (index !== undefined && !item) return
    editingIndex = index; filename.value = item?.name ?? ''; variableSource.value = item?.location ?? ''
    placement.value = 'attachment'; modalError.value = ''; modalOpen.value = true
  }
  function insertVariableImage(source: string): boolean {
    if (!editable() || !source || !props.insertInlineImage?.(source)) { modalError.value = 'inlineFailed'; return false }
    registerSource(source); modalError.value = ''; return true
  }
  function insertAttachmentImage(index: number) {
    const item = accepted.value[index]
    if (!item) return
    if (!insertVariableImage(item.location)) { variableSource.value = item.location; filename.value = item.name; editingIndex = index; placement.value = 'inline'; modalOpen.value = true }
  }
  function confirmVariable() {
    if (!editable()) return false
    const source = variableSource.value.trim()
    if (!source) { modalError.value = 'variableRequired'; return false }
    if (placement.value === 'inline') {
      if (!insertVariableImage(source)) return false
      closeVariable(); return true
    }
    const name = filename.value.trim()
    if (!name) { modalError.value = 'nameRequired'; return false }
    if (accepted.value.some((item, index) => index !== editingIndex && item.name.trim() === name)) { modalError.value = 'duplicateName'; return false }
    if (editingIndex === undefined && accepted.value.length + uploadingCount() >= 5) { modalError.value = 'limit'; return false }
    const items = [...accepted.value]
    if (editingIndex === undefined) items.push({ name, location: source })
    else if (items[editingIndex]) items[editingIndex] = { ...items[editingIndex], name, location: source }
    else { closeVariable(); return false }
    publish(items); registerSource(source); error.value = ''; closeVariable(); return true
  }

  return { t, error, files, beforeUpload, uploadChanged, removeAttachment, variableAttachments, variableOptions,
    modalOpen, modalError, placement, filename, variableSource, openVariable, closeVariable, confirmVariable, removeVariableAttachment, insertAttachmentImage }
}
