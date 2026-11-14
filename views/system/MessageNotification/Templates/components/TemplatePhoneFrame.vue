<template>
  <div class="template-phone">
    <div class="template-phone__status"><span>{{ time || '15:46' }}</span><span>5G</span></div>
    <div class="template-phone__navigation"><AIcon type="LeftOutlined" aria-hidden="true" /><strong>{{ title }}</strong></div>
    <div class="template-phone__screen"><slot /></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; time?: string }>()
</script>

<style scoped>
.template-phone { width: min(100%, 18.75rem); min-height: 31.25rem; margin-inline: auto; border: 1px solid var(--line); border-radius: var(--r-6); overflow: hidden; background: var(--jet-theme-bg-container); }
.template-phone__status { display: flex; justify-content: space-between; padding: var(--space-2) var(--space-5); color: var(--text-color); }
.template-phone__navigation { position: relative; display: flex; align-items: center; justify-content: center; min-height: var(--control-height-lg, 2.5rem); padding: var(--space-2) var(--space-8); color: var(--text-color); }
.template-phone__navigation > .anticon { position: absolute; left: var(--space-4); color: var(--text-color-secondary); font-size: var(--fs-12); }
.template-phone__navigation strong { font-weight: 500; text-align: center; overflow-wrap: anywhere; }
.template-phone__screen { min-height: 25rem; padding: var(--space-3); background: var(--bg-sunken); }
</style>
