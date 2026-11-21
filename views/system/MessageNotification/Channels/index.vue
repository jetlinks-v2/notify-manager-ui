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
                <div class="notification-channels__title-row"><h2>{{ channelTitle(channel) }}</h2><StatusPill v-if="!multipleConfigurations && ['ready', 'empty'].includes(state)" :status="t(state === 'empty' ? 'messageNotification.channels.unconfigured' : dirty || entry?.isNew ? 'messageNotification.channels.draft' : 'messageNotification.channels.configured')" /></div>
                <p>{{ help.description }}</p>
              </div>
              <div v-if="multipleConfigurations || (configurationVisible && trialSupported)" class="notification-page__actions">
                <j-permission-button v-if="multipleConfigurations" type="primary" :has-permission="[notificationPermissions.channels.add]" :disabled="!configurationCanAdd" @click="configurationList.add"><template #icon><PlusOutlined aria-hidden="true" /></template>{{ t(isRobot ? 'messageNotification.channels.robot.add' : 'messageNotification.channels.add') }}</j-permission-button>
                <j-permission-button v-else :has-permission="[notificationPermissions.channels.action]" :disabled="!canTrial || operationBusy" @click="showSend"><template #icon><SendOutlined aria-hidden="true" /></template>{{ t('messageNotification.channels.test') }}</j-permission-button>
              </div>
            </header>
            <div v-if="state === 'loading' || (!multipleConfigurations && detailState === 'loading')" class="notification-page__feedback" role="status"><a-spin :tip="t('messageNotification.common.loading')" /></div>
            <CloudEmpty v-else-if="['unavailable', 'forbidden', 'error'].includes(state)" class="notification-page__feedback" :description="t(`messageNotification.state.${state}`)"><a-button v-if="canQuery && channel" @click="refresh">{{ t('messageNotification.common.retry') }}</a-button></CloudEmpty>
            <CloudEmpty v-else-if="!multipleConfigurations && ['unavailable', 'forbidden', 'error'].includes(detailState)" class="notification-page__feedback" :description="t(`messageNotification.state.${detailState}`)"><a-button v-if="canQuery && selectedConfigId" @click="workspace.selectConfig(selectedConfigId)">{{ t('messageNotification.common.retry') }}</a-button></CloudEmpty>
            <template v-else-if="multipleConfigurations || entry">
              <div class="notification-page__body notification-channels__body">
                <a-alert v-if="entry?.refreshFailure" type="warning" show-icon :message="t('messageNotification.channels.savedRefreshFailed')" class="notification-channels__alert"><template #action><a-button :disabled="operationBusy" @click="workspace.refreshSaved()">{{ t('messageNotification.common.retry') }}</a-button></template></a-alert>
                <div class="notification-channels__content notification-channels__content--help">
                  <div v-if="multipleConfigurations" class="notification-channels__editor">
                    <a-alert v-if="['unavailable', 'forbidden', 'error'].includes(detailState)" type="error" show-icon :message="t(`messageNotification.state.${detailState}`)" class="notification-channels__alert"><template #action><a-button :disabled="operationBusy" @click="refresh">{{ t('messageNotification.common.retry') }}</a-button></template></a-alert>
                    <ChannelConfigurationList v-if="configurationRows.length" :items="configurationRows" :disabled="operationBusy || configurationModal.open"
                      :can-fill-templates="canFillConfigurationTemplates" :can-delete="configurationCanDelete" @action="configurationList.act" />
                    <CloudEmpty v-else :description="t('messageNotification.channels.empty')" />
                    <ChannelTemplateSetup v-if="templateSetupModel.available && !configurationModal.open" :model="templateSetupModel" mode="feedback"
                      @fill="templateSetup.fill()" @view="viewMessageTemplates" />
                  </div>
                  <div v-else-if="entry" class="notification-channels__editor">
                    <ChannelConfiguration :entry="entry" :disabled="!canEdit || sending || fillingTemplates || workRecipients.busy.value" :busy="busy" :submit="saveFields" @field="workspace.changeField" @focus="focusField" />
                    <ChannelTemplateSetup v-if="templateSetupModel.available" :model="templateSetupModel"
                      @change="templateSetup.change" @focus="focusField" @retry-options="templateSetup.reloadSmsOptions" @fill="templateSetup.fill()" @view="viewMessageTemplates" />
                    <section v-if="workChannel" class="notification-channels__members" :aria-label="t('messageNotification.members.section')">
                      <h3>{{ t('messageNotification.members.section') }}</h3>
                      <p>{{ t('messageNotification.members.sectionHelp') }}</p>
                      <WechatMembersSummary v-if="canSyncMembers" :model="memberDrawer" @match="autoMatchMembers" @reload="reloadMembers">
                        <j-permission-button size="small" :has-permission="[notificationPermissions.channels.bind]" :disabled="operationBusy || workRecipients.open.value || memberDrawer.state === 'loading'" @click="showMembers()">{{ t('messageNotification.members.manage') }} ›</j-permission-button>
                      </WechatMembersSummary>
                      <div v-else class="notification-page__actions">
                        <a-button size="small" disabled>{{ t('messageNotification.members.autoMatch') }}</a-button>
                        <j-permission-button size="small" :has-permission="[notificationPermissions.channels.bind]" disabled>{{ t('messageNotification.members.manage') }} ›</j-permission-button>
                      </div>
                    </section>
                    <WorkRecipientGroups v-if="workChannel" :work="workRecipients" :can-manage="canManageWork" :disabled="operationBusy || memberDrawer.open"
                      @close="closeWorkRecipients" @reload="reloadWorkRecipients" />
                  </div>
                  <ChannelHelp :key="`${channelId}:${entry?.key || ''}`" :model="help" :active-section="activeHelpSection" :focus-version="helpFocusVersion" />
                </div>
              </div>
              <StickyActionBar v-if="!multipleConfigurations && entry && canEdit" position="inline" class="notification-page__footer notification-channels__footer">
                <j-permission-button type="primary" :has-permission="[entry.isNew ? notificationPermissions.channels.add : notificationPermissions.channels.update]" :loading="busy || fillingTemplates" :disabled="(!entry.isNew && !dirty) || !canEdit || operationBusy" @click="save">{{ t(templateSetupModel.saveCredentialsFirst ? 'messageNotification.channels.templateSetup.saveCredentials' : 'messageNotification.common.save') }}</j-permission-button>
              </StickyActionBar>
            </template>
            <CloudEmpty v-else class="notification-page__feedback" :description="t(state === 'empty' ? 'messageNotification.channels.cannotCreate' : 'messageNotification.channels.selectConfig')" />
          </template>
        </section>
      </template>
    </EqualHeightColumns>
    <ChannelConfigurationModal :model="configurationModal" @close="configurationList.close" @save="configurationList.save" @change="configurationList.change">
      <ChannelTemplateSetup v-if="configurationModal.open && isRobot" :model="templateSetupModel" mode="fields" @change="templateSetup.change" />
      <ChannelConfiguration v-else-if="configurationModal.open && entry" :entry="entry" :external-fields="['name']"
        :disabled="configurationModal.disabled" :busy="configurationModal.busy" @field="workspace.changeField" @focus="focusField" />
    </ChannelConfigurationModal>
    <JlConfirmDialog :open="!!configurationDeleteTarget" tone="danger"
      :title="t(isRobot ? 'messageNotification.channels.robot.deleteTitle' : 'messageNotification.channels.webhook.deleteTitle')"
      :message="t(isRobot ? 'messageNotification.channels.robot.deleteMessage' : 'messageNotification.channels.webhook.deleteMessage', { name: configurationDeleteTarget?.name ?? '' })"
      :confirm-text="t('messageNotification.common.delete')" :cancel-text="t('messageNotification.common.cancel')"
      @confirm="configurationList.confirmDelete" @cancel="configurationList.cancelDelete" />
    <ChannelTestModal :model="testModel" @close="trial.close()" @recipient="trial.selectRecipient" @address="trial.setAddress" @validate="trial.validateRecipient" @retry-identity="trial.loadIdentity" @retry-members="trial.loadMembers" @send="trial.send" @again="trial.again" @fix="fixTestConfiguration" @closed="afterTestClosed" />
    <WechatMembersDrawer :model="memberDrawer" @close="closeMembers" @reload="reloadMembers" @save="saveMembers" @unbind="unbindMember" @assign="members.assign" @filter="updateMemberFilters" @match="members.autoMatch" @status="updateMemberStatus" @reset-filters="resetMemberFilters" />
    <JlConfirmDialog :open="memberDiscardOpen" :title="t('messageNotification.members.discardTitle')" :message="t('messageNotification.members.discardMessage')" :confirm-text="t('messageNotification.channels.leave')" :cancel-text="t('messageNotification.channels.stay')" @confirm="decideMemberDiscard(true)" @cancel="decideMemberDiscard(false)" @update:open="!$event && decideMemberDiscard(false)" />
    <JlConfirmDialog :open="leaveOpen" :title="t('messageNotification.channels.leaveTitle')" :message="t('messageNotification.channels.confirmLeave')" :confirm-text="t('messageNotification.channels.leave')" :cancel-text="t('messageNotification.channels.stay')" @confirm="decideLeave(true)" @cancel="decideLeave(false)" @update:open="!$event && decideLeave(false)" />
  </FullPage>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { PlusOutlined, SendOutlined } from '@ant-design/icons-vue'
import { DingTalk, Email, Sms, Voice, Webhook, WeixinCorp } from '@jetlinks-web-core/assets/notice'
import AutoTree from '@jetlinks-web-core/components/AutoTree'
import { useChannelsPage } from './useChannelsPage'
import ChannelConfiguration from './ChannelConfiguration.vue'
import ChannelTestModal from './testing/ChannelTestModal.vue'
import ChannelHelp from './configuration/ChannelHelp.vue'
import WechatMembersDrawer from './members/WechatMembersDrawer.vue'
import WechatMembersSummary from './members/WechatMembersSummary.vue'
import WorkRecipientGroups from './members/WorkRecipientGroups.vue'
import ChannelConfigurationList from './configuration/ChannelConfigurationList.vue'
import ChannelConfigurationModal from './configuration/ChannelConfigurationModal.vue'
const ChannelTemplateSetup = defineAsyncComponent(() => import('./templateSetup/ChannelTemplateSetup.vue'))
defineOptions({ name: 'MessageNotificationChannels' })
const channelIcons: Record<string, string> = { email: Email, dingTalk: DingTalk, weixin: WeixinCorp, voice: Voice, sms: Sms, webhook: Webhook }
const channelIcon = (type: string) => channelIcons[type]
const {
  templateSetup, templateSetupModel, fillingTemplates, viewMessageTemplates, canFillConfigurationTemplates,
  configurationList, isRobot, configurationRows, configurationModal, configurationCanAdd, configurationCanDelete, configurationDeleteTarget,
  t, notificationPermissions, isNarrow, channelOptions, channelSearch, filteredChannelTree, openChannelKeys, selectChannel,
  canQuery, channelId, channel, multipleConfigurations, state, detailState, entry, selectedConfigId,
  busy, dirty, canEdit, operationBusy, trialSupported, canTrial, leaveOpen, decideLeave,
  workspace, trial, testModel, fixTestConfiguration, afterTestClosed, refresh, save, showSend, configurationVisible,
  catalog, directoryState, providerFeedback, channelTitle, help, saveFields, focusField, activeHelpSection, helpFocusVersion, sending,
  workChannel, canManageWork, workRecipients, closeWorkRecipients, reloadWorkRecipients, saveMembers, unbindMember,
  members, memberDrawer, canSyncMembers, showMembers, autoMatchMembers, closeMembers, reloadMembers, memberDiscardOpen, decideMemberDiscard, updateMemberFilters, updateMemberStatus, resetMemberFilters,
} = useChannelsPage()
</script>

<style scoped src="../shared/layout.css"></style>
<style scoped>
.notification-channels__tree { background: transparent; }
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
.notification-channels__body { display: flex; flex-direction: column; overflow: hidden; }
.notification-channels__editor { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.notification-channels__editor :deep(.notification-channels__members) { margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--line); }
.notification-channels__editor :deep(.notification-channels__members h3) { margin: 0 0 var(--space-2); font-size: var(--fs-14); font-weight: 500; }
.notification-channels__editor :deep(.notification-channels__members p) { margin: 0 0 var(--space-3); color: var(--text-color-secondary); font-size: var(--fs-12); }
.notification-channels__content { display: grid; grid-template-columns: minmax(0, 1fr); align-items: stretch; gap: var(--space-6); flex: 1; min-height: 0; }
.notification-channels__content--help { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.notification-channels__alert { flex-shrink: 0; margin-bottom: var(--space-4); }
.notification-channels__footer { justify-content: flex-start; }
.notification-channels__mobile-nav { flex-shrink: 0; }
.notification-channels__mobile-feedback { flex-shrink: 0; max-height: 8rem; overflow-y: auto; }
@media (max-width: 64rem) {
  .notification-channels__body { display: block; overflow: auto; }
  .notification-channels__content--help { grid-template-columns: minmax(0, 1fr); }
  .notification-channels__editor { overflow: visible; }
}
@media (max-width: 48rem) { .notification-channels__heading { flex-wrap: wrap; } .notification-channels__summary { flex-basis: calc(100% - 3rem); } }
</style>
