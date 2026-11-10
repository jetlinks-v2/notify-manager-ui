<template>
  <FullPage class="notification-page message-templates" transparentBackground :flex="true">
    <div class="notification-page__toolbar">
      <div class="message-templates__channels">
        <SwitchGroup :model-value="channelId" :options="channelOptions" :disabled="busy" :aria-label="t('messageNotification.templates.channelFilter')" @change="changeChannel" />
      </div>
      <div class="notification-page__actions">
        <a-button type="primary" :disabled="!canAdd || busy" @click="createTemplate"><AIcon type="PlusOutlined" />{{ t('messageNotification.templates.create') }}</a-button>
        <a-button :disabled="!canQuery || busy" @click="reload"><template #icon><AIcon type="ReloadOutlined" /></template>{{ t('messageNotification.templates.reload') }}</a-button>
      </div>
    </div>
    <EqualHeightColumns class="notification-page__layout" :show-left="!compact" left-width="15rem" right-width="1fr">
      <template #left>
        <aside class="notification-page__sidebar message-templates__directory" :aria-label="t('messageNotification.templates.title')">
          <strong class="notification-page__title">{{ t('messageNotification.templates.title') }}</strong>
          <TemplateDirectory :templates="templates" :state="listState" :selected-id="activeKey" :disabled="busy" @select="selectTemplate" @reload="reload" />
        </aside>
      </template>
      <template #right>
        <section class="notification-page__workspace message-templates__workspace">
          <div v-if="compact" class="message-templates__mobile-picker">
            <a-select
              :value="selectedTemplateId"
              :options="templateOptions" :loading="listState === 'loading'" :disabled="busy || !canQuery"
              :placeholder="t('messageNotification.templates.selectTemplate')"
              :aria-label="t('messageNotification.templates.templatePicker')"
              show-search option-filter-prop="label" @change="selectTemplate"
            />
            <a-alert v-if="listFailure" type="warning" show-icon :message="t(`messageNotification.templates.${listState}`)" />
          </div>
          <a-spin wrapper-class-name="notification-page__body message-templates__detail" :spinning="detailState === 'loading'">
            <a-alert v-if="saved" type="success" show-icon :message="t('messageNotification.templates.saved')" />
            <a-alert v-if="detailFailure" type="warning" show-icon :message="t(`messageNotification.templates.${detailState}`)" />
            <template v-else-if="draft && detailState === 'ready'">
              <div :key="activeKey" class="message-templates__editor-grid">
                <TemplateEditor :draft="draft" :existing="entry?.existing" :configs="configs" :config-state="configState" :disabled="!canSave || saving" @uploading="setUploading" />
                <TemplatePreview :draft="draft" />
              </div>
              <a-alert v-if="validationMessage" type="error" show-icon :message="validationMessage" />
              <a-alert v-else-if="saveFailure" type="error" show-icon :message="t(`messageNotification.templates.${saveState}`)" />
            </template>
            <CloudEmpty v-else class="notification-page__feedback" :description="t('messageNotification.templates.selectTemplate')" />
          </a-spin>
          <StickyActionBar v-if="draft && detailState === 'ready'" position="inline" class="notification-page__footer" :hint="dirty ? t('messageNotification.templates.unsaved') : ''">
            <a-button :disabled="!dirty || busy" @click="requestDiscard">{{ t('messageNotification.templates.discard') }}</a-button>
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
  t, compact, workspace, channelId, templates, configs, listState, configState,
  detailState, saveState, activeKey, draft, entry, dirty, saving, canSave, canQuery,
  canAdd, busy, uploading, validationMessage, saved, channelOptions, templateOptions,
  selectedTemplateId, listFailure, detailFailure, saveFailure, confirmation,
  setUploading, reload, changeChannel, selectTemplate, createTemplate, save,
  requestDiscard, resolveConfirmation,
} = useTemplatePage()
</script>

<style scoped src="../shared/layout.css"></style>
<style scoped>
.message-templates__channels { overflow-x: auto; min-width: 0; max-width: 100%; }
.message-templates__directory > .template-directory { flex: 1; min-height: 0; }
.message-templates__detail :deep(.ant-spin-container) { display: flex; flex-direction: column; gap: var(--space-4); min-height: 100%; }
.message-templates__detail :deep(.ant-spin-container > *) { flex-shrink: 0; }
.message-templates__mobile-picker { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.message-templates__mobile-picker :deep(.ant-select) { width: 100%; }
.message-templates__editor-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); align-items: start; gap: var(--space-6); padding-right: var(--space-2); }
@media (max-width: 67.5rem) { .message-templates__editor-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
