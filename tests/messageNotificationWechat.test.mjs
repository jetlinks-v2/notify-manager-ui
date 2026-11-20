import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const calls = []
let response
const request = Object.fromEntries(['get', 'post'].map(method => [method, async (url, data) => { calls.push({ method, url, data }); return response }]))
const cache = new Map()
function load(filename) {
  if (!filename.endsWith('.ts')) filename += '.ts'
  if (cache.has(filename)) return cache.get(filename)
  const { code } = transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' })
  const module = { exports: {} }
  const imports = name => name === 'vue' ? vue : name === '@jetlinks-web/core' ? { request }
    : name === 'vue-i18n' ? { useI18n: () => ({ t: key => key }) }
    : name.startsWith('.') ? load(resolve(dirname(filename), name === '../../shared' || name === '../shared' ? `${name}/index` : name)) : require(name)
  new Function('require', 'module', 'exports', code)(imports, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}
const base = resolve(root, 'views/system/MessageNotification/Channels')
const { matchWechatMembers, memberBindingChanges, memberPhone, memberEmail } = load(resolve(base, 'members/wechatMemberMatching'))
const { useWechatMembers } = load(resolve(base, 'members/useWechatMembers'))
const { useWechatMembersDrawer } = load(resolve(base, 'members/useWechatMembersDrawer'))
const { withMemberStatus } = load(resolve(base, 'members/wechatMemberFilters'))
const { buildWechatMemberTree, wechatTreeExpandedKeys } = load(resolve(base, 'members/wechatMemberTree'))
const { loadMemberPlatformUsers, wechatMemberApi } = load(resolve(root, 'api/notice/wechatMembers'))
const { messageNotificationApi } = load(resolve(root, 'api/notice/messageNotification'))
const corpChannel = { id: 'weixin:corpMessage', type: 'weixin', provider: 'corpMessage' }
const corpTemplate = () => ({ id: 'tpl', name: 'Saved enterprise template', type: 'weixin', provider: 'corpMessage', configId: 'corp', template: { agentId: '1000002', message: 'Hello ${code}' }, variableDefinitions: [{ id: 'code', expands: { required: true } }, { id: 'toUser', name: 'Recipient', type: 'string' }] })
const clone = value => JSON.parse(JSON.stringify(value))
const user = (id, telephone, email) => ({ id, telephone, email, name: id })
const member = (id, mobile, email, extra = {}) => ({ id, mobile, email, name: id, department: ['2'], ...extra })

test('matches normalized unique phones/emails and never matches name or equal IDs', () => {
  const result = matchWechatMembers([
    member('a', '+86 (138) 0013-8000'), member('b', undefined, ' B@Example.org '), member('c', undefined, undefined, { bizMail: 'work@example.org' }), member('same'),
  ], [user('u1', '+8613800138000'), user('u2', undefined, 'b@example.org'), user('u3', undefined, 'WORK@example.org'), user('same')], [])
  assert.equal(result.get('a').userId, 'u1'); assert.equal(result.get('b').userId, 'u2'); assert.equal(result.get('c').userId, 'u3')
  assert.equal(result.get('same').state, 'missing')
  assert.equal(memberPhone('138****8000'), ''); assert.equal(memberEmail('a***@example.org'), '')
  assert.notEqual(memberPhone('+8613800138000'), memberPhone('13800138000'))
})

test('duplicates and contradictory phones/emails produce no suggestions', () => {
  const users = [user('u1', '111', 'one@example.org'), user('u2', '222', 'two@example.org'), user('u3', '333'), user('u4', '333')]
  const result = matchWechatMembers([member('cross', '111', 'two@example.org'), member('dup', '333'), member('a', '222'), member('b', '222')], users, [])
  for (const match of result.values()) assert.deepEqual(match, { state: 'conflict' })
  const collision = matchWechatMembers([member('a', '111'), member('b', undefined, 'one@example.org')], users, [])
  assert.equal(collision.get('a').state, 'conflict'); assert.equal(collision.get('b').state, 'conflict')
})

test('existing bindings reserve accounts and are not rematched', () => {
  const bindings = [{ id: 'binding', userId: 'u1', thirdPartyUserId: 'bound' }]
  const result = matchWechatMembers([member('bound', '222'), member('new', '111')], [user('u1', '111'), user('u2', '222')], bindings)
  assert.equal(result.has('bound'), false)
  assert.equal(result.get('new').state, 'conflict')
  assert.deepEqual(memberBindingChanges([member('bound'), member('new')], bindings, new Map([['u1', 'new'], ['u3', 'bound']])), [
    { id: 'binding', userId: 'u1', thirdPartyUserId: 'new', providerName: 'new' }, { userId: 'u3', thirdPartyUserId: 'bound', providerName: 'bound' },
  ])
  assert.deepEqual(memberBindingChanges([member('bound')], bindings, new Map()), [])
})

test('platform users load every page and reject truncated/repeated responses', async () => {
  const seen = []
  const users = await loadMemberPlatformUsers({ users: async page => { seen.push(page); return { data: [user(`u${page}`)], total: 3 } } }, () => true)
  assert.deepEqual(seen, [0, 1, 2]); assert.equal(users.length, 3)
  await assert.rejects(loadMemberPlatformUsers({ users: async () => ({ data: [user('u1')], total: 3 }) }, () => true))
  await assert.rejects(loadMemberPlatformUsers({ users: async () => ({ data: [], total: 3 }) }, () => true))
  let active = true
  assert.deepEqual(await loadMemberPlatformUsers({ users: async () => { active = false; return { data: [user('late')], total: 1 } } }, () => active), [])
})

function memberFixture() {
  let bindings = [{ id: 'old', userId: 'u1', thirdPartyUserId: 'bound', providerName: 'bound' }]
  const calls = []
  const api = {
    departments: async () => [{ id: '1', name: 'Root', children: [{ id: '2', name: 'Team' }] }],
    members: async () => [member('bound'), member('auto', '222'), member('manual'), member('auto', '222')],
    users: async () => ({ data: [user('u1'), user('u2', '222'), user('u3'), user('u4')], total: 4 }),
    bindings: async () => { calls.push(['read']); return clone(bindings) },
    bind: async (configId, payload) => {
      calls.push(['bind', configId, clone(payload)])
      for (const change of payload) {
        bindings = bindings.filter(binding => binding.id !== change.id)
        bindings.push({ ...change, id: `binding-${change.userId}` })
      }
    },
    unbind: async id => { calls.push(['unbind', id]); bindings = bindings.filter(binding => binding.id !== id) },
  }
  const permitted = vue.ref(true)
  const clean = vue.ref(true)
  const context = { configId: 'corp', permitted: () => permitted.value, clean: () => clean.value }
  return { api, calls, context, permitted, clean, setBindings: value => { bindings = value } }
}

test('summary and manager reads never match or write until explicitly requested', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.prepare(io.context)
  assert.equal(workspace.open.value, false)
  assert.equal(workspace.dirty.value, false)
  assert.deepEqual(workspace.stats.value, { total: 4, bound: 1, unbound: 3, invalid: 0 })
  const reads = io.calls.length
  await workspace.show(io.context)
  assert.equal(io.calls.length, reads)
  assert.equal(workspace.statusFilter.value, 'all')
  assert.deepEqual(workspace.filterTerms.value, [])
  assert.deepEqual(workspace.visibleRows.value.map(row => row.id), ['u1', 'u2', 'u3', 'u4'])
  assert.equal(workspace.assignments.has('u2'), false)
  assert.equal(await workspace.save(), false)
  workspace.autoMatch()
  assert.equal(workspace.matchCount.value, 1)
  assert.equal(workspace.assignments.get('u2'), 'auto')
  assert.equal(workspace.statusFilter.value, 'unbound')
  assert.equal(workspace.visibleRows.value.length, 3, 'suggestions stay visible until saved')
  assert.equal(io.calls.some(([action]) => ['bind', 'unbind'].includes(action)), false)
  workspace.close()
  assert.equal(workspace.dirty.value, false)
  assert.equal(workspace.stats.value.bound, 1)
  await workspace.show(io.context)
  assert.equal(workspace.statusFilter.value, 'all')
  assert.deepEqual(workspace.filterTerms.value, [])
  assert.deepEqual(workspace.visibleRows.value.map(row => row.id), ['u1', 'u2', 'u3', 'u4'])
  assert.equal(workspace.assignments.has('u2'), false)
  assert.equal(workspace.matchCount.value, undefined)
})

test('explicit rematching preserves manually changed and cleared users, including occupied candidates', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.show(io.context)
  workspace.assign('u3', 'auto')
  workspace.autoMatch()
  assert.equal(workspace.matchCount.value, 0)
  assert.equal(workspace.assignments.has('u2'), false)
  workspace.assign('u3', undefined)
  workspace.autoMatch()
  assert.equal(workspace.assignments.get('u2'), 'auto')
  workspace.assign('u2', 'manual')
  workspace.autoMatch()
  assert.equal(workspace.assignments.get('u2'), 'manual')
  workspace.assign('u2', undefined)
  workspace.autoMatch()
  assert.equal(workspace.assignments.has('u2'), false)
  assert.equal(workspace.assignments.get('u1'), 'bound')
})

test('status counts respect search while summary includes unavailable saved counterparts', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  io.setBindings([
    { id: 'old', userId: 'missing-user', thirdPartyUserId: 'bound', providerName: 'bound' },
    { id: 'orphan', userId: 'u1', thirdPartyUserId: 'missing-member', providerName: 'Unavailable member' },
  ])
  await workspace.show(io.context)
  assert.deepEqual(workspace.stats.value, { total: 5, bound: 0, unbound: 3, invalid: 2 })
  workspace.statusFilter.value = 'invalid'
  assert.equal(workspace.visibleRows.value.length, 2)
  workspace.filterTerms.value = withMemberStatus([{ column: 'member', termType: 'like', value: 'Unavailable' }], 'invalid')
  assert.deepEqual(workspace.filterCounts.value, { all: 1, bound: 0, unbound: 0, invalid: 1 })
  assert.equal(workspace.stats.value.total, 5)
  assert.equal(workspace.visibleRows.value[0].memberAvailable, false)
  workspace.assign('u3', 'missing-member')
  assert.equal(workspace.dirty.value, false)
  assert.equal(await workspace.unbind('orphan'), true)
  assert.equal(workspace.stats.value.invalid, 1)
  assert.equal(workspace.visibleRows.value.length, 0)
})

test('summary responses cannot cross configuration changes and matching respects revocation', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  let release
  const original = io.api.members
  io.api.members = () => new Promise(resolve => { release = resolve })
  const previous = workspace.prepare(io.context)
  io.api.members = async () => [member('next')]
  await workspace.prepare({ ...io.context, configId: 'next' })
  release(await original()); await previous
  assert.equal(workspace.configId.value, 'next')
  assert.equal(workspace.members.value[0].id, 'next')
  io.api.members = original
  await workspace.show(io.context)
  io.permitted.value = false
  workspace.autoMatch()
  assert.equal(workspace.assignments.has('u2'), false)
  assert.equal(workspace.canAutoMatch.value, false)
  io.permitted.value = true
  io.clean.value = false
  workspace.autoMatch()
  assert.equal(workspace.assignments.has('u2'), false)
})

test('platform-user rows preview changes and replacement updates the original user binding', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.show(io.context)
  workspace.autoMatch()
  assert.equal(workspace.rows.value.length, 4)
  assert.equal(workspace.assignments.get('u2'), 'auto')
  assert.equal(io.calls.some(([action]) => action === 'bind'), false)
  workspace.assign('u3', 'auto')
  assert.equal(workspace.error.value, 'duplicate'); assert.equal(workspace.assignments.has('u3'), false)
  workspace.assign('u1', 'manual')
  assert.equal(workspace.memberUnavailable('bound', 'u3'), true, 'saved member stays reserved until replacement is saved')
  assert.equal(await workspace.save(), true)
  const sent = io.calls.find(([action]) => action === 'bind')
  assert.equal(sent[1], 'corp'); assert.equal(sent[2].length, 2)
  assert.deepEqual(sent[2].find(row => row.userId === 'u1'), { id: 'old', userId: 'u1', thirdPartyUserId: 'manual', providerName: 'manual' })
  assert.equal(workspace.bindings.value.filter(row => row.userId === 'u1').length, 1)
  assert.equal(workspace.memberUnavailable('bound', 'u3'), false)
  assert.equal(workspace.dirty.value, false)
  workspace.filterTerms.value = [{ column: 'department', termType: 'in', value: ['1'] }]
  assert.equal(workspace.visibleRows.value.length, 2)
  workspace.filterTerms.value.push({ column: 'member', termType: 'like', value: 'manual' })
  assert.deepEqual(workspace.visibleRows.value.map(row => row.id), ['u1'])
})

test('concurrent binding changes block saves and unbinds until refreshed', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.show(io.context)
  workspace.autoMatch()
  io.setBindings([{ id: 'other', userId: 'u2', thirdPartyUserId: 'different' }])
  assert.equal(await workspace.save(), false)
  assert.equal(workspace.error.value, 'conflict'); assert.equal(workspace.refreshRequired.value, true)
  assert.equal(await workspace.unbind('old'), false)
  assert.equal(io.calls.some(([action]) => ['bind', 'unbind'].includes(action)), false)
})

test('save failures preserve preview and successful-write refresh failures cannot replay mutations', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.show(io.context)
  workspace.autoMatch()
  const bind = io.api.bind
  io.api.bind = async () => { throw new Error('offline') }
  assert.equal(await workspace.save(), false); assert.equal(workspace.assignments.get('u2'), 'auto')
  io.api.bind = async (...args) => { await bind(...args); io.api.bindings = async () => { throw new Error('read offline') } }
  assert.equal(await workspace.save(), false); assert.equal(workspace.error.value, 'refresh')
  assert.equal(workspace.canSave.value, false); assert.equal(await workspace.save(), false)
  assert.equal(io.calls.filter(([action]) => action === 'bind').length, 1)
})

test('explicit unbind preserves other pending edits and reserves existing members', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.show(io.context)
  workspace.autoMatch()
  workspace.assign('u1', 'manual')
  assert.equal(workspace.memberUnavailable('bound', 'u3'), true)
  assert.equal(await workspace.unbind('old'), true)
  assert.equal(workspace.assignments.has('u1'), false)
  assert.equal(workspace.assignments.get('u2'), 'auto')
  assert.equal(workspace.memberUnavailable('bound', 'u3'), false)
})

test('permissions and stale drawer responses cannot publish or mutate another config', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.show(io.context)
  workspace.autoMatch()
  io.permitted.value = false
  assert.equal(await workspace.save(), false); assert.equal(await workspace.unbind('old'), false)
  io.permitted.value = true
  let release
  io.api.members = () => new Promise(resolve => { release = resolve })
  const loading = workspace.reload()
  workspace.close(true)
  release([member('late')]); await loading
  assert.equal(workspace.open.value, false); assert.deepEqual(workspace.members.value, [])
  assert.equal(workspace.assignments.size, 0)
})

test('late successful mutations do not reopen the drawer or restore its data', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.show(io.context)
  workspace.autoMatch()
  let release
  io.api.bind = () => new Promise(resolve => { release = resolve })
  const saving = workspace.save()
  await Promise.resolve(); await Promise.resolve()
  workspace.close(true)
  release(); assert.equal(await saving, false)
  assert.equal(workspace.open.value, false); assert.equal(workspace.saved.value, false)
})



function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve() }

test('channel auto match keeps one lock from matching through write and readback without opening the drawer', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.prepare(io.context)
  const check = deferred(); const write = deferred(); const readback = deferred()
  const bindings = io.api.bindings; const bind = io.api.bind
  let reads = 0
  io.api.bindings = async () => { await (++reads === 1 ? check.promise : readback.promise); return bindings() }
  io.api.bind = async (...args) => { await write.promise; return bind(...args) }
  const saving = workspace.autoMatchAndSave()
  assert.equal(workspace.busy.value, true); assert.equal(workspace.autoMatching.value, true)
  assert.equal(workspace.open.value, false)
  assert.equal(await workspace.autoMatchAndSave(), false)
  await workspace.show(io.context)
  assert.equal(workspace.open.value, false)
  check.resolve(); await settle()
  assert.equal(workspace.busy.value, true); assert.equal(workspace.saved.value, false)
  write.resolve(); await settle()
  assert.equal(workspace.busy.value, true); assert.equal(workspace.refreshRequired.value, true)
  readback.resolve()
  assert.equal(await saving, true)
  assert.equal(workspace.busy.value, false); assert.equal(workspace.autoMatching.value, false)
  assert.equal(workspace.open.value, false); assert.equal(workspace.stats.value.bound, 2)
  assert.equal(io.calls.filter(([action]) => action === 'bind').length, 1)
  assert.deepEqual(io.calls.find(([action]) => action === 'bind')[2].map(row => row.thirdPartyUserId), ['auto'])
})

test('channel matching reports no matches without an empty write and drawer previews require explicit save', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  io.api.members = async () => [member('manual')]
  await workspace.prepare(io.context)
  assert.equal(await workspace.autoMatchAndSave(), false)
  assert.equal(workspace.matchCount.value, 0); assert.equal(workspace.busy.value, false)
  assert.equal(io.calls.some(([action]) => action === 'bind'), false)
  await workspace.show(io.context)
  workspace.assign('u3', 'manual')
  assert.equal(await workspace.autoMatchAndSave(), false, 'outside action never saves an open drawer draft')
  assert.equal(await workspace.save(), true)
})

test('channel saves retry failed writes, but never repeat a successful write after readback failure', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.prepare(io.context)
  const bind = io.api.bind; const bindings = io.api.bindings
  io.api.bind = async () => { throw new Error('offline') }
  assert.equal(await workspace.autoMatchAndSave(), false)
  assert.equal(workspace.error.value, 'error'); assert.equal(workspace.canAutoMatchAndSave.value, true)
  assert.equal(workspace.assignments.get('u2'), 'auto')
  io.api.bind = async (...args) => { await bind(...args); io.api.bindings = async () => { throw new Error('read offline') } }
  assert.equal(await workspace.autoMatchAndSave(), false)
  assert.equal(workspace.error.value, 'refresh'); assert.equal(workspace.busy.value, false)
  assert.equal(await workspace.autoMatchAndSave(), false)
  io.api.bindings = bindings
  await workspace.reload()
  assert.equal(workspace.refreshRequired.value, false); assert.equal(workspace.stats.value.bound, 2)
  assert.equal(io.calls.filter(([action]) => action === 'bind').length, 1)
})

test('channel matching blocks concurrent bindings, revoked access and stale writes across config changes', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.prepare(io.context)
  io.setBindings([{ id: 'changed', userId: 'u2', thirdPartyUserId: 'other' }])
  assert.equal(await workspace.autoMatchAndSave(), false)
  assert.equal(workspace.error.value, 'conflict')
  assert.equal(io.calls.some(([action]) => action === 'bind'), false)
  io.setBindings([]); await workspace.reload()
  const check = deferred(); const bindings = io.api.bindings
  io.api.bindings = async () => { await check.promise; return bindings() }
  const denied = workspace.autoMatchAndSave()
  await settle(); io.permitted.value = false; check.resolve()
  assert.equal(await denied, false)
  assert.equal(io.calls.some(([action]) => action === 'bind'), false)
  io.permitted.value = true; io.api.bindings = bindings
  const write = deferred()
  io.api.bind = async () => write.promise
  const stale = workspace.autoMatchAndSave(); await settle()
  workspace.close(true)
  await workspace.prepare({ ...io.context, configId: 'next' })
  write.resolve(); assert.equal(await stale, false)
  assert.equal(workspace.configId.value, 'next'); assert.equal(workspace.saved.value, false)
  assert.equal(workspace.busy.value, false); assert.equal(workspace.autoMatching.value, false)
})

test('core filters search platform users and selected members with department descendants and status counts', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.show(io.context)
  workspace.autoMatch()
  workspace.filterTerms.value = [{ column: 'department', termType: 'in', value: ['1'] }]
  assert.equal(workspace.visibleRows.value.length, 2)
  workspace.filterTerms.value.push({ column: 'member', termType: 'like', value: 'AUTO' })
  assert.deepEqual(workspace.visibleRows.value.map(row => row.id), ['u2'])
  assert.deepEqual(workspace.filterCounts.value, { all: 1, bound: 0, unbound: 1, invalid: 0 })
  workspace.statusFilter.value = 'bound'
  assert.equal(workspace.visibleRows.value.length, 0); assert.equal(workspace.stats.value.total, 4)
  workspace.statusFilter.value = 'all'
  assert.equal(workspace.visibleRows.value.length, 1)
  workspace.filterTerms.value = [{ column: 'contact', termType: 'eq', value: '222' }, { column: 'platformUser', termType: 'like', value: 'u1', type: 'or' }]
  assert.deepEqual(workspace.visibleRows.value.map(row => row.id), ['u1', 'u2'])
  workspace.statusFilter.value = 'bound'
  assert.deepEqual(workspace.visibleRows.value.map(row => row.id), ['u1'])
  workspace.filterTerms.value = [{ column: 'department', termType: 'nin', value: ['2'] }]
  assert.deepEqual(workspace.visibleRows.value.map(row => row.id), ['u3', 'u4'])
  workspace.filterTerms.value = [{ column: 'member', termType: 'nlike', value: 'auto' }]
  assert.deepEqual(workspace.visibleRows.value.map(row => row.id), ['u1', 'u3', 'u4'])
  workspace.filterTerms.value = []
  assert.equal(workspace.statusFilter.value, 'all'); assert.equal(workspace.visibleRows.value.length, 4)
})

test('drawer pagination and row editing reset when unified filter terms change', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.show(io.context)
  const scope = vue.effectScope()
  const drawer = scope.run(() => useWechatMembersDrawer(() => ({ ...Object.fromEntries(Object.entries(workspace).map(([key, value]) => [key, vue.unref(value)])), rows: workspace.visibleRows.value }), workspace.assign))
  drawer.pagination.value.onChange(3, 20); drawer.edit('u3')
  workspace.filterTerms.value = [{ column: 'member', termType: 'like', value: 'manual' }]
  await vue.nextTick()
  assert.equal(drawer.pagination.value.current, 1); assert.equal(drawer.editingUser.value, '')
  assert.deepEqual(drawer.filterFields.value.map(field => field.dataIndex), ['member', 'platformUser', 'contact', 'department', 'mappingStatus'])
  scope.stop()
})

test('department trees keep nested paths, deduplicate aliases and retain members without visible departments', () => {
  const departments = [{ id: '1', name: '公司', children: [{ id: 2, name: '研发', children: [{ id: '3', name: '测试组' }] }, { id: '4', name: '运营' }, { id: '5', name: '空部门' }] }]
  const members = [member('nested', '13800138000', undefined, { name: '测试成员', department: [3] }), member('shared', undefined, undefined, { department: ['2', '2', '4'] }), member('hidden', undefined, undefined, { department: ['invisible'] }), member('none', undefined, undefined, { department: [] })]
  const source = structuredClone({ departments, members })
  const build = keyword => buildWechatMemberTree(departments, members, id => id === 'shared', '未分组', keyword)
  const flatten = nodes => nodes.flatMap(node => [node, ...flatten(node.children || [])])
  const all = flatten(build(''))
  assert.equal(all.filter(node => node.memberId === 'shared').length, 2)
  assert.equal(all.filter(node => node.memberId === 'shared').every(node => node.disabled), true)
  assert.equal(new Set(all.map(node => node.key)).size, all.length)
  assert.equal(all.find(node => node.title === '公司').count, 2, 'department counts deduplicate multi-department members')
  assert.equal(all.find(node => node.title === '未分组').count, 2)
  assert.equal(all.some(node => node.title === '空部门'), false)
  assert.equal(all.filter(node => node.kind === 'department').every(node => node.selectable === false), true)
  assert.deepEqual(flatten(build('1380013')).map(node => node.title), ['公司', '研发', '测试组', '测试成员'])
  assert.deepEqual(flatten(build('测试成员')).map(node => node.title), ['公司', '研发', '测试组', '测试成员'])
  assert.deepEqual(flatten(build('研发')).filter(node => node.kind === 'member').map(node => node.memberId), ['nested', 'shared'])
  assert.deepEqual(build('not found'), [])
  assert.deepEqual(buildWechatMemberTree([], members, () => false, '未分组')[0].count, 4)
  const expanded = wechatTreeExpandedKeys(build(''), 'nested')
  assert.ok(all.filter(node => ['公司', '研发', '测试组'].includes(node.title)).every(node => expanded.includes(node.key)))
  assert.deepEqual({ departments, members }, source)
})

test('unmatched platform users remain visible without members and missing users cannot be edited', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  io.api.members = async () => []
  io.setBindings([{ id: 'orphan', userId: 'missing-user', thirdPartyUserId: 'missing-member' }])
  await workspace.show(io.context)
  assert.equal(workspace.state.value, 'ready')
  assert.equal(workspace.rows.value.length, 5)
  assert.deepEqual(workspace.visibleRows.value.map(row => row.id), ['u1', 'u2', 'u3', 'u4', 'missing-user'])
  assert.equal(workspace.canAutoMatch.value, false)
  workspace.assign('missing-user', 'other')
  assert.equal(workspace.dirty.value, false)
  assert.equal(await workspace.unbind('orphan'), true)
  assert.equal(workspace.rows.value.length, 4)
})

test('switching a saved member survives reload and failed replacement keeps the original relation and draft', async () => {
  const io = memberFixture(); const workspace = useWechatMembers(io.api)
  await workspace.show(io.context)
  workspace.assign('u1', 'manual')
  const bind = io.api.bind
  io.api.bind = async () => { throw new Error('offline') }
  assert.equal(await workspace.save(), false)
  assert.equal(workspace.bindings.value[0].thirdPartyUserId, 'bound')
  assert.equal(workspace.assignments.get('u1'), 'manual')
  workspace.assign('u3', 'manual')
  assert.equal(workspace.assignments.has('u3'), false)
  io.api.bind = bind
  assert.equal(await workspace.save(), true)
  await workspace.reload()
  assert.equal(workspace.bindings.value.length, 1)
  assert.equal(workspace.assignments.get('u1'), 'manual')
  assert.equal(workspace.memberUnavailable('bound', 'u3'), false)
})

test('member APIs preserve permission context, encode IDs, and use user details and POST binding', async () => {
  calls.length = 0
  response = { success: true, result: [] }
  await wechatMemberApi.departments('corp/one'); await wechatMemberApi.members('corp/one'); await wechatMemberApi.bindings('corp/one')
  await wechatMemberApi.bind('corp/one', [{ userId: 'u', thirdPartyUserId: 'c', providerName: 'Name' }]); await wechatMemberApi.unbind('binding/id')
  response = { success: true, result: { data: [], total: 0 } }
  await wechatMemberApi.users(2, 100)
  response = { success: true, result: corpTemplate() }
  await messageNotificationApi.getSendTemplate('tpl/id')
  assert.deepEqual(calls.map(call => [call.method, call.url]), [
    ['get', '/notifier/wechat/corp/corp%2Fone/departments/tree'], ['get', '/notifier/wechat/corp/corp%2Fone/users'], ['get', '/user/third-party/weixin_corpMessage/corp%2Fone'],
    ['post', '/user/third-party/weixin_corpMessage/corp%2Fone/_bind'], ['post', '/user/third-party/binding%2Fid/_unbind'], ['post', '/user/detail/_query'], ['get', '/notifier/template/tpl%2Fid/detail'],
  ])
  assert.deepEqual(calls[5].data, { pageIndex: 2, pageSize: 100, paging: true, sorts: [{ name: 'id', order: 'asc' }] })
  response = { success: false, status: 403 }
  await assert.rejects(wechatMemberApi.bindings('corp'), error => error.kind === 'forbidden')
})


test('channel AgentId round-trips with legacy metadata and preserves the credential', () => {
  const { channelDefinition } = load(resolve(base, 'configuration/channelMetadata'))
  const { createChannelConfigDraft, channelConfigPayload } = load(resolve(base, 'channelSchema'))
  const legacy = { properties: ['corpId', 'corpSecret'].map(id => ({ id, name: id, valueType: { type: 'string' } })) }
  const definition = channelDefinition({ ...corpChannel, secretFields: ['corpSecret'] }, legacy)
  assert.deepEqual(definition.fields.map(field => field.key), ['corpId', 'corpSecret'])
  const saved = { id: 'corp', name: 'Corp', type: 'weixin', provider: 'corpMessage', configuration: { corpId: 'corp', corpSecret: 'fixture-only' } }
  const draft = createChannelConfigDraft(saved, definition)
  draft.configuration.agentId = '1000002'
  const payload = channelConfigPayload(draft, saved, definition)
  assert.deepEqual(payload.configuration, { corpId: 'corp', agentId: '1000002', corpSecret: 'fixture-only' })
  assert.equal(createChannelConfigDraft(payload, definition).configuration.agentId, '1000002')
  assert.equal(saved.configuration.agentId, undefined)
  assert.equal(legacy.properties.length, 2)
  assert.equal(channelDefinition({ ...corpChannel, secretFields: [] }, { properties: [...legacy.properties, { id: 'agentId', name: 'App', valueType: { type: 'string' } }] }).fields.length, 2)
})

test('enterprise template recipients depend on saved channel credentials instead of a duplicate AgentId', () => {
  const hooks = resolve(root, 'views/notice/template/hooks')
  const { getTemplateFieldSchemas } = load(resolve(hooks, 'noticeTemplateFormModel'))
  const { createTemplateRemoteFieldResolver } = load(resolve(hooks, 'noticeTemplateRemoteFieldResolver'))
  const context = { type: 'weixin', provider: 'corpMessage' }
  const form = { configId: 'corp', template: { toParty: 'department' } }
  const fields = getTemplateFieldSchemas(context, form)
  assert.equal(fields.find(field => field.key === 'agentId').required, false)
  const states = Object.fromEntries(['smsTemplates', 'smsSigns', 'wechatDepartments', 'wechatUsers', 'wechatTags'].map(key => [key, { options: [], loading: false }]))
  const resolver = createTemplateRemoteFieldResolver(context, form, states, () => form.configId, () => form.template.toParty, () => undefined)
  for (const key of ['toParty', 'toUser', 'toTag']) assert.equal(!!resolver.resolveField(fields.find(field => field.key === key)).disabled, false)
  form.configId = ''
  for (const key of ['toParty', 'toUser', 'toTag']) assert.equal(resolver.resolveField(fields.find(field => field.key === key)).disabled, true)
})
