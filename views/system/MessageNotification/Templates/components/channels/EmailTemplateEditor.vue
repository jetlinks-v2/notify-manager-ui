<template>
  <div class="email-editor">
    <a-form-item>
      <template #label>
        <span class="email-editor__label"><span>{{ t('messageNotification.templates.visual.subject') }}</span><span class="email-editor__count">{{ draft.subject.length }} / 255</span></span>
      </template>
      <a-input v-model:value="draft.subject" :maxlength="255" :disabled="disabled" @focus="closeImage(); captureCaret($event, 'subject')" @click="captureCaret($event, 'subject')" @keyup="captureCaret($event, 'subject')" @input="captureCaret($event, 'subject')" />
    </a-form-item>
    <a-form-item>
      <template #label>
        <span class="email-editor__label"><span>{{ t('messageNotification.templates.visual.body') }}</span><span class="email-editor__count">{{ bodyLength }} / 5120</span></span>
      </template>
      <div class="email-editor__rich-text" :class="{ 'email-editor__rich-text--disabled': disabled }">
        <div class="email-editor__toolbar" role="toolbar" :aria-label="t('messageNotification.templates.richText.bodyLabel')">
          <a-tooltip v-for="action in toolbarActions" :key="action.key" :title="t(`messageNotification.templates.richText.${action.key}`)">
            <a-button size="small" :type="action.active ? 'primary' : 'text'" :disabled="action.disabled" :aria-label="t(`messageNotification.templates.richText.${action.key}`)" :aria-pressed="action.active" @mousedown.prevent @click="runFormat(action.key)">
              <template #icon><AIcon :type="action.icon" /></template>
            </a-button>
          </a-tooltip>
          <a-popover :open="linkOpen" trigger="click" :title="t('messageNotification.templates.richText.link')" @open-change="openLink">
            <template #content>
              <div class="email-editor__link-form">
                <a-input v-model:value="linkUrl" :disabled="disabled" :aria-label="t('messageNotification.templates.richText.linkUrl')" :placeholder="t('messageNotification.templates.richText.linkUrl')" @press-enter="applyLink" />
                <a-button type="primary" size="small" :disabled="disabled || !linkValid" @click="applyLink">{{ t('messageNotification.templates.richText.applyLink') }}</a-button>
              </div>
            </template>
            <a-button size="small" :type="linkActive ? 'primary' : 'text'" :disabled="disabled || !richEditor" :title="t('messageNotification.templates.richText.link')" :aria-label="t('messageNotification.templates.richText.link')" :aria-pressed="linkActive" @mousedown.prevent>
              <template #icon><AIcon type="LinkOutlined" /></template>
            </a-button>
          </a-popover>
          <a-tooltip :title="t('messageNotification.templates.richText.removeLink')">
            <a-button size="small" type="text" :disabled="disabled || !linkActive" :aria-label="t('messageNotification.templates.richText.removeLink')" @mousedown.prevent @click="removeLink">
              <template #icon><AIcon type="DisconnectOutlined" /></template>
            </a-button>
          </a-tooltip>
          <a-popover :open="imageOpen" :trigger="[]" @open-change="openImage">
            <template #title>
              <div class="email-editor__image-title"><span>{{ t('messageNotification.templates.richText.image') }}</span><a-button size="small" type="text" :aria-label="t('messageNotification.common.close')" @click="closeImage"><template #icon><AIcon type="CloseOutlined" /></template></a-button></div>
            </template>
            <template #content>
              <div class="email-editor__image-form">
                <a-upload accept="image/jpeg,image/png,image/gif,image/webp" :show-upload-list="false" :multiple="false" :disabled="disabled || imageUploading" :before-upload="beforeImageUpload" :custom-request="customImageRequest">
                  <a-button :loading="imageUploading" :disabled="disabled"><template #icon><AIcon type="UploadOutlined" /></template>{{ t('messageNotification.templates.richText.uploadImage') }}</a-button>
                </a-upload>
                <div class="email-editor__link-form">
                  <a-input v-model:value="imageUrl" :disabled="disabled" :aria-label="t('messageNotification.templates.richText.imageUrl')" :placeholder="t('messageNotification.templates.richText.imageUrl')" @focus="captureImageCaret" @click="captureImageCaret" @keyup="captureImageCaret" @input="captureImageCaret" @press-enter="insertImageSource" @keydown.esc.stop="closeImage" />
                  <a-button type="primary" size="small" :disabled="disabled || !imageSourceValid" @click="insertImageSource">{{ t('messageNotification.templates.richText.insertImage') }}</a-button>
                </div>
                <div class="email-editor__hint">{{ t('messageNotification.templates.richText.imageHint') }}</div>
                <div v-if="imageError" class="email-editor__error" role="alert">{{ t('messageNotification.templates.richText.' + imageError) }}</div>
              </div>
            </template>
            <a-button size="small" type="text" :disabled="disabled || !richEditor" :loading="imageUploading" :aria-label="t('messageNotification.templates.richText.image')" :title="t('messageNotification.templates.richText.image')" @mousedown.prevent @click="toggleImage">
              <template #icon><AIcon type="PictureOutlined" /></template>
            </a-button>
          </a-popover>
        </div>
        <div ref="editorElement" class="email-editor__content" />
      </div>
      <div class="email-editor__hint">{{ t('messageNotification.templates.richText.hint') }}</div>
      <div v-if="imageError && !imageOpen" class="email-editor__error" role="alert">{{ t('messageNotification.templates.richText.' + imageError) }}</div>
      <div v-if="limitReached" class="email-editor__error" role="alert">{{ t('messageNotification.templates.richText.limitHint') }}</div>
    </a-form-item>
    <a-form-item :label="t('messageNotification.templates.attachments')">
      <AttachmentEditor v-model:attachments="draft.attachments" :editor="editor" :insert-inline-image="insertAttachmentImage" :disabled="disabled" @uploading="setUploading" />
    </a-form-item>
  </div>
</template>

<script setup lang="ts">
import 'quill/dist/quill.core.css'
import { useEmailTemplateImages } from '../../hooks/useEmailTemplateImages'
import { useEmailRichTextEditor } from '../../hooks/useEmailRichTextEditor'
import type { TemplateDraft } from '../../model'
import type { TemplateEditorController } from '../../channelViewTypes'
import AttachmentEditor from '../AttachmentEditor.vue'

const props = defineProps<{ draft: TemplateDraft; editor: TemplateEditorController; disabled?: boolean }>()
const { t, captureCaret, setUploading } = props.editor
const { editorElement, richEditor, bodyLength, toolbarActions, runFormat, linkOpen, linkUrl, linkActive, linkValid, openLink, applyLink, removeLink, limitReached,
  imageOpen, imageUrl, imageSourceValid, openImage, closeImage, toggleImage, captureImageCaret, insertImageSource, captureImageSelection, insertImage, insertAttachmentImage, setImageUploadHandler } = useEmailRichTextEditor(props)
const { beforeImageUpload, customImageRequest, uploadImageFiles, imageUploading, imageError } = useEmailTemplateImages(props, {
  capture: captureImageSelection, insert: insertImage, editable: () => !props.disabled,
})
setImageUploadHandler((files, selection) => { void uploadImageFiles(files, selection) })
</script>

<style scoped>
.email-editor { min-width: 0; }
.email-editor :deep(.ant-form-item-label) { width: 100%; padding-bottom: var(--space-1); }
.email-editor :deep(.ant-form-item-label > label) { width: 100%; color: var(--jet-theme-text-secondary); font-size: var(--fs-12); }
.email-editor__label { display: flex; width: 100%; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
.email-editor__count { color: var(--text-color-secondary); font-size: var(--fs-12); font-weight: 400; }
.email-editor :deep(.ant-form-item) { margin-bottom: var(--space-4); }
.email-editor__rich-text { border: 1px solid var(--line); border-radius: var(--r-2); background: var(--jet-theme-bg-container); overflow: hidden; }
.email-editor__rich-text:focus-within { border-color: var(--jet-theme-primary); }
.email-editor__toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-1); padding: var(--space-2); border-bottom: 1px solid var(--line); }
.email-editor__toolbar :deep(.ant-btn) { display: inline-flex; align-items: center; justify-content: center; }
.email-editor__content :deep(.ql-editor) { min-height: 17rem; max-height: 30rem; padding: var(--space-3); outline: none; color: var(--jet-theme-text); font-size: var(--fs-12); line-height: 1.75; overflow-y: auto; overflow-wrap: anywhere; }
.email-editor__content :deep(p) { margin: 0 0 var(--space-2); }
.email-editor__content :deep(h2) { margin: var(--space-3) 0 var(--space-2); font-size: var(--fs-16); font-weight: 600; }
.email-editor__content :deep(ul), .email-editor__content :deep(ol) { padding-inline-start: var(--space-6); }
.email-editor__content :deep(img) { max-width: 100%; height: auto; }
.email-editor__content :deep(img[data-email-template-src]) { min-width: 8rem; min-height: 3rem; border: 1px dashed var(--line); }
.email-editor__content :deep(a) { color: var(--jet-theme-primary); text-decoration: underline; }
.email-editor__rich-text--disabled { background: var(--jet-theme-bg-layout); opacity: 0.65; }
.email-editor__image-title { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.email-editor__image-form { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); }
.email-editor__link-form { display: flex; align-items: center; gap: var(--space-2); width: 20rem; max-width: 70vw; }
.email-editor__error { margin-top: var(--space-1); color: var(--jet-theme-error); font-size: var(--fs-12); }
.email-editor__hint { margin-top: var(--space-1); color: var(--text-color-secondary); font-size: var(--fs-12); }
</style>
