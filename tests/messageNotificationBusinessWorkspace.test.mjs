import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'
import { channelProviders, channelTypes } from './messageNotificationChannelFixtures.mjs'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const cache = new Map()
const clone = value => JSON.parse(JSON.stringify(value))
const httpCalls = []
let httpResult
let httpFailure
const request = Object.fromEntries(['get', 'put', 'post', 'patch', 'remove'].map(method => [method, async (url, body) => {
  httpCalls.push([method, url, body])
  if (httpFailure) throw httpFailure
  return { success: true, result: httpResult }
}]))

// Execute the actual reactive workspace and HTTP adapters; only replace platform I/O.
function load(filename) {
  if (!filename.endsWith('.ts')) filename = existsSync(`${filename}.ts`) ? `${filename}.ts` : resolve(filename, 'index.ts')
  if (cache.has(filename)) return cache.get(filename)
  const { code } = transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' })
  const module = { exports: {} }
  const imports = name => {
    if (name === 'vue') return vue
    if (name === '@jetlinks-web/core') return { request }
    if (name.startsWith('.')) return load(resolve(dirname(filename), name))
    if (name.startsWith('@notify-manager-ui/')) return load(resolve(root, name.slice('@notify-manager-ui/'.length)))
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(imports, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}

const { useTemplateWorkspace } = load(resolve(root, 'views/system/MessageNotification/Templates/useTemplateWorkspace.ts'))
const { useTemplateCatalog } = load(resolve(root, 'views/system/MessageNotification/Templates/hooks/useTemplateCatalog.ts'))
const { messageNotificationApi } = load(resolve(root, 'api/notice/messageNotification.ts'))
const { NotificationRequestError } = load(resolve(root, 'api/notice/messageNotificationState.ts'))
const permissions = () => ({ query: vue.ref(true), add: vue.ref(true), update: vue.ref(true) })
const config = (id = 'smtp', type = 'email', provider = 'embedded') => ({ id, name: id, type, provider, configuration: {} })
const business = (id = 'actual-topic', provider = 'alarm-device') => ({ id: id ?? undefined, provider, name: '设备告警', state: 'disabled', channels: [] })
const template = (overrides = {}) => ({
  id: 'stored-template', name: '真实邮件', configId: 'smtp', type: 'email', provider: 'embedded',
  template: { subject: '真实标题', text: '真实正文 ${message}', providerExtra: 'keep', attachments: [] },
  variableDefinitions: [{ id: 'message', name: '消息', defaultValue: '真实保存值', expands: { businessType: 'string' } }],
  ...overrides,
})
const item = (providerId = 'actual-topic', record = template(), overrides = {}) => ({
  channel: { id: 'channel-real', providerId, name: '邮件', channelProvider: `notifier-${record.type}`,
    state: 'disabled', grant: { role: { idList: ['role-kept'] } },
    channelConfiguration: { templateId: record.id, variables: { message: { source: 'fixed', value: 'keep' } }, extra: 'kept' }, ...overrides },
  template: record,
})

function mockApi(initialConfigs = [config()]) {
  const calls = []
  const records = new Map()
  const api = {
    async queryTypes() { calls.push(['queryTypes']); return clone(channelTypes) },
    async queryProviders(type) { calls.push(['queryProviders', type]); return clone(channelProviders[type] || []) },
    async queryAllConfigs() { calls.push(['queryAllConfigs']); return clone(initialConfigs) },
    async getTemplateMetadata(type, provider) { calls.push(['getTemplateMetadata', type, provider]); return { properties: [] } },
    async queryBusinessVariables(id) { calls.push(['queryBusinessVariables', id]); return [{ id: 'message', name: '消息' }] },
    async getBusinessTemplate(id, channel) { calls.push(['getBusinessTemplate', id, channel]); return records.get(`${id}/${channel}`) },
    async saveBusinessTemplate(id, channel, value) {
      calls.push(['saveBusinessTemplate', id, channel, clone(value)])
      const saved = clone(value)
      saved.channel.id = 'channel-saved'; saved.channel.providerId = id
      saved.template.id = 'stored-template'
      saved.channel.channelConfiguration.templateId = saved.template.id
      records.set(`${id}/${channel}`, saved)
      return saved
    },
    async saveBusinessTemplates(provider, value) {
      calls.push(['saveBusinessTemplates', provider, clone(value)])
      const saved = clone(value)
      saved.provider.id = 'generated-topic-id'
      saved.channels[0].channel.id = 'generated-channel-id'
      saved.channels[0].channel.providerId = saved.provider.id
      saved.channels[0].template.id = 'generated-template-id'
      saved.channels[0].channel.channelConfiguration.templateId = saved.channels[0].template.id
      records.set(`${saved.provider.id}/${saved.channels[0].channel.channelProvider}`, saved.channels[0])
      return saved
    },
    async queryTemplates() { calls.push(['queryTemplates']); return { data: [] } },
    async getTemplate(id) { calls.push(['getTemplate', id]); return template({ id }) },
    async createTemplate(payload) { calls.push(['createTemplate', clone(payload)]) },
    async updateTemplate(payload) { calls.push(['updateTemplate', clone(payload)]) },
  }
  return { api, calls, records }
}

test('business drafts use the backend directory and reuse one exact-provider config snapshot', async () => {
  const io = mockApi([config(), config('other', 'email', 'otherVendor')])
  io.api.queryProviders = async type => type === 'email' ? [{ id: 'embedded' }, { id: 'otherVendor' }] : channelProviders[type]
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(null), 'email:embedded')
  assert.equal(workspace.isDefault.value, true)
  assert.equal(workspace.dirty.value, false)
  assert.equal(workspace.draft.value.configId, 'smtp')
  assert.deepEqual(workspace.configs.value.map(value => value.id), ['smtp'])
  workspace.draft.value.text = '邮件草稿'
  await workspace.loadBusiness(business(null), 'email:otherVendor')
  assert.equal(workspace.currentChannel.value.provider, 'otherVendor')
  assert.equal(workspace.isDefault.value, false)
  assert.equal(workspace.hasContent.value, false)
  assert.equal(workspace.draft.value.text, '')
  workspace.draft.value.templateJson = '{"body":"另一个提供商"}'
  await workspace.loadBusiness(business(null), 'email:embedded')
  assert.equal(workspace.draft.value.text, '邮件草稿')
  assert.equal(io.calls.filter(([name]) => name === 'queryAllConfigs').length, 1)
  assert.equal(io.calls.some(([name]) => name === 'getBusinessTemplate'), false)
})

test('channel configuration states use all exact enum provider pairs and survive selection changes without requests', async () => {
  const io = mockApi([
    { ...config(), type: { value: 'email', text: 'Email' }, provider: { value: 'embedded', text: 'SMTP' } },
    config('robot', 'dingTalk', 'dingTalkRobotWebHook'),
    config('foreign', 'voice', 'embedded'),
  ])
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(null), 'email:embedded')
  assert.equal(workspace.channelConfigurationStates.value['email:embedded'], 'ready')
  assert.equal(workspace.channelConfigurationStates.value['dingTalk:dingTalkRobotWebHook'], 'ready')
  assert.equal(workspace.channelConfigurationStates.value['dingTalk:dingTalkMessage'], 'empty')
  assert.equal(workspace.channelConfigurationStates.value['voice:aliyun'], 'empty')
  const before = { ...workspace.channelConfigurationStates.value }
  await workspace.loadBusiness(business(null), 'voice:aliyun')
  assert.deepEqual(workspace.channelConfigurationStates.value, before)
  assert.equal(io.calls.filter(([name]) => name === 'queryAllConfigs').length, 1)
  assert.equal(workspace.isDefault.value, true)
  assert.equal(workspace.channelConfigurationStates.value['voice:aliyun'], 'empty')
})

test('configuration state refresh retains loading and failures instead of reporting unreadable channels as empty', async () => {
  const io = mockApi()
  const catalog = useTemplateCatalog(vue.ref(true), vue.ref('email:embedded'), io.api)
  await catalog.loadCatalog()
  assert.ok(Object.values(catalog.channelConfigurationStates.value).every(state => state === 'idle'))
  let resolveConfigs
  io.api.queryAllConfigs = () => new Promise(resolve => { resolveConfigs = resolve })
  const pending = catalog.loadConfigs()
  assert.ok(Object.values(catalog.channelConfigurationStates.value).every(state => state === 'loading'))
  resolveConfigs([config('voice', 'voice', 'aliyun')])
  await pending
  assert.equal(catalog.channelConfigurationStates.value['voice:aliyun'], 'ready')
  assert.equal(catalog.channelConfigurationStates.value['email:embedded'], 'empty')
  io.api.queryAllConfigs = async () => { throw new NotificationRequestError('forbidden') }
  await catalog.loadConfigs(true)
  assert.ok(Object.values(catalog.channelConfigurationStates.value).every(state => state === 'forbidden'))
  io.api.queryAllConfigs = async () => []
  await catalog.loadConfigs(true)
  assert.ok(Object.values(catalog.channelConfigurationStates.value).every(state => state === 'empty'))
})

test('a real business template wins over prototypes and single-channel saving preserves state grant and variables', async () => {
  const io = mockApi()
  io.records.set('actual-topic/notifier-email', item())
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(), 'email:embedded')
  assert.equal(workspace.isDefault.value, false)
  assert.equal(workspace.entry.value.existing, true)
  assert.equal(workspace.draft.value.subject, '真实标题')
  assert.equal(workspace.draft.value.variables[0].defaultValue, '真实保存值')
  workspace.draft.value.subject = '更新标题'
  assert.equal(await workspace.saveTemplate(), true)
  const call = io.calls.find(([name]) => name === 'saveBusinessTemplate')
  assert.deepEqual(call.slice(1, 3), ['actual-topic', 'notifier-email'])
  assert.equal(call[3].channel.state, 'disabled')
  assert.deepEqual(call[3].channel.grant, { role: { idList: ['role-kept'] } })
  assert.deepEqual(call[3].channel.channelConfiguration.variables.message, { source: 'fixed', value: 'keep' })
  assert.equal(call[3].channel.channelConfiguration.extra, 'kept')
  assert.equal(call[3].template.template.providerExtra, 'keep')
  assert.equal(io.calls.some(([name]) => ['saveBusinessTemplates', 'createTemplate', 'updateTemplate'].includes(name)), false)
  assert.equal(workspace.business.value.state, 'disabled')
  assert.equal(workspace.dirty.value, false)
})

test('first save sends only this channel with a disabled topic and writes back the returned actual ID', async () => {
  const io = mockApi([config(), config('http', 'webhook', 'http')])
  const workspace = useTemplateWorkspace(permissions(), io.api)
  const selected = business(null)
  selected.channels = [{ channelProvider: 'notifier-sms', name: '短信占位' }]
  await workspace.loadBusiness(selected, 'webhook:http')
  workspace.draft.value.templateJson = '{"body":"未保存的Webhook"}'
  await workspace.loadBusiness(selected, 'email:embedded')
  assert.equal(await workspace.saveTemplate(), true)
  const request = io.calls.find(([name]) => name === 'saveBusinessTemplates')
  assert.equal(request[1], 'alarm-device')
  assert.equal(request[2].provider.state, 'disabled')
  assert.equal(request[2].provider.id, undefined)
  assert.equal(request[2].channels.length, 1)
  assert.equal(request[2].channels[0].channel.channelProvider, 'notifier-email')
  assert.equal(workspace.business.value.id, 'generated-topic-id')
  assert.equal(workspace.draft.value.id, 'generated-template-id')
  assert.deepEqual(workspace.business.value.channels.map(value => value.channelProvider), ['notifier-sms', 'notifier-email'])
  assert.equal(workspace.isDefault.value, false)
  await workspace.loadBusiness(selected, 'webhook:http')
  assert.equal(workspace.business.value.id, 'generated-topic-id')
  assert.equal(workspace.draft.value.templateJson, '{"body":"未保存的Webhook"}')
  assert.equal(await workspace.saveTemplate(), true)
  assert.equal(io.calls.filter(([name]) => name === 'saveBusinessTemplates').length, 1)
  assert.equal(io.calls.find(([name]) => name === 'saveBusinessTemplate')[1], 'generated-topic-id')
})

test('unconfigured and ambiguous configs still allow drafts but cannot save until an exact config is selected', async () => {
  for (const choices of [[], [config('first'), config('second'), config('foreign', 'email', 'other')]]) {
    const io = mockApi(choices)
    const workspace = useTemplateWorkspace(permissions(), io.api)
    await workspace.loadBusiness(business(null), 'email:embedded')
    assert.equal(workspace.detailState.value, 'ready')
    assert.ok(workspace.draft.value.text)
    assert.equal(workspace.draft.value.configId, '')
    assert.equal(workspace.canSave.value, false)
    assert.equal(await workspace.saveTemplate(), false)
    workspace.draft.value.configId = 'foreign'
    assert.equal(workspace.canSave.value, false)
    if (choices.length) { workspace.draft.value.configId = 'second'; assert.equal(workspace.canSave.value, true) }
  }
})

test('business config deep links select the requested exact config among multiple choices without making the draft dirty', async () => {
  const io = mockApi([config('smtp-a'), config('smtp-b')])
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(null), 'email:embedded', 'smtp-b')
  assert.equal(workspace.draft.value.configId, 'smtp-b')
  assert.equal(workspace.dirty.value, false)
  assert.equal(workspace.hasDirtyDrafts.value, false)
  assert.equal(workspace.canSave.value, true)
  assert.equal(await workspace.saveTemplate(), true)
  const saved = io.calls.find(([name]) => name === 'saveBusinessTemplates')
  assert.equal(saved[2].channels[0].template.configId, 'smtp-b')
  assert.equal(workspace.dirty.value, false)
})

test('inaccessible or wrong-provider config deep links never fall back to another sole configuration', async () => {
  for (const requested of ['inaccessible', 'foreign']) {
    const io = mockApi([config('smtp-a'), config('foreign', 'email', 'other-vendor')])
    const workspace = useTemplateWorkspace(permissions(), io.api)
    await workspace.loadBusiness(business(null), 'email:embedded', requested)
    assert.equal(workspace.draft.value.configId, requested)
    assert.equal(workspace.dirty.value, false)
    assert.equal(workspace.canSave.value, false)
    assert.equal(await workspace.saveTemplate(), false)
    await workspace.refreshConfigs()
    await workspace.loadBusiness(business(null), 'email:embedded', 'smtp-a')
    assert.equal(workspace.draft.value.configId, requested)
    assert.equal(workspace.canSave.value, false)
    assert.equal(io.calls.some(([name]) => name === 'saveBusinessTemplates'), false)
    workspace.draft.value.configId = 'smtp-a'
    assert.equal(workspace.canSave.value, true)
  }
})

test('business config deep links preserve persisted and previously selected draft configurations', async () => {
  const io = mockApi([config('smtp-a'), config('smtp-b')])
  io.records.set('actual-topic/notifier-email', item('actual-topic', template({ configId: 'smtp-a' })))
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(), 'email:embedded', 'smtp-b')
  assert.equal(workspace.draft.value.configId, 'smtp-a')
  assert.equal(workspace.dirty.value, false)
  workspace.draft.value.configId = 'smtp-b'
  await workspace.loadBusiness(business(), 'email:embedded', 'smtp-a')
  assert.equal(workspace.draft.value.configId, 'smtp-b')
  assert.equal(workspace.dirty.value, true)
  await workspace.discardDraft()
  assert.equal(workspace.draft.value.configId, 'smtp-a')
  await workspace.loadBusiness(business(null), 'email:embedded', 'smtp-b')
  workspace.draft.value.text = '未保存的模板草稿'
  await workspace.loadBusiness(business(null), 'email:embedded', 'smtp-a')
  assert.equal(workspace.draft.value.configId, 'smtp-b')
  assert.equal(workspace.draft.value.text, '未保存的模板草稿')
  assert.equal(workspace.dirty.value, true)
})

test('another provider binding never supplies content to the selected provider and its one channel is replaced on save', async () => {
  const io = mockApi([config('robot', 'dingTalk', 'dingTalkRobotWebHook')])
  const existing = template({ type: 'dingTalk', provider: 'dingTalkMessage', configId: 'corp', template: { message: '公司私有正文', agentId: 'old-agent' } })
  io.records.set('actual-topic/notifier-dingTalk', item('actual-topic', existing))
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(), 'dingTalk:dingTalkRobotWebHook')
  assert.equal(workspace.entry.value.existing, false)
  assert.equal(workspace.isDefault.value, true)
  assert.equal(workspace.draft.value.id, '')
  assert.equal(workspace.draft.value.configId, 'robot')
  assert.equal(workspace.draft.value.templateJson.includes('公司私有正文'), false)
  assert.equal(await workspace.saveTemplate(), true)
  const call = io.calls.find(([name]) => name === 'saveBusinessTemplate')
  assert.equal(call[2], 'notifier-dingTalk')
  assert.equal(call[3].template.provider, 'dingTalkRobotWebHook')
  assert.equal(call[3].template.configId, 'robot')
  assert.equal(call[3].channel.state, 'disabled')
})

test('forbidden queries and broken template references stay errors instead of prototype defaults', async () => {
  for (const failure of ['forbidden', 'missing', 'wrong-id']) {
    const io = mockApi()
    const selected = business()
    selected.channels = [{ channelProvider: 'notifier-email', channelConfiguration: { templateId: 'stored-template' } }]
    io.api.getBusinessTemplate = async () => {
      if (failure === 'forbidden') throw { response: { status: 403 } }
      if (failure === 'missing') return undefined
      return item('actual-topic', template({ id: 'unexpected' }), { channelConfiguration: { templateId: 'stored-template' } })
    }
    const workspace = useTemplateWorkspace(permissions(), io.api)
    await workspace.loadBusiness(selected, 'email:embedded')
    assert.equal(workspace.detailState.value, failure === 'forbidden' ? 'forbidden' : 'error')
    assert.equal(workspace.draft.value, undefined)
    assert.equal(workspace.isDefault.value, false)
    assert.equal(await workspace.saveTemplate(), false)
  }
})

test('a confirmed business departure clears all its channel drafts and a cancelled edit restores only this channel', async () => {
  const io = mockApi([config(), config('http', 'webhook', 'http')])
  const workspace = useTemplateWorkspace(permissions(), io.api)
  const selected = business(null)
  await workspace.loadBusiness(selected, 'email:embedded')
  const baseline = workspace.draft.value.text
  workspace.draft.value.text = '邮件修改'
  await workspace.loadBusiness(selected, 'webhook:http')
  const webhook = workspace.draft.value.templateJson
  workspace.draft.value.templateJson = '{"body":"草稿"}'
  await workspace.discardDraft()
  assert.equal(workspace.draft.value.templateJson, webhook)
  assert.equal(workspace.hasDirtyDrafts.value, true)
  workspace.discardBusinessDrafts()
  assert.equal(workspace.hasDirtyDrafts.value, false)
  await workspace.loadBusiness(business(null, 'scene'), 'email:embedded')
  await workspace.loadBusiness(selected, 'email:embedded')
  assert.equal(workspace.draft.value.text, baseline)
})

test('restore default retains persisted identity and config, and cancellation recovers actual saved content', async () => {
  const io = mockApi()
  io.records.set('actual-topic/notifier-email', item())
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(), 'email:embedded')
  workspace.restoreDefault()
  assert.notEqual(workspace.draft.value.subject, '真实标题')
  assert.equal(workspace.draft.value.id, 'stored-template')
  assert.equal(workspace.draft.value.configId, 'smtp')
  assert.equal(workspace.dirty.value, true)
  await workspace.discardDraft()
  assert.equal(workspace.draft.value.subject, '真实标题')
  assert.equal(workspace.draft.value.variables[0].defaultValue, '真实保存值')
})

test('late business responses cannot replace a later channel selection', async () => {
  const io = mockApi([config(), config('http', 'webhook', 'http')])
  let finish
  io.api.getBusinessTemplate = (id, channel) => channel === 'notifier-email'
    ? new Promise(resolve => { finish = resolve }) : Promise.resolve(undefined)
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadCatalog()
  const pending = workspace.loadBusiness(business(), 'email:embedded')
  while (!finish) await new Promise(resolve => setImmediate(resolve))
  await workspace.loadBusiness(business(), 'webhook:http')
  finish(item())
  await pending
  assert.equal(workspace.channelId.value, 'webhook:http')
  assert.equal(workspace.draft.value.type, 'webhook')
})

test('unknown providers with successful empty metadata have editable clean empty drafts', async () => {
  const io = mockApi([config('extension', 'extension', 'custom')])
  io.api.queryTypes = async () => [{ id: 'extension', name: '扩展' }]
  io.api.queryProviders = async () => [{ id: 'custom', name: '自定义' }]
  io.api.getTemplateMetadata = async () => undefined
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(null, 'unknown-business'), 'extension:custom')
  assert.equal(workspace.metadata.value, undefined)
  assert.equal(workspace.metadataState.value, 'ready')
  assert.equal(workspace.isDefault.value, false)
  assert.equal(workspace.hasContent.value, false)
  assert.equal(workspace.dirty.value, false)
  workspace.draft.value.templateJson = '{"custom":"value"}'
  assert.equal(await workspace.saveTemplate(), true)
})

test('failed first save retains its draft without making another creation request', async () => {
  const io = mockApi()
  io.api.saveBusinessTemplates = async (...args) => { io.calls.push(['saveBusinessTemplates', ...clone(args)]); throw new Error('connection lost') }
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(null), 'email:embedded')
  workspace.draft.value.text = '仍保留的编辑'
  assert.equal(await workspace.saveTemplate(), false)
  await Promise.resolve()
  assert.equal(workspace.saveState.value, 'error')
  assert.equal(workspace.business.value.id, undefined)
  assert.equal(workspace.draft.value.text, '仍保留的编辑')
  assert.equal(io.calls.filter(([name]) => name === 'saveBusinessTemplates').length, 1)
  assert.equal(workspace.saveOutcomeUnknown.value, true)
  assert.equal(await workspace.saveTemplate(), false)
  assert.equal(io.calls.filter(([name]) => name === 'saveBusinessTemplates').length, 1)
  await workspace.loadBusiness(business(null), 'email:embedded')
  assert.equal(workspace.saveOutcomeUnknown.value, true)
  workspace.resetBusinessIdentity(business(null))
  assert.equal(workspace.saveOutcomeUnknown.value, false)
})

test('a malformed first-save success locks retries, while a definite backend rejection remains retryable', async () => {
  for (const mode of ['missing-response', 'missing-id', 'rejected']) {
    const io = mockApi()
    io.api.saveBusinessTemplates = async () => {
      if (mode === 'rejected') throw { response: { status: 403 } }
      return mode === 'missing-response' ? undefined : { provider: {}, channels: [] }
    }
    const workspace = useTemplateWorkspace(permissions(), io.api)
    await workspace.loadBusiness(business(null), 'email:embedded')
    assert.equal(await workspace.saveTemplate(), false)
    assert.equal(workspace.saveOutcomeUnknown.value, mode !== 'rejected')
    assert.equal(workspace.canSave.value, mode === 'rejected')
    assert.equal(workspace.business.value.id, undefined)
  }
})

test('first-save gateway, server and timeout failures lock repeated creation despite explicit failure flags', async () => {
  const failures = [
    ...[408, 499, 500, 502, 503, 504, 520, 521, 522, 523, 524].map(status => ({ response: { status, data: { success: false, status } } })),
    { success: false, status: 502 },
    { success: false, status: 504, data: { status: 400 } },
    { response: { status: 502, data: { success: false, status: 400 } } },
    { success: false },
  ]
  for (const failure of failures) {
    const io = mockApi()
    io.api.saveBusinessTemplates = async (...args) => {
      io.calls.push(['saveBusinessTemplates', ...clone(args)])
      throw new NotificationRequestError('error', failure)
    }
    const workspace = useTemplateWorkspace(permissions(), io.api)
    await workspace.loadBusiness(business(null), 'email:embedded')
    workspace.draft.value.text = '连接中断后仍保留的编辑'
    assert.equal(await workspace.saveTemplate(), false, JSON.stringify(failure))
    assert.equal(workspace.saveOutcomeUnknown.value, true, JSON.stringify(failure))
    assert.equal(workspace.canSave.value, false)
    assert.equal(workspace.draft.value.text, '连接中断后仍保留的编辑')
    assert.equal(await workspace.saveTemplate(), false)
    assert.equal(io.calls.filter(([name]) => name === 'saveBusinessTemplates').length, 1)
    assert.equal(workspace.business.value.id, undefined)
  }
})

test('definite HTTP and platform-envelope client rejections allow a corrected first save to retry', async () => {
  const failures = [
    ...[400, 401, 403, 409, 422].map(status => ({ response: { status } })),
    { success: false, status: 400, message: 'error.template_type_mismatch' },
    { success: false, status: 403, message: 'error.access_denied' },
  ]
  for (const failure of failures) {
    const io = mockApi()
    const save = io.api.saveBusinessTemplates
    let rejected = false
    io.api.saveBusinessTemplates = async (...args) => {
      if (!rejected) {
        rejected = true
        io.calls.push(['saveBusinessTemplates', ...clone(args)])
        throw new NotificationRequestError('error', failure)
      }
      return save(...args)
    }
    const workspace = useTemplateWorkspace(permissions(), io.api)
    await workspace.loadBusiness(business(null), 'email:embedded')
    assert.equal(await workspace.saveTemplate(), false, JSON.stringify(failure))
    assert.equal(workspace.saveOutcomeUnknown.value, false, JSON.stringify(failure))
    assert.equal(workspace.canSave.value, true)
    workspace.draft.value.subject = '修正后的模板'
    assert.equal(await workspace.saveTemplate(), true)
    assert.equal(io.calls.filter(([name]) => name === 'saveBusinessTemplates').length, 2)
    assert.equal(workspace.business.value.id, 'generated-topic-id')
  }
})

test('available variables include unused backend fields without adding them to stored declarations', async () => {
  const io = mockApi()
  io.records.set('actual-topic/notifier-email', item())
  io.api.queryBusinessVariables = async () => [{ id: 'unusedField', name: '后端未使用字段', type: 'date', required: true }, { id: 'message', name: '后端名称' }]
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(), 'email:embedded')
  assert.equal(workspace.availableVariables.value.find(value => value.id === 'unusedField').required, true)
  assert.equal(workspace.availableVariables.value.find(value => value.id === 'message').name, '消息')
  assert.equal(workspace.draft.value.variables.some(value => value.id === 'unusedField'), false)
  workspace.draft.value.variables[0].name = '当前编辑名称'
  assert.equal(workspace.availableVariables.value.find(value => value.id === 'message').name, '当前编辑名称')
  await workspace.loadBusiness(business(null), 'email:embedded')
  assert.ok(workspace.availableVariables.value.some(value => value.id === 'notifyTime'))
})

test('partial provider failures keep successful channels and an explicit reload refreshes choices without losing drafts', async () => {
  const io = mockApi()
  let failed = true
  let queried = 0
  io.api.queryProviders = async type => {
    ++queried
    if (failed && type === 'sms') throw new Error('SMS directory unavailable')
    return channelProviders[type]
  }
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(null), 'email:embedded')
  assert.equal(workspace.catalogState.value, 'error')
  assert.ok(workspace.channels.value.some(value => value.id === 'email:embedded'))
  assert.equal(workspace.channels.value.some(value => value.id === 'sms:aliyunSms'), false)
  workspace.draft.value.text = '重读目录仍保留'
  failed = false
  await workspace.reloadCatalog()
  assert.equal(workspace.catalogState.value, 'ready')
  assert.ok(workspace.channels.value.some(value => value.id === 'sms:aliyunSms'))
  assert.equal(workspace.draft.value.text, '重读目录仍保留')
  assert.equal(queried, channelTypes.length * 2)
  assert.equal(io.calls.filter(([name]) => name === 'queryAllConfigs').length, 2)
})

test('channel-wide template lists survive business switches and save upserts only the current actual template', async () => {
  const io = mockApi()
  io.records.set('actual-topic/notifier-email', item())
  io.api.queryTemplates = async () => { io.calls.push(['queryTemplates']); return { data: [template(), template({ id: 'other-business-template' }), template({ id: 'foreign', provider: 'other' })] } }
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(), 'email:embedded')
  assert.deepEqual(workspace.templates.value.map(value => value.id), ['stored-template', 'other-business-template'])
  await workspace.loadBusiness(business('scene-topic', 'scene'), 'email:embedded')
  assert.deepEqual(workspace.templates.value.map(value => value.id), ['stored-template', 'other-business-template'])
  await workspace.loadBusiness(business(), 'email:embedded')
  assert.equal(io.calls.filter(([name]) => name === 'queryTemplates').length, 1)
  workspace.draft.value.subject = '单条更新'
  assert.equal(await workspace.saveTemplate(), true)
  assert.equal(workspace.templates.value.length, 2)
  assert.equal(workspace.templates.value.find(value => value.id === 'other-business-template').name, '真实邮件')
  assert.equal(workspace.templates.value.find(value => value.id === 'stored-template').template.subject, '单条更新')
})

test('template-list failure stays separate from the valid single-business template detail', async () => {
  const io = mockApi()
  io.records.set('actual-topic/notifier-email', item())
  io.api.queryTemplates = async () => { throw new Error('list offline') }
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(), 'email:embedded')
  assert.equal(workspace.listState.value, 'error')
  assert.equal(workspace.detailState.value, 'ready')
  assert.equal(workspace.draft.value.subject, '真实标题')
  assert.equal(workspace.isDefault.value, false)
})

test('a completed save updates its original business without replacing a later selection', async () => {
  const io = mockApi()
  let finish
  io.api.saveBusinessTemplates = async (_provider, payload) => new Promise(resolve => {
    finish = () => {
      const saved = clone(payload)
      saved.provider.id = 'late-saved-topic'
      saved.channels[0].channel.providerId = 'late-saved-topic'
      saved.channels[0].template.id = 'late-saved-template'
      saved.channels[0].channel.channelConfiguration.templateId = 'late-saved-template'
      resolve(saved)
    }
  })
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(null), 'email:embedded')
  const pending = workspace.saveTemplate()
  await workspace.loadBusiness(business(null, 'scene'), 'email:embedded')
  finish()
  assert.equal(await pending, true)
  assert.equal(workspace.business.value.provider, 'scene')
  assert.equal(workspace.business.value.id, undefined)
  assert.equal(workspace.entry.value.existing, false)
  await workspace.loadBusiness(business(null), 'email:embedded')
  assert.equal(workspace.business.value.id, 'late-saved-topic')
  assert.equal(workspace.draft.value.id, 'late-saved-template')
})

test('restoring defaults keeps names descriptions recipients and app selections', async () => {
  const io = mockApi()
  const saved = template({ name: '我的模板名', description: '我的描述', template: { subject: '定制', text: '定制正文', sendTo: ['${receiver}'], attachments: [{ name: 'old.pdf', location: 'file-id' }] }, variableDefinitions: [{ id: 'receiver', name: '接收人' }] })
  io.records.set('actual-topic/notifier-email', item('actual-topic', saved))
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadBusiness(business(), 'email:embedded')
  workspace.restoreDefault()
  assert.equal(workspace.draft.value.name, '我的模板名')
  assert.equal(workspace.draft.value.description, '我的描述')
  assert.deepEqual(workspace.draft.value.sendTo, ['${receiver}'])
  assert.ok(workspace.draft.value.variables.some(value => value.id === 'receiver'))
  assert.deepEqual(workspace.draft.value.attachments, [])
  const corp = template({ type: 'weixin', provider: 'corpMessage', configId: 'corp', template: { agentId: 'actual-agent', toUser: ['actual-user'], toParty: ['actual-org'], toTag: ['actual-tag'], message: '定制' } })
  io.records.set('actual-topic/notifier-weixin', item('actual-topic', corp))
  await workspace.loadBusiness(business(), 'weixin:corpMessage')
  workspace.restoreDefault()
  const value = JSON.parse(workspace.draft.value.templateJson)
  assert.equal(value.agentId, 'actual-agent')
  assert.deepEqual(value.toUser, ['actual-user'])
  assert.deepEqual(value.toParty, ['actual-org'])
  assert.deepEqual(value.toTag, ['actual-tag'])
})

test('independent old template links read and save the actual ID without any business request', async () => {
  const io = mockApi()
  const workspace = useTemplateWorkspace(permissions(), io.api)
  await workspace.loadChannel('email:embedded', 'independent-id')
  assert.equal(workspace.business.value, undefined)
  assert.equal(workspace.draft.value.id, 'independent-id')
  workspace.draft.value.subject = '独立模板修改'
  assert.equal(await workspace.saveTemplate(), true)
  assert.equal(io.calls.find(([name]) => name === 'updateTemplate')[1].id, 'independent-id')
  assert.equal(io.calls.some(([name]) => ['getBusinessTemplate', 'saveBusinessTemplate', 'saveBusinessTemplates'].includes(name)), false)
})

test('template HTTP metadata accepts absence and empty properties while failures remain explicit', async () => {
  httpCalls.length = 0; httpFailure = undefined; httpResult = {}
  assert.deepEqual(await messageNotificationApi.getTemplateMetadata('extension/type', 'custom?provider'), { properties: [] })
  assert.equal(httpCalls[0][1], '/notifier/template/extension%2Ftype/custom%3Fprovider/config/metadata')
  httpResult = null
  assert.equal(await messageNotificationApi.getTemplateMetadata('webhook', 'http'), undefined)
  httpFailure = { response: { status: 403 } }
  await assert.rejects(messageNotificationApi.getBusinessTemplate('actual/id', 'notifier-email'), error => error.kind === 'forbidden')
  httpFailure = undefined; httpResult = { channel: {}, template: null }
  await assert.rejects(messageNotificationApi.getBusinessTemplate('actual/id', 'notifier-email'))
})
