import { readonly, shallowRef } from 'vue'

export interface NotificationConfigurationChange {
  id: string
  channel: string
  action: 'saved' | 'deleted'
  revision: number
}

const latestChange = shallowRef<NotificationConfigurationChange | null>(null)
export const notificationConfigurationChange = readonly(latestChange)

/** In-memory invalidation only: subscribers refresh choices; no secret or draft enters this event. */
export function publishNotificationConfigurationChange(change: Omit<NotificationConfigurationChange, 'revision'>): void {
  latestChange.value = {
    id: change.id,
    channel: change.channel,
    action: change.action,
    revision: (latestChange.value?.revision ?? 0) + 1,
  }
}
