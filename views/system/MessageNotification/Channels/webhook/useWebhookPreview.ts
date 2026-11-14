import { computed, type Ref } from 'vue'
import type { ChannelDraftEntry } from '../useChannelWorkspace'
import { webhookRequestPreview } from './requestPreview'

export interface WebhookPreviewModel {
  content: string
}

/** 示例始终可见；已有配置以保存值为准，新配置使用当前输入或地址占位。 */
export function useWebhookPreview(entry: Ref<ChannelDraftEntry | undefined>, t: Parameters<typeof webhookRequestPreview>[1]) {
  return computed<WebhookPreviewModel>(() => ({
    content: webhookRequestPreview(entry.value?.baseline?.configuration || entry.value?.draft.configuration || {}, t),
  }))
}
