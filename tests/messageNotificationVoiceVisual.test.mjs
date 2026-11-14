import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { ref } from 'vue'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../views/system/MessageNotification/Templates/hooks/useVoiceTemplateVisual.ts', import.meta.url), 'utf8')
const output = transformSync(source, { loader: 'ts', format: 'cjs' }).code
const module = { exports: {} }
new Function('require', 'module', 'exports', output)(require, module, module.exports)
const { useVoiceTemplateEditorVisual } = module.exports

test('voice visual keeps canonical mode and caller fields in advanced settings', () => {
  const fields = ref(['templateType', 'templateCode', 'calledNumber', 'calledShowNumbers', 'playTimes', 'ttsmessage'].map(key => ({ key, path: [key] })))
  const values = { templateType: 'tts', templateCode: 'TTS_EXISTING', ttsmessage: 'Hello ${detail.targetName} ${supplierAlias}', playTimes: 2 }
  const writes = []
  const editor = { fields, insertableVariables: ref([{ id: 'detail.targetName', name: 'Device' }]), fieldValue: field => values[field.key], changeField: (field, value) => writes.push([field.path, value]) }
  const view = useVoiceTemplateEditorVisual(editor)
  assert.deepEqual(view.mainFields.value.map(item => item.key), ['templateCode', 'ttsmessage'])
  assert.deepEqual(view.advancedFields.value.map(item => item.key), ['templateType', 'calledNumber', 'calledShowNumbers'])
  assert.equal(view.playTimes.value, 2)
  assert.deepEqual(writes, [], 'mounting never publishes a draft edit')
  assert.deepEqual(view.mappings.value, [{ id: 'detail.targetName', label: 'Device', available: true }, { id: 'supplierAlias', label: 'supplierAlias', available: false }])
  view.changePlayTimes(3)
  assert.deepEqual(writes, [[['playTimes'], 3]])
  fields.value = fields.value.filter(item => item.key !== 'ttsmessage')
  assert.deepEqual(view.mainFields.value.map(item => item.key), ['templateCode'])
  assert.deepEqual(view.mappings.value, [], 'recorded voice mode has no invented TTS source')
})
