<template>
  <FullPage class="notification-page notification-channels" transparentBackground :flex="true">
    <a-select v-if="isNarrow" :value="channelId" :options="channelOptions" :disabled="operationBusy || directoryState === 'loading'" :aria-label="t('messageNotification.channels.navigation')" class="notification-channels__mobile-nav" @change="workspace.activate(String($event))" />
    <div v-if="isNarrow && providerFeedback.length" class="notification-channels__mobile-feedback">
      <div v-for="feedback in providerFeedback" :key="feedback.id" class="notification-channels__provider-feedback" role="status">
        <span>{{ feedback.name }} · {{ t(feedback.state === 'empty' ? 'messageNotification.channels.noProviders' : `messageNotification.state.${feedback.state}`) }}</span>
        <a-button v-if="feedback.state !== 'empty'" type="link" size="small" :disabled="operationBusy" @click="catalog.loadProviders(feedback.id)">{{ t('messageNotification.common.retry') }}</a-button>
      </div>
    </div>
    <EqualHeightColumns class="notification-page__layout" left-width="15rem" right-width="1fr" :show-left="!isNarrow">
      <template #left>
        <nav class="notification-page__sidebar" :aria-label="t('messageNotification.channels.navigation')">
          <strong class="notification-page__title">{{ t('messageNotification.channels.navigation') }}</strong>
          <a-input v-model:value="channelSearch" allow-clear :placeholder="t('messageNotification.channels.search')" :aria-label="t('messageNotification.channels.search')"><template #prefix><AIcon type="SearchOutlined" aria-hidden="true" /></template></a-input>
          <div class="notification-page__body">
            <a-spin v-if="directoryState === 'loading'" />
            <AutoTree v-else-if="filteredChannelTree.length" v-model:expanded-keys="openChannelKeys" class="notification-channels__tree" block-node :show-line="{ showLeafIcon: false }" :tree-data="filteredChannelTree" :selected-keys="[channelId]" :disabled="operationBusy" @select="selectChannel">
              <template #title="node">
                <span class="notification-channels__node" :title="node.title">
                  <img v-if="channelIcon(node.type)" class="notification-channels__icon" :src="channelIcon(node.type)" alt="" />
                  <AIcon v-else type="NotificationOutlined" class="notification-channels__icon" aria-hidden="true" />
                  <span class="notification-channels__node-label">{{ node.title }}</span>
                  <span v-if="node.count === 0" class="notification-channels__node-state">{{ t('messageNotification.channels.unconfigured') }}</span>
                  <span v-else-if="node.multipleConfigurations && node.count > 1" class="notification-channels__node-state">{{ node.count }}</span>
                </span>
              </template>
            </AutoTree>
            <CloudEmpty v-else-if="directoryState === 'ready'" :description="t('messageNotification.channels.noMatches')" />
            <div v-for="feedback in providerFeedback" :key="feedback.id" class="notification-channels__provider-feedback" role="status">
              <span>{{ feedback.name }} · {{ t(feedback.state === 'empty' ? 'messageNotification.channels.noProviders' : `messageNotification.state.${feedback.state}`) }}</span>
              <a-button v-if="feedback.state !== 'empty'" type="link" size="small" :disabled="operationBusy" @click="catalog.loadProviders(feedback.id)">{{ t('messageNotification.common.retry') }}</a-button>
            </div>
          </div>
        </nav>
      </template>
      <template #right>
        <section class="notification-page__workspace notification-channels__panel" :aria-label="channel ? channelTitle(channel) : t('messageNotification.channels.title')">
          <div v-if="directoryState === 'loading' || directoryState === 'idle'" class="notification-page__feedback" role="status"><a-spin :tip="t('messageNotification.common.loading')" /></div>
          <CloudEmpty v-else-if="['unavailable', 'forbidden', 'error', 'empty'].includes(directoryState)" class="notification-page__feedback" :description="t(directoryState === 'empty' ? 'messageNotification.channels.noChannels' : `messageNotification.state.${directoryState}`)"><a-button v-if="canQuery" @click="catalog.reload()">{{ t('messageNotification.common.retry') }}</a-button></CloudEmpty>
          <template v-else>
            <header v-if="channel" class="notification-channels__heading">
              <img v-if="channelIcon(channel.type)" class="notification-channels__heading-icon" :src="channelIcon(channel.type)" alt="" />
              <AIcon v-else type="NotificationOutlined" class="notification-channels__heading-icon" aria-hidden="true" />
              <div class="notification-channels__summary">
                <div class="notification-channels__title-row"><h2>{{ channelTitle(channel) }}</h2><StatusPill v-if="['ready', 'empty'].includes(state)" :status="t(state === 'empty' ? 'messageNotification.channels.unconfigured' : dirty || entry?.isNew ? 'messageNotification.channels.draft' : 'messageNotification.channels.configured')" /></div>
                <p>{{ help.description }}</p>
              </div>
              <div v-if="entry" class="notification-page__actions">
                <j-permission-button v-if="configurationVisible && trialSupported" :has-permission="[notificationPermissions.channels.action]" :disabled="!canTrial || operationBusy" @click="showSend">{{ t('messageNotification.channels.test') }}</j-permission-button>
                <a-button :type="helpOpen ? 'primary' : 'default'" :ghost="helpOpen" :aria-expanded="helpOpen" aria-controls="notification-channel-help" @click="toggleHelp()"><template #icon><AIcon type="ReadOutlined" /></template>{{ t('messageNotification.channels.helpTitle') }}</a-button>
                <a-dropdown v-if="configurationVisible && !entry.isNew" :trigger="['click']" :disabled="operationBusy">
                  <a-button :aria-label="t('messageNotification.channels.more')"><AIcon type="MoreOutlined" /></a-button>
                  <template #overlay><a-menu>
                    <a-menu-item key="delete"><j-permission-button type="link" danger :has-permission="[notificationPermissions.channels.delete]" :disabled="operationBusy" @click="requestRemove">{{ t('messageNotification.channels.clear') }}</j-permission-button></a-menu-item>
                  </a-menu></template>
                </a-dropdown>
              </div>
            </header>
            <div v-if="multipleConfigurations && configs.length" class="notification-page__toolbar">
              <a-select :value="selectedConfigId" class="notification-channels__selector" :options="configurationOptions" :disabled="operationBusy || !canQuery || state === 'loading'" :placeholder="t('messageNotification.channels.chooseConfig')" :aria-label="t('messageNotification.channels.chooseConfig')" @change="workspace.selectConfig(String($event))" />
              <div class="notification-page__actions">
                <j-permission-button :has-permission="[notificationPermissions.channels.add]" :disabled="operationBusy || !['ready', 'empty'].includes(state)" @click="workspace.createConfig()"><template #icon><AIcon type="PlusOutlined" /></template>{{ t('messageNotification.channels.add') }}</j-permission-button>
              </div>
            </div>
            <div v-if="state === 'loading' || detailState === 'loading'" class="notification-page__feedback" role="status"><a-spin :tip="t('messageNotification.common.loading')" /></div>
            <CloudEmpty v-else-if="['unavailable', 'forbidden', 'error'].includes(state)" class="notification-page__feedback" :description="t(`messageNotification.state.${state}`)"><a-button v-if="canQuery && channel" @click="refresh">{{ t('messageNotification.common.retry') }}</a-button></CloudEmpty>
            <CloudEmpty v-else-if="['unavailable', 'forbidden', 'error'].includes(detailState)" class="notification-page__feedback" :description="t(`messageNotification.state.${detailState}`)"><a-button v-if="canQuery && selectedConfigId" @click="workspace.selectConfig(selectedConfigId)">{{ t('messageNotification.common.retry') }}</a-button></CloudEmpty>
            <template v-else-if="entry">
              <div class="notification-page__body notification-channels__body">
                <a-alert v-if="entry.refreshFailure" type="warning" show-icon :message="t('messageNotification.channels.savedRefreshFailed')" class="notification-channels__alert"><template #action><a-button :disabled="operationBusy" @click="workspace.refreshSaved()">{{ t('messageNotification.common.retry') }}</a-button></template></a-alert>
                <div class="notification-channels__content" :class="{ 'notification-channels__content--help': helpOpen }">
                  <div>
                    <ChannelConfiguration ref="configurationPanel" :entry="entry" :disabled="!canEdit || sending" :busy="busy" :submit="saveFields" @field="workspace.changeField" @focus="focusField" />
                    <WebhookRequestPreview v-if="channelId === 'webhook:http'" :model="webhookPreviewModel" />
                    <section v-if="channelId === 'weixin:corpMessage'" class="notification-channels__members" :aria-label="t('messageNotification.members.section')">
                      <h3>{{ t('messageNotification.members.section') }}</h3>
                      <p>{{ t('messageNotification.members.sectionHelp') }}</p>
                      <WechatMembersSummary v-if="canSyncMembers" :model="memberDrawer" @match="showMembers(true)">
                        <j-permission-button size="small" :has-permission="[notificationPermissions.channels.bind]" :disabled="operationBusy || memberDrawer.state === 'loading'" @click="showMembers()">{{ t('messageNotification.members.manage') }} ›</j-permission-button>
                      </WechatMembersSummary>
                      <div v-else class="notification-page__actions">
                        <a-button size="small" disabled>{{ t('messageNotification.members.autoMatch') }}</a-button>
                        <j-permission-button size="small" :has-permission="[notificationPermissions.channels.bind]" disabled>{{ t('messageNotification.members.manage') }} ›</j-permission-button>
                      </div>
                    </section>
                  </div>
                  <ChannelHelp v-if="helpOpen" :model="help" :active-step="activeHelpStep" @close="toggleHelp(false)" />
                </div>
              </div>
              <StickyActionBar v-if="entry.isNew" position="inline" class="notification-page__footer notification-channels__footer">
                <j-permission-button type="primary" :has-permission="[entry.isNew ? notificationPermissions.channels.add : notificationPermissions.channels.update]" :loading="busy" :disabled="(!entry.isNew && !dirty) || !canEdit || operationBusy" @click="save">{{ t('messageNotification.common.save') }}</j-permission-button>
              </StickyActionBar>
            </template>
            <CloudEmpty v-else class="notification-page__feedback" :description="t(state === 'empty' ? 'messageNotification.channels.cannotCreate' : 'messageNotification.channels.selectConfig')" />
          </template>
        </section>
      </template>
    </EqualHeightColumns>
    <ChannelTestModal :model="testModel" @close="trial.close()" @recipient="trial.selectRecipient" @address="trial.setAddress" @validate="trial.validateRecipient" @retry-identity="trial.loadIdentity" @send="trial.send" @again="trial.again" @fix="fixTestConfiguration" @closed="afterTestClosed" />
    <WechatMembersDrawer :model="memberDrawer" @close="closeMembers" @reload="reloadMembers" @save="members.save" @unbind="members.unbind" @assign="members.assign" @department="updateMemberDepartment" @search="updateMemberSearch" @match="members.autoMatch" @status="updateMemberStatus" @reset-filters="resetMemberFilters" />
    <JlConfirmDialog :open="memberDiscardOpen" :title="t('messageNotification.members.discardTitle')" :message="t('messageNotification.members.discardMessage')" :confirm-text="t('messageNotification.channels.leave')" :cancel-text="t('messageNotification.channels.stay')" @confirm="decideMemberDiscard(true)" @cancel="decideMemberDiscard(false)" @update:open="!$event && decideMemberDiscard(false)" />
    <a-modal v-if="channel" class="notification-channels__clear" :open="deleteOpen" :title="t('messageNotification.channels.clearTitle', { channel: clearChannelName })" :width="420" centered :closable="false" :mask-closable="false" :ok-text="t('messageNotification.channels.clearConfirm')" :cancel-text="t('messageNotification.common.cancel')" :ok-button-props="{ danger: true, disabled: operationBusy }" @ok="remove" @cancel="deleteOpen = false">
      <p class="notification-channels__clear-message">{{ clearMessage }}</p>
    </a-modal>
    <JlConfirmDialog :open="leaveOpen" :title="t('messageNotification.channels.leaveTitle')" :message="t('messageNotification.channels.confirmLeave')" :confirm-text="t('messageNotification.channels.leave')" :cancel-text="t('messageNotification.channels.stay')" @confirm="decideLeave(true)" @cancel="decideLeave(false)" @update:open="!$event && decideLeave(false)" />
  </FullPage>
</template>

<script setup lang="ts">
import { DingTalk, Email, Sms, Voice, Webhook, WeixinCorp } from '@jetlinks-web-core/assets/notice'
import AutoTree from '@jetlinks-web-core/components/AutoTree'
import { useChannelsPage } from './useChannelsPage'
import ChannelConfiguration from './ChannelConfiguration.vue'
import WebhookRequestPreview from './webhook/WebhookRequestPreview.vue'
import ChannelTestModal from './testing/ChannelTestModal.vue'
import ChannelHelp from './configuration/ChannelHelp.vue'
import WechatMembersDrawer from './members/WechatMembersDrawer.vue'
import WechatMembersSummary from './members/WechatMembersSummary.vue'
defineOptions({ name: 'MessageNotificationChannels' })
const channelIcons: Record<string, string> = { email: Email, dingTalk: DingTalk, weixin: WeixinCorp, voice: Voice, sms: Sms, webhook: Webhook }
const channelIcon = (type: string) => channelIcons[type]
const {
  webhookPreviewModel,
  t, notificationPermissions, isNarrow, channelOptions, channelSearch, filteredChannelTree, openChannelKeys, selectChannel, configurationOptions,
  canQuery, channelId, channel, multipleConfigurations, configs, state, detailState, entry, selectedConfigId,
  busy, dirty, canEdit, operationBusy, trialSupported, canTrial, leaveOpen, decideLeave, configurationPanel,
  workspace, trial, testModel, fixTestConfiguration, afterTestClosed, refresh, save, remove, showSend, configurationVisible,
  catalog, directoryState, providerFeedback, channelTitle, help, helpOpen, toggleHelp, saveFields, focusField, activeHelpStep, sending, deleteOpen, clearChannelName, clearMessage, requestRemove,
  members, memberDrawer, canSyncMembers, showMembers, closeMembers, reloadMembers, memberDiscardOpen, decideMemberDiscard, updateMemberDepartment, updateMemberSearch, updateMemberStatus, resetMemberFilters,
} = useChannelsPage()
</script>

<style scoped src="../shared/layout.css"></style>
<style scoped>
.notification-channels__tree { background: transparent; }
.notification-channels__clear-message { margin: 0; color: var(--text-color-secondary); }
.notification-channels__tree :deep(.ant-tree-title) { display: block; width: 100%; min-width: 0; }
.notification-channels__node { display: flex; align-items: center; gap: var(--space-1); min-width: 0; }
.notification-channels__node-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notification-channels__icon { flex: 0 0 auto; width: var(--space-5); height: var(--space-5); object-fit: contain; }
.notification-channels__node-state { margin-left: auto; color: var(--text-color-secondary); font-size: var(--fs-12); white-space: nowrap; }
.notification-channels__provider-feedback { margin-top: var(--space-3); color: var(--text-color-secondary); font-size: var(--fs-12); }
.notification-channels__heading { display: flex; align-items: flex-start; gap: var(--space-3); }
.notification-channels__heading-icon { flex-shrink: 0; width: var(--space-8); height: var(--space-8); object-fit: contain; }
.notification-channels__summary { flex: 1; min-width: 0; }
.notification-channels__title-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
.notification-channels__title-row h2 { margin: 0; font-size: var(--fs-18); font-weight: 500; }
.notification-channels__summary p { margin: var(--space-2) 0 0; font-size: var(--fs-12); color: var(--text-color-secondary); }
.notification-channels__selector { flex: 1 1 15rem; min-width: 0; max-width: 28rem; }
.notification-channels__body { padding-right: var(--space-2); }
.notification-channels__members { margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--line); }
.notification-channels__members h3 { margin: 0 0 var(--space-2); font-size: var(--fs-14); font-weight: 500; }
.notification-channels__members p { margin: 0 0 var(--space-3); color: var(--text-color-secondary); font-size: var(--fs-12); }
.notification-channels__content { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: var(--space-6); }
.notification-channels__content--help { grid-template-columns: minmax(0, 1fr) minmax(16rem, 34%); }
.notification-channels__alert { margin-bottom: var(--space-4); }
.notification-channels__footer { justify-content: flex-start; }
.notification-channels__mobile-nav { flex-shrink: 0; }
.notification-channels__mobile-feedback { flex-shrink: 0; max-height: 8rem; overflow-y: auto; }
@media (max-width: 64rem) { .notification-channels__content--help { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 48rem) { .notification-channels__heading { flex-wrap: wrap; } .notification-channels__summary { flex-basis: calc(100% - 3rem); } }
</style>

<style>
.notification-channels__clear .ant-modal-header { background: transparent; }
.notification-channels__clear .ant-modal-header .ant-modal-title { padding-bottom: 0; }
.notification-channels__clear .ant-modal-footer { box-shadow:none; }
</style>
