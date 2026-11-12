<template>
  <FullPage class="notification-page message-templates" transparentBackground :flex="true">
    <EqualHeightColumns class="notification-page__layout" :show-left="!compact" left-width="15rem" right-width="1fr">
      <template #left>
        <aside class="notification-page__sidebar message-templates__directory" :aria-label="t('messageNotification.templates.title')">
          <TemplateDirectory :templates="templates" :business-types="businessTypes" :directory-state="directoryState" :state="listState" :selected-id="activeKey" :selected-business="selectedBusinessId" :disabled="busy" @select="selectTemplate" @business="selectBusiness" @reload="reload" />
        </aside>
      </template>
      <template #right>
        <section class="notification-page__workspace message-templates__workspace">
          <DetailHeader class="message-templates__header" :title="title">
            <template v-if="draft?.description" #description>
              <p class="message-templates__description" :title="draft.description">{{ draft.description }}</p>
            </template>
            <template #titleExtra>
              <a-tag v-if="dirty">{{ t('messageNotification.templates.unsaved') }}</a-tag>
            </template>
            <template #actions>
              <a-button v-if="draft && !editing && detailState === 'ready'" type="primary" :disabled="!canSave || busy" :aria-label="t('messageNotification.templates.edit')" @click="startEditing">
                {{ t('messageNotification.templates.edit') }}
              </a-button>
              <a-button v-else-if="!draft && !businessLinkPending" type="primary" :disabled="!canAdd || !canQuery || busy" @click="createTemplate">
                {{ t('messageNotification.templates.create') }}
              </a-button>
              <a-dropdown :trigger="['click']" placement="bottomRight">
                <a-button type="text" :aria-label="t('messageNotification.templates.more')"><AIcon type="EllipsisOutlined" /></a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item key="create" :disabled="!canAdd || !canQuery || busy" @click="createTemplate">
                      <AIcon type="PlusOutlined" /> {{ t('messageNotification.templates.create') }}
                    </a-menu-item>
                    <a-menu-item key="reload" :disabled="!canQuery || busy" @click="reload">
                      <AIcon type="ReloadOutlined" /> {{ t('messageNotification.templates.reload') }}
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </template>
          </DetailHeader>
          <div class="message-templates__channels">
            <SwitchGroup :model-value="channelId" :options="channelOptions" :disabled="busy" :aria-label="t('messageNotification.templates.channelFilter')" @change="changeChannel" />
          </div>
          <div v-if="compact || !canManage" class="message-templates__mobile-picker">
            <a-select v-if="canManage" :value="selectedBusinessId || undefined" :options="businessOptions" :disabled="busy" :placeholder="t('messageNotification.templates.selectBusiness')" show-search option-filter-prop="label" @change="selectBusiness" />
            <a-select v-if="!businessLinkPending || !canManage"
              :value="selectedTemplateId" :options="templateOptions" :loading="listState === 'loading'" :disabled="busy || !canQuery"
              :placeholder="t('messageNotification.templates.selectTemplate')" :aria-label="t('messageNotification.templates.templatePicker')"
              show-search option-filter-prop="label" @change="selectTemplate"
            />
            <a-alert v-if="listFailure" type="warning" show-icon :message="t(`messageNotification.templates.${listState}`)">
              <template #action><a-button size="small" @click="reload">{{ t('messageNotification.templates.reload') }}</a-button></template>
            </a-alert>
          </div>
          <a-alert v-if="canQuery && !canManage" type="info" show-icon :message="t('messageNotification.templates.businessForbidden')" />
          <a-space v-if="selectedBusiness" wrap>
            <a-tag>{{ t(businessEnabled ? 'messageNotification.templates.businessEnabled' : 'messageNotification.templates.businessDisabled') }}</a-tag>
            <a-button :disabled="!canManage || busy" :loading="changingBusiness" @click="toggleBusiness">{{ t(businessEnabled ? 'messageNotification.templates.disableBusiness' : 'messageNotification.templates.enableBusiness') }}</a-button>
            <span v-if="!selectedBusiness.id && !selectedBusiness.providerId">{{ t('messageNotification.templates.enableFirst') }}</span>
          </a-space>
          <a-alert v-if="['error', 'forbidden', 'unavailable'].includes(businessActionState)" type="error" show-icon :message="t(`messageNotification.templates.${businessActionState}`)" />
          <a-alert v-if="configState === 'empty' && selectedBusiness" type="warning" show-icon :message="t('messageNotification.templates.noConfig')">
            <template #action><a-button v-if="canConfigure" size="small" :disabled="busy" @click="openConfiguration">{{ t('messageNotification.templates.configureChannel') }}</a-button></template>
          </a-alert>
          <a-spin wrapper-class-name="notification-page__body message-templates__detail" :spinning="detailState === 'loading' || listState === 'loading' || businessLinkPending && businessLinkState === 'loading'">
            <a-alert v-if="businessLinkPending && !['idle', 'loading', 'ready', 'empty'].includes(businessLinkState)" type="warning" show-icon :message="t(businessLinkState === 'unavailable' ? 'messageNotification.templates.selectExactBusiness' : `messageNotification.templates.${businessLinkState}`)">
              <template #action><a-button size="small" :disabled="busy" @click="reload">{{ t('messageNotification.templates.reload') }}</a-button></template>
            </a-alert>
            <a-alert v-if="saved" type="success" show-icon :message="t('messageNotification.templates.saved')" />
            <a-alert v-if="detailFailure" type="warning" show-icon :message="t(`messageNotification.templates.${detailState}`)">
              <template #action><a-button size="small" :disabled="busy" @click="reload">{{ t('messageNotification.templates.reload') }}</a-button></template>
            </a-alert>
            <template v-else-if="draft && detailState === 'ready'">
              <a-space v-if="selectedBusiness" wrap>
                <span>{{ t('messageNotification.templates.channelEnabled') }}</span>
                <a-switch v-model:checked="channelEnabled" :disabled="!editing || !canSave || busy" />
                <a-select v-if="editing" :value="undefined" :options="templateOptions" :disabled="!canSave || busy" :placeholder="t('messageNotification.templates.importTemplate')" show-search option-filter-prop="label" class="message-templates__source" @change="importTemplate" />
              </a-space>
              <div :key="activeKey" class="message-templates__content" :class="{ 'message-templates__content--editing': editing }">
                <TemplateEditor v-if="editing" :draft="draft" :existing="entry?.existing" :managed="!!selectedBusiness" :configs="configs" :config-state="configState" :disabled="!canSave || saving" @uploading="setUploading" />
                <TemplatePreview :draft="draft" :editing="editing" />
              </div>
              <a-alert v-if="validationMessage" type="error" show-icon :message="validationMessage" />
              <a-alert v-else-if="saveFailure" type="error" show-icon :message="t(`messageNotification.templates.${saveState}`)" />
            </template>
            <CloudEmpty v-else-if="listState !== 'loading' && detailState !== 'loading'" class="notification-page__feedback" :description="t(businessLinkPending && businessLinkState === 'empty' ? 'messageNotification.templates.noAlarm' : listState === 'empty' ? 'messageNotification.templates.empty' : 'messageNotification.templates.selectTemplate')" />
          </a-spin>
          <StickyActionBar v-if="editing && draft && detailState === 'ready'" position="inline" class="notification-page__footer" :hint="dirty ? t('messageNotification.templates.unsaved') : ''">
            <a-button :disabled="busy" @click="requestDiscard">{{ t('messageNotification.templates.cancelEdit') }}</a-button>
            <a-button type="primary" :loading="saving" :disabled="!canSave || uploading || !dirty" @click="save">{{ t('messageNotification.templates.save') }}</a-button>
          </StickyActionBar>
        </section>
      </template>
    </EqualHeightColumns>
    <JlConfirmDialog :open="confirmation.open" :title="t('messageNotification.templates.unsavedTitle')" :message="t('messageNotification.templates.leaveMessage')" :confirm-text="t('messageNotification.templates.leave')" :cancel-text="t('messageNotification.templates.keepEditing')" @confirm="resolveConfirmation(true)" @cancel="resolveConfirmation(false)" />
  </FullPage>
</template>

<script setup lang="ts">
import { useTemplatePage } from './hooks/useTemplatePage'
import TemplateDirectory from './components/TemplateDirectory.vue'
import TemplateEditor from './components/TemplateEditor.vue'
import TemplatePreview from './components/TemplatePreview.vue'

const {
  canManage, selectedBusiness, selectedBusinessId, businessEnabled, businessOptions, selectBusiness, toggleBusiness, changingBusiness, businessActionState,
  channelEnabled, importTemplate, openConfiguration, canConfigure,
  t, compact, workspace, channelId, templates, configs, listState, configState, businessTypes, directoryState, businessLinkPending, businessLinkState,
  detailState, activeKey, draft, entry, dirty, saving, canSave, canQuery, editing, title,
  canAdd, busy, uploading, validationMessage, saved, channelOptions, templateOptions,
  selectedTemplateId, listFailure, detailFailure, saveFailure, saveState, confirmation,
  setUploading, reload, changeChannel, selectTemplate, createTemplate, save,
  startEditing, requestDiscard, resolveConfirmation,
} = useTemplatePage()
</script>

<style scoped src="../shared/layout.css"></style>
<style scoped>
.message-templates__source { min-width: 16rem; }
.message-templates__directory > .template-directory { flex: 1; min-height: 0; }
.message-templates .message-templates__header { flex-direction: row; flex-wrap: wrap; padding: 0; margin: 0; border: 0; border-radius: 0; background: transparent; }
.message-templates__header :deep(.cloud-detail-header__actions) { width: auto; }
.message-templates__description { margin: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.message-templates__channels { flex-shrink: 0; overflow-x: auto; min-width: 0; max-width: 100%; padding-bottom: var(--space-1); }
.message-templates__detail :deep(.ant-spin-container) { display: flex; flex-direction: column; gap: var(--space-4); min-height: 100%; }
.message-templates__detail :deep(.ant-spin-container > *) { flex-shrink: 0; }
.message-templates__mobile-picker { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.message-templates__mobile-picker :deep(.ant-select) { width: 100%; }
.message-templates__content { min-width: 0; }
.message-templates__content--editing { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); align-items: start; gap: var(--space-6); padding-right: var(--space-2); }
@media (max-width: 67.5rem) { .message-templates__content--editing { grid-template-columns: minmax(0, 1fr); } }
</style>
