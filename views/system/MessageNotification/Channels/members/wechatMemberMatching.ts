import type { MemberPlatformUser, WechatBindingChange, WechatMember, WechatMemberBinding } from '../../../../../api/notice/wechatMembers'

import { uniqueNamePairs } from '../../shared/workRecipients'

export function matchWechatMembers(members: WechatMember[], users: MemberPlatformUser[], bindings: WechatMemberBinding[]): Map<string, string> {
  const pairs = uniqueNamePairs(users, members, bindings.map(binding => ({
    platformId: binding.userId, externalId: binding.thirdPartyUserId,
  })))
  return new Map(pairs.map(pair => [pair.externalId, pair.platformId]))
}

export function bindingSignature(bindings: WechatMemberBinding[]): string {
  return JSON.stringify(bindings.map(({ id, userId, thirdPartyUserId }) => [id, userId, thirdPartyUserId]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
}

/** Drafts are keyed by platform user, matching the server's type/provider/user binding identity. */
export function memberBindingChanges(members: WechatMember[], bindings: WechatMemberBinding[], assignments: ReadonlyMap<string, string>): WechatBindingChange[] {
  const existing = new Map(bindings.map(binding => [binding.userId, binding]))
  const available = new Map(members.map(member => [member.id, member]))
  return [...assignments].flatMap(([userId, memberId]) => {
    const member = available.get(memberId)
    const binding = existing.get(userId)
    return member && memberId !== binding?.thirdPartyUserId ? [{ ...(binding ? { id: binding.id } : {}), userId, thirdPartyUserId: memberId, providerName: member.name || memberId }] : []
  })
}
