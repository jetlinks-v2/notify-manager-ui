<template>
  <FullPage class="notification-page notification-channels" transparentBackground :flex="true">
    <a-select v-if="isNarrow" :value="channelId" :options="channelOptions" :disabled="operationBusy || sending" :aria-label="t('messageNotification.channels.navigation')" class="notification-channels__mobile-nav" @change="workspace.activate(String($event))" />
    <EqualHeightColumns class="notification-page__layout" left-width="15rem" right-width="1fr" :show-left="!isNarrow">
      <template #left>
        <nav class="notification-page__sidebar" :aria-label="t('messageNotification.channels.navigation')">
          <strong class="notification-page__title">{{ t('messageNotification.channels.navigation') }}</strong>
          <a-menu class="notification-page__body" :selected-keys="[channelId]" mode="inline" :disabled="operationBusy" @click="workspace.activate(String($event.key))">
            <a-menu-item-group v-for="group in channelGroups" :key="group.id" :title="t(`messageNotification.channels.groups.${group.id}`)">
              <a-menu-item v-for="item in group.items" :key="item.id">{{ t(item.labelKey) }}</a-menu-item>
            </a-menu-item-group>
          </a-menu>
        </nav>
      </template>
      <template #right>
        <section class="notification-page__workspace notification-channels__panel" :aria-label="channel ? t(channel.labelKey) : t('messageNotification.channels.title')">
          <div class="notification-page__toolbar">
            <div class="notification-channels__selection">
              <a-select :value="selectedConfigId" class="notification-channels__selector" :options="configurationOptions" :disabled="operationBusy || !canQuery || state === 'loading'" :placeholder="t('messageNotification.channels.chooseConfig')" :aria-label="t('messageNotification.channels.chooseConfig')" @change="workspace.selectConfig(String($event))" />
              <StatusPill v-if="entry" :status="t(dirty || entry.isNew ? 'messageNotification.channels.draft' : 'messageNotification.channels.saved')" />
            </div>
            <div class="notification-page__actions">
              <j-permission-button v-if="canQuery" type="primary" :has-permission="[notificationPermissions.channels.add]" :disabled="operationBusy || !['ready', 'empty'].includes(state)" @click="workspace.createConfig()"><template #icon><AIcon type="PlusOutlined" /></template>{{ t('messageNotification.channels.add') }}</j-permission-button>
              <template v-if="configurationVisible && entry">
                <a-button :disabled="entry.isNew || !canViewTemplates || operationBusy" @click="goTemplates">{{ t('messageNotification.channels.manageTemplates') }}</a-button>
                <a-tooltip :title="channel?.id !== 'email:embedded' ? t('messageNotification.channels.sendUnavailable') : dirty ? t('messageNotification.channels.saveBeforeSend') : undefined">
                  <j-permission-button :has-permission="[notificationPermissions.channels.action]" :disabled="!canTrial || operationBusy" @click="showSend">{{ t('messageNotification.channels.test') }}</j-permission-button>
                </a-tooltip>
                <a-popconfirm v-if="!entry.isNew" :title="t('messageNotification.channels.confirmDelete')" @confirm="remove">
                  <j-permission-button danger :has-permission="[notificationPermissions.channels.delete]" :disabled="operationBusy">{{ t('messageNotification.common.delete') }}</j-permission-button>
                </a-popconfirm>
              </template>
            </div>
          </div>
          <div v-if="state === 'loading' || detailState === 'loading'" class="notification-page__feedback" role="status"><a-spin :tip="t('messageNotification.common.loading')" /></div>
          <CloudEmpty v-else-if="['unavailable', 'forbidden', 'error'].includes(state)" class="notification-page__feedback" :description="t(`messageNotification.state.${state}`)">
            <a-button v-if="canQuery && channel" @click="refresh">{{ t('messageNotification.common.retry') }}</a-button>
          </CloudEmpty>
          <CloudEmpty v-else-if="['unavailable', 'forbidden', 'error'].includes(detailState)" class="notification-page__feedback" :description="t(`messageNotification.state.${detailState}`)">
            <a-button v-if="canQuery && selectedConfigId" @click="workspace.selectConfig(selectedConfigId)">{{ t('messageNotification.common.retry') }}</a-button>
          </CloudEmpty>
          <template v-else-if="entry">
            <div class="notification-page__body notification-channels__body">
              <a-alert v-if="entry.failure" type="error" show-icon :message="t(`messageNotification.state.${entry.failure}`)" class="notification-channels__alert" />
              <ChannelConfiguration :entry="entry" :disabled="!canEdit || operationBusy" @field="workspace.changeField" />
              <a-collapse :key="entry.key" ghost :default-active-key="entry.isNew ? ['help'] : []" class="notification-channels__help">
                <a-collapse-panel key="help" :header="t('messageNotification.channels.helpTitle')"><p>{{ t(`messageNotification.channels.help.${channel?.type}`) }}</p></a-collapse-panel>
              </a-collapse>
            </div>
            <StickyActionBar position="inline" class="notification-page__footer" :hint="dirty ? t('messageNotification.channels.unsaved') : undefined">
              <a-popconfirm :title="t('messageNotification.channels.confirmReset')" :disabled="!dirty || operationBusy" @confirm="workspace.resetDraft()">
                <a-button :disabled="!dirty || operationBusy">{{ t('messageNotification.common.reset') }}</a-button>
              </a-popconfirm>
              <j-permission-button type="primary" :has-permission="[entry.isNew ? notificationPermissions.channels.add : notificationPermissions.channels.update]" :loading="busy" :disabled="!dirty || !canEdit || operationBusy" @click="save">{{ t('messageNotification.common.save') }}</j-permission-button>
            </StickyActionBar>
          </template>
          <CloudEmpty v-else class="notification-page__feedback" :description="t(state === 'empty' ? 'messageNotification.channels.empty' : 'messageNotification.channels.selectConfig')" />
        </section>
      </template>
    </EqualHeightColumns>
    <ChannelSendDrawer :model="sendDrawer" @close="trial.close" @template="trial.selectTemplate" @parameters="updateSendParameters" @send="trial.send" />
    <JlConfirmDialog :open="leaveOpen" :title="t('messageNotification.channels.leaveTitle')" :message="t('messageNotification.channels.confirmLeave')" :confirm-text="t('messageNotification.channels.leave')" :cancel-text="t('messageNotification.channels.stay')" @confirm="decideLeave(true)" @cancel="decideLeave(false)" @update:open="!$event && decideLeave(false)" />
  </FullPage>
</template>

<script setup lang="ts">
import { useChannelsPage } from './useChannelsPage'
import ChannelConfiguration from './ChannelConfiguration.vue'
import ChannelSendDrawer from './ChannelSendDrawer.vue'

defineOptions({ name: 'MessageNotificationChannels' })
const {
  t, notificationPermissions, isNarrow, channelOptions, channelGroups, configurationOptions,
  canQuery, canViewTemplates, channelId, channel, state, detailState, entry, selectedConfigId,
  busy, dirty, canEdit, operationBusy, canTrial, leaveOpen, decideLeave, sendDrawer, sending,
  workspace, trial, refresh, save, remove, goTemplates, showSend, updateSendParameters, configurationVisible,
} = useChannelsPage()
</script>

<style scoped src="../shared/layout.css"></style>
<style scoped>
.notification-channels__selection { display: flex; flex: 1 1 20rem; align-items: center; gap: var(--space-2); min-width: 0; max-width: 34rem; }
.notification-channels__selector { flex: 1; min-width: 0; max-width: 28rem; }
.notification-channels__body { padding-right: var(--space-2); }
.notification-channels__alert { margin-bottom: var(--space-4); }
.notification-channels__help { margin-top: var(--space-4); margin-bottom: var(--space-4); }
.notification-channels__help p { color: var(--text-color-secondary); margin: 0; }
.notification-channels__mobile-nav { flex-shrink: 0; }
@media (max-width: 48rem) { .notification-channels__selection { flex-basis: 100%; } }
</style>
