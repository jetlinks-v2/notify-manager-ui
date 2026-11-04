<template>
  <JPageContainer :pageHeaderRender="false">
    <div class="notice-template-page">
<!--      <PageHeader-->
<!--        :title="$t('NoticeCenter.template.pageTitle')"-->
<!--        :description="$t('NoticeCenter.template.pageDescription')"-->
<!--      />-->
      <full-page transparentBackground>
        
	        <EqualHeightColumns
		        left-width="20rem"
		        right-width="1fr"
	        >
		        <template #left>
			        <TemplateTree
				        :tree-data="treeData"
				        :expanded-keys="expandedKeys"
				        :selected-keys="selectedKeys"
				        :switching-keys="switchingKeys"
				        :loading="loading"
				        @select="selectTreeNode"
				        @toggle-state="toggleAlarmState"
				        @update:expanded-keys="expandedKeys = $event"
			        />
		        </template>
		        <template #right>
			        <TemplateDetail
				        :alarm="selectedAlarm"
				        :channel="selectedChannel"
				        :template="templateDetail"
				        :breadcrumb="breadcrumb"
				        :template-code="templateCode"
				        :covered-alarm-names="coveredAlarmNames"
				        :used-variables="usedVariables"
				        :available-stats="availableStats"
				        :referenced-policies="referencedPolicies"
				        :loading="detailLoading"
				        :editable="detailReady"
				        :saving="saving"
				        :testing="testing"
				        :variables="channelVariables"
				        :saved-version="savedVersion"
				        @save="handleSave"
				        @test="sendTest"
			        />
		        </template>
	        </EqualHeightColumns>
        
      </full-page>
    </div>
  </JPageContainer>
</template>

<script setup lang="ts" name="NoticeCenterTemplate">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import TemplateDetail from './components/TemplateDetail.vue'
import TemplateTree from './components/TemplateTree.vue'
import { useNoticeTemplateCenter } from './hooks/useNoticeTemplateCenter'
import { notifyVisualAlarmTemplateSaved, parseVisualAlarmTemplateContext } from './hooks/visualAlarmTemplateBridge'
import type { NoticeTemplateEditorPayload } from './hooks/useNoticeTemplateCenter'
import PageHeader from '@jetlinks-web-core/components/PageHeader'

const route = useRoute()
const requestedType = typeof route.query.aiAlarmType === 'string' ? route.query.aiAlarmType : ''
const initialProviderCode = requestedType === 'aiSecurityAlarm' || requestedType === 'aiComplianceAlarm' ? requestedType : undefined
const visualAlarmContext = parseVisualAlarmTemplateContext(route.query)
const notifyVisualAlarmSaved = (providerCode: string) => notifyVisualAlarmTemplateSaved(visualAlarmContext, providerCode)

const savedVersion = ref(0)
const {
  loading,
  detailLoading,
  detailReady,
  saving,
  testing,
  switchingKeys,
  treeData,
  expandedKeys,
  selectedKeys,
  selectedAlarm,
  selectedChannel,
  templateDetail,
  channelVariables,
  breadcrumb,
  templateCode,
  coveredAlarmNames,
  usedVariables,
  availableStats,
  referencedPolicies,
  reload,
  selectTreeNode,
  saveTemplate,
  sendTest,
  toggleAlarmState,
} = useNoticeTemplateCenter({ initialProviderCode, onTemplateSaved: notifyVisualAlarmSaved })

const handleSave = async (payload: NoticeTemplateEditorPayload) => {
  await saveTemplate(payload)
  savedVersion.value += 1
}

onMounted(() => {
  reload()
})
</script>

<style scoped lang="less">
.notice-template-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--ink-1);
}

.notice-template-page__workspace {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.notice-template-page__workspace :deep(.equal-height-columns__pane) {
  display: grid;
  min-width: 0;
  min-height: 0;
}

@media (max-width: 64rem) {
  .notice-template-page__workspace {
    grid-template-columns: 1fr;
    height: auto;
  }

  .notice-template-page__workspace :deep(.equal-height-columns__pane) {
    min-height: auto;
  }
}
</style>
