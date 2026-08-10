<template>
  <a-modal
    :open="open"
    :confirm-loading="testing"
    :title="$t('NoticeCenter.template.test.paramsTitle')"
    :ok-text="$t('NoticeCenter.template.test.send')"
    :cancel-text="$t('NoticeCenter.template.test.cancel')"
    width="48rem"
    @update:open="emit('update:open', $event)"
    @ok="submit"
    @cancel="resetFields"
  >
    <a-form ref="formRef" :model="formState" layout="vertical">
      <a-spin :spinning="loading">
      <a-table
        v-if="testVariables.length"
        bordered
        size="small"
        :columns="columns"
        :data-source="testVariables"
        :pagination="false"
        :row-key="record => record.id"
      >
        <template #bodyCell="{ column, record }">
          <code v-if="column.dataIndex === 'id'">{{ variableToken(record.id) }}</code>
          <span v-if="column.dataIndex === 'name'">
            {{ record.name || $t('NoticeCenter.template.empty.noContent') }}
          </span>
          <span v-if="column.dataIndex === 'type'">{{ getTypeLabel(record.type) }}</span>
          <a-form-item
            v-if="column.dataIndex === 'value'"
            :name="['values', record.id]"
            :rules="getRules(record)"
            class="template-test-params-modal__value"
          >
            <MetadataValueItem
              :item="toMetadataItem(record)"
              v-model="formState.values[record.id]"
            />
          </a-form-item>
        </template>
      </a-table>
      <CloudEmpty
        v-else
        :description="$t('NoticeCenter.template.test.noParams')"
      />
      </a-spin>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { FormInstance } from 'ant-design-vue'
import type { Rule } from 'ant-design-vue/es/form'
import { phoneRegEx } from '@jetlinks-web-core/utils/validate'
import { queryNotifierTemplateDetail_api } from '@notify-manager-ui/api/notice-center'
import type { NoticeTemplateVariable } from '@notify-manager-ui/api/notice-center'
import { variableToken } from '../hooks/noticeTemplateFormModel'

type TemplateTestVariable = NoticeTemplateVariable & {
  format?: string
}

type MetadataItem = {
  id: string
  name?: string
  valueType: {
    type: string
    format?: string
    expands?: Record<string, unknown>
  }
}

const props = defineProps<{
  open: boolean
  testing?: boolean
  templateId?: string
  variables: TemplateTestVariable[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  send: [params: Record<string, unknown>]
}>()

const { t: $t } = useI18n()
const formRef = ref<FormInstance>()
const loading = ref(false)
const fetchedVariables = ref<TemplateTestVariable[]>([])
const formState = reactive<{ values: Record<string, unknown> }>({
  values: {},
})
const testVariables = computed(() => props.templateId ? fetchedVariables.value : props.variables)

const columns = computed(() => [
  {
    title: $t('NoticeCenter.template.variable.id'),
    dataIndex: 'id',
    width: 160,
  },
  {
    title: $t('NoticeCenter.template.variable.name'),
    dataIndex: 'name',
    width: 160,
  },
  {
    title: $t('NoticeCenter.template.variable.type'),
    dataIndex: 'type',
    width: 120,
  },
  {
    title: $t('NoticeCenter.template.test.paramValue'),
    dataIndex: 'value',
  },
])

const normalizeType = (type?: string) => {
  if (type === 'date') return 'date'
  if (type === 'double' || type === 'float' || type === 'number') return 'double'
  if (type === 'integer') return 'int'
  if (type === 'int' || type === 'long') return type
  if (type === 'boolean' || type === 'object' || type === 'array' || type === 'file') return type
  return 'string'
}

const defaultValue = (variable: TemplateTestVariable) => {
  const mockValue = variable.expands?.mockValue
  if (mockValue !== undefined) {
    return mockValue
  }
  const type = normalizeType(variable.type)
  if (type === 'object') return '{}'
  if (type === 'array') return '[]'
  return undefined
}

const isRequired = (variable: TemplateTestVariable) =>
  variable.expands?.required === true || variable.expands?.required === 'true'

const isUserPhoneNumberVariable = (variable: TemplateTestVariable) =>
  variable.id === 'phoneNumber' && String(variable.expands?.businessType) === 'user'

const responseResult = <T,>(response: any, fallback: T): T =>
  response?.result === undefined || response?.result === null ? fallback : response.result as T

const normalizeDetailVariable = (variable: NoticeTemplateVariable): TemplateTestVariable => ({
  ...variable,
  type: variable.expands?.businessType ? String(variable.expands.businessType) : variable.type,
})

const clearValues = () => {
  Object.keys(formState.values).forEach(key => {
    delete formState.values[key]
  })
}

const loadTemplateVariables = async () => {
  if (!props.templateId) {
    fetchedVariables.value = []
    loading.value = false
    return
  }
  const requestTemplateId = props.templateId
  fetchedVariables.value = []
  loading.value = true
  try {
    const response = await queryNotifierTemplateDetail_api(requestTemplateId)
    if (requestTemplateId !== props.templateId) {
      return
    }
    const detail = responseResult<{ variableDefinitions?: NoticeTemplateVariable[] }>(response, {})
    fetchedVariables.value = (detail.variableDefinitions || []).map(normalizeDetailVariable)
  } finally {
    if (requestTemplateId === props.templateId) {
      loading.value = false
    }
  }
}

const resetFields = () => {
  const nextIds = new Set(testVariables.value.map(item => item.id))
  Object.keys(formState.values).forEach(key => {
    if (!nextIds.has(key)) {
      delete formState.values[key]
    }
  })
  testVariables.value.forEach(variable => {
    formState.values[variable.id] = defaultValue(variable)
  })
  formRef.value?.clearValidate()
}

const getRules = (variable: TemplateTestVariable): Rule[] => {
  const rules: Rule[] = []

  if (isRequired(variable)) {
    rules.push({ required: true, message: $t('NoticeCenter.template.test.paramRequired') })
  }

  if (isUserPhoneNumberVariable(variable)) {
    rules.push({
      // 短信模板测试参数中的接收手机号沿用模板配置页的手机号校验规则。
      validator: (_rule, value) => {
        if (!value || phoneRegEx(String(value))) {
          return Promise.resolve()
        }
        return Promise.reject($t('NoticeCenter.template.validation.phoneInvalid'))
      },
      trigger: 'blur',
    })
  }

  return rules
}

const toMetadataItem = (variable: TemplateTestVariable): MetadataItem => ({
  id: variable.id,
  name: variable.name || variable.id,
  valueType: {
    type: normalizeType(variable.type),
    format: variable.format,
    expands: variable.expands,
  },
})

const getTypeLabel = (type?: string) => {
  const normalizedType = normalizeType(type)
  if (normalizedType === 'date') return $t('NoticeCenter.template.variable.type.date')
  if (['double', 'float', 'number', 'int', 'long'].includes(normalizedType)) {
    return $t('NoticeCenter.template.variable.type.double')
  }
  return $t('NoticeCenter.template.variable.type.string')
}

const submit = async () => {
  await formRef.value?.validate()
  emit('send', { ...formState.values })
}

watch(
  () => [props.open, props.templateId],
  async ([open]) => {
    if (open) {
      clearValues()
      await loadTemplateVariables()
      resetFields()
    }
  },
  { immediate: true },
)

watch(
  () => props.variables,
  () => {
    if (props.open && !props.templateId) {
      resetFields()
    }
  },
)
</script>

<style scoped lang="less">
.template-test-params-modal__value {
  margin-bottom: 0;
}

code {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--fs-13);
}
</style>
