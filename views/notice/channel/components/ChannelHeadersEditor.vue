<template>
  <div class="channel-headers">
    <div
      v-for="item in headerRows"
      :key="item.key"
      class="channel-headers__row"
    >
      <a-input
        v-model:value="item.name"
        :maxlength="64"
        :status="item.touched && !item.name ? 'error' : undefined"
        :placeholder="$t('NoticeCenter.channel.credential.headers.keyPlaceholder')"
        @change="handleChange(item)"
      />
      <a-input
        v-model:value="item.value"
        :maxlength="64"
        :status="item.touched && !item.value ? 'error' : undefined"
        :placeholder="$t('NoticeCenter.channel.credential.headers.valuePlaceholder')"
        @change="handleChange(item)"
      />
      <a-button type="text" danger @click="removeHeader(item.key)">
        <AIcon type="DeleteOutlined" />
      </a-button>
    </div>
    <a-button type="dashed" block @click="addHeader">
      <AIcon type="PlusOutlined" />
      {{ $t('NoticeCenter.channel.credential.headers.add') }}
    </a-button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface HeaderItem {
  key: string
  value: string
}

interface HeaderRow {
  key: string
  name: string
  value: string
  touched: boolean
}

const props = defineProps<{
  modelValue?: HeaderItem[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: HeaderItem[]): void
}>()

const { t: $t } = useI18n()
const headerRows = ref<HeaderRow[]>([])

const normalizeHeaders = (headers?: HeaderItem[]) =>
  Array.isArray(headers)
    ? headers.map((item, index) => ({
      key: `${index}-${item.key || 'header'}`,
      name: item.key || '',
      value: item.value || '',
      touched: false,
    }))
    : []

const emitHeaders = () => {
  emit(
    'update:modelValue',
    headerRows.value
      .map(item => ({ key: item.name, value: item.value }))
      .filter(item => item.key || item.value),
  )
}

const handleChange = (item: HeaderRow) => {
  item.touched = true
  emitHeaders()
}

const addHeader = () => {
  headerRows.value.push({
    key: `${Date.now()}-${headerRows.value.length}`,
    name: '',
    value: '',
    touched: false,
  })
  emitHeaders()
}

const removeHeader = (key: string) => {
  headerRows.value = headerRows.value.filter(item => item.key !== key)
  emitHeaders()
}

watch(
  () => props.modelValue,
  value => {
    headerRows.value = normalizeHeaders(value)
  },
  { immediate: true, deep: true },
)

const validate = () => {
  headerRows.value.forEach(item => {
    item.touched = true
  })

  const invalid = headerRows.value.length === 0
    || headerRows.value.some(item => !item.name || !item.value)

  if (invalid) {
    return Promise.reject(new Error($t('NoticeCenter.channel.validation.headersRequired')))
  }

  emitHeaders()
  return Promise.resolve()
}

defineExpose({ validate })
</script>

<style scoped lang="less">
.channel-headers {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.channel-headers__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 2rem;
  gap: var(--space-2);
}

@media (max-width: 40rem) {
  .channel-headers__row {
    grid-template-columns: 1fr;
  }
}
</style>
