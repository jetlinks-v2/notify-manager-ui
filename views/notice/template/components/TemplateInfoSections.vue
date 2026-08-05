<template>
  <div class="template-info-sections">
<!--    <section-->
<!--      v-if="coveredAlarmNames.length"-->
<!--      class="template-info-sections__covered"-->
<!--    >-->
<!--      <header class="template-info-sections__covered-head">-->
<!--        <h2>{{ $t('NoticeCenter.template.detail.coveredTitle') }}</h2>-->
<!--        <MetaChip class="template-info-sections__covered-count">-->
<!--          <b>{{ coveredAlarmNames.length }}</b>-->
<!--          {{ $t('NoticeCenter.template.detail.itemUnit') }}-->
<!--        </MetaChip>-->
<!--      </header>-->
<!--      <p class="template-info-sections__covered-sub">-->
<!--        <template v-for="(segment, index) in coveredSubSegments" :key="index">-->
<!--          <code v-if="segment.variable">{{ segment.text }}</code>-->
<!--          <span v-else>{{ segment.text }}</span>-->
<!--        </template>-->
<!--      </p>-->
<!--      <div class="template-info-sections__covered-chips">-->
<!--        <AppTag v-for="name in visibleCoveredAlarmNames" :key="name">-->
<!--          {{ name }}-->
<!--        </AppTag>-->
<!--        <button-->
<!--          v-if="canToggleCoveredAlarms"-->
<!--          type="button"-->
<!--          class="template-info-sections__covered-toggle"-->
<!--          :aria-expanded="coveredExpanded"-->
<!--          @click="coveredExpanded = !coveredExpanded"-->
<!--        >-->
<!--          {{ coveredToggleText }}-->
<!--        </button>-->
<!--      </div>-->
<!--    </section>-->
<!--    <div v-if="usedVariables.length">-->
<!--        <header class="template-info-sections__covered-head">-->
<!--            <h2>{{ $t('NoticeCenter.template.detail.variableTitle') }}</h2>-->

<!--        </header>-->
<!--        <div class="template-info-sections__variables">-->
<!--            <div-->
<!--                class="variables__btn"-->
<!--                v-for="item in usedVariables"-->
<!--                :key="item.id"-->
<!--                type="button"-->
<!--                @click="$emit('copy-variable', item.id)"-->
<!--            >-->
<!--                <code>{{ variableToken(item.id) }}</code>-->
<!--                <span>{{ item.name || item.description || item.type || item.id }}</span>-->
<!--            </div>-->
<!--        </div>-->
<!--    </div>-->

    <SectionCard
      v-if="availableStats.length"
      icon="LineChartOutlined"
      :title="$t('NoticeCenter.template.detail.statsTitle')"
    >
      <div class="template-info-sections__stats">
        <div v-for="item in availableStats" :key="item.key">
          <span>{{ item.key }}</span>
          <b>{{ item.value }}</b>
        </div>
      </div>
    </SectionCard>

    <SectionCard
      v-if="referencedPolicies.length"
      icon="BranchesOutlined"
      :title="$t('NoticeCenter.template.detail.referenceTitle')"
    >
      <template #actions>
        <MetaChip :value="referencedPolicies.length">
          {{ $t('NoticeCenter.template.detail.itemUnit') }}
        </MetaChip>
      </template>
      <div class="template-info-sections__refs">
        <button v-for="item in referencedPolicies" :key="item.id" type="button">
          <AIcon type="CheckCircleOutlined" />
          <span>{{ item.name }}</span>
          <em v-if="item.count">{{ item.count }}</em>
          <AIcon type="RightOutlined" />
        </button>
      </div>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoticeTemplateVariable } from '@notice-center-ui/api/notice-center'

type TextSegment = {
  text: string
  variable: boolean
}

const props = defineProps<{
  coveredAlarmNames: string[]
  usedVariables: NoticeTemplateVariable[]
  availableStats: Array<{ key: string; value: string }>
  referencedPolicies: Array<{ id: string; name: string; count?: unknown }>
}>()

defineEmits<{
  (e: 'copy-variable', id: string): void
}>()

const { t: $t } = useI18n()
const coveredExpanded = ref(false)
const coveredCollapsedSize = 8
const variableToken = (id: string) => `\${${id}}`
const coveredVariableToken = variableToken('alarmTypeName')
const canToggleCoveredAlarms = computed(() => props.coveredAlarmNames.length > coveredCollapsedSize)
const visibleCoveredAlarmNames = computed(() => {
  if (coveredExpanded.value || !canToggleCoveredAlarms.value) {
    return props.coveredAlarmNames
  }
  return props.coveredAlarmNames.slice(0, coveredCollapsedSize)
})
const coveredHiddenCount = computed(() => Math.max(props.coveredAlarmNames.length - coveredCollapsedSize, 0))
const coveredToggleText = computed(() => coveredExpanded.value
  ? $t('NoticeCenter.template.detail.collapse')
  : $t('NoticeCenter.template.detail.expandMore', [coveredHiddenCount.value])
)
const coveredSubSegments = computed<TextSegment[]>(() => {
  const text = $t('NoticeCenter.template.detail.coveredSub', [coveredVariableToken])
  const variable = coveredVariableToken
  const index = text.indexOf(variable)

  if (index === -1) {
    return [{ text, variable: false }]
  }

  return [
    { text: text.slice(0, index), variable: false },
    { text: variable, variable: true },
    { text: text.slice(index + variable.length), variable: false },
  ].filter(item => item.text)
})

watch(
  () => props.coveredAlarmNames.join('|'),
  () => {
    coveredExpanded.value = false
  },
)
</script>

<style scoped lang="less" src="./TemplateInfoSections.less"></style>
