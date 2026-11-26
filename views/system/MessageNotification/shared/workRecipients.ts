import { NotificationRequestError } from '../../../../api/notice/messageNotificationState'
import type { NotificationObject, NotifierConfig } from '../../../../api/notice/messageNotificationTypes'

export const workRecipientsKey = 'workNotificationRecipients'
export const workChannelRecipients = {
  'weixin:corpMessage': { user: 'toUser', department: 'toParty', tag: 'toTag' },
  'dingTalk:dingTalkMessage': { user: 'userIdList', department: 'departmentIdList' },
} as const
export type WorkChannelId = keyof typeof workChannelRecipients
export type GroupRecipientKind = 'department' | 'tag'
export interface DirectoryItem { id: string; name?: string; path?: string; parentId?: string }
export interface RecipientPair { platformId: string; externalId: string }
export interface WorkRecipients {
  departments: RecipientPair[]
  tags: RecipientPair[]
  memberIds: string[]
}

export const emptyWorkRecipients = (): WorkRecipients => ({ departments: [], tags: [], memberIds: [] })

export function isWorkChannel(id: string): id is WorkChannelId {
  return Object.hasOwn(workChannelRecipients, id)
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && !/[,|]/.test(value)
}

function pairs(value: unknown): RecipientPair[] {
  if (!Array.isArray(value) || value.some(item => !identifier(item?.platformId) || !identifier(item?.externalId))) {
    throw new NotificationRequestError('error')
  }
  if (new Set(value.map(item => item.platformId)).size !== value.length
    || new Set(value.map(item => item.externalId)).size !== value.length) throw new NotificationRequestError('error')
  return value.map(({ platformId, externalId }) => ({ platformId, externalId }))
}

/** An absent setting is a legacy configuration. A present, empty setting must clear old recipients. */
export function readWorkRecipients(configuration: NotificationObject): WorkRecipients | undefined {
  if (!Object.hasOwn(configuration, workRecipientsKey)) return
  const value = configuration[workRecipientsKey] as Partial<WorkRecipients> | undefined
  if (!value || !Array.isArray(value.memberIds) || !value.memberIds.every(identifier)) throw new NotificationRequestError('error')
  return { departments: pairs(value.departments), tags: pairs(value.tags), memberIds: [...new Set(value.memberIds)] }
}

export function assertWorkConfig(config: NotifierConfig, id: string, channelId: WorkChannelId): void {
  const type = typeof config.type === 'string' ? config.type : config.type?.value
  const provider = typeof config.provider === 'string' ? config.provider : config.provider?.value
  if (config.id !== id || `${type}:${provider}` !== channelId) throw new NotificationRequestError('error')
}

/** Only unambiguous names on both sides can create a binding. Existing bindings reserve both IDs. */
export function uniqueNamePairs(platform: DirectoryItem[], external: DirectoryItem[], existing: RecipientPair[]): RecipientPair[] {
  const byName = (items: DirectoryItem[]) => {
    const index = new Map<string, Set<string>>()
    for (const item of items) {
      const name = item.name?.trim()
      if (!name || !identifier(item.id)) continue
      const ids = index.get(name) ?? new Set<string>()
      ids.add(item.id)
      index.set(name, ids)
    }
    return index
  }
  const platformNames = byName(platform)
  const externalNames = byName(external)
  const boundPlatform = new Set(existing.map(pair => pair.platformId))
  const boundExternal = new Set(existing.map(pair => pair.externalId))
  const matches: RecipientPair[] = []
  for (const [name, platformIds] of platformNames) {
    const externalIds = externalNames.get(name)
    if (platformIds.size !== 1 || externalIds?.size !== 1) continue
    const [platformId] = platformIds
    const [externalId] = externalIds
    if (!boundPlatform.has(platformId) && !boundExternal.has(externalId)) {
      matches.push({ platformId, externalId })
    }
  }
  return matches
}

export function workRecipientsEmpty(value: WorkRecipients, channelId: WorkChannelId): boolean {
  return !value.memberIds.length && !value.departments.length && (channelId !== 'weixin:corpMessage' || !value.tags.length)
}
