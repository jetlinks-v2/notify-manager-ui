<template>
  <FullPage class="notification-page message-templates" transparentBackground :flex="true">
    <EqualHeightColumns class="notification-page__layout" :show-left="!compact" left-width="15rem" right-width="1fr">
      <template #left>
        <aside class="notification-page__sidebar message-templates__directory" :aria-label="t('messageNotification.templates.title')">
          <TemplateDirectory :templates="templates" :business-types="businessTypes" :config-id="directoryConfigId"
            :directory-state="directoryState" :state="directoryState" :selected-id="selectedDirectoryKey" :disabled="busy" @select="selectTemplate" @reload="reload" />
        </aside>
      </template>
      <template #right>
        <section class="notification-page__workspace message-templates__workspace">
          <DetailHeader class="message-templates__header" :title="title">
            <template v-if="description" #description>
              <p class="message-templates__description" :title="description">{{ description }}</p>
            </template>
            <template #titleExtra>
              <a-tag v-if="templateStatus" :color="templateStatus === 'unsaved' ? 'processing' : isDefault ? 'warning' : undefined">
                {{ t(`messageNotification.templates.${templateStatus}`) }}
              </a-tag>
              <a-tag v-if="business" class="message-templates__business-state" :color="businessEnabled ? 'success' : undefined"
                :title="t(businessEnabled ? 'messageNotification.templates.businessEnabled' : 'messageNotification.templates.businessDisabled')">
                {{ t(businessEnabled ? 'messageNotification.templates.businessStateEnabled' : 'messageNotification.templates.businessStateDisabled') }}
              </a-tag>
            </template>
            <template #actions>
              <template v-if="business">
                <a-button :disabled="!canRestoreDefault || !canEdit || busy" :aria-label="t('messageNotification.templates.restoreDefault')" @click="restoreDefault">
                  <AIcon type="UndoOutlined" aria-hidden="true" /> {{ t('messageNotification.templates.restoreDefault') }}
                </a-button>
                <a-button v-if="canFillInsideMail" :disabled="busy" :loading="fillingInsideMail" :aria-label="t('messageNotification.templates.fillInsideMail')" @click="fillInsideMail">
                  <AIcon type="InboxOutlined" aria-hidden="true" /> {{ t('messageNotification.templates.fillInsideMail') }}
                </a-button>
                <a-button :disabled="!canManage || busy" :aria-label="t(businessEnabled ? 'messageNotification.templates.disableBusiness' : 'messageNotification.templates.enableBusiness')" @click="toggleBusiness">
                  <AIcon :type="businessEnabled ? 'StopOutlined' : 'CheckCircleOutlined'" aria-hidden="true" />
                  {{ t(businessEnabled ? 'messageNotification.templates.disableBusiness' : 'messageNotification.templates.enableBusiness') }}
                </a-button>
              </template>
              <a-button v-if="draft && !editing && detailState === 'ready'" type="primary" :disabled="!canEdit || busy" @click="startEditing">
                {{ t('messageNotification.templates.edit') }}
              </a-button>
              <a-button v-else-if="!draft && !business && !businessLinkPending" type="primary" :disabled="!canAdd || !canQuery || busy" @click="createTemplate">
                {{ t('messageNotification.templates.create') }}
              </a-button>
              <a-dropdown v-if="!business" :trigger="['click']" placement="bottomRight">
                <a-button type="text" :aria-label="t('messageNotification.templates.more')"><AIcon type="EllipsisOutlined" /></a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item key="create" :disabled="!canAdd || !canQuery || busy" @click="createTemplate">
                      <AIcon type="PlusOutlined" /> {{ t('messageNotification.templates.create') }}
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </template>
          </DetailHeader>
          <div v-if="compact" class="message-templates__mobile-picker">
            <a-select :value="selectedDirectoryKey" :options="templateOptions" :disabled="busy || !canQuery" :loading="directoryState === 'loading'"
              :placeholder="t('messageNotification.templates.selectBusiness')" show-search option-filter-prop="label" @change="selectTemplate" />
          </div>
          <div v-if="!canManage" class="message-templates__mobile-picker">
            <a-select :value="selectedTemplateId" :options="importOptions" :disabled="busy || !canQuery" :loading="listState === 'loading'"
              :placeholder="t('messageNotification.templates.selectTemplate')" show-search option-filter-prop="label" @change="selectTemplate" />
            <a-alert v-if="canQuery" type="info" show-icon :message="t('messageNotification.templates.businessForbidden')" />
          </div>
          <a-alert v-if="['error', 'forbidden', 'unavailable'].includes(businessActionState)" type="error" show-icon :message="t(`messageNotification.templates.${businessActionState}`)" />
          <div class="message-templates__channels">
            <TemplateChannelNavigation :value="channelId" :channels="channels" :configuration-states="channelConfigurationStates"
              :configurations-by-channel="configurationsByChannel" :active-config-id="activeConfigId" :disabled="busy" @change="changeChannel" />
          </div>
          <a-alert v-if="listFailure" type="warning" show-icon :message="t(`messageNotification.templates.${catalogState}`)">
            <template #action><a-button size="small" :disabled="busy" @click="reload">{{ t('messageNotification.templates.reload') }}</a-button></template>
          </a-alert>
          <a-spin :wrapper-class-name="`notification-page__body message-templates__detail${editing ? ' message-templates__detail--editing' : ''}`" :spinning="detailState === 'loading' || catalogState === 'loading' || directoryState === 'loading'">
            <a-alert v-if="detailFailure" type="warning" show-icon :message="t(`messageNotification.templates.${feedbackState}`)">
              <template #action><a-button size="small" :disabled="busy" @click="reload">{{ t('messageNotification.templates.reload') }}</a-button></template>
            </a-alert>
            <template v-else-if="draft && detailState === 'ready'">
              <a-alert v-if="missingConfiguration" type="warning" show-icon :message="t('messageNotification.templates.missingConfiguration')">
                <template #action><a-button type="link" size="small" :disabled="busy || !canConfigure" @click="goConfigure">{{ t('messageNotification.templates.configure') }}</a-button></template>
              </a-alert>
              <div :key="activeKey" class="message-templates__content" :class="{ 'message-templates__content--editing': editing }">
                <TemplateEditor v-if="editing" ref="contentEditor" :draft="draft" :existing="entry?.existing" :business="business" :business-mode="!!business" :configs="configs" :config-state="configState" :metadata="metadata" :metadata-state="metadataState" :available-variables="availableVariables" :disabled="!canEdit || saving" @uploading="setUploading" @configuration="selectConfiguration" />
                <TemplateVariablePanel v-if="editing" :draft="draft" :business="business" :business-title="business && title" :variables="availableVariables" :disabled="busy || !contentEditor?.canInsertVariable" @insert="contentEditor?.insertVariable($event)" />
                <TemplatePreview v-if="hasContent || editing" :draft="draft" :editing="editing" :business="business" :channel="currentChannel" :config="activeConfig" :available-variables="availableVariables" />
                <CloudEmpty v-else class="notification-page__feedback" :description="t('messageNotification.templates.noDefault')" />
              </div>
              <a-alert v-if="saveOutcomeUnknown" type="warning" show-icon :message="t('messageNotification.templates.saveOutcomeUnknown')" />
              <a-alert v-else-if="validationMessage" type="error" show-icon :message="validationMessage" />
              <a-alert v-else-if="saveFailure" type="error" show-icon :message="t(`messageNotification.templates.${saveState}`)" />
            </template>
            <CloudEmpty v-else-if="detailState !== 'loading' && catalogState !== 'loading' && directoryState !== 'loading'" class="notification-page__feedback" :description="t(businessLinkPending && businessLinkState === 'empty' ? 'messageNotification.templates.noAlarm' : catalogState === 'empty' ? 'messageNotification.templates.noChannels' : 'messageNotification.templates.selectBusiness')" />
          </a-spin>
          <StickyActionBar v-if="editing && draft && detailState === 'ready'" position="inline" class="notification-page__footer" :hint="dirty ? t('messageNotification.templates.unsaved') : ''">
            <a-button :disabled="busy" @click="requestDiscard">{{ t('messageNotification.templates.cancelEdit') }}</a-button>
            <a-button type="primary" :loading="saving" :disabled="!canSave || uploading || !dirty && entry?.existing" @click="save">{{ t('messageNotification.templates.save') }}</a-button>
          </StickyActionBar>
        </section>
      </template>
    </EqualHeightColumns>
    <JlConfirmDialog :open="confirmation.open" tone="info" :title="t('messageNotification.templates.unsavedTitle')" :message="t('messageNotification.templates.leaveMessage')" :confirm-text="t('messageNotification.templates.leave')" :cancel-text="t('messageNotification.templates.keepEditing')" @confirm="resolveConfirmation(true)" @cancel="resolveConfirmation(false)" />
  </FullPage>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { useTemplatePage } from './hooks/useTemplatePage'
import TemplateDirectory from './components/TemplateDirectory.vue'
import TemplatePreview from './components/TemplatePreview.vue'
import TemplateVariablePanel from './components/TemplateVariablePanel.vue'
import TemplateChannelNavigation from './components/TemplateChannelNavigation.vue'

const TemplateEditor = defineAsyncComponent(() => import('./components/TemplateEditor.vue'))
const contentEditor = ref<{ insertVariable(id: string): Promise<void>; canInsertVariable: boolean }>()
const {
  canManage, selectedTemplateId, businessEnabled, changingBusiness, businessActionState, toggleBusiness,
  canFillInsideMail, fillingInsideMail, fillInsideMail,
  businessLinkPending, businessLinkState, importOptions,
  t, compact, workspace, channels, channelId, templates, configs, listState, configState, channelConfigurationStates, businessTypes, directoryState,
  detailState, activeKey, draft, entry, business, dirty, saving, canSave, canQuery, editing, title, description,
  canAdd, canEdit, canConfigure, busy, uploading, validationMessage, channelOptions, templateOptions,
  selectedDirectoryKey, directoryConfigId, listFailure, detailFailure, feedbackState, saveFailure, saveState, confirmation,
  isDefault, canRestoreDefault, missingConfiguration, hasContent, catalogState, metadata, metadataState, availableVariables, saveOutcomeUnknown,
  currentChannel, activeConfig, configurationsByChannel, activeConfigId, templateStatus, setUploading, reload, changeChannel, selectConfiguration, selectTemplate, createTemplate, save,
  startEditing, restoreDefault, requestDiscard, goConfigure, resolveConfirmation,
} = useTemplatePage()
</script>

<style scoped src="../shared/layout.css"></style>
<style scoped>
.message-templates__directory > .template-directory { flex: 1; min-height: 0; }
.message-templates .message-templates__header { flex-direction: row; flex-wrap: wrap; padding: 0; margin: 0; border: 0; border-radius: 0; background: transparent; }
.message-templates__header :deep(.cloud-detail-header__actions) { width: auto; }
.message-templates__description { margin: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.message-templates__channels { flex-shrink: 0; overflow-x: auto; min-width: 0; max-width: 100%; padding-bottom: var(--space-1); }
.message-templates__detail :deep(.ant-spin-container) { display: flex; flex-direction: column; gap: var(--space-4); min-height: 100%; }
.message-templates__detail :deep(.ant-spin-container > *) { flex-shrink: 0; }
.message-templates__detail--editing { overflow: hidden; }
.message-templates__detail--editing :deep(.ant-spin-container) { height: 100%; min-height: 0; }
.message-templates__detail--editing .message-templates__content { flex-shrink: 1; }
.message-templates__mobile-picker { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.message-templates__mobile-picker :deep(.ant-select) { width: 100%; }
.message-templates__content { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.message-templates__workspace { container-type: inline-size; }
.message-templates__content--editing { display: grid; grid-template-columns: minmax(15rem, 1.15fr) minmax(10rem, .55fr) minmax(17rem, 1fr); grid-template-rows: minmax(0, 1fr); align-items: stretch; gap: var(--space-4); min-height: 0; }
.message-templates__content--editing > .template-editor { min-height: 0; overflow: auto; }
@container (max-width: 48rem) {
  .message-templates__detail--editing { overflow: auto; }
  .message-templates__detail--editing :deep(.ant-spin-container) { height: auto; min-height: 100%; }
  .message-templates__content--editing { grid-template-columns: minmax(0, 1fr) minmax(10rem, .7fr); grid-template-rows: none; align-items: start; }
  .message-templates__content--editing > .template-variables { max-height: 28rem; }
  .message-templates__content--editing > .template-preview { grid-column: 1 / -1; }
}
@media (max-width: 62rem) {
  .message-templates__detail--editing { overflow: auto; }
  .message-templates__detail--editing :deep(.ant-spin-container) { height: auto; min-height: 100%; }
  .message-templates__content--editing { grid-template-columns: minmax(0, 1fr) minmax(10rem, .7fr); grid-template-rows: none; align-items: start; }
  .message-templates__content--editing > .template-variables { max-height: 28rem; }
  .message-templates__content--editing > .template-preview { grid-column: 1 / -1; }
}
@container (max-width: 34rem) { .message-templates__content--editing { grid-template-columns: minmax(0, 1fr); } .message-templates__content--editing > .template-preview { grid-column: auto; } }
@media (max-width: 40rem) { .message-templates__content--editing { grid-template-columns: minmax(0, 1fr); } .message-templates__content--editing > .template-preview { grid-column: auto; } }
</style>
