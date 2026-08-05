<template>
  <a-space>
    <a-tooltip :title="$t('NoticeCenter.template.action.sendPreview')">
      <a-button
        :loading="testing"
        @click="emit('test')"
      >
        <template #icon>
          <AIcon type="SendOutlined" />
        </template>
      </a-button>
    </a-tooltip>
    <a-tooltip :title="$t('NoticeCenter.template.action.notifyRecord')">
      <a-button
        :disabled="!templateId"
        @click="emit('record')"
      >
        <template #icon>
          <AIcon type="ProfileOutlined" />
        </template>
      </a-button>
    </a-tooltip>
  </a-space>
</template>

<script setup lang="ts">
defineProps<{
  templateId?: string
  testing?: boolean
}>()

const emit = defineEmits<{
  test: []
  record: []
}>()
</script>
