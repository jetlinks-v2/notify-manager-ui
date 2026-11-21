<template>
  <a-list class="channel-configurations" size="small" bordered :data-source="items">
    <template #renderItem="{ item }">
      <a-list-item class="channel-configurations__row" :data-config-id="item.id">
        <div class="channel-configurations__summary">
          <div class="channel-configurations__name" :title="item.name">{{ item.name }}</div>
          <div class="channel-configurations__url" :title="item.address">{{ item.address || t('messageNotification.channels.notFilled') }}</div>
        </div>
        <div class="channel-configurations__actions">
          <j-permission-button type="link" size="small" :has-permission="[notificationPermissions.channels.action]" :disabled="disabled" @click="emit('action', item.id, 'test')">{{ t('messageNotification.channels.testConfiguration') }}</j-permission-button>
          <a-dropdown :trigger="['click']" :disabled="disabled">
            <a-button type="text" size="small" :disabled="disabled" :aria-label="t('messageNotification.channels.more')"><EllipsisOutlined /></a-button>
            <template #overlay>
              <a-menu class="channel-configurations__menu">
                <a-menu-item key="edit"><j-permission-button type="link" block :has-permission="[notificationPermissions.channels.update]" :disabled="disabled" @click="emit('action', item.id, 'edit')">{{ t('messageNotification.common.edit') }}</j-permission-button></a-menu-item>
                <a-menu-item v-if="canFillTemplates" key="fill"><j-permission-button type="link" block :has-permission="[notificationPermissions.channels.update]" :disabled="disabled" @click="emit('action', item.id, 'fill')">{{ t('messageNotification.channels.templateSetup.fill') }}</j-permission-button></a-menu-item>
                <a-menu-divider />
                <a-menu-item key="delete">
                  <j-permission-button type="link" block danger :has-permission="canDelete" :disabled="disabled" @click="emit('action', item.id, 'delete')">
                    {{ t('messageNotification.common.delete') }}
                  </j-permission-button>
                </a-menu-item>
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
import type { ChannelConfigurationAction, ChannelConfigurationRow } from './configurationPresentation'
defineProps<{ items: ChannelConfigurationRow[]; disabled: boolean; canFillTemplates: boolean; canDelete: boolean }>()
const emit = defineEmits<{ (event: 'action', id: string, action: ChannelConfigurationAction): void }>()
const { t } = useI18n()
</script>

<style scoped>
.channel-configurations { border-color: var(--line); border-radius: var(--r-2); }
.channel-configurations__row { gap: var(--space-4); }
.channel-configurations__summary { flex: 1; min-width: 0; }
.channel-configurations__name, .channel-configurations__url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.channel-configurations__name { font-weight: 500; }
.channel-configurations__url { color: var(--text-color-secondary); font-size: var(--fs-12); font-family: monospace; }
.channel-configurations__actions { display: flex; align-items: center; flex-shrink: 0; gap: var(--space-1); }
.channel-configurations__menu :deep(.ant-dropdown-menu-item) { padding: 0; min-width: 8rem; }
.channel-configurations__menu :deep(.ant-btn) { text-align: left; }
@media (max-width: 30rem) {
  .channel-configurations__row { gap: var(--space-2); }
  .channel-configurations__actions { gap: 0; }
}
</style>
