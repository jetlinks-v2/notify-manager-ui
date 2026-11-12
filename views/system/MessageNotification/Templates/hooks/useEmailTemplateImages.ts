import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Upload, type UploadProps } from 'ant-design-vue'
import { createFileUploadCustomRequest } from '@jetlinks-web-core/components/Upload/utils'
import { getFileDownloadUrl } from '@jetlinks-web-core/components/Upload/File/useFileDownload'
import type { TemplateDraft } from '../model'
import type { TemplateEditorController } from '../channelViewTypes'
import { isEmailImageSource } from '../definition/emailTemplateContent'

interface ImageUploadProps { draft: TemplateDraft; editor: TemplateEditorController; disabled?: boolean }
interface ImageTarget<Selection> {
  capture: () => Selection | undefined
  insert: (url: string, selection?: Selection) => boolean
  editable: () => boolean
}
const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const imageSize = 2 * 1024 * 1024
type UploadOptions = Parameters<NonNullable<UploadProps['customRequest']>>[0]

/** Uploads share the platform file service; only completed URLs become inline image content. */
export function useEmailTemplateImages<Selection>(props: ImageUploadProps, target: ImageTarget<Selection>) {
  const pending = ref(0)
  const imageError = ref('')
  let active = true
  let generation = 0
  const upload = createFileUploadCustomRequest()
  const imageUploading = computed(() => pending.value > 0)

  function setPending(change: number) {
    pending.value = Math.max(0, pending.value + change)
    props.editor.setUploading(pending.value > 0, 'emailImages')
  }
  function validateImage(file: Pick<File, 'size' | 'type'>): boolean {
    if (props.disabled || !target.editable()) return false
    if (!imageTypes.includes(file.type) || file.size >= imageSize || file.size === 0) {
      imageError.value = 'imageLimit'
      return false
    }
    return true
  }
  const beforeImageUpload: UploadProps['beforeUpload'] = file => validateImage(file) || Upload.LIST_IGNORE

  async function uploadOne(options: UploadOptions, selection = target.capture()) {
    const file = options.file as File
    if (!validateImage(file) || selection === undefined) return
    const draft = props.draft
    const version = generation
    const current = () => active && generation === version && props.draft === draft && !props.disabled && target.editable()
    imageError.value = ''
    setPending(1)
    let succeeded = false
    try {
      await upload({
        ...options,
        onSuccess(response) {
          if (!current()) return
          const value = getFileDownloadUrl({ uid: 'email-image', name: file.name, status: 'done', response })
          let url = ''
          try { if (value && isEmailImageSource(value, false)) url = new URL(value, window.location.href).href } catch { /* Invalid addresses never enter the draft. */ }
          if (!url) { imageError.value = 'imageUploadFailed'; options.onError?.(new Error('Invalid image upload response')); return }
          if (!target.insert(url, selection)) {
            imageError.value = 'imageInsertFailed'
            options.onError?.(new Error('Image could not be inserted'))
            return
          }
          succeeded = true
          options.onSuccess?.(response)
        },
        onError(error) {
          if (!current()) return
          imageError.value = 'imageUploadFailed'
          options.onError?.(error)
        },
      })
    } catch (error) {
      if (current()) {
        imageError.value = 'imageUploadFailed'
        options.onError?.(error instanceof Error ? error : new Error('Image upload failed'))
      }
    } finally {
      if (active && generation === version) setPending(-1)
    }
    return succeeded
  }
  const customImageRequest: UploadProps['customRequest'] = options => { void uploadOne(options) }

  /** Clipboard and drop images use the same upload path instead of Quill's default base64 embeds. */
  async function uploadImageFiles(files: readonly File[], selection = target.capture()) {
    const draft = props.draft
    const version = generation
    let nextSelection = selection
    for (const file of files) {
      if (!active || props.disabled || props.draft !== draft || generation !== version) return
      const inserted = await uploadOne({ file, filename: 'file' } as UploadOptions, nextSelection)
      // Insertion consumes its bookmark; the next image starts after the accepted image.
      if (inserted) nextSelection = target.capture()
    }
  }
  function invalidate() {
    generation++
    pending.value = 0
    imageError.value = ''
    props.editor.setUploading(false, 'emailImages')
  }
  watch(() => props.draft, invalidate)
  watch(() => props.disabled, disabled => { if (disabled) invalidate() })
  onBeforeUnmount(() => { active = false; invalidate() })

  return { beforeImageUpload, customImageRequest, uploadImageFiles, imageUploading, imageError }
}
