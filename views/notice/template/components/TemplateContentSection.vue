<template>
  <section class="template-content-section">
    <template v-if="editing">
      <header class="template-content-section__head">
        <h2>{{ $t('NoticeCenter.template.editor.contentTitle') }}</h2>
        <MetaChip v-if="form.variableDefinitions.length" :value="form.variableDefinitions.length">
          {{ $t('NoticeCenter.template.detail.variableLabel') }}
        </MetaChip>
      </header>

      <a-form :model="form" layout="vertical" class="template-content-section__form">
        <template v-for="field in fields" :key="field.key">
          <a-form-item
            :required="field.required"
            :name="field.key === 'provider' ? ['provider'] : ['template', ...field.path]"
            :rules="getFieldRules(field)"
            :label="$t(field.labelKey)"
          >
            <TemplateFieldRenderer
              :field="field"
              :value="getFieldValue(field)"
              @update="value => setFieldValue(field, value)"
              @activate="path => activePath = path"
              @load-options="loadRemoteOptions"
              @register-textarea="registerTextarea"
            />
          </a-form-item>
        </template>
      </a-form>

      <div v-if="variables.length" class="template-content-section__recommend">
        <div class="template-content-section__header">
          <span>{{ $t('NoticeCenter.template.editor.recommendVariables') }}</span>
          <div class="template-content-section__tip">
            <span>{{ $t('NoticeCenter.template.editor.modeGuide') }}</span>
          </div>
        </div>
        <div class="template-content-section__variables">
          <button
            v-for="item in variables"
            :key="item.id"
            type="button"
            class="button"
            @click="insertVariable(item.id)"
          >
            <i v-if="item.expands?.recommended">★</i>{{ variableToken(item.id) }}
          </button>
        </div>
      </div>

      <TemplateVariableDefinitions
        v-if="form.variableDefinitions.length"
        v-model="form.variableDefinitions"
        :readonly="false"
      />

      <div class="template-content-section__resolved-preview">
        <span>{{ $t('NoticeCenter.template.editor.resolvedPreview') }}</span>
        <strong v-if="previewTitle">
          <template v-for="(segment, index) in resolvedTitleSegments" :key="index">
            <span v-if="segment.variable" class="template-content-section__resolved-token">{{ segment.text }}</span>
            <span v-else>{{ segment.text }}</span>
          </template>
        </strong>
        <p>
          <template v-for="(segment, index) in resolvedMessageSegments" :key="index">
            <span v-if="segment.variable" class="template-content-section__resolved-token">{{ segment.text }}</span>
            <span v-else>{{ segment.text }}</span>
          </template>
        </p>
      </div>
    </template>

    <template v-else>
      <div class="template-content-section__top">
        <header class="template-content-section__head">
          <h2>{{ $t('NoticeCenter.template.detail.contentTitle') }}</h2>
        </header>
        <div class="template-content-section__toolbar">
          <TemplateContentActions
            :template-id="templateId"
            :testing="testing"
            @test="templateId ? testParamsOpen = true : emit('test')"
            @record="recordOpen = true"
          />
        </div>
      </div>

      <TemplateEchoGrid :fields="readFields" :form="form" />

      <div class="template-content-section__render">
        <strong v-if="previewTitle">
          <template v-for="(segment, index) in visibleTitleSegments" :key="index">
            <span v-if="segment.variable" class="template-content-section__token">{{ segment.text }}</span>
            <span v-else>{{ segment.text }}</span>
          </template>
        </strong>
        <p>
          <template v-for="(segment, index) in visibleMessageSegments" :key="index">
            <span v-if="segment.variable" class="template-content-section__token">{{ segment.text }}</span>
            <span v-else>{{ segment.text }}</span>
          </template>
        </p>
      </div>

      <TemplateVariableDefinitions
        v-if="form.variableDefinitions.length"
        v-model="form.variableDefinitions"
        readonly
        class="template-content-section__variables-readonly"
      />
    </template>

    <TemplateTestParamsModal
      v-model:open="testParamsOpen"
      :testing="testing"
      :template-id="templateId"
      :variables="form.variableDefinitions"
      @send="params => emit('test', params)"
    />
    <TemplateNotifyRecordModal
      v-model:open="recordOpen"
      :template-id="templateId"
      :template-type="templateType"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateContentActions from './TemplateContentActions.vue'
import TemplateEchoGrid from './TemplateEchoGrid.vue'
import TemplateFieldRenderer from './TemplateFieldRenderer.vue'
import TemplateNotifyRecordModal from './TemplateNotifyRecordModal.vue'
import TemplateTestParamsModal from './TemplateTestParamsModal.vue'
import TemplateVariableDefinitions from './TemplateVariableDefinitions.vue'
import type { NoticeTemplateVariable } from '@notice-center-ui/api/notice-center'
import type { NoticeTemplateChannelNode } from '../hooks/noticeTemplateModel'
import { useTemplatePreviewSegments } from '../hooks/useTemplatePreviewSegments'
import type { PreviewMode } from '../hooks/useTemplatePreviewSegments'
import type {
  NoticeTemplateEditorPayload,
  NoticeTemplateFieldSchema,
  NoticeTemplateFormContext,
} from '../hooks/noticeTemplateFormModel'
import { useNoticeTemplateEditorOptions } from '../hooks/useNoticeTemplateEditorOptions'
import { useTemplateFieldRules } from '../hooks/useTemplateFieldRules'
import {
  applyTemplateFieldChange,
  applyTemplateProviderChange,
  getByPath,
  getPreviewTexts,
  resolveTemplateConfigId,
  getTemplateFieldSchemas,
  syncVariableDefinitions,
  variableToken,
} from '../hooks/noticeTemplateFormModel'

const props = defineProps<{
  editing: boolean
  context: NoticeTemplateFormContext
  channel?: NoticeTemplateChannelNode
  variables: NoticeTemplateVariable[]
  form: NoticeTemplateEditorPayload
  templateId?: string
  templateType?: string
  copyable?: boolean
  testing?: boolean
}>()

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'test', params?: Record<string, unknown>): void
}>()

const { t: $t } = useI18n()
const { getFieldRules } = useTemplateFieldRules($t)
const previewMode = ref<PreviewMode>('token')
const activePath = ref<string[]>(['message'])
const testParamsOpen = ref(false)
const recordOpen = ref(false)
const textareaRefs = new Map<string, any>()
const {
  resolveField,
  onFieldChange,
  loadRemoteOptions,
} = useNoticeTemplateEditorOptions(
  props.context,
  props.form,
  () => props.channel,
)

const fields = computed(() =>
  getTemplateFieldSchemas(props.context, props.form)
    .map(resolveField)
    .filter(field => !field.hidden),
)
const readFields = computed(() => fields.value)
const previewTexts = computed(() => getPreviewTexts(props.form))
const previewTitle = computed(() => previewTexts.value.title)
const previewMessage = computed(() => previewTexts.value.message)
const {
  resolvedTitleSegments,
  resolvedMessageSegments,
  visibleTitleSegments,
  visibleMessageSegments,
} = useTemplatePreviewSegments(
  () => props.variables,
  () => $t('NoticeCenter.template.empty.noContent'),
  previewTitle,
  previewMessage,
  previewMode,
)

const pathKey = (path: string[]) => path.join('.')

const registerTextarea = (field: NoticeTemplateFieldSchema, el: any) => {
  const key = pathKey(field.path)
  // Vue function refs pass null on unmount; clear stale refs before inserting variables.
  if (!el) {
    textareaRefs.delete(key)
    return
  }
  textareaRefs.set(key, el)
}

const getFieldValue = (field: NoticeTemplateFieldSchema) =>
  field.key === 'provider' ? props.form.provider : getByPath(props.form.template, field.path)

const setFieldValue = (field: NoticeTemplateFieldSchema, value: unknown) => {
  if (field.key === 'provider') {
    const provider = String(value) as NoticeTemplateFormContext['provider']
    const matchedTemplate = props.channel?.templates?.find(item => item.provider === provider)
    applyTemplateProviderChange(
      props.form,
      provider,
      resolveTemplateConfigId(props.channel, provider, matchedTemplate),
      matchedTemplate,
    )
    props.context.provider = props.form.provider as NoticeTemplateFormContext['provider']
  } else {
    applyTemplateFieldChange(props.form, field, value)
  }
  onFieldChange(field, value)
  const lastPath = field.path[field.path.length - 1] || ''
  if (field.copyable || ['message', 'subject', 'body', 'ttsmessage'].includes(lastPath)) {
    activePath.value = field.path
  }
  props.form.variableDefinitions = syncVariableDefinitions(props.form)
}

const insertVariable = (id: string) => {
  const token = variableToken(id)
  const path = activePath.value
  const current = String(getByPath(props.form.template, path) || '')
  const textarea = textareaRefs.get(pathKey(path))?.resizableTextArea?.textArea

  if (!textarea) {
    applyTemplateFieldChange(props.form, { key: pathKey(path), path } as NoticeTemplateFieldSchema, `${current}${token}`)
    props.form.variableDefinitions = syncVariableDefinitions(props.form)
    return
  }

  const start = textarea.selectionStart || 0
  const end = textarea.selectionEnd || 0
  applyTemplateFieldChange(
    props.form,
    { key: pathKey(path), path } as NoticeTemplateFieldSchema,
    `${current.slice(0, start)}${token}${current.slice(end)}`,
  )
  props.form.variableDefinitions = syncVariableDefinitions(props.form)
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.selectionStart = start + token.length
    textarea.selectionEnd = start + token.length
  })
}

watch(
  () => [props.context.type, props.context.provider, props.form.template.messageType, props.form.template.templateType],
  () => {
    const nextFields = getTemplateFieldSchemas(props.context, props.form).map(resolveField)
    const firstCopyable = nextFields.find(field => field.copyable)
    activePath.value = firstCopyable?.path || nextFields[0]?.path || ['message']
  },
  { immediate: true },
)

watch(
  () => props.testing,
  (testing, previousTesting) => {
    if (previousTesting && !testing) {
      testParamsOpen.value = false
    }
  },
)
</script>

<style scoped lang="less" src="./TemplateContentSection.less"></style>
