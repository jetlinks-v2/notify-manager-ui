import type { MemberPlatformUser, WechatBindingChange, WechatMember, WechatMemberBinding } from '../../../../../api/notice/wechatMembers'

export type MemberMatchState = 'automatic' | 'conflict' | 'missing' | 'unmatched'
export interface MemberMatch { state: MemberMatchState; userId?: string }

export function memberPhone(value?: string): string {
  const text = value?.replace(/[\s()\-]/g, '') ?? ''
  return /^\+?\d+$/.test(text) ? text : ''
}
export function memberEmail(value?: string): string {
  const text = value?.trim().toLowerCase() ?? ''
  return /^[^\s@*•]+@[^\s@*•]+\.[^\s@*•]+$/.test(text) ? text : ''
}
function contacts(phone?: string, ...emails: (string | undefined)[]): string[] {
  return [...new Set([memberPhone(phone) && `p:${memberPhone(phone)}`, ...emails.map(email => memberEmail(email) && `e:${memberEmail(email)}`)].filter(Boolean))]
}
function addIndex(index: Map<string, Set<string>>, key: string, id: string) {
  if (!index.has(key)) index.set(key, new Set())
  index.get(key)!.add(id)
}

/** Match only unique, consistent contacts; preserve existing bindings and never guess by name/ID. */
export function matchWechatMembers(members: WechatMember[], users: MemberPlatformUser[], bindings: WechatMemberBinding[]): Map<string, MemberMatch> {
  const platform = new Map<string, Set<string>>()
  const corporate = new Map<string, Set<string>>()
  const reserved = new Set(bindings.map(binding => binding.userId))
  const bound = new Set(bindings.map(binding => binding.thirdPartyUserId))
  users.forEach(user => contacts(user.telephone, user.email).forEach(key => addIndex(platform, key, user.id)))
  members.forEach(member => contacts(member.mobile, member.email, member.bizMail).forEach(key => addIndex(corporate, key, member.id)))
  const result = new Map<string, MemberMatch>()
  const proposedUsers = new Map<string, Set<string>>()
  for (const member of members) {
    if (bound.has(member.id)) continue
    const keys = contacts(member.mobile, member.email, member.bizMail)
    const candidates = new Set(keys.flatMap(key => [...(platform.get(key) ?? [])]))
    const duplicate = keys.some(key => (corporate.get(key)?.size ?? 0) > 1 || (platform.get(key)?.size ?? 0) > 1)
    const userId = candidates.size === 1 ? [...candidates][0] : undefined
    const state: MemberMatchState = !keys.length ? 'missing' : duplicate || candidates.size > 1 || (userId && reserved.has(userId)) ? 'conflict' : userId ? 'automatic' : 'unmatched'
    result.set(member.id, { state, ...(state === 'automatic' ? { userId } : {}) })
    if (state === 'automatic' && userId) addIndex(proposedUsers, userId, member.id)
  }
  // Different contacts can still identify the same platform account; neither proposal wins by order.
  proposedUsers.forEach(ids => { if (ids.size > 1) ids.forEach(id => result.set(id, { state: 'conflict' })) })
  return result
}

export function bindingSignature(bindings: WechatMemberBinding[]): string {
  return JSON.stringify(bindings.map(({ id, userId, thirdPartyUserId }) => [id, userId, thirdPartyUserId]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
}

/** Only changed, explicitly assigned members are sent; omitted members are never implicitly unbound. */
export function memberBindingChanges(members: WechatMember[], bindings: WechatMemberBinding[], assignments: ReadonlyMap<string, string>): WechatBindingChange[] {
  const existing = new Map(bindings.map(binding => [binding.thirdPartyUserId, binding]))
  return members.flatMap(member => {
    const userId = assignments.get(member.id)
    const binding = existing.get(member.id)
    return userId && userId !== binding?.userId ? [{ ...(binding ? { id: binding.id } : {}), userId, thirdPartyUserId: member.id, providerName: member.name || member.id }] : []
  })
}
