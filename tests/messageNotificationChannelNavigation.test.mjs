import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { transformSync } from 'esbuild'
import { reactive } from 'vue'
import * as vue from 'vue'

const filename = resolve(import.meta.dirname, '../views/system/MessageNotification/Templates/hooks/useTemplateChannelNavigation.ts')
const { code } = transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' })
const module = { exports: {} }
new Function('require', 'module', 'exports', code)(name => {
  if (name === 'vue') return vue
  if (name === 'vue-i18n') return { useI18n: () => ({ t: key => key }) }
  throw new Error(`Unexpected dependency in pure navigation test: ${name}`)
}, module, module.exports)
const { useTemplateChannelNavigation } = module.exports
const channel = (type, provider, name = provider) => ({ id: `${type}:${provider}`, type, provider, name })
const fixture = [
  channel('email', 'embedded'),
  channel('dingTalk', 'dingTalkRobotWebHook'), channel('dingTalk', 'customDing'), channel('dingTalk', 'dingTalkMessage'),
  channel('weixin', 'officialMessage'), channel('weixin', 'corpMessage'),
  channel('customType', 'primary'), channel('customType', 'secondary'), channel('sms', 'aliyunSms'),
]
function setup(channels = fixture, value = 'email:embedded', configurationStates = {}) {
  const props = reactive({ channels: channels.map(item => ({ ...item })), value, configurationStates: { ...configurationStates } })
  const events = []
  const result = useTemplateChannelNavigation(props, (name, id) => { events.push([name, id]); props.value = id })
  return { props, events, result }
}

test('grouping retains every backend provider exactly once, including extension providers and types', () => {
  const { result } = setup()
  assert.deepEqual(result.groups.value.flatMap(group => group.channels.map(item => item.id)).sort(), fixture.map(item => item.id).sort())
  assert.deepEqual(result.groups.value.map(group => group.key), ['email:embedded', 'dingTalk', 'weixin', 'customType:primary', 'customType:secondary', 'sms:aliyunSms'])
  assert.deepEqual(result.groups.value.find(group => group.key === 'dingTalk').channels.map(item => item.provider), ['dingTalkRobotWebHook', 'customDing', 'dingTalkMessage'])
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

test('a family without a built-in work provider falls back only to its first actual backend entry', () => {
  const entries = [channel('dingTalk', 'vendorA'), channel('dingTalk', 'vendorB'), channel('weixin', 'officialMessage')]
  const { result, props, events } = setup(entries, '')
  result.selectGroup('dingTalk')
  assert.equal(props.value, 'dingTalk:vendorA')
  result.selectGroup('weixin')
  assert.equal(props.value, 'weixin:officialMessage')
  assert.deepEqual(result.subChannels.value, [])
  assert.deepEqual(events, [['change', 'dingTalk:vendorA'], ['change', 'weixin:officialMessage']])
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
    'weixin:officialMessage': 'empty', 'weixin:corpMessage': 'empty',
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
