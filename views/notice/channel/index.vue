<template>
  <JPageContainer :pageHeaderRender="false">
<!--      <PageHeader-->
<!--          :title="$t('NoticeCenter.channel.pageTitle')"-->
<!--      />-->
      <full-page hasPadding>

					
						<EqualHeightColumns
							left-width="20rem"
							right-width="1fr"
						>
							<template #left>
								<ChannelList
									:items="channelList"
									:selected-id="selectedProviderId"
									:loading="loading"
									@select="selectProvider"
								/>
							</template>
							
							<template #right>
								<div class="notice-channel-page">
									<a-spin :spinning="detailLoading">
										<CloudEmpty
											v-if="!selectedChannel"
											type="page"
											:description="$t('NoticeCenter.channel.empty.noSelection')"
										/>
										<template v-else>
											<ChannelDetailHeader
												:channel="selectedChannel"
												:saving="saving"
												:testing="testing"
												:can-save="canSave"
												@save="handleSave"
												@test="sendTest"
											/>
											<main class="notice-channel-page__body">
                        <a-select
                          :value="selectedConfigId"
                          :placeholder="$t('NoticeCenter.channel.config.select')"
                          style="width: 100%; margin-bottom: var(--space-4)"
                          :disabled="loading"
                          @change="handleConfigChange"
                        >
                          <a-select-option v-for="config in currentConfigs" :key="config.id" :value="config.id">
                            {{ config.name || config.id }}
                          </a-select-option>
                          <a-select-option value="">{{ $t('NoticeCenter.channel.config.create') }}</a-select-option>
                        </a-select>
												<ChannelCredentialForm
													ref="credentialFormRef"
													:channel="selectedChannel"
													:draft="draft"
													:metadata="selectedChannel.metadata"
													:inside-mail="selectedChannel.status === 'builtin'"
												/>
												<!--                                  <ChannelTestPanel-->
												<!--                                      v-if="selectedChannel.status !== 'builtin'"-->
												<!--                                      :channel="selectedChannel"-->
												<!--                                      :testing="testing"-->
												<!--                                      :tested="tested"-->
												<!--                                      @test="sendTest"-->
												<!--                                  />-->
											</main>
										</template>
									</a-spin>
								</div>
							</template>
						</EqualHeightColumns>
					
      </full-page>
  </JPageContainer>
</template>

<script setup lang="ts" name="NoticeCenterChannel">
import { onMounted, ref } from 'vue'
import PageHeader from '@jetlinks-web-core/components/PageHeader'
import ChannelDetailHeader from './components/ChannelDetailHeader.vue'
import ChannelCredentialForm from './components/ChannelCredentialForm.vue'
import ChannelList from './components/ChannelList.vue'
// import ChannelTestPanel from './components/ChannelTestPanel.vue'
import { useNoticeChannelCenter } from './hooks/useNoticeChannelCenter'

const {
  loading,
  detailLoading,
  saving,
  testing,
  tested,
  channelList,
  selectedProviderId,
  selectedChannel,
  currentConfigs,
  selectedConfigId,
  selectConfig,
  canSave,
  draft,
  reload,
  selectProvider,
  saveCredential,
  sendTest,
} = useNoticeChannelCenter()

const credentialFormRef = ref()

const handleConfigChange = async (value: unknown) => {
  if (typeof value === 'string') await selectConfig(value)
}

const handleSave = async () => {
  await credentialFormRef.value?.validate?.()
  await saveCredential()
}

onMounted(reload)
</script>

<style scoped lang="less">
.notice-channel-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
    border-radius: var(--r-3);
    box-shadow: var(--shadow-1);
    overflow: hidden;
}

.notice-channel-page__banner {
  margin-bottom: var(--space-4);
}

.notice-channel-page__workspace {
  flex: 1;
  min-height: 0;
}

.notice-channel-page__workspace :deep(.equal-height-columns__pane) {
  min-height: 0;
}

.notice-channel-page__detail {
  min-width: 0;
  min-height: 0;
}

.notice-channel-page__body {
  padding-top: var(--space-4);
}

@media (max-width: 64rem) {
  .notice-channel-page__workspace {
    grid-template-columns: 1fr;
    height: auto;
  }

  .notice-channel-page__workspace :deep(.equal-height-columns__pane) {
    min-height: auto;
  }
}
</style>
