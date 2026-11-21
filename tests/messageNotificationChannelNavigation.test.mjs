import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { transformSync } from 'esbuild'
import { reactive } from 'vue'
import * as vue from 'vue'
import { createI18n } from 'vue-i18n'

const root = resolve(import.meta.dirname, '../views/system/MessageNotification')
const locale = JSON.parse(readFileSync(resolve(import.meta.dirname, '../locales/lang/zh.json'), 'utf8'))
const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh: locale } })
function load(path) {
  const { code } = transformSync(readFileSync(resolve(root, path), 'utf8'), { loader: 'ts', format: 'cjs' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'vue') return vue
    if (name === 'vue-i18n') return { useI18n: () => i18n.global }
    if (name === '../../shared') return load('shared/catalog.ts')
    throw new Error(`Unexpected dependency in pure navigation test: ${name}`)
  }, module, module.exports)
  return module.exports
}
const { useTemplateChannelNavigation } = load('Templates/hooks/useTemplateChannelNavigation.ts')
const channel = (type, provider, providerName = provider, typeName = type) => ({
  id: `${type}:${provider}`, type, provider, providerName, typeName, name: `${typeName} · ${providerName}`,
})
const fixture = [
  channel('email', 'embedded'),
  channel('dingTalk', 'dingTalkRobotWebHook'), channel('dingTalk', 'customDing'), channel('dingTalk', 'dingTalkMessage'),
  channel('weixin', 'corpMessage'),
  channel('customType', 'primary'), channel('customType', 'secondary'), channel('sms', 'aliyunSms'),
]
function setup(channels = fixture, value = 'email:embedded', configurationStates = {}) {
  const props = reactive({
    channels: channels.map(item => ({ ...item })), value, configurationStates: { ...configurationStates },
    configurationsByChannel: {}, activeConfigId: undefined,
  })
  const events = []
  const result = useTemplateChannelNavigation(props, (name, id, ...config) => {
    events.push([name, id, ...config])
    props.value = id
    props.activeConfigId = config[0]
  })
  return { props, events, result }
}

test('grouping retains every available provider exactly once, including extension providers and types', () => {
  const { result } = setup()
  assert.deepEqual(result.groups.value.flatMap(group => group.channels.map(item => item.id)).sort(), fixture.map(item => item.id).sort())
  assert.deepEqual(result.groups.value.map(group => group.key), ['email:embedded', 'dingTalk', 'weixin', 'customType:primary', 'customType:secondary', 'sms:aliyunSms'])
  assert.deepEqual(result.groups.value.find(group => group.key === 'dingTalk').channels.map(item => item.provider), ['dingTalkRobotWebHook', 'customDing', 'dingTalkMessage'])
  assert.deepEqual(result.groups.value.filter(group => group.key.startsWith('customType:')).map(group => group.label),
    ['customType · primary', 'customType · secondary'])
})

test('template navigation uses channel directory type names and DingTalk provider labels', () => {
  const { result } = setup([
    channel('webhook', 'http', 'HTTP', 'WebHook'),
    channel('weixin', 'corpMessage', '工作通知', '企业微信'),
    channel('sms', 'aliyunSms', '阿里云短信', '短信'),
    channel('email', 'embedded'),
    channel('voice', 'aliyun', '阿里云语音', '语音'),
    channel('dingTalk', 'dingTalkRobotWebHook', '群消息'),
    channel('dingTalk', 'dingTalkMessage', '应用消息'),
  ])
  assert.deepEqual(result.groups.value.map(group => group.label), ['WebHook', '微信', '短信', '邮件', '语音', '钉钉'])
  result.selectGroup('dingTalk')
  assert.deepEqual(result.subChannels.value.map(item => item.label), ['群机器人', '工作通知'])
})

test('primary family selection emits its real work provider ID rather than a visual grouping key', () => {
  const { result, props, events } = setup()
  result.selectGroup('dingTalk')
  assert.equal(props.value, 'dingTalk:dingTalkMessage')
  assert.deepEqual(events, [['change', 'dingTalk:dingTalkMessage']])
  assert.equal(result.activeGroup.value.key, 'dingTalk')
  result.selectGroup('weixin')
  assert.equal(props.value, 'weixin:corpMessage')
  assert.deepEqual(events.at(-1), ['change', 'weixin:corpMessage'])
  assert.deepEqual(result.subChannels.value, [])
})

test('subtabs keep exact provider identities and repeated current-family clicks retain the selected subtype', () => {
  const { result, props, events } = setup()
  result.selectGroup('dingTalk')
  result.selectChannel('dingTalk:dingTalkRobotWebHook')
  assert.equal(props.value, 'dingTalk:dingTalkRobotWebHook')
  assert.deepEqual(events.at(-1), ['change', 'dingTalk:dingTalkRobotWebHook'])
  const count = events.length
  result.selectGroup('dingTalk')
  result.selectGroup('dingTalk')
  assert.equal(props.value, 'dingTalk:dingTalkRobotWebHook')
  assert.equal(events.length, count)
  assert.deepEqual(result.subChannels.value.map(item => item.id), ['dingTalk:dingTalkRobotWebHook', 'dingTalk:customDing', 'dingTalk:dingTalkMessage'])
  assert.equal(result.subChannels.value.find(item => item.id === 'dingTalk:customDing').label, 'customDing')
})

test('configured robots appear as distinct named tabs and emit their configuration ID', () => {
  const { result, props, events } = setup(fixture, 'dingTalk:dingTalkMessage')
  props.configurationsByChannel['dingTalk:dingTalkRobotWebHook'] = [{ id: 'robot-a', name: '告警群' }, { id: 'robot-b', name: '告警群' }]
  assert.deepEqual(result.subChannels.value.map(tab => tab.label), ['群机器人·告警群', '群机器人·告警群', 'customDing', '工作通知'])
  assert.equal(result.activeTabKey.value, 'dingTalk:dingTalkMessage')
  const [first, second] = result.subChannels.value
  assert.notEqual(first.key, second.key)
  result.selectChannel(second.key)
  assert.deepEqual(events.at(-1), ['change', 'dingTalk:dingTalkRobotWebHook', 'robot-b'])
  assert.equal(result.activeTabKey.value, second.key)
  props.configurationsByChannel['dingTalk:dingTalkRobotWebHook'][1].name = '值班群'
  assert.equal(result.subChannels.value[1].label, '群机器人·值班群')
  assert.equal(result.activeTabKey.value, second.key)
})

test('Webhook tabs select their own configuration rather than the first Webhook', () => {
  const { result, props, events } = setup([channel('webhook', 'http')], 'webhook:http')
  props.configurationsByChannel['webhook:http'] = [{ id: 'hook-a', name: '告警回调' }, { id: 'hook-b', name: '工单回调' }]
  assert.deepEqual(result.subChannels.value.map(tab => tab.label), ['告警回调', '工单回调'])
  result.selectChannel(result.subChannels.value[1].key)
  assert.deepEqual(events.at(-1), ['change', 'webhook:http', 'hook-b'])
  assert.equal(result.activeTabKey.value, 'webhook:http:hook-b')
})

test('a family without a built-in work provider falls back only to its first actual backend entry', () => {
  const entries = [channel('dingTalk', 'vendorA'), channel('dingTalk', 'vendorB'), channel('customType', 'primary')]
  const { result, props, events } = setup(entries, '')
  result.selectGroup('dingTalk')
  assert.equal(props.value, 'dingTalk:vendorA')
  result.selectGroup('customType:primary')
  assert.equal(props.value, 'customType:primary')
  assert.deepEqual(result.subChannels.value, [])
  assert.deepEqual(events, [['change', 'dingTalk:vendorA'], ['change', 'customType:primary']])
})

test('catalog refresh recomputes families and subtabs while preserving a surviving selected provider', () => {
  const { result, props, events } = setup(fixture, 'dingTalk:dingTalkRobotWebHook')
  props.channels = [channel('dingTalk', 'dingTalkRobotWebHook'), channel('dingTalk', 'newProvider'), channel('newType', 'newProvider')]
  assert.equal(result.activeGroup.value.key, 'dingTalk')
  assert.deepEqual(result.subChannels.value.map(item => item.id), ['dingTalk:dingTalkRobotWebHook', 'dingTalk:newProvider'])
  assert.equal(props.value, 'dingTalk:dingTalkRobotWebHook')
  assert.deepEqual(events, [])
  assert.equal(result.groups.value.at(-1).key, 'newType:newProvider')
})

test('empty and unavailable selections remain explicit and cannot invent a provider by clicking a missing group', () => {
  const { result, props, events } = setup([], 'unavailable:provider')
  assert.deepEqual(result.groups.value, [])
  assert.equal(result.activeGroup.value, undefined)
  assert.deepEqual(result.subChannels.value, [])
  result.selectGroup('dingTalk')
  assert.equal(props.value, 'unavailable:provider')
  assert.deepEqual(events, [])
})

test('a configured robot marks its family configured independently of the selected work provider', () => {
  const { result, props, events } = setup(fixture, 'dingTalk:dingTalkMessage', {
    'email:embedded': 'ready',
    'dingTalk:dingTalkRobotWebHook': 'ready', 'dingTalk:customDing': 'empty', 'dingTalk:dingTalkMessage': 'empty',
    'weixin:corpMessage': 'empty',
    'customType:primary': 'empty', 'customType:secondary': 'ready', 'sms:aliyunSms': 'empty',
  })
  const states = () => Object.fromEntries(result.groups.value.map(group => [group.key, group.configurationState]))
  const initial = states()
  assert.equal(initial.dingTalk, 'ready')
  assert.equal(initial.weixin, 'empty')
  assert.equal(initial['customType:primary'], 'empty')
  assert.equal(initial['customType:secondary'], 'ready')
  const configured = result.groups.value.find(group => group.key === 'dingTalk').statusText
  const empty = result.groups.value.find(group => group.key === 'weixin').statusText
  assert.ok(configured)
  assert.ok(empty)
  assert.notEqual(configured, empty)

  result.selectChannel('dingTalk:dingTalkRobotWebHook')
  assert.equal(props.value, 'dingTalk:dingTalkRobotWebHook')
  assert.deepEqual(states(), initial)
  result.selectGroup('email:embedded')
  assert.equal(props.value, 'email:embedded')
  assert.deepEqual(states(), initial)
  assert.deepEqual(events, [['change', 'dingTalk:dingTalkRobotWebHook'], ['change', 'email:embedded']])
})

test('configuration refresh updates status reactively without navigating or changing other families', () => {
  const { result, props, events } = setup(fixture, 'email:embedded', {
    'email:embedded': 'ready',
    'dingTalk:dingTalkRobotWebHook': 'empty', 'dingTalk:customDing': 'empty', 'dingTalk:dingTalkMessage': 'empty',
  })
  const family = key => result.groups.value.find(group => group.key === key)
  assert.equal(family('dingTalk').configurationState, 'empty')
  props.configurationStates['dingTalk:dingTalkRobotWebHook'] = 'ready'
  assert.equal(family('dingTalk').configurationState, 'ready')
  props.configurationStates = { ...props.configurationStates, 'dingTalk:dingTalkRobotWebHook': 'empty' }
  assert.equal(family('dingTalk').configurationState, 'empty')
  assert.equal(family('email:embedded').configurationState, 'ready')
  assert.equal(props.value, 'email:embedded')
  assert.deepEqual(events, [])
})

test('only a successfully empty complete family is unconfigured; missing metadata remains idle', () => {
  const { result, props } = setup(fixture, '', {
    'dingTalk:dingTalkRobotWebHook': 'empty', 'dingTalk:customDing': 'empty',
  })
  const family = key => result.groups.value.find(group => group.key === key)
  assert.equal(family('dingTalk').configurationState, 'idle')
  assert.equal(family('email:embedded').configurationState, 'idle')
  props.configurationStates['dingTalk:dingTalkMessage'] = 'empty'
  assert.equal(family('dingTalk').configurationState, 'empty')
  assert.notEqual(family('email:embedded').statusText, family('dingTalk').statusText)
})

test('loading and failed snapshots retain their own status and never claim the family is unconfigured', () => {
  const channels = [channel('dingTalk', 'dingTalkRobotWebHook'), channel('dingTalk', 'dingTalkMessage')]
  const { result, props, events } = setup(channels, '', {
    'dingTalk:dingTalkRobotWebHook': 'empty', 'dingTalk:dingTalkMessage': 'empty',
  })
  const family = () => result.groups.value[0]
  const emptyStatusText = family().statusText
  for (const state of ['loading', 'error', 'forbidden', 'unavailable']) {
    props.configurationStates['dingTalk:dingTalkRobotWebHook'] = state
    assert.equal(family().configurationState, state)
    assert.ok(family().statusText)
    assert.notEqual(family().statusText, emptyStatusText)
    props.configurationStates['dingTalk:dingTalkMessage'] = 'ready'
    assert.equal(family().configurationState, 'ready')
    props.configurationStates['dingTalk:dingTalkMessage'] = 'empty'
  }
  assert.equal(props.value, '')
  assert.deepEqual(events, [])
})
