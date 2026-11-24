import { queryDingTalkCorpUsers_api, queryWechatCorpTags_api, type NoticeCorpTag } from '../notice-center'
import { request } from '@jetlinks-web/core'
import { checked } from './messageNotification'
import { normalizeNotificationPage, NotificationRequestError } from './messageNotificationState'
import type { NotificationPage } from './messageNotificationTypes'

export interface WechatMember {
  id: string
  name?: string
  department?: string[]
  mobile?: string
  email?: string
  bizMail?: string
}
export interface WechatDepartment { id: string; name?: string; children?: WechatDepartment[] }
export interface MemberPlatformUser { id: string; name?: string; username?: string; telephone?: string; email?: string }
export interface WechatMemberBinding { id: string; userId: string; thirdPartyUserId: string; providerName?: string }
export type WechatBindingChange = Omit<WechatMemberBinding, 'id'> & { id?: string }
interface WechatDirectoryOptions { hiddenError?: boolean; refresh?: boolean }

function segment(id: string): string {
  if (!id.trim()) throw new NotificationRequestError('error')
  return encodeURIComponent(id)
}

/** These endpoints retain the platform request context and server-side asset authorization. */
export const wechatMemberApi = {
  async departments(configId: string, options?: WechatDirectoryOptions): Promise<WechatDepartment[]> {
    return checked(request.get(`/notifier/wechat/corp/${segment(configId)}/departments/tree`, undefined, { hiddenError: options?.hiddenError }))
  },
  async members(configId: string, options?: WechatDirectoryOptions): Promise<WechatMember[]> {
    return checked(request.get(`/notifier/wechat/corp/${segment(configId)}/users`, undefined, { hiddenError: options?.hiddenError }))
  },
  async users(pageIndex: number, pageSize: number): Promise<NotificationPage<MemberPlatformUser>> {
    return normalizeNotificationPage(await checked<NotificationPage<MemberPlatformUser>>(request.post('/user/detail/_query', {
      pageIndex, pageSize, paging: true, sorts: [{ name: 'id', order: 'asc' }],
    })))
  },
  async bindings(configId: string): Promise<WechatMemberBinding[]> {
    return checked(request.get(`/user/third-party/weixin_corpMessage/${segment(configId)}`))
  },
  bind(configId: string, changes: WechatBindingChange[]): Promise<unknown> {
    return checked(request.post(`/user/third-party/weixin_corpMessage/${segment(configId)}/_bind`, changes))
  },
  unbind(bindingId: string): Promise<unknown> {
    return checked(request.post(`/user/third-party/${segment(bindingId)}/_unbind`))
  },
}
// Both providers use the same configurable third-party user binding API.
export const dingTalkMemberApi: typeof wechatMemberApi = {
  ...wechatMemberApi,
  departments: configId => checked(request.get(`/notifier/dingtalk/corp/${segment(configId)}/departments/tree`, undefined, { hiddenError: true })),
  members: configId => checked(queryDingTalkCorpUsers_api(configId)),
  bindings: configId => checked(request.get(`/user/third-party/dingTalk_dingTalkMessage/${segment(configId)}`)),
  bind: (configId, changes) => checked(request.post(`/user/third-party/dingTalk_dingTalkMessage/${segment(configId)}/_bind`, changes)),
}

export type WechatMemberApi = typeof wechatMemberApi

const wechatDirectoryCacheMs = 30_000
interface DirectoryResponse<T> { result: Promise<T[]>; expiresAt?: number }

function cacheDirectoryRead<T>(query: (configId: string, options?: WechatDirectoryOptions) => Promise<T[]>) {
  const responses = new Map<string, DirectoryResponse<T>>()

  function read(configId: string, options?: WechatDirectoryOptions): Promise<T[]> {
    const now = Date.now()
    const cached = responses.get(configId)
    if (cached && (cached.expiresAt === undefined || (!options?.refresh && cached.expiresAt > now))) return cached.result

    for (const [id, response] of responses) {
      if (response.expiresAt !== undefined && response.expiresAt <= now) responses.delete(id)
    }
    const response: DirectoryResponse<T> = {
      result: Promise.resolve().then(() => query(configId, options)).then(value => {
        if (!Array.isArray(value)) throw new NotificationRequestError('error')
        response.expiresAt = Date.now() + wechatDirectoryCacheMs
        return value
      }).catch(error => {
        if (responses.get(configId) === response) responses.delete(configId)
        throw error
      }),
    }
    responses.set(configId, response)
    return response.result
  }

  function clear(configId?: string) {
    if (configId === undefined) responses.clear()
    else responses.delete(configId)
  }

  return { read, clear }
}

/** One channel page shares directory reads. A refresh bypasses completed results and joins an active request. */
export function createWechatDirectoryCache() {
  const departments = cacheDirectoryRead(wechatMemberApi.departments)
  const members = cacheDirectoryRead(wechatMemberApi.members)
  const tags = cacheDirectoryRead(configId => checked<NoticeCorpTag[]>(queryWechatCorpTags_api(configId)))

  return {
    ...wechatMemberApi,
    departments: departments.read,
    members: members.read,
    tags: tags.read,
    clear(configId?: string) {
      departments.clear(configId)
      members.clear(configId)
      tags.clear(configId)
    },
  }
}

export type WechatDirectoryCache = ReturnType<typeof createWechatDirectoryCache>

/** No fixed first-page limit: abort stale loads and reject incomplete/repeating pages. */
export async function loadMemberPlatformUsers(api: Pick<WechatMemberApi, 'users'>, active: () => boolean): Promise<MemberPlatformUser[]> {
  const users = new Map<string, MemberPlatformUser>()
  const pageSize = 100
  for (let pageIndex = 0; active(); pageIndex++) {
    const page = await api.users(pageIndex, pageSize)
    if (!active()) return []
    const before = users.size
    for (const user of page.data) users.set(user.id, user)
    if (page.total !== undefined && users.size >= page.total) return [...users.values()]
    if (!page.data.length || users.size === before) {
      if (page.total !== undefined && users.size < page.total) throw new NotificationRequestError('error')
      if (page.data.length) throw new NotificationRequestError('error')
      return [...users.values()]
    }
    if (page.total === undefined && page.data.length < (page.pageSize ?? pageSize)) return [...users.values()]
  }
  return []
}
