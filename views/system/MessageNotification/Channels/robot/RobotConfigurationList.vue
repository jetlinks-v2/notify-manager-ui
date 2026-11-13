<template>
  <a-list class="robot-configurations" size="small" bordered :data-source="items">
    <template #renderItem="{ item }">
      <a-list-item class="robot-configurations__row" :data-config-id="item.id">
        <div class="robot-configurations__summary">
          <div class="robot-configurations__name" :title="item.name">{{ item.name }}</div>
          <div class="robot-configurations__url" :title="item.webhook">{{ item.webhook || t('messageNotification.channels.notFilled') }}</div>
        </div>
        <div class="robot-configurations__actions">
          <j-permission-button type="link" size="small" :has-permission="[notificationPermissions.channels.action]" :disabled="disabled" @click="emit('action', item.id, 'test')">{{ t('messageNotification.channels.robot.test') }}</j-permission-button>
          <a-dropdown :trigger="['click']" :disabled="disabled">
            <a-button type="text" size="small" :disabled="disabled" :aria-label="t('messageNotification.channels.more')"><EllipsisOutlined /></a-button>
            <template #overlay>
              <a-menu class="robot-configurations__menu">
                <a-menu-item key="edit"><j-permission-button type="link" block :has-permission="[notificationPermissions.channels.update]" :disabled="disabled" @click="emit('action', item.id, 'edit')">{{ t('messageNotification.common.edit') }}</j-permission-button></a-menu-item>
                <a-menu-divider />
                <a-menu-item key="delete"><j-permission-button type="link" block danger :has-permission="[notificationPermissions.channels.delete]" :disabled="disabled" @click="emit('action', item.id, 'delete')">{{ t('messageNotification.common.delete') }}</j-permission-button></a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </a-list-item>
    </template>
  </a-list>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { EllipsisOutlined } from '@ant-design/icons-vue'
import { notificationPermissions } from '../../shared'
import type { RobotConfigurationRow } from './robotPresentation'
defineProps<{ items: RobotConfigurationRow[]; disabled: boolean }>()
const emit = defineEmits<{ (event: 'action', id: string, action: 'edit' | 'test' | 'delete'): void }>()
const { t } = useI18n()
</script>

<style scoped>
.robot-configurations { border-color: var(--line); border-radius: var(--r-2); }
.robot-configurations__row { gap: var(--space-4); }
.robot-configurations__summary { flex: 1; min-width: 0; }
.robot-configurations__name, .robot-configurations__url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.robot-configurations__name { font-weight: 500; }
.robot-configurations__url { color: var(--text-color-secondary); font-size: var(--fs-12); font-family: monospace; }
.robot-configurations__actions { display: flex; align-items: center; flex-shrink: 0; gap: var(--space-1); }
.robot-configurations__menu :deep(.ant-dropdown-menu-item) { padding: 0; min-width: 8rem; }
.robot-configurations__menu :deep(.ant-btn) { text-align: left; }
@media (max-width: 30rem) {
  .robot-configurations__row { gap: var(--space-2); }
  .robot-configurations__actions { gap: 0; }
}
</style>
