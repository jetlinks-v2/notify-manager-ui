import { computed, ref, shallowReactive, watch } from 'vue'
import { Upload, type UploadChangeParam, type UploadFile, type UploadProps } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { getFileDownloadUrl } from '@jetlinks-web-core/components/Upload/File/useFileDownload'
import type { NotificationAttachment } from '../../shared'
import { attachmentFromUpload, attachmentToUploadFile } from '../model'

interface AttachmentProps { attachments: NotificationAttachment[] }
interface AttachmentEvents {
  (event: 'update:attachments', value: NotificationAttachment[]): void
  (event: 'uploading', value: boolean): void
}

/** Keep accepted and pending files stable while the parent applies controlled values. */
export function useTemplateAttachments(props: AttachmentProps, emit: AttachmentEvents) {
  const { t } = useI18n()
  const error = ref('')
  const pending = shallowReactive(new Map<string, UploadFile>())
  const accepted = ref<NotificationAttachment[]>(props.attachments.map(item => ({ ...item })))
  watch(() => props.attachments, value => { accepted.value = value.map(item => ({ ...item })) }, { deep: true })
  // Pending UIDs must stay in the list when another upload finishes or Ant Upload drops their callbacks.
  const files = computed<UploadFile[]>(() => [...accepted.value.map(attachmentToUploadFile), ...pending.values()])

  const beforeUpload: UploadProps['beforeUpload'] = (file, batch) => {
    if (accepted.value.length + pending.size + batch.length > 5 || file.size >= 10 * 1024 * 1024) {
      error.value = 'attachmentLimit'
      return Upload.LIST_IGNORE
    }
    if (accepted.value.some(item => item.name === file.name)) { error.value = 'duplicateAttachment'; return Upload.LIST_IGNORE }
    return true
  }

  /** Preserve real platform references and previous files when an upload fails. */
  function uploadChanged(info: UploadChangeParam) {
    const file = info.file
    if (file.status === 'uploading') pending.set(file.uid, file)
    else pending.delete(file.uid)
    emit('uploading', pending.size > 0)
    if (file.status === 'error') { error.value = 'uploadFailed'; return }
    if (file.status !== 'done') return
    const attachment = attachmentFromUpload(file, () => getFileDownloadUrl(file))
    if (!attachment) { error.value = 'uploadFailed'; return }
    if (accepted.value.some(item => item.name === attachment.name)) { error.value = 'duplicateAttachment'; return }
    if (accepted.value.length >= 5) { error.value = 'attachmentLimit'; return }
    error.value = ''
    // Two completions can arrive before v-model updates props, so append against accepted rather than props.
    accepted.value = [...accepted.value, attachment]
    emit('update:attachments', [...accepted.value])
  }

  function removeAttachment(file: UploadFile) {
    pending.delete(file.uid)
    emit('uploading', pending.size > 0)
    accepted.value = accepted.value.filter(item => item.name !== file.name)
    emit('update:attachments', [...accepted.value])
  }

  return { t, error, files, beforeUpload, uploadChanged, removeAttachment }
}
