import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { transformSync } from 'esbuild'

const directory = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const modules = new Map()
// 执行真实 model 和纯预览函数；只转译 TypeScript，不替换业务逻辑。
function load(path) {
  if (modules.has(path)) return modules.get(path).exports
  const module = { exports: {} }
  modules.set(path, module)
  const code = transformSync(readFileSync(path, 'utf8'), { loader: 'ts', format: 'cjs' }).code
  const localRequire = id => id.startsWith('.') ? load(resolve(dirname(path), `${id}.ts`)) : require(id)
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports)
  return module.exports
}
const { getRecommendedVariables, mergeRecommendedVariables, normalizeGroupList } = load(resolve(directory, 'noticeTemplateModel.ts'))
const { syncVariableDefinitions } = load(resolve(directory, 'noticeTemplateFormModel.ts'))
const { alarmPreviewValues, formatPreviewValue } = load(resolve(directory, 'noticeAlarmPreview.ts'))
const { useTemplatePreviewSegments } = load(resolve(directory, 'useTemplatePreviewSegments.ts'))
const { createI18n } = require('vue-i18n')
const { ref } = require('vue')
const translate = locale => createI18n({ legacy: false, locale, messages: {
  [locale]: JSON.parse(readFileSync(resolve(directory, `../../../../locales/lang/${locale}.json`), 'utf8')),
} }).global.t

test('trigger and recovery have separate template entries within the same alarm group', () => {
  const channel = templateId => ({ channelProvider: 'notifier-email', channelConfiguration: { templateId } })
  const { groups } = normalizeGroupList([
    { id: 'trigger-config', provider: 'alarm-device', name: 'Device alarm', type: { id: 'alarm', name: 'Alarm' }, channels: [channel('trigger-template')] },
    { id: 'recovery-config', provider: 'alarm-device-relieve', name: 'Device alarm cleared', type: { id: 'alarm', name: 'Alarm' }, channels: [channel('recovery-template')] },
  ], [{ id: 'notifier-email', name: 'Email' }], 'Other')
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].alarms.map(item => item.providerCode), ['alarm-device', 'alarm-device-relieve'])
  assert.deepEqual(groups[0].alarms.map(item => item.channels[0].channel.channelConfiguration.templateId), ['trigger-template', 'recovery-template'])
})

test('recommendations use root notification fields and detail property fields with localized labels', () => {
  for (const locale of ['zh', 'en']) {
    const t = translate(locale)
    const variables = getRecommendedVariables('alarm-device', t)
    assert.deepEqual(getRecommendedVariables('alarm-device-relieve', t), variables)
    const ids = variables.map(item => item.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(ids.includes('message') && ids.includes('notifyTime'))
    assert.ok(!ids.includes('detail.message') && !ids.includes('detail.notifyTime'))
    for (const id of ['targetId', 'targetName', 'productId', 'productName', 'property', 'propertyName', 'propertyValue', 'propertyValueText', 'propertyUnit', 'event', 'eventText', 'levelText', 'alarmTime', 'relieveTime']) {
      const variable = variables.find(item => item.id === `detail.${id}`)
      assert.ok(variable, id)
      assert.notEqual(variable.name, variable.i18nName)
    }
    assert.ok(variables.find(item => item.id === 'detail.propertyValue').description)
    assert.ok(!getRecommendedVariables('alarm-product', t).some(item => item.id === 'detail.propertyValue'))
  }
})

test('metadata merge keeps date defaults, and saved definitions keep user names and formats', () => {
  const recommended = mergeRecommendedVariables(getRecommendedVariables('alarm-device', translate('en')), [
    { id: 'alarmTime', type: 'long', name: '服务端名称' },
    { id: 'propertyValueText', name: '服务端名称' },
    { id: 'extraField', name: 'Extra field' },
  ])
  assert.equal(recommended.find(item => item.id === 'detail.alarmTime').type, 'date')
  assert.equal(recommended.find(item => item.id === 'detail.extraField').name, 'Extra field')
  const payload = { name: 'User template', type: 'email', provider: 'embedded', template: {
    body: '${message}|${notifyTime}|${detail.alarmTime}|${detail.relieveTime}',
  }, variableDefinitions: [{ id: 'detail.alarmTime', name: '用户名称', type: 'date', format: 'yyyy' }] }
  const definitions = syncVariableDefinitions(payload, recommended)
  assert.equal(definitions.find(item => item.id === 'detail.alarmTime').name, '用户名称')
  assert.equal(definitions.find(item => item.id === 'detail.alarmTime').format, 'yyyy')
  assert.equal(definitions.find(item => item.id === 'detail.relieveTime').format, 'yyyy-MM-dd HH:mm:ss')
  assert.equal(definitions.find(item => item.id === 'notifyTime').type, 'date')
})

test('trigger and recovery samples preserve raw types and render event, dates and missing fields consistently', () => {
  for (const locale of ['zh', 'en']) {
    const t = translate(locale)
    const trigger = alarmPreviewValues(t, 'trigger')
    const relieve = alarmPreviewValues(t, 'relieve')
    assert.equal(trigger['detail.event'], 'trigger')
    assert.equal(relieve['detail.event'], 'relieve')
    assert.equal(trigger['detail.relieveTime'], undefined)
    assert.equal(typeof trigger['detail.propertyValue'], 'number')
    assert.equal(relieve['detail.propertyValue'], 50)
    assert.equal(relieve['detail.propertyValueText'], '50℃')
    assert.notEqual(trigger.message, relieve.message)
    assert.equal(formatPreviewValue(trigger['detail.alarmTime'], { type: 'date' }), '2026-01-01 12:00:00')
    assert.equal(formatPreviewValue(relieve['detail.relieveTime'], { type: 'date', format: 'yyyy/MM/dd HH:mm' }), '2026/01/01 12:01')
    assert.equal(formatPreviewValue(90, { type: 'double', format: '%.2f' }), '90.00')
    const preview = useTemplatePreviewSegments(() => getRecommendedVariables('alarm-device', t), () => '',
      ref(''), ref('${detail.event}|${detail.propertyValue}|${detail.relieveTime}|${missing}'), ref('resolved'), () => trigger)
    assert.equal(preview.resolvedMessageSegments.value.map(item => item.text).join(''), 'trigger|90||')
  }
})
