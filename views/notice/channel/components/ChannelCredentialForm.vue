<template>
  <div class="channel-credential">
    <section class="channel-credential__section">
      <div class="channel-credential__title">
        <span>1</span>
        {{ $t('NoticeCenter.channel.info.title') }}
        <em>{{ $t('NoticeCenter.channel.info.hint') }}</em>
      </div>
      <div class="channel-credential__fixed">
        <span>{{ $t('NoticeCenter.channel.field.channelName') }}</span>
        <div><AIcon type="LockOutlined" />{{ $t(channel.name) }}</div>
      </div>
    </section>

    <div v-if="insideMail" class="channel-credential__notice">
      <AIcon type="InfoCircleOutlined" />
      <p>
        <b>{{ $t('NoticeCenter.channel.inside.title') }}</b>
        {{ $t('NoticeCenter.channel.inside.description') }}
      </p>
    </div>

    <ChannelRetentionForm v-if="insideMail" />

    <section v-else class="channel-credential__section">
      <div class="channel-credential__title">
        <span>2</span>
        {{ $t('NoticeCenter.channel.credential.title') }}
        <i>*</i>
        <em v-if="normalizedMetadata.length">{{ $t('NoticeCenter.channel.credential.hint') }}</em>
      </div>
      <a-form ref="formRef" :model="draft.configuration" layout="vertical">
        <a-form-item
          v-if="showProviderSelector"
          class="is-wide"
          :label="$t('NoticeCenter.channel.credential.field.providerType')"
        >
          <a-radio-group
            v-model:value="draft.provider"
            option-type="button"
            button-style="solid"
            :options="providerOptions"
            @change="handleProviderChange"
          />
        </a-form-item>
        <div class="channel-credential__grid">
          <template
            v-for="item in visibleMetadata"
            :key="item.id"
          >
            <a-form-item
              v-if="item.group === 'emailServer'"
              class="is-wide"
              :label="$t('NoticeCenter.channel.credential.field.serverAddress')"
              :extra="$t('NoticeCenter.channel.credential.description.serverAddress')"
              :validate-status="emailServerError ? 'error' : undefined"
              :help="emailServerError"
            >
                <div style="display: flex; align-items: center; gap: 16px">
                    <a-auto-complete
                        v-model:value="draft.configuration.host"
                        class="channel-credential__host"
                        :options="emailHostOptions"
                        :placeholder="$t('NoticeCenter.channel.credential.placeholder.host')"
                        @change="clearEmailServerError"
                    />
                    <a-input-number
                        v-model:value="draft.configuration.port"
                        :precision="0"
                        :min="1"
                        :max="65535"
                        @change="clearEmailServerError"
                    />
                    <a-checkbox
                        v-model:checked="draft.configuration.ssl"
                        @change="handleSslChange"
                    >
                        {{ $t('NoticeCenter.channel.credential.field.ssl') }}
                    </a-checkbox>
                </div>
            </a-form-item>
            <a-form-item
              v-else
              :name="item.id"
              :rules="getRules(item)"
              :label="formatMessage(item.name, item.id)"
              :extra="formatMessage(item.description)"
              :class="{ 'is-wide': item.id === 'headers' }"
            >
              <ChannelHeadersEditor
                v-if="item.id === 'headers'"
                ref="headersEditorRef"
                :model-value="getHeaders()"
                @update:model-value="setHeaders"
              />
              <MetadataValueItem
                v-else
                :item="item"
                v-model="draft.configuration[item.id]"
              />
            </a-form-item>
          </template>
        </div>
      </a-form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ChannelHeadersEditor from './ChannelHeadersEditor.vue'
import ChannelRetentionForm from './ChannelRetentionForm.vue'
import { useChannelCredentialForm } from '../hooks/useChannelCredentialForm'
import type { NotifierDraft, NoticeChannelItem, NoticeCredentialProperty } from '../hooks/noticeChannelModel'

const props = defineProps<{
  channel: NoticeChannelItem
  draft: NotifierDraft
  metadata: NoticeCredentialProperty[]
  insideMail: boolean
}>()

const { t: $t } = useI18n()
const {
  formRef,
  headersEditorRef,
  emailServerError,
  emailHostOptions,
  providerOptions,
  showProviderSelector,
  normalizedMetadata,
  visibleMetadata,
  formatMessage,
  getHeaders,
  setHeaders,
  getRules,
  handleProviderChange,
  handleSslChange,
  clearEmailServerError,
  validate,
} = useChannelCredentialForm({
  channel: toRef(props, 'channel'),
  draft: props.draft,
  metadata: toRef(props, 'metadata'),
  t: $t,
})

defineExpose({ validate })
</script>

<style scoped lang="less">
.channel-credential {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.channel-credential__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.channel-credential__notice {
  padding: var(--space-3);
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  border: 0.0625rem solid #e9d5ff;
  border-radius: var(--jet-theme-radius);
  background: #faf5ff;
  color: #7e22ce;

  p {
    margin: 0;
    color: #7e22ce;
    font-size: var(--fs-12);
    line-height: 1.6;
  }

  b {
    margin-right: var(--space-1);
  }
}

.channel-credential__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--jet-theme-text);
  font-size: var(--fs-14);
  font-weight: 600;

  span {
    width: 1.125rem;
    height: 1.125rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--jet-theme-primary);
    color: #fff;
    font-size: var(--fs-12);
  }

  i {
    color: var(--jet-theme-error);
    font-style: normal;
  }

  em {
    margin-left: auto;
    color: var(--jet-theme-text-disabled);
    font-size: var(--fs-12);
    font-style: normal;
    font-weight: 400;
  }
}

.channel-credential__fixed {
  min-height: 2.5rem;
  padding: 0 var(--space-3);
  display: grid;
  grid-template-columns: 8rem minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
  border: 0.0625rem solid var(--jet-theme-border);
  border-radius: var(--jet-theme-button-r);
  background: var(--jet-theme-bg);

  span {
    color: var(--jet-theme-text-disabled);
    font-size: var(--fs-12);
  }
    .anticon {
        padding-right: var(--space-2);
    }
}

.channel-credential__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--space-3);
}

.channel-credential__host {
  width: 11.25rem;
}

@media (max-width: 64rem) {
  .channel-credential__grid {
    grid-template-columns: 1fr;
  }
}
</style>
