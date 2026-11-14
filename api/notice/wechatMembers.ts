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

function segment(id: string): string {
  if (!id.trim()) throw new NotificationRequestError('error')
  return encodeURIComponent(id)
}

/** These endpoints retain the platform request context and server-side asset authorization. */
export const wechatMemberApi = {
  async departments(configId: string): Promise<WechatDepartment[]> {
    return checked(request.get(`/notifier/wechat/corp/${segment(configId)}/departments/tree`))
  },
  async members(configId: string): Promise<WechatMember[]> {
    return checked(request.get(`/notifier/wechat/corp/${segment(configId)}/users`))
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
export type WechatMemberApi = typeof wechatMemberApi

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
