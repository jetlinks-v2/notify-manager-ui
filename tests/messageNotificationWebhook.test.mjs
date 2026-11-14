import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { transformSync } from 'esbuild'
import * as vue from 'vue'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../views/system/MessageNotification/Channels/webhook')
const cache = new Map()
function load(filename) {
  if (!filename.endsWith('.ts')) filename = existsSync(`${filename}.ts`) ? `${filename}.ts` : resolve(filename, 'index.ts')
  if (filename.endsWith('/api/notice/messageNotification.ts')) return { messageNotificationApi: {} }
  if (cache.has(filename)) return cache.get(filename)
  const module = { exports: {} }
  const { code } = transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' })
  new Function('require', 'module', 'exports', code)(name => name === 'vue' ? vue : name.startsWith('.') ? load(resolve(dirname(filename), name)) : require(name), module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}
const { webhookRequestPreview } = load(resolve(root, 'requestPreview'))
const { useWebhookPreview } = load(resolve(root, 'useWebhookPreview'))
const t = key => key
function entry(id = 'config-1') {
  const baseline = { id, name: id, type: 'webhook', provider: 'http', configuration: { url: `https://example.test/${id}` } }
  return { key: id, baseline, draft: structuredClone(baseline), isNew: false, snapshot: JSON.stringify(baseline), issues: [] }
}

test('local example contains an alarm JSON body and masks configured headers without a template', () => {
  const result = webhookRequestPreview({ url: 'https://example.test/hook', headers: [{ key: 'Authorization', value: 'secret-one' }] }, t)
  assert.match(result, /^POST https:\/\/example.test\/hook\nContent-Type: application\/json/)
  assert.match(result, /Authorization: /)
  assert.doesNotMatch(result, /secret-one|X-Signature|timeout|\$\{/)
  const body = JSON.parse(result.split('\n\n')[1])
  assert.equal(body.detail.targetId, 'device-001')
  assert.equal(typeof body.detail.alarmTime, 'number')
  assert.equal(body.detail.alarmConfigName, 'NoticeCenter.template.sample.alarm')
})

test('unconfigured addresses use a placeholder and configured content-type is not duplicated', () => {
  for (const url of [undefined, '', '  ', 'https://']) {
    assert.match(webhookRequestPreview({ url }, t), /^POST messageNotification.channels.webhook.receiver\n/)
  }
  const result = webhookRequestPreview({ headers: [{ key: 'content-TYPE', value: 'private-value' }, { key: '', value: 'unfinished' }] }, t)
  assert.equal(result.match(/content-type:/gi).length, 1)
  assert.doesNotMatch(result, /private-value|unfinished/)
})

test('existing edits affect the example only after saving; new configurations show the draft immediately', () => {
  const current = vue.ref(entry())
  const preview = useWebhookPreview(current, t)
  const initial = preview.value.content
  current.value.draft.configuration.url = 'https://changed.test/hook'
  assert.equal(preview.value.content, initial)
  current.value.baseline.configuration.url = current.value.draft.configuration.url
  assert.match(preview.value.content, /^POST https:\/\/changed.test\/hook/)
  current.value = { ...entry(), isNew: true, baseline: undefined }
  current.value.draft.configuration.url = ''
  assert.match(preview.value.content, /^POST messageNotification.channels.webhook.receiver/)
  current.value.draft.configuration.url = 'https://new.test/hook'
  assert.match(preview.value.content, /^POST https:\/\/new.test\/hook/)
})
