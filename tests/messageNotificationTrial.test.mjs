import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'
import { createI18n } from 'vue-i18n'
import { channelMetadata } from './messageNotificationChannelFixtures.mjs'

const root = resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh: JSON.parse(readFileSync(resolve(root, 'locales/lang/zh.json'), 'utf8')) } })
const cache = new Map()
function load(filename) {
  if (!filename.endsWith('.ts')) filename = existsSync(`${filename}.ts`) ? `${filename}.ts` : resolve(filename, 'index.ts')
  if (cache.has(filename)) return cache.get(filename)
  const module = { exports: {} }
  const imports = name => name === 'vue' ? vue : name === 'vue-i18n' ? { useI18n: () => i18n.global }
    : name === '@jetlinks-web/core' ? { request: {} } : name.startsWith('.') ? load(resolve(dirname(filename), name)) : require(name)
  new Function('require', 'module', 'exports', transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code)(imports, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}
const channels = resolve(root, 'views/system/MessageNotification/Channels')
const { buildChannelTest, channelTestAdapters, testRecipientIssue } = load(resolve(channels, 'testing/channelTestAdapter'))
const { useChannelTest } = load(resolve(channels, 'testing/useChannelTest'))
const { testSettingsIssues } = load(resolve(channels, 'testing/channelTestConfig'))
const { useChannelTestSettings } = load(resolve(channels, 'testing/useChannelTestSettings'))
const { channelDefinition } = load(resolve(channels, 'configuration/channelMetadata'))
const { createChannelConfigDraft, channelConfigPayload, validateChannelDraft } = load(resolve(channels, 'channelSchema'))
const { notificationChannels } = load(resolve(channels, '../shared'))
const clone = value => JSON.parse(JSON.stringify(value))
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
const settings = {
  'email:embedded': { host: 'smtp.example.test' },
  'dingTalk:dingTalkMessage': { appKey: 'key', appSecret: 'secret', agentId: '1001' },
  'weixin:corpMessage': { corpId: 'corp', corpSecret: 'secret', agentId: '1002' },
  'dingTalk:dingTalkRobotWebHook': { url: 'https://robot.example.test/?secret=credential' },
  'webhook:http': { url: 'https://webhook.example.test', headers: [{ key: 'Authorization', value: 'secret' }] },
  'sms:aliyunSms': { regionId: 'cn-shanghai', accessKeyId: 'key', secret: 'secret', testTemplate: { signName: '测试签名', code: 'SMS_REAL', parameters: [{ name: 'code', value: '123456' }] } },
  'voice:aliyun': { regionId: 'cn-shanghai', accessKeyId: 'key', secret: 'secret', testTemplate: { templateType: 'tts', templateCode: 'TTS_REAL', calledShowNumbers: '01012345678', parameters: [{ name: 'name', value: '测试' }] } },
  'weixin:officialMessage': { appId: 'official', secret: 'secret', testTemplate: { wxTemplateId: 'WX_REAL', parameters: [{ name: 'thing1', value: '测试通知' }] } },
}
function config(channelId = 'email:embedded', id = channelId) {
  const [type, provider] = channelId.split(':')
  return { id, name: 'Channel', type, provider, configuration: clone(settings[channelId] || {}) }
}
function context(record = config()) {
  return { config: record, channelName: '测试渠道', systemName: '测试平台', permitted: () => true, clean: () => true }
}
function apiFixture() {
  const calls = []
  return {
    calls,
    getCurrentEmail: async () => 'me@example.test', getCurrentPhone: async () => '+8613800138000',
    getCurrentBindings: async () => [
      { type: 'dingTalk_dingTalkMessage', provider: 'dingTalk:dingTalkMessage', providerName: '本人钉钉', thirdPartyUserId: 'ding-member' },
      { type: 'weixin_corpMessage', provider: 'weixin:corpMessage', providerName: '本人企微', thirdPartyUserId: 'corp-member' },
      { type: 'weixin_officialMessage', provider: 'weixin:officialMessage', providerName: '本人微信', thirdPartyUserId: 'official-openid' },
    ],
    sendInline: async (...args) => calls.push(clone(args)),
    queryTemplates: () => assert.fail('trial must not query stored templates'),
    getSendTemplate: () => assert.fail('trial must not load a stored template'),
    createTemplate: () => assert.fail('trial must not persist templates'),
  }
}

test('seven provider payloads use explicit single recipients and saved configuration without mutating either', () => {
  assert.equal(Object.keys(channelTestAdapters).length, 7)
  const expected = {
    'email:embedded': { subject: 'Test title', text: 'Test message', sendTo: ['target@example.test'] },
    'dingTalk:dingTalkMessage': { agentId: '1001', message: 'Test message', userIdList: 'member', toAllUser: false },
    'weixin:corpMessage': { agentId: '1002', message: 'Test message', toUser: 'member' },
    'dingTalk:dingTalkRobotWebHook': { messageType: 'text', text: { content: 'Test message' }, at: { atAll: false } },
    'webhook:http': { method: 'POST', url: '', contextAsBody: false, body: '{"message":"Test message"}' },
    'sms:aliyunSms': { signName: '测试签名', code: 'SMS_REAL', phoneNumber: '13800138000' },
    'voice:aliyun': { templateType: 'tts', templateCode: 'TTS_REAL', ttsCode: 'TTS_REAL', calledShowNumbers: '01012345678', calledNumber: '13800138000', playTimes: 1 },
  }
  for (const [id, adapter] of Object.entries(channelTestAdapters)) {
    const record = config(id), before = clone(record)
    const recipient = { email: 'target@example.test', phone: '13800138000', member: 'member', openid: 'openid', group: '', endpoint: '' }[adapter.recipient]
    const result = buildChannelTest({ config: record, recipient, title: 'Test title', message: 'Test message' })
    assert.deepEqual(result.template.template, expected[id], id)
    assert.equal(result.template.configId, record.id)
    assert.equal(result.template.id, undefined)
    assert.deepEqual(result.context, Object.fromEntries((record.configuration.testTemplate?.parameters || []).map(row => [row.name, row.value])))
    assert.deepEqual(record, before)
    assert.equal(JSON.stringify(result).includes('secret'), false)
  }
  const voice = config('voice:aliyun'); voice.configuration.testTemplate.templateType = 'voice'
  assert.equal(buildChannelTest({ config: voice, recipient: '13800138000', title: 'T', message: 'M' }).template.template.templateType, 'voice')
})

for (const id of Object.keys(channelTestAdapters)) test(`${id}: unified lifecycle uses account/config target and inline sending only`, async () => {
  const api = apiFixture(), trial = useChannelTest(api)
  trial.show(context(config(id))); await flush()
  assert.equal(api.calls.length, 0)
  assert.equal(trial.model.value.canSend, true)
  assert.equal(trial.model.value.message, '这是一条来自测试平台的测试消息，收到说明测试渠道配置正确。')
  assert.equal(await trial.send(), true)
  assert.equal(api.calls.length, 1)
  assert.equal(api.calls[0][0], id)
  assert.equal(trial.model.value.stage, 'success')
  assert.ok(trial.model.value.sentTo)
  assert.ok(trial.model.value.sentAt)
  trial.again(); assert.equal(trial.model.value.stage, 'form')
  trial.close(); assert.equal(trial.model.value.open, false)
  assert.equal(trial.model.value.ownRecipient, '')
})

test('missing and failed self identity reads differ and retry preserves an explicit other recipient', async () => {
  const api = apiFixture(), trial = useChannelTest(api)
  api.getCurrentEmail = async () => ''
  trial.show(context()); await flush()
  assert.equal(trial.model.value.identityState, 'empty')
  assert.equal(trial.model.value.recipientMode, 'other')
  assert.equal(await trial.send(), false)
  trial.setAddress('other@example.test')
  api.getCurrentEmail = async () => { throw { status: 403 } }
  await trial.loadIdentity()
  assert.equal(trial.model.value.identityState, 'forbidden')
  assert.equal(trial.model.value.address, 'other@example.test')
  api.getCurrentEmail = async () => 'restored@example.test'
  await trial.loadIdentity()
  assert.equal(trial.model.value.recipientMode, 'other')
  assert.equal(await trial.send(), true)
  assert.deepEqual(api.calls[0][1].template.sendTo, ['other@example.test'])
})

test('self bindings require exact provider type and configuration', async () => {
  const api = apiFixture(), trial = useChannelTest(api)
  api.getCurrentBindings = async () => [
    { type: 'weixin_corpMessage', provider: 'another', thirdPartyUserId: 'wrong-config' },
    { type: 'other', provider: 'weixin:corpMessage', thirdPartyUserId: 'wrong-type' },
  ]
  trial.show(context(config('weixin:corpMessage'))); await flush()
  assert.equal(trial.model.value.identityState, 'empty')
  trial.setAddress('explicit-member'); assert.equal(await trial.send(), true)
  assert.equal(api.calls[0][1].template.toUser, 'explicit-member')
  trial.close(); api.getCurrentBindings = async () => [
    { type: 'weixin_corpMessage', provider: 'weixin:corpMessage', thirdPartyUserId: 'one' },
    { type: 'weixin_corpMessage', provider: 'weixin:corpMessage', thirdPartyUserId: 'two' },
  ]
  trial.show(context(config('weixin:corpMessage'))); await flush()
  assert.equal(trial.model.value.identityState, 'error')
})

test('single-recipient validation rejects lists, broadcasts, malformed addresses and phone numbers', () => {
  assert.ok(testRecipientIssue('openid', 'email@example.test'))
  assert.equal(testRecipientIssue('member', 'email@example.test'), '')
  for (const value of ['', 'bad', 'one@example.test,two@example.test', 'one@example.test;two@example.test', 'a b@example.test']) assert.ok(testRecipientIssue('email', value))
  for (const value of ['', '123', '13800138000,13900139000', '138****8000']) assert.ok(testRecipientIssue('phone', value))
  for (const kind of ['member', 'openid']) {
    for (const value of ['', '@all', 'all', 'one,two', 'one|two', 'one two']) assert.ok(testRecipientIssue(kind, value))
    assert.equal(testRecipientIssue(kind, 'member_01-AB'), '')
  }
  assert.equal(testRecipientIssue('email', ' name@example.test '), '')
  assert.equal(testRecipientIssue('phone', '+8613800138000'), '')
})

test('legacy configurations and unknown providers expose reasons and cannot send', async () => {
  for (const id of ['dingTalk:dingTalkMessage', 'weixin:corpMessage', 'sms:aliyunSms', 'voice:aliyun']) {
    const api = apiFixture(), trial = useChannelTest(api), record = config(id)
    record.configuration = {}
    trial.show(context(record)); await flush()
    assert.ok(trial.model.value.missing.length)
    assert.equal(await trial.send(), false); assert.deepEqual(api.calls, [])
  }
  for (const id of ['extension:custom', 'weixin:officialMessage']) {
    const api = apiFixture(), trial = useChannelTest(api)
    trial.show(context(config(id)))
    assert.equal(trial.model.value.supported, false)
    assert.equal(await trial.send(), false)
    assert.deepEqual(api.calls, [])
  }
})

test('permission and dirty state block opening/sending, while failure preserves inputs and server feedback', async () => {
  const api = apiFixture(), trial = useChannelTest(api), allowed = vue.ref(false), clean = vue.ref(true)
  const input = { ...context(), permitted: () => allowed.value, clean: () => clean.value }
  trial.show(input); assert.equal(trial.open.value, false)
  allowed.value = true; trial.show(input); await flush()
  trial.selectRecipient('other'); trial.setAddress('keep@example.test')
  clean.value = false; assert.equal(await trial.send(), false)
  clean.value = true; allowed.value = false; assert.equal(await trial.send(), false)
  allowed.value = true; api.sendInline = async () => { throw { response: { status: 400, data: { message: '服务商拒绝测试' } } } }
  assert.equal(await trial.send(), false)
  assert.equal(trial.model.value.error, '服务商拒绝测试')
  assert.equal(trial.model.value.address, 'keep@example.test')
  trial.again(); assert.equal(trial.model.value.address, 'keep@example.test')
  api.sendInline = async (...args) => api.calls.push(args)
  assert.equal(await trial.send(), true)
})

test('pending sends freeze inputs and duplicate actions; forced close and permission loss discard completions', async () => {
  const api = apiFixture(), trial = useChannelTest(api), allowed = vue.ref(true)
  let release
  api.sendInline = () => new Promise(resolve => { release = resolve })
  trial.show({ ...context(), permitted: () => allowed.value }); await flush()
  const sending = trial.send()
  assert.equal(trial.sending.value, true)
  trial.setAddress('changed@example.test'); trial.selectRecipient('other'); trial.close(); trial.show(context(config('webhook:http')))
  assert.equal(trial.model.value.address, '')
  assert.equal(trial.model.value.recipientMode, 'self')
  assert.equal(trial.configId.value, 'email:embedded')
  assert.equal(await trial.send(), false)
  allowed.value = false; release()
  assert.equal(await sending, false); assert.equal(trial.open.value, false)
  allowed.value = true; trial.show(context()); await flush()
  const old = trial.send(); trial.close(true); trial.show(context(config('webhook:http'))); release()
  assert.equal(await old, false); assert.equal(trial.model.value.stage, 'form')
  assert.equal(trial.configId.value, 'webhook:http')
})

test('late identity reads cannot overwrite a different channel, including delayed errors', async () => {
  const api = apiFixture(), trial = useChannelTest(api)
  let resolveEmail, rejectEmail
  api.getCurrentEmail = () => new Promise((resolve, reject) => { resolveEmail = resolve; rejectEmail = reject })
  trial.show(context()); trial.close(); trial.show(context(config('sms:aliyunSms'))); await flush()
  resolveEmail('old@example.test'); await flush()
  assert.equal(trial.model.value.ownRecipient, '+8613800138000')
  trial.close(); trial.show(context()); trial.close(); trial.show(context(config('webhook:http')))
  rejectEmail(new Error('old failure')); await flush()
  assert.equal(trial.model.value.identityState, 'ready')
  assert.equal(trial.model.value.fixedTarget, true)
})

test('saved configuration is snapshotted and sample parameters cannot redirect a trial', async () => {
  const api = apiFixture(), trial = useChannelTest(api), record = config('weixin:corpMessage')
  trial.show(context(record)); await flush(); record.configuration.agentId = 'modified-draft'
  await trial.send(); assert.equal(api.calls[0][1].template.agentId, '1002')
  for (const parameters of [[{ name: 'phoneNumber', value: 'another-recipient' }], [{ name: 'name', value: 'x' }, { name: ' name ', value: 'y' }], [{ name: '', value: 'x' }], [null], 'invalid']) {
    const sms = config('sms:aliyunSms'); sms.configuration.testTemplate.parameters = parameters
    assert.ok(testSettingsIssues('sms:aliyunSms', sms.configuration.testTemplate).includes('parameters'))
    assert.throws(() => buildChannelTest({ config: sms, recipient: '13800138000', title: 'T', message: 'M' }))
  }
})

test('test settings and AgentId round-trip through provider metadata and ordinary config payloads', () => {
  for (const id of ['dingTalk:dingTalkMessage', 'sms:aliyunSms', 'voice:aliyun']) {
    const record = config(id), [type, provider] = id.split(':')
    const channel = notificationChannels.find(item => item.id === id) || { id, type, provider, secretFields: ['secret'] }
    const definition = channelDefinition(channel, channelMetadata[id] || { properties: [] })
    assert.ok(definition.fields.some(field => field.key === (id.startsWith('dingTalk') ? 'agentId' : 'testTemplate')))
    const draft = createChannelConfigDraft(record, definition)
    const payload = channelConfigPayload(draft, record, definition)
    assert.deepEqual(payload.configuration, record.configuration)
    assert.deepEqual(validateChannelDraft(draft, record, definition), [])
    if (id.startsWith('dingTalk')) continue
    draft.configuration.testTemplate.parameters = [{ name: 'sample', value: 'new' }]
    assert.notDeepEqual(channelConfigPayload(draft, record, definition).configuration.testTemplate, record.configuration.testTemplate)
  }
  const official = config('weixin:officialMessage')
  const definition = channelDefinition({ id: 'weixin:officialMessage', type: 'weixin', provider: 'officialMessage', secretFields: ['secret'] }, { properties: [
    { id: 'appId', name: 'AppId', valueType: { type: 'string' } },
    { id: 'secret', name: 'AppSecret', valueType: { type: 'password' } },
  ] })
  assert.deepEqual(definition.fields.map(field => field.key), ['appId', 'secret'])
  official.configuration.testTemplate.parameters = [{ name: '', value: '' }]
  const draft = createChannelConfigDraft(official, definition)
  draft.configuration.appId = 'updated-official'
  assert.deepEqual(validateChannelDraft(draft, official, definition), [])
  const payload = channelConfigPayload(draft, official, definition)
  assert.equal(payload.configuration.appId, 'updated-official')
  assert.equal(payload.configuration.secret, official.configuration.secret)
  assert.deepEqual(payload.configuration.testTemplate, official.configuration.testTemplate)
})

test('settings editor uses named controls and immutable parameter rows, preserving unrelated nested fields', () => {
  const original = { templateType: 'tts', templateCode: 'TTS_REAL', custom: true, parameters: [{ name: 'name', value: 'old' }] }
  const props = vue.reactive({ channelId: 'voice:aliyun', value: clone(original), disabled: false })
  const editor = useChannelTestSettings(props, value => { props.value = value })
  editor.updateParameter(0, 'value', 'new'); editor.addParameter(); editor.removeParameter(1)
  assert.equal(props.value.parameters[0].value, 'new')
  assert.equal(original.parameters[0].value, 'old')
  assert.equal(props.value.custom, true)
  props.disabled = true; editor.update('templateCode', 'blocked')
  assert.equal(props.value.templateCode, 'TTS_REAL')
})
