import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'
import { aliyunSmsWireMetadata, channelWireMetadata } from './messageNotificationChannelFixtures.mjs'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const calls = []
let response = { success: true, result: undefined }
let failure
const request = Object.fromEntries(['get', 'post', 'put', 'patch', 'remove'].map(method => [method, async (url, data, options) => {
  calls.push({ method, url, data, ...(options ? { options } : {}) })
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

const { notificationFailureMessage } = load(resolve(root, 'api/notice/messageNotificationState.ts'))
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
  assert.equal(notificationCapabilities.history.query, true)
  assert.equal(notificationCapabilities.history.count, true)
  assert.equal(notificationCapabilities.history.export, true)
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

test('facade rejects unsuccessful and forbidden requests', async () => {
  response = { success: false, status: 403, result: { data: [] } }
  await assert.rejects(api.queryConfigs({}), error => error instanceof NotificationRequestError && error.kind === 'forbidden')
  failure = { response: { status: 405 } }
  await assert.rejects(api.queryTemplates({}), error => error.kind === 'unavailable')
  failure = new Error('offline')
  await assert.rejects(api.getConfig('id'), error => error.kind === 'error')
  assert.equal(classifyNotificationFailure({ response: { status: 401 } }), 'forbidden')
  assert.equal(classifyNotificationFailure({ status: 404 }), 'error')
  assert.equal(calls.length, 3)
})

test('global history preserves paging, nested filters, snapshots and the caller cancellation signal', async () => {
  const history = { id: 'history-one', state: { value: 'cancel', text: 'Cancelled' }, template: '${saved}', context: { saved: 'old value' } }
  response = { success: true, result: { data: [history], total: 37, pageIndex: 1, pageSize: 12 } }
  const query = { paging: true, pageIndex: 1, pageSize: 12, terms: [{ terms: [{ column: 'state', termType: 'eq', value: 'cancel' }], type: 'and' }], sorts: [{ name: 'notifyTime', order: 'desc' }] }
  const controller = new AbortController()
  assert.deepEqual(await api.queryHistory(query, controller.signal), response.result)
  assert.deepEqual(calls, [{ method: 'post', url: '/notify/history/_query', data: query, options: { signal: controller.signal } }])
  controller.abort()
  assert.equal(calls[0].options.signal.aborted, true)
})

test('history only reports empty after a valid success and keeps permission, unavailable and error failures', async () => {
  response = { success: true, result: { data: [], total: 0 } }
  assert.deepEqual(await api.queryHistory({}), { data: [], total: 0 })
  response = { success: true, result: { total: 0 } }
  await assert.rejects(api.queryHistory({}), { kind: 'error' })
  for (const [status, kind] of [[401, 'forbidden'], [403, 'forbidden'], [405, 'unavailable'], [501, 'unavailable'], [404, 'error'], [500, 'error']]) {
    response = { success: false, status, result: { data: [] } }
    await assert.rejects(api.queryHistory({}), { kind })
    failure = { response: { status } }
    await assert.rejects(api.queryHistory({}), { kind })
    failure = undefined
  }
  failure = new Error('offline')
  await assert.rejects(api.queryHistory({}), { kind: 'error' })
})

test('history counts use asset-filtered aggregation and reject invalid or duplicate buckets', async () => {
  const stream = rows => rows.map(row => `data:${JSON.stringify(row)}\n\n`).join('')
  response = stream([{ state: 'success', total: 7 }, { state: 'error', total: '3' }, { state: 'future-state', total: 1 }])
  const filter = { terms: [{ column: 'notifierId', termType: 'eq', value: 'smtp-one' }] }
  const controller = new AbortController()
  assert.deepEqual(await api.countHistory(filter, controller.signal), { all: 11, success: 7, error: 3, retrying: 0, cancel: 0 })
  assert.deepEqual(calls[0], { method: 'post', url: '/notify/history/_agg', data: {
    columns: [{ column: 'id', alias: 'total', aggregation: 'COUNT' }], groupBy: [{ column: 'state', alias: 'state' }], filter, limit: 100,
  }, options: { signal: controller.signal, headers: { Accept: 'text/event-stream' }, responseType: 'text' } })
  for (const result of [null, {}, [null], [{ state: 'error' }], [{ state: 'error', total: -1 }], [{ state: 'error', total: null }], [{ state: 'error', total: 1.5 }], [{ state: 'error', total: 1 }, { state: 'error', total: 2 }]]) {
    response = Array.isArray(result) ? stream(result) : result
    await assert.rejects(api.countHistory(filter), { kind: 'error' })
  }
  response = { success: false, status: 403 }
  await assert.rejects(api.countHistory(filter), { kind: 'forbidden' })
  response = 'event:error\ndata:{"status":403}\n\n'
  await assert.rejects(api.countHistory(filter), { kind: 'forbidden' })
  response = '\uFEFF: keepalive\r\n\r\ndata: {"state":"error",\r\ndata: "total":2}\r\n\r\n'
  assert.equal((await api.countHistory(filter)).error, 2)
  response = ''
  assert.equal((await api.countHistory(filter)).all, 0)
  for (const invalid of ['not SSE', 'data:{broken}\n\n', 'event:error\n\n']) {
    response = invalid
    await assert.rejects(api.countHistory(filter), { kind: 'error' })
  }
})

test('configuration invalidation carries only identifiers and a monotonic in-memory revision', () => {
  const initialRevision = notificationConfigurationChange.value?.revision ?? 0
  publishNotificationConfigurationChange({ id: 'config', channel: 'email:embedded', action: 'saved', password: 'must-not-propagate' })
  assert.deepEqual(notificationConfigurationChange.value, { id: 'config', channel: 'email:embedded', action: 'saved', revision: initialRevision + 1 })
  publishNotificationConfigurationChange({ id: 'config', channel: 'email:embedded', action: 'deleted' })
  assert.equal(notificationConfigurationChange.value.revision, initialRevision + 2)
})

test('channel directory and metadata endpoints preserve opaque type/provider IDs and reject malformed records', async () => {
  response = { success: true, result: [{ id: 'extension/type', name: 'Extension' }] }
  assert.deepEqual(await api.queryTypes(), response.result)
  await api.queryProviders('extension/type')
  response = { success: true, result: { properties: [{ id: 'token', valueType: { type: 'password' } }] } }
  assert.deepEqual(await api.getConfigMetadata('extension/type', 'provider/#'), response.result)
  assert.deepEqual(calls.map(call => call.url), ['/notifier/config/types', '/notifier/config/type/extension%2Ftype/providers', '/notifier/config/extension%2Ftype/provider%2F%23/metadata'])
  for (const properties of [[null], [{ id: 1, valueType: { type: 'string' } }], [{ id: 'field', valueType: { type: {} } }]]) {
    response = { success: true, result: { properties } }
    await assert.rejects(api.getConfigMetadata('extension', 'custom'), error => error.kind === 'error')
  }
  for (const result of [[null], [{ ...config(), id: '' }], [{ ...config(), type: {} }], [{ ...config(), configuration: [] }]]) {
    response = { success: true, result }
    await assert.rejects(api.queryAllConfigs(), error => error.kind === 'error')
  }
  response = { success: true, result: [{ ...config(), type: { value: 'email', text: '邮件' } }] }
  assert.deepEqual(await api.queryAllConfigs(), response.result)
  assert.deepEqual(calls.at(-1), { method: 'post', url: '/notifier/config/_query/no-paging', data: {} })
})

test('real ConfigMetadata property/type responses normalize without dropping provider fields', async () => {
  for (const [id, metadata] of Object.entries(channelWireMetadata)) {
    response = { success: true, result: structuredClone(metadata) }
    const normalized = await api.getConfigMetadata(...id.split(':'))
    assert.deepEqual(normalized.properties.map(field => field.id), metadata.properties.map(field => field.property))
    assert.deepEqual(normalized.properties.map(field => field.valueType), metadata.properties.map(field => field.type))
    assert.equal(normalized.description, metadata.description)
  }
  assert.equal(aliyunSmsWireMetadata.properties.some(field => 'id' in field || 'valueType' in field), false)
  const property = { property: 'token', name: 'Token', type: { type: 'password', expands: { required: true } } }
  response = { success: true, result: { properties: [{ property: 'settings', type: { type: 'array', expands: { defaultValue: [] }, elementType: { type: 'object', properties: [property] } } }] } }
  const nested = (await api.getConfigMetadata('custom', 'provider')).properties[0]
  assert.equal(nested.valueType.elementType.properties[0].id, 'token')
  assert.equal(nested.valueType.elementType.properties[0].valueType.type, 'password')
  assert.deepEqual(nested.valueType.expands.defaultValue, [])
  assert.equal(response.result.properties[0].type.elementType.properties[0].property, 'token')
  for (const malformed of [{ property: 'id' }, { property: 'id', type: 'string' }, { property: 'id', type: { type: 'object', properties: [null] } }]) {
    response = { success: true, result: { properties: [malformed] } }
    await assert.rejects(api.getConfigMetadata('custom', 'provider'), { kind: 'error' })
  }
})

test('HTTP Webhook without metadata uses verified fields only after a successful response', async () => {
  for (const result of [undefined, null]) {
    response = { success: true, result }
    const metadata = await api.getConfigMetadata('webhook', 'http')
    assert.deepEqual(metadata.properties.map(field => field.id), ['url', 'headers'])
    assert.equal(metadata.properties[0].valueType.expands.required, true)
    assert.deepEqual(metadata.properties[1].valueType.elementType.properties.map(field => field.id), ['key', 'value'])
    await assert.rejects(api.getConfigMetadata('extension', 'custom'), { kind: 'error' })
  }
  for (const result of [{}, { properties: [null] }]) {
    response = { success: true, result }
    await assert.rejects(api.getConfigMetadata('webhook', 'http'), { kind: 'error' })
  }
  response = { success: false, status: 403 }
  await assert.rejects(api.getConfigMetadata('webhook', 'http'), { kind: 'forbidden' })
})


test('template business directory reads existing groups and exact channel template bindings', async () => {
  response.result = [{ provider: 'alarm-device', type: { id: 'alarm', name: 'Alarm' }, channels: [{ channelConfiguration: { templateId: 'trigger' } }] }]
  assert.deepEqual(await api.queryTemplateDirectory(), response.result)
  assert.deepEqual(calls, [{ method: 'get', url: '/notify/channel/all-for-save', data: undefined }])
  response.result = { data: [] }
  await assert.rejects(api.queryTemplateDirectory(), NotificationRequestError)
  response.result = [{ channels: 'invalid' }]
  await assert.rejects(api.queryTemplateDirectory(), NotificationRequestError)
})


test('configuration failures keep the backend message and suppress duplicate global notifications', async () => {
  const data = { status: 400, code: 'error.data.referenced', message: '当前通知配置已绑定模板，不可删除' }
  for (const original of [data, { data }, { response: { status: 400, data } }]) {
    assert.equal(notificationFailureMessage(new NotificationRequestError('error', original)), data.message)
  }
  assert.equal(notificationFailureMessage(new NotificationRequestError('error', new Error('Request failed with status code 400'))), undefined)
  assert.equal(notificationFailureMessage({ message: '   ' }), undefined)
  failure = { response: { status: 400, data } }
  await assert.rejects(api.deleteConfig('smtp/id'), error => notificationFailureMessage(error) === data.message)
  assert.deepEqual(calls[0], { method: 'remove', url: '/notifier/config/smtp%2Fid', data: undefined, options: { hiddenError: true } })
})

test('inline send reuses content endpoint and current email follows personal-center identity precedence', async () => {
  const template = { name: 'Selected built-in', type: 'email', provider: 'embedded', template: { subject: 'subject', text: 'body', sendTo: [] } }
  const context = { sendTo: ['recipient@example.test'] }
  await api.sendInline('smtp/id', template, context)
  assert.deepEqual(calls[0], { method: 'post', url: '/notifier/smtp%2Fid/_send', data: { template, context }, options: { hiddenError: true } })
  response.result = [{ provider: 'email', identity: 'first@example.test' }, { provider: 'email', identity: 'primary@example.test', isPrimary: true }]
  assert.equal(await api.getCurrentEmail(), 'primary@example.test')
  assert.equal(calls.at(-1).url, '/user/identity/_me')
  response.result = [{ provider: 'email', identity: 'first@example.test' }]
  assert.equal(await api.getCurrentEmail(), 'first@example.test')
  response.result = { email: 'malformed@example.test' }
  await assert.rejects(api.getCurrentEmail(), { kind: 'error' })
  failure = { response: { status: 403 } }
  await assert.rejects(api.getCurrentEmail(), { kind: 'forbidden' })
  assert.equal(calls.some(call => call.url === '/user/detail'), false)
})


test('business template endpoints encode opaque record IDs and save only the selected channel', async () => {
  const payload = { channel: { providerId: 'scope/id', channelProvider: 'notifier-email', state: 'enabled', channelConfiguration: { notifierId: 'smtp-exact' } }, template: { configId: 'smtp-exact', type: 'email', provider: 'embedded' } }
  response = { success: true, result: payload }
  assert.deepEqual(await api.getBusinessTemplate('scope/id', 'notifier-email'), payload)
  assert.deepEqual(await api.saveBusinessTemplate('scope/id', 'notifier-email', payload), payload)
  await api.setBusinessEnabled('business/code', true)
  await api.setBusinessEnabled('scope/id', false)
  assert.deepEqual(calls.map(call => [call.method, call.url]), [
    ['get', '/notify/channel/scope%2Fid/notifier-email/_query-with-template'],
    ['put', '/notify/channel/scope%2Fid/notifier-email/_save-with-template'],
    ['post', '/notify/channel/business%2Fcode/enable'], ['post', '/notify/channel/scope%2Fid/disable'],
  ])
  assert.deepEqual(calls[1].data, payload)
  response = { success: false, status: 403 }
  await assert.rejects(api.saveBusinessTemplate('scope/id', 'notifier-email', payload))
})

test('optional credential policy supports absent legacy values, replacement, retention and explicit clearing', () => {
  const baseline = { id: 'custom-one', name: 'Custom', type: 'extension', provider: 'custom', configuration: { token: 'saved-token', extra: 1 } }
  const fields = ['token']
  const policy = { optionalFields: fields }
  const draft = createNotificationConfigDraft(baseline, fields)
  assert.equal(buildNotificationConfigPayload(draft, baseline, fields, policy).configuration.token, 'saved-token')
  draft.configuration.token = 'replacement'
  assert.equal(buildNotificationConfigPayload(draft, baseline, fields, policy).configuration.token, 'replacement')
  draft.configuration.token = ''
  const cleared = buildNotificationConfigPayload(draft, baseline, fields, { ...policy, clearFields: fields })
  assert.deepEqual(cleared.configuration, { token: '', extra: 1 })
  assert.equal(Object.hasOwn(cleared, 'clearFields'), false)
  assert.equal(Object.hasOwn(cleared.configuration, 'clearFields'), false)
  for (const value of [undefined, null, '', '  ']) {
    baseline.configuration.token = value
    assert.deepEqual(notificationSecretsRequiringInput(draft, baseline, fields, policy), [])
    assert.equal(Object.hasOwn(buildNotificationConfigPayload(draft, baseline, fields, policy).configuration, 'token'), false)
  }
  baseline.configuration.token = '******'
  assert.deepEqual(notificationSecretsRequiringInput(draft, baseline, fields, policy), ['token'])
  assert.throws(() => buildNotificationConfigPayload(draft, baseline, fields, policy), NotificationSecretInputRequiredError)
  assert.equal(buildNotificationConfigPayload(draft, baseline, fields, { ...policy, clearFields: fields }).configuration.token, '')
})

test('clear intent cannot remove non-optional SMTP, SMS or Webhook credentials', () => {
  for (const baseline of [config(), { id: 'sms', name: 'SMS', type: 'sms', provider: 'aliyunSms', configuration: { secret: 'saved-sms' } },
    { id: 'robot', name: 'Robot', type: 'dingTalk', provider: 'dingTalkRobotWebHook', configuration: { url: 'https://fixture.example.test/hook', secret: 'SECsaved' } }]) {
    const fields = resolveNotificationChannel(baseline.type, baseline.provider).secretFields
    const policy = { optionalFields: [], clearFields: fields }
    const draft = createNotificationConfigDraft(baseline)
    assert.deepEqual(buildNotificationConfigPayload(draft, baseline, fields, policy).configuration, baseline.configuration)
  }
})

test('robot signing keys never merge across record IDs or provider boundaries', () => {
  const baseline = { id: 'one', name: 'Robot', type: 'dingTalk', provider: 'dingTalkRobotWebHook', configuration: { url: 'https://fixture.example.test/hook', secret: 'SECone' } }
  const draft = createNotificationConfigDraft(baseline)
  assert.equal(buildNotificationConfigPayload(draft, baseline).configuration.secret, 'SECone')
  for (const mismatch of [{ ...draft, id: 'two' }, { ...draft, provider: 'other' }, { ...draft, type: 'other' }]) {
    const payload = buildNotificationConfigPayload(mismatch, baseline, ['url', 'secret'], { optionalFields: ['secret'] })
    assert.equal(payload.configuration.secret, undefined)
    assert.equal(payload.configuration.url, undefined)
  }
})


test('personal phone and notification binding reads distinguish missing, malformed and failed responses', async () => {
  response.result = { telephone: '13800138000' }
  assert.equal(await api.getCurrentPhone(), '13800138000')
  assert.deepEqual(calls.at(-1), { method: 'get', url: '/user/detail', data: undefined, options: { applicationScope: false, hiddenError: true } })
  response.result = {}
  assert.equal(await api.getCurrentPhone(), '')
  for (const malformed of [null, [], { telephone: 123 }]) {
    response.result = malformed
    await assert.rejects(api.getCurrentPhone(), { kind: 'error' })
  }
  const binding = { type: 'weixin_corpMessage', provider: 'corp-config', thirdPartyUserId: 'member', providerName: 'Member' }
  response.result = [binding]
  assert.deepEqual(await api.getCurrentBindings(), [binding])
  assert.deepEqual(calls.at(-1), { method: 'get', url: '/user/third-party/me', data: undefined, options: { hiddenError: true } })
  response.result = []
  assert.deepEqual(await api.getCurrentBindings(), [])
  for (const malformed of [undefined, {}, [null], [{ ...binding, provider: undefined }]]) {
    response.result = malformed
    await assert.rejects(api.getCurrentBindings(), { kind: 'error' })
  }
  failure = { response: { status: 403 } }
  await assert.rejects(api.getCurrentPhone(), { kind: 'forbidden' })
  await assert.rejects(api.getCurrentBindings(), { kind: 'forbidden' })
})
