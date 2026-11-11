<template>
  <div class="template-message-text">
    <component :is="block.tag" v-for="(block, blockIndex) in blocks" :key="blockIndex" :class="{ 'template-message-text__heading': block.tag !== 'div' }">
      <template v-for="(segment, segmentIndex) in block.segments" :key="segmentIndex"><strong v-if="segment.strong">{{ segment.text }}</strong><span v-else>{{ segment.text }}</span></template>
      <br v-if="block.empty" />
    </component>
  </div>
</template>

<script setup lang="ts">
import { useTemplateMessageText } from '../hooks/useTemplateMessageText'

const props = defineProps({ text: { type: String, required: true }, markdown: { type: Boolean, default: false } })
const { blocks } = useTemplateMessageText(props)
</script>

<style scoped>
.template-message-text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.75; }
.template-message-text__heading { margin: 0 0 var(--space-2); font-size: var(--fs-16); font-weight: 600; line-height: 1.5; }
</style>
