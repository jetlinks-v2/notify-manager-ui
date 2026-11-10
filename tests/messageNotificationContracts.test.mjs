import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const calls = []
let response = { success: true, result: undefined }
let failure
const request = Object.fromEntries(['get', 'post', 'patch', 'remove'].map(method => [method, async (url, data) => {
  calls.push({ method, url, data })
  if (failure) throw failure
  return response
}]))
const cache = new Map()

// Run production contracts/adapters; only replace HTTP I/O so tests cannot send notifications.
function load(filename) {
  if (cache.has(filename)) return cache.get(filename)
  const { code } = transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' })
  const module = { exports: {} }
  const imports = name => {
    if (name === '@jetlinks-web/core') return { request }
    if (name === 'vue') return vue
    if (name.startsWith('.')) return load(resolve(dirname(filename), name.endsWith('.ts') ? name : `${name}.ts`))
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(imports, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}

const shared = load(resolve(root, 'views/system/MessageNotification/shared/index.ts'))
const { messageNotificationApi: api } = load(resolve(root, 'api/notice/messageNotification.ts'))
const {
  notificationChannels, notificationCapabilities, notificationPermissions, notificationStates,
  notificationEnumValue, notificationEnumText, resolveNotificationChannel,
  normalizeNotificationNavigation, notificationQuery, notificationNavigationTarget,
  withNotificationChannel, selectNotificationConfig,
  createNotificationConfigDraft, buildNotificationConfigPayload,
  notificationSecretsRequiringInput, NotificationSecretInputRequiredError,
  normalizeNotificationPage, classifyNotificationFailure, NotificationRequestError,
  notificationConfigurationChange, publishNotificationConfigurationChange,
} = shared

test.beforeEach(() => {
  calls.length = 0
  response = { success: true, result: undefined }
  failure = undefined
})

test('catalog distinguishes real providers and excludes unverified inbox/business mappings', () => {
  assert.equal(new Set(notificationChannels.map(channel => channel.id)).size, 7)
  assert.equal(resolveNotificationChannel({ value: 'email', text: '邮件' }, 'embedded').id, 'email:embedded')
  assert.equal(resolveNotificationChannel('weixin', 'robot'), undefined)
  assert.equal(resolveNotificationChannel('inbox', 'embedded'), undefined)
  assert.deepEqual(notificationStates, ['success', 'error', 'retrying', 'cancel'])
  assert.equal(notificationCapabilities.history.query, false)
  assert.equal(notificationCapabilities.history.count, false)
  assert.equal(notificationCapabilities.history.retry, false)
  assert.equal(notificationPermissions.templates.update, 'system/MessageNotification/Templates:update')
})

test('EnumDict display preserves service text while requests use values', () => {
  assert.equal(notificationEnumText({ value: 'cancel', text: 'Cancelled by sender' }), 'Cancelled by sender')
  assert.equal(notificationEnumValue({ value: 'cancel', text: 'Cancelled by sender' }), 'cancel')
  assert.equal(notificationEnumText('retrying'), 'retrying')
  assert.equal(notificationEnumValue(null), '')
})

test('navigation validates shared keys without inventing prototype business relations', () => {
  assert.deepEqual(normalizeNotificationNavigation({
    channel: ['email:embedded', 'sms:aliyunSms'], configId: 'id/with?parts', templateId: 'tpl#one', state: 'cancel',
  }), { channel: 'email:embedded', configId: 'id/with?parts', templateId: 'tpl#one', state: 'cancel' })
  assert.deepEqual(normalizeNotificationNavigation({ ch: '邮件', type: '设备告警' }), { channel: 'email:embedded' })
  assert.deepEqual(normalizeNotificationNavigation({ ch: '钉钉' }), {})
  assert.deepEqual(normalizeNotificationNavigation({ ch: '站内信', type: '设备告警', status: '没发' }), {})
  assert.deepEqual(normalizeNotificationNavigation({ channel: 'unknown', state: 'unsent', configId: '' }), {})
})

test('route updates preserve ConditionFilter query and return targets for menu navigation', () => {
  const existing = { filter: 'opaque-filter', owner: 'cloud', ch: '邮件', tab: '通知渠道', configId: 'old' }
  assert.deepEqual(notificationQuery({ channel: 'sms:aliyunSms', templateId: 'tpl' }, existing), {
    filter: 'opaque-filter', owner: 'cloud', channel: 'sms:aliyunSms', templateId: 'tpl',
  })
  assert.equal(existing.configId, 'old')
  assert.deepEqual(notificationNavigationTarget('templates', { configId: 'config-real', channel: 'email:embedded' }), {
    name: 'system/MessageNotification/Templates',
    options: { query: { channel: 'email:embedded', configId: 'config-real' } },
  })
})

test('multiple configurations require a real selection and channel filters preserve existing terms', () => {
  const records = [{ id: 'a' }, { id: 'b' }]
  assert.equal(selectNotificationConfig(records), undefined)
  assert.equal(selectNotificationConfig(records, 'b'), records[1])
  assert.equal(selectNotificationConfig(records, 'deleted'), undefined)
  assert.equal(selectNotificationConfig([records[0]]), records[0])
  const query = { pageIndex: 0, pageSize: 20, terms: [{ column: 'name', termType: 'like', value: 'SMTP' }] }
  const result = withNotificationChannel(query, notificationChannels[0])
  assert.deepEqual(result.terms.slice(1), [
    { column: 'type', termType: 'eq', value: 'email' },
    { column: 'provider', termType: 'eq', value: 'embedded' },
  ])
  assert.equal(query.terms.length, 1)
  assert.equal(result.pageIndex, 0)
})

const config = () => ({
  id: 'existing-config', name: 'SMTP one', type: 'email', provider: 'embedded', receiptKey: 'receipt-secret',
  configuration: { host: 'smtp.example.org', password: 'real-password', properties: [{ name: 'mail.smtp.ssl.enable', value: 'true' }], custom: 1 },
})

test('draft secrets start empty and nested edits cannot change the saved baseline', () => {
  const original = config()
  const draft = createNotificationConfigDraft(original)
  assert.equal(draft.configuration.password, '')
  assert.equal(draft.receiptKey, undefined)
  draft.configuration.properties[0].value = 'false'
  assert.equal(original.configuration.properties[0].value, 'true')
  assert.equal(original.configuration.password, 'real-password')
})

test('empty or masked secret input preserves true baseline credentials without writing a mask', () => {
  const original = config()
  const draft = createNotificationConfigDraft(original)
  draft.configuration.host = 'smtp.updated.example.org'
  const empty = buildNotificationConfigPayload(draft, original)
  assert.equal(empty.configuration.password, 'real-password')
  assert.equal(empty.receiptKey, 'receipt-secret')
  assert.equal(empty.configuration.host, 'smtp.updated.example.org')
  assert.equal(empty.configuration.custom, 1)
  draft.configuration.password = '********'
  draft.receiptKey = '••••••••'
  assert.equal(buildNotificationConfigPayload(draft, original).configuration.password, 'real-password')
  assert.equal(buildNotificationConfigPayload(draft, original).receiptKey, 'receipt-secret')
  draft.configuration.password = 'new-password'
  assert.equal(buildNotificationConfigPayload(draft, original).configuration.password, 'new-password')
})

test('masked or absent saved secrets require re-entry because nested PATCH preservation is unverified', () => {
  const masked = config()
  masked.configuration.password = '******'
  masked.receiptKey = '******'
  const draft = createNotificationConfigDraft(masked)
  assert.deepEqual(notificationSecretsRequiringInput(draft, masked), ['password'])
  assert.throws(() => buildNotificationConfigPayload(draft, masked), error => error instanceof NotificationSecretInputRequiredError && error.fields[0] === 'password')
  const withoutSecret = config()
  delete withoutSecret.configuration.password
  assert.deepEqual(notificationSecretsRequiringInput(createNotificationConfigDraft(withoutSecret), withoutSecret), ['password'])
  draft.configuration.password = 're-entered'
  const payload = buildNotificationConfigPayload(draft, masked)
  assert.equal(payload.configuration.password, 're-entered')
  assert.equal(Object.hasOwn(payload, 'receiptKey'), false)
})

test('a new or different record cannot inherit credentials from another baseline', () => {
  const newDraft = { name: 'New', type: 'email', provider: 'embedded', configuration: { host: 'smtp.new.example.org', password: '' } }
  const created = buildNotificationConfigPayload(newDraft, config())
  assert.equal(Object.hasOwn(created.configuration, 'password'), false)
  assert.equal(Object.hasOwn(created.configuration, 'custom'), false)
  assert.equal(Object.hasOwn(created, 'receiptKey'), false)
  assert.equal(Object.hasOwn(buildNotificationConfigPayload({ ...newDraft, id: 'other' }, config()).configuration, 'password'), false)
})

test('token-bearing robot URLs receive the same masked and empty secret protection', () => {
  const original = { id: 'robot', name: 'Robot', type: 'dingTalk', provider: 'dingTalkRobotWebHook', configuration: { url: 'https://example.org/hook?access_token=secret' } }
  const draft = createNotificationConfigDraft(original)
  assert.equal(draft.configuration.url, '')
  draft.configuration.url = 'https://example.org/hook?access_token=******'
  assert.equal(buildNotificationConfigPayload(draft, original).configuration.url, original.configuration.url)
})

test('page adapters preserve real totals and reject malformed data instead of claiming no results', () => {
  assert.deepEqual(normalizeNotificationPage([{ id: 'record' }]), { data: [{ id: 'record' }] })
  assert.deepEqual(normalizeNotificationPage({ data: [], total: 123, pageIndex: 2, pageSize: 20 }), { data: [], total: 123, pageIndex: 2, pageSize: 20 })
  assert.equal(Object.hasOwn(normalizeNotificationPage({ data: [] }), 'total'), false)
  assert.throws(() => normalizeNotificationPage(undefined), error => error.kind === 'error')
  assert.throws(() => normalizeNotificationPage({ total: 0 }), error => error.kind === 'error')
})

test('facade uses verified endpoints, opaque encoded IDs and preserves query terms', async () => {
  response = { success: true, result: { data: [config()], total: 1 } }
  const query = withNotificationChannel({ paging: false }, notificationChannels[0])
  const result = await api.queryConfigs(query)
  assert.equal(result.data[0].id, 'existing-config')
  assert.deepEqual(calls[0], { method: 'post', url: '/notifier/config/_query', data: query })
  await api.getConfig('opaque/id?#')
  await api.getTemplate('template/id?#')
  assert.equal(calls[1].url, '/notifier/config/opaque%2Fid%3F%23')
  assert.equal(calls[2].url, '/notifier/template/template%2Fid%3F%23')
  const payload = { id: 'tpl', name: 'actual', type: 'email', provider: 'embedded', template: { subject: 'subject', text: 'text' } }
  await api.updateTemplate(payload)
  assert.deepEqual(calls[3], { method: 'patch', url: '/notifier/template', data: payload })
})

test('facade rejects unsuccessful and forbidden requests and keeps unavailable history free of HTTP', async () => {
  response = { success: false, status: 403, result: { data: [] } }
  await assert.rejects(api.queryConfigs({}), error => error instanceof NotificationRequestError && error.kind === 'forbidden')
  failure = { response: { status: 405 } }
  await assert.rejects(api.queryTemplates({}), error => error.kind === 'unavailable')
  failure = new Error('offline')
  await assert.rejects(api.getConfig('id'), error => error.kind === 'error')
  assert.equal(classifyNotificationFailure({ response: { status: 401 } }), 'forbidden')
  assert.equal(classifyNotificationFailure({ status: 404 }), 'error')
  assert.equal(Object.hasOwn(api, 'queryHistory'), false)
  assert.equal(calls.length, 3)
  assert.equal(calls.some(call => /histor|notifications/.test(call.url)), false)
})

test('configuration invalidation carries only identifiers and a monotonic in-memory revision', () => {
  const initialRevision = notificationConfigurationChange.value?.revision ?? 0
  publishNotificationConfigurationChange({ id: 'config', channel: 'email:embedded', action: 'saved', password: 'must-not-propagate' })
  assert.deepEqual(notificationConfigurationChange.value, { id: 'config', channel: 'email:embedded', action: 'saved', revision: initialRevision + 1 })
  publishNotificationConfigurationChange({ id: 'config', channel: 'email:embedded', action: 'deleted' })
  assert.equal(notificationConfigurationChange.value.revision, initialRevision + 2)
})
