import { request } from '@jetlinks-web/core'
import { queryWechatCorpTags_api } from '../notice-center'
import { checked } from './messageNotification'
import { NotificationRequestError } from './messageNotificationState'
import { dingTalkMemberApi, wechatMemberApi } from './wechatMembers'
import type { DirectoryItem, GroupRecipientKind, WorkChannelId } from '../../views/system/MessageNotification/shared/workRecipients'

interface RawDirectoryItem {
  id?: string | number
  name?: string
  children?: RawDirectoryItem[]
}

function flatten(value: unknown, parents: string[] = [], parentId?: string): DirectoryItem[] {
  if (!Array.isArray(value)) throw new NotificationRequestError('error')
  return value.flatMap((row: RawDirectoryItem) => {
    if (!row || !['string', 'number'].includes(typeof row.id) || !String(row.id).trim()) throw new NotificationRequestError('error')
    const id = String(row.id)
    const path = [...parents, row.name || id]
    return [{ id, parentId, name: row.name, path: path.join(' / ') }, ...(row.children ? flatten(row.children, path, id) : [])]
  })
}

export async function loadGroupRecipients(configId: string, channelId: WorkChannelId, kind: GroupRecipientKind) {
  const [platform, external] = await (kind === 'tag' ? Promise.all([
    checked(request.post('/role/_query/no-paging', { paging: false }, { hiddenError: true })),
    checked(queryWechatCorpTags_api(configId)),
  ]) : Promise.all([
    checked(request.post('/organization/_all/tree', { paging: false }, { hiddenError: true })),
    (channelId === 'weixin:corpMessage' ? wechatMemberApi : dingTalkMemberApi).departments(configId),
  ]))
  return { platform: flatten(platform), external: flatten(external) }
}
