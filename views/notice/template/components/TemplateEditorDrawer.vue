<template>
  <JlDrawerShell
    :open="open"
    :title="drawerTitle"
    :sub="$t('NoticeCenter.template.editor.sub')"
    icon="EditOutlined"
    :width="620"
    form-mode
    @submit="handleSubmit"
    @update:open="$emit('update:open', $event)"
  >
    <a-form layout="vertical">
      <a-form-item :label="$t('NoticeCenter.template.field.name')" required>
        <a-input
          v-model:value="form.name"
          :placeholder="$t('NoticeCenter.template.placeholder.name')"
        />
      </a-form-item>

      <a-form-item :label="$t('NoticeCenter.template.field.description')">
        <a-input
          v-model:value="form.description"
          :placeholder="$t('NoticeCenter.template.placeholder.description')"
        />
      </a-form-item>

      <a-form-item
        v-if="isEmailLike"
        :label="$t('NoticeCenter.template.field.subject')"
      >
        <a-input
          v-model:value="form.subject"
          :placeholder="$t('NoticeCenter.template.placeholder.subject')"
        />
      </a-form-item>

      <a-form-item :label="$t('NoticeCenter.template.field.content')" required>
        <a-textarea
          ref="textareaRef"
          v-model:value="form.message"
          :auto-size="{ minRows: 8, maxRows: 14 }"
          :placeholder="$t('NoticeCenter.template.placeholder.content')"
        />
      </a-form-item>
    </a-form>

    <section v-if="variables.length" class="template-editor__variables">
      <div class="template-editor__section-title">
        {{ $t('NoticeCenter.template.editor.variables') }}
      </div>
      <div class="template-editor__chips">
        <button
          v-for="item in variables"
          :key="item.id"
          type="button"
          @click="insertVariable(item.id)"
        >
          {{ variableToken(item.id) }}
        </button>
      </div>
    </section>

    <section class="template-editor__preview">
      <div class="template-editor__section-title">
        {{ $t('NoticeCenter.template.editor.preview') }}
      </div>
      <div class="template-editor__preview-box">
        <strong v-if="form.subject">{{ form.subject }}</strong>
        <p>{{ form.message || $t('NoticeCenter.template.empty.noContent') }}</p>
      </div>
    </section>

    <template #foot>
      <a-button @click="$emit('update:open', false)">
        {{ $t('NoticeCenter.template.action.cancel') }}
      </a-button>
      <a-button type="primary" :loading="saving" @click="handleSubmit">
        {{ $t('NoticeCenter.template.action.save') }}
      </a-button>
    </template>
  </JlDrawerShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web/utils'
import type { NoticeTemplateEditorPayload } from '../hooks/useNoticeTemplateCenter'
import type {
  NoticeTemplateEntity,
  NoticeTemplateVariable,
} from '@notice-center-ui/api/notice-center'
import type { NoticeTemplateAlarmNode, NoticeTemplateChannelNode } from '../hooks/useNoticeTemplateCenter'

const props = defineProps<{
  open: boolean
  alarm?: NoticeTemplateAlarmNode
  channel?: NoticeTemplateChannelNode
  template?: NoticeTemplateEntity
  variables: NoticeTemplateVariable[]
  saving: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', value: NoticeTemplateEditorPayload): void
}>()

const { t: $t } = useI18n()
const textareaRef = ref()
type TemplateEditorDrawerForm = {
  name: string
  description?: string
  subject?: string
  message: string
}

const form = reactive<TemplateEditorDrawerForm>({
  name: '',
  description: '',
  subject: '',
  message: '',
})

const drawerTitle = computed(() =>
  props.template?.id
    ? $t('NoticeCenter.template.editor.editTitle')
    : $t('NoticeCenter.template.editor.createTitle'),
)

const isEmailLike = computed(() => props.channel?.channelProvider.includes('email'))

const variableToken = (id: string) => `\${${id}}`

const getTemplateBody = () => props.template?.template || {}

const resetForm = () => {
  const body = getTemplateBody()
  form.name = props.template?.name || [props.alarm?.name, props.channel?.channelName].filter(Boolean).join(' · ')
  form.description = props.template?.description || ''
  form.subject = String(body.subject || body.title || '')
  form.message = String(body.message || body.text || '')
}

const insertVariable = (id: string) => {
  const token = variableToken(id)
  const textarea = textareaRef.value?.resizableTextArea?.textArea
  if (!textarea) {
    form.message += token
    return
  }

  const start = textarea.selectionStart || 0
  const end = textarea.selectionEnd || 0
  // 在光标处插入变量，保留用户已选中的文本替换行为。
  form.message = `${form.message.slice(0, start)}${token}${form.message.slice(end)}`
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.selectionStart = start + token.length
    textarea.selectionEnd = start + token.length
  })
}

const handleSubmit = () => {
  if (!form.name.trim()) {
    onlyMessage($t('NoticeCenter.template.validation.nameRequired'), 'error')
    return
  }
  if (!form.message.trim()) {
    onlyMessage($t('NoticeCenter.template.validation.contentRequired'), 'error')
    return
  }
  emit('save', {
    name: form.name.trim(),
    description: form.description?.trim(),
    type: props.template?.type,
    provider: props.template?.provider,
    template: {
      ...(props.template?.template || {}),
      subject: form.subject?.trim(),
      message: form.message,
    },
    variableDefinitions: props.template?.variableDefinitions || [],
  })
}

watch(
  () => [props.open, props.template?.id, props.channel?.key],
  () => {
    if (props.open) {
      resetForm()
    }
  },
  { immediate: true },
)
</script>

<style scoped lang="less">
.template-editor__variables,
.template-editor__preview {
  border: 0.0625rem solid var(--jet-theme-border);
  border-radius: var(--jet-theme-radius);
  padding: var(--space-3);
  background: var(--jet-theme-bg-container);
}

.template-editor__section-title {
  color: var(--jet-theme-primary);
  font-size: var(--fs-13);
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.template-editor__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);

  button {
    border: 0.0625rem solid var(--jet-theme-border);
    border-radius: var(--jet-theme-radius);
    background: var(--jet-theme-bg);
    color: var(--jet-theme-primary);
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

    &:hover {
      border-color: var(--jet-theme-primary);
      background: var(--jet-theme-hover);
    }
  }
}

.template-editor__preview-box {
  color: var(--jet-theme-primary);
  line-height: 1.7;
  white-space: pre-wrap;

  strong {
    display: block;
    margin-bottom: var(--space-2);
  }

  p {
    margin: 0;
  }
}
</style>
