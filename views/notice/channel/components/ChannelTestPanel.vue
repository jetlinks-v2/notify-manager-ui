<template>
  <section class="channel-test">
    <div class="channel-test__title">
      <span>3</span>
      {{ $t('NoticeCenter.channel.test.title') }}
      <em>{{ $t('NoticeCenter.channel.test.sub') }}</em>
    </div>
    <div class="channel-test__panel">
      <div class="channel-test__head">
        <span><AIcon type="CheckCircleOutlined" /></span>
        <b>{{ $t('NoticeCenter.channel.test.messageTitle') }}</b>
        <a-button
          size="small"
          :disabled="Boolean(disabledReason)"
          :loading="testing"
          @click="testVariables.length ? testParamsOpen = true : emit('test')"
        >
          <AIcon type="SendOutlined" />
          {{ tested ? $t('NoticeCenter.channel.action.retest') : $t('NoticeCenter.channel.action.test') }}
        </a-button>
      </div>
      <dl>
        <div>
          <dt>{{ $t('NoticeCenter.channel.test.target') }}</dt>
          <dd>{{ $t(`NoticeCenter.channel.test.target.${channel?.type || 'default'}`) }}</dd>
        </div>
        <div>
          <dt>{{ $t('NoticeCenter.channel.test.template') }}</dt>
          <dd>{{ $t('NoticeCenter.channel.test.templateName') }}</dd>
        </div>
        <div>
          <dt>{{ $t('NoticeCenter.channel.test.preview') }}</dt>
          <dd class="is-preview">{{ preview }}</dd>
        </div>
      </dl>
      <div v-if="tested" class="channel-test__result">
        <AIcon type="CheckOutlined" />
        <p>
          <b>{{ $t('NoticeCenter.channel.test.successTitle') }}</b>
          {{ $t('NoticeCenter.channel.test.successDescription') }}
        </p>
      </div>
    </div>
    <TemplateTestParamsModal
      v-model:open="testParamsOpen"
      :testing="testing"
      :variables="testVariables"
      @send="params => emit('test', params)"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateTestParamsModal from '../../template/components/TemplateTestParamsModal.vue'
import type { NoticeChannelItem } from '../hooks/noticeChannelModel'

const props = defineProps<{
  channel?: NoticeChannelItem
  testing: boolean
  tested: boolean
}>()

const emit = defineEmits<{
  (e: 'test', params?: Record<string, unknown>): void
}>()

const { t: $t } = useI18n()
const testParamsOpen = ref(false)

const disabledReason = computed(() => {
  return !props.channel || props.channel.status === 'builtin' || !props.channel.config?.id
})

const testVariables = computed(() => props.channel?.template?.variableDefinitions || [])

const preview = computed(() =>
  $t(`NoticeCenter.channel.test.preview.${props.channel?.type || 'default'}`),
)

watch(
  () => props.testing,
  (testing, previousTesting) => {
    if (previousTesting && !testing) {
      testParamsOpen.value = false
    }
  },
)
</script>

<style scoped lang="less">
.channel-test {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.channel-test__title {
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

  em {
    margin-left: auto;
    color: var(--jet-theme-text-disabled);
    font-size: var(--fs-12);
    font-style: normal;
    font-weight: 400;
  }
}

.channel-test__panel {
  overflow: hidden;
  border: 0.0625rem solid var(--jet-theme-border);
  border-radius: var(--jet-theme-radius);
}

.channel-test__head {
  min-height: 3rem;
  padding: 0 var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--jet-theme-bg);
  border-bottom: 0.0625rem solid var(--jet-theme-border);

  span {
    color: var(--jet-theme-primary);
  }

  b {
    flex: 1;
    color: var(--jet-theme-text);
    font-size: var(--fs-13);
  }
}

.channel-test__panel dl {
  margin: 0;
  padding: var(--space-3);
}

.channel-test__panel dl div {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 0.0625rem dashed var(--jet-theme-border);

  &:last-child {
    border-bottom: 0;
  }
}

.channel-test__panel dt {
  color: var(--jet-theme-text-disabled);
  font-size: var(--fs-12);
}

.channel-test__panel dd {
  margin: 0;
  color: var(--jet-theme-text);
  font-size: var(--fs-13);
}

.channel-test__panel .is-preview {
  border-radius: var(--jet-theme-radius);
  background: var(--jet-theme-bg);
  color: var(--jet-theme-text-secondary);
}

.channel-test__result {
  margin: 0 var(--space-3) var(--space-3);
  padding: var(--space-3);
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  border-radius: var(--jet-theme-radius);
  background: var(--ok-bg, #f6ffed);
  color: var(--jet-theme-success);

  p {
    margin: 0;
    color: var(--jet-theme-success);
    font-size: var(--fs-13);
    line-height: 1.6;
  }

  b {
    margin-right: var(--space-1);
  }
}
</style>
