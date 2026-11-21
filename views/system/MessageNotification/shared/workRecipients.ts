import type { NoticeChannelTemplateItem } from '../../../../api/notice-center'
import { NotificationRequestError } from '../../../../api/notice/messageNotificationState'
import type { NotificationObject, NotifierConfig } from '../../../../api/notice/messageNotificationTypes'

export const workRecipientsKey = 'workNotificationRecipients'
export const workChannelRecipients = {
  'weixin:corpMessage': { user: 'toUser', department: 'toParty', tag: 'toTag' },
  'dingTalk:dingTalkMessage': { user: 'userIdList', department: 'departmentIdList' },
} as const
export type WorkChannelId = keyof typeof workChannelRecipients
export type GroupRecipientKind = 'department' | 'tag'
export interface DirectoryItem { id: string; name?: string; path?: string }
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

function joined(ids: string[]): string {
  return [...new Set(ids.filter(identifier))].sort().join(',')
}

/** Replace only the native recipient fields that each provider already reads. */
export function workRecipientContent(channelId: WorkChannelId, content: NotificationObject, recipients: WorkRecipients): NotificationObject {
  const keys = workChannelRecipients[channelId]
  return {
    ...content,
    [keys.user]: joined(recipients.memberIds),
    [keys.department]: joined(recipients.departments.map(pair => pair.externalId)),
    ...('tag' in keys ? { [keys.tag]: joined(recipients.tags.map(pair => pair.externalId)) } : { toAllUser: false }),
  }
}

/** Legacy subscriber expressions override static recipients, so remove only those reserved keys. */
export function applyWorkRecipients(item: NoticeChannelTemplateItem, channelId: WorkChannelId,
  recipients: WorkRecipients): NoticeChannelTemplateItem {
  if (!item.template) return item
  const configuration = item.channel.channelConfiguration
  const keys: string[] = Object.values(workChannelRecipients[channelId])
  if (channelId === 'dingTalk:dingTalkMessage') keys.push('toAllUser')
  const variables = Object.fromEntries(Object.entries(configuration?.variables ?? {}).filter(([key]) => !keys.includes(key)))
  return {
    channel: { ...item.channel, channelConfiguration: { ...configuration, variables } },
    template: { ...item.template, template: workRecipientContent(channelId, item.template.template ?? {}, recipients) },
  }
}

export function workRecipientsEmpty(value: WorkRecipients, channelId: WorkChannelId): boolean {
  return !value.memberIds.length && !value.departments.length && (channelId !== 'weixin:corpMessage' || !value.tags.length)
}
