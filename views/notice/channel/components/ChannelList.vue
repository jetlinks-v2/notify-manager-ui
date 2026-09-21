<template>
    <aside class="channel-list">
        <header class="channel-list__head">
            <h2>{{ $t('NoticeCenter.channel.list.title') }}</h2>
            <span>{{ items.length }}</span>
        </header>

        <a-spin :spinning="loading">
            <div v-if="items.length" class="channel-list__body">
                <button
                    v-for="item in items"
                    :key="item.id"
                    type="button"
                    class="channel-list__item"
                    :class="{ 'is-active': item.id === selectedId }"
                    @click="$emit('select', item.id)"
                >
              <span class="channel-list__icon" :class="`is-${item.type}`">
                <AIcon :type="item.icon" />
              </span>
                    <span class="channel-list__copy">
                <b>{{ $t(item.name) }}</b>
              </span>
                    <span class="channel-list__dot" :class="`is-${item.status}`" />
                </button>
            </div>
            <CloudEmpty v-else type="page" :description="$t('NoticeCenter.channel.empty.noProvider')" />
        </a-spin>
    </aside>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { NoticeChannelItem } from '../hooks/noticeChannelModel'

defineProps<{
  items: NoticeChannelItem[]
  selectedId: string
  loading: boolean
}>()

defineEmits<{
  (e: 'select', providerId: string): void
}>()

const { t: $t } = useI18n()
</script>

<style scoped lang="less">
.channel-list {
  min-height: 0;
    height: 100%;
    border-radius: var(--r-3);
    box-shadow: var(--shadow-1);
}

.channel-list__head {
  padding-bottom: var(--space-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);

  h2 {
    margin: 0;
    font-size: var(--fs-18);
    font-weight: 600;
    letter-spacing: 0.12em;
  }

  span {
    padding: 0.0625rem var(--space-2);
    border-radius: 0.1875rem;
    background: var(--jet-theme-bg);
    color: var(--jet-theme-text-secondary);
    font-size: var(--fs-12);
    font-weight: 600;
  }
}

.channel-list__item {
  width: 100%;
  margin-bottom: var(--space-1);
  padding: var(--space-2) var(--space-3);
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  border: 0.0625rem solid transparent;
  border-radius: var(--jet-theme-radius);
  background: transparent;
  cursor: pointer;
  text-align: left;

  &:hover,
  &.is-active {
	  background: var(--accent-soft);
	  border-radius: var(--r-2);
  }

    &.is-active {
        color: var(--jet-theme-primary);
    }
}

//.channel-list__item.is-active {
//  color: var(--jet-theme-primary);
//}

.channel-list__icon {
  display: grid;
  place-items: center;
  color: var(--jet-theme-primary);
}

.channel-list__copy {
  min-width: 0;

  b {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  b {
    font-size: var(--fs-14);
    font-weight: 600;
  }

}

.channel-list__dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: var(--jet-theme-success);

  &.is-builtin {
    background: var(--jet-theme-primary);
  }

  &.is-unconfigured {
    background: var(--jet-theme-warning);
  }
}
</style>
