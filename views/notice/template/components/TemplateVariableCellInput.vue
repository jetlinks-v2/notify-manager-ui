<template>
  <div class="template-variable-cell-input">
    <a-input
      :key="inputKey"
      :default-value="displayValue"
      :placeholder="placeholder"
      @focus="focused = true"
      @input="syncDraftFromEvent"
      @blur="handleBlur"
      @press-enter="handlePressEnter"
    />
    <div v-if="invalidName" class="template-variable-cell-input__error">
      {{ nameErrorText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  value?: string
  placeholder?: string
  validateName?: boolean
}>(), {
  value: '',
  placeholder: '',
  validateName: false,
})

const emit = defineEmits<{
  (e: 'commit', value: string): void
}>()

const { t: $t } = useI18n()
const inputKey = ref(0)
const displayValue = ref(props.value || '')
const focused = ref(false)
let draftValue = props.value || ''

watch(
  () => props.value,
  (value) => {
    if (!focused.value) {
      displayValue.value = value || ''
      draftValue = displayValue.value
      inputKey.value += 1
    }
  },
)

const invalidName = computed(() => props.validateName && (!displayValue.value || displayValue.value.length > 64))
const nameErrorText = computed(() => {
  if (!displayValue.value) {
    return $t('NoticeCenter.template.validation.variableNameRequired')
  }
  return $t('NoticeCenter.template.validation.maxLength', [$t('NoticeCenter.template.variable.name'), 64])
})

const syncDraftFromEvent = (event: Event) => {
  draftValue = (event.target as HTMLInputElement | null)?.value || ''
}

const commit = (event: Event) => {
  syncDraftFromEvent(event)
  emit('commit', draftValue)
}

const handleBlur = (event: Event) => {
  focused.value = false
  displayValue.value = draftValue
  commit(event)
}

const handlePressEnter = (event: Event) => {
  commit(event)
}
</script>

<style scoped lang="less">
.template-variable-cell-input {
  width: 100%;
}

.template-variable-cell-input__error {
  margin-top: var(--space-1);
  color: var(--error);
  font-size: var(--fs-12);
}
</style>
