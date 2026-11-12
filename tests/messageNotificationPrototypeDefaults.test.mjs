import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const templates = resolve(root, 'views/system/MessageNotification/Templates')
const cache = new Map()

// 执行真实默认工厂、既有 provider 归一化和 payload mapper，不用测试替身重写业务逻辑。
function load(filename) {
  if (cache.has(filename)) return cache.get(filename)
  const { code } = transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    if (name.startsWith('.')) {
      const path = resolve(dirname(filename), name)
      return load(existsSync(`${path}.ts`) ? `${path}.ts` : resolve(path, 'index.ts'))
    }
    return require(name)
  }, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}

const defaults = load(resolve(templates, 'definition/templateDefaults.ts'))
const model = load(resolve(templates, 'model.ts'))
const { notificationChannels } = load(resolve(templates, '../shared/catalog.ts'))
const business = (provider, name = provider) => ({ id: null, provider, name })
const channel = id => notificationChannels.find(value => value.id === id)
const create = (provider, id = 'email:embedded', variables = [], translate) => defaults.createPrototypeTemplate(business(provider), channel(id), variables, translate)
const usedVariables = record => [...JSON.stringify(record.template).matchAll(/\$\{([^}]+)\}/g)].map(match => match[1])
const supportedBusinesses = ['alarm-device', 'alarm-device-relieve', 'aiComplianceAlarm', 'aiSecurityAlarm', 'scene', 'SystemBulletin']

test('未持久化的已知业务按精确渠道生成独立原型默认，不依赖主题变量接口', () => {
  for (const provider of supportedBusinesses) {
    for (const target of notificationChannels) {
      assert.equal(defaults.hasPrototypeTemplate(business(provider), target), true)
      const record = defaults.createPrototypeTemplate(business(provider), target, [])
      assert.equal(record.id, '')
      assert.equal(record.type, target.type)
      assert.equal(record.provider, target.provider)
      assert.ok(usedVariables(record).length > 0)
      const definitions = new Set(record.variableDefinitions.map(variable => variable.id))
      assert.ok(usedVariables(record).every(id => definitions.has(id)))
      assert.ok(record.variableDefinitions.every(variable => !Object.hasOwn(variable, 'defaultValue')))
    }
  }
})

test('未覆盖业务、相似名称及动态额外渠道不会套用其他原型默认', () => {
  for (const provider of ['system-event', 'saas-service', 'alarm-product', 'unknown', 'systembulletin']) {
    const source = business(provider, '设备告警')
    assert.equal(defaults.hasPrototypeTemplate(source, channel('email:embedded')), false)
    assert.equal(defaults.createPrototypeTemplate(source, channel('email:embedded'), []), undefined)
  }
  for (const target of [
    { ...channel('sms:aliyunSms'), id: 'sms:extension', provider: 'extension' },
    { ...channel('weixin:corpMessage'), id: 'weixin:robot', provider: 'robot' },
    { ...channel('email:embedded'), id: 'custom:embedded', type: 'custom' },
  ]) {
    assert.equal(defaults.hasPrototypeTemplate(business('alarm-device'), target), false)
    assert.equal(defaults.createPrototypeTemplate(business('alarm-device'), target, []), undefined)
  }
})

test('保留原型标题和邮件段落，删除无依据的接收人、空间、时长、处理信息及详情链接', () => {
  const record = create('alarm-device')
  assert.equal(record.template.subject, '【${detail.levelText}告警】${detail.alarmConfigName} - ${detail.targetName}')
  assert.match(record.template.text, /设备产生了一条\$\{detail.levelText\}告警，请及时处理。/)
  assert.match(record.template.text, /设备：\$\{detail.targetName\}（\$\{detail.productName\}）/)
  assert.match(record.template.text, /这封邮件由系统自动发送/)
  const relieve = create('alarm-device-relieve')
  assert.match(relieve.template.subject, /^【告警解除】/)
  assert.match(relieve.template.text, /解除时间：\$\{detail.relieveTime\}/)
  for (const source of [record, relieve]) {
    assert.doesNotMatch(JSON.stringify(source.template), /接收人|项目名称|平台名称|所在空间|触发条件|持续时长|解除方式|处理人|处理说明|https?:\/\//)
  }
})

test('AI 原型只使用确证字段，不把识别集合、文件集合或不稳定安全告警上下文猜成单值', () => {
  const incoming = ['mediaChannelName', 'spaceName', 'confidence', 'image', 'video', 'item'].map(id => ({ id: `detail.${id}`, name: id }))
  const safety = create('aiSecurityAlarm', 'email:embedded', incoming)
  const compliance = create('aiComplianceAlarm', 'email:embedded', incoming)
  assert.doesNotMatch(JSON.stringify(safety), /detail\.(?:mediaChannelName|spaceName|confidence|image|video|item)/)
  assert.match(compliance.template.text, /通道：\$\{detail.mediaChannelName\}/)
  assert.match(safety.template.text, /请立即处理/)
  assert.match(compliance.template.text, /请及时核实/)
})

test('场景只保留场景名称及触发方式，公告只保留标题、摘要和类型', () => {
  const scene = create('scene')
  assert.match(scene.template.subject, /「\$\{detail.sceneName\}」已执行/)
  assert.match(scene.template.text, /触发方式：\$\{detail.triggerType\}/)
  assert.doesNotMatch(scene.template.text, /触发对象|触发条件|执行结果|执行时间/)
  const bulletin = create('SystemBulletin')
  assert.equal(bulletin.template.subject, '【${detail.type}】${detail.title}')
  assert.match(bulletin.template.text, /\$\{detail.summary\}/)
  assert.doesNotMatch(bulletin.template.text, /发布时间|公告详情/)
})

test('Webhook 自定义 JSON 沿用原型结构且不生成无法提供的键', () => {
  const record = create('alarm-device-relieve', 'webhook:http')
  assert.equal(record.template.contextAsBody, false)
  assert.deepEqual(JSON.parse(record.template.body), {
    type: '设备告警解除', name: '${detail.alarmConfigName}', level: '${detail.levelText}',
    device: { id: '${detail.targetId}', name: '${detail.targetName}' }, alarmTime: '${detail.alarmTime}', recoverTime: '${detail.relieveTime}',
  })
  const scene = JSON.parse(create('scene', 'webhook:http').template.body)
  assert.deepEqual(Object.keys(scene).sort(), ['scene', 'trigger', 'type'])
})

test('应用通知是纯文本，钉钉机器人独立使用真实 Markdown 嵌套结构', () => {
  const application = create('alarm-device', 'dingTalk:dingTalkMessage')
  const robot = create('alarm-device', 'dingTalk:dingTalkRobotWebHook')
  assert.match(application.template.message, /^\$\{detail.levelText\}告警：\$\{detail.alarmConfigName\}\n/)
  assert.doesNotMatch(application.template.message, /####|\*\*/)
  assert.equal(robot.template.messageType, 'markdown')
  assert.match(robot.template.markdown.text, /^#### \$\{detail.levelText\}告警/)
  assert.equal(Object.hasOwn(robot.template, 'message'), false)
  assert.equal(Object.hasOwn(robot.template, 'grp'), false)
  assert.equal(Object.hasOwn(create('aiSecurityAlarm', 'weixin:corpMessage').template, 'img'), false)
})

test('服务商编号、签名、号码和演示品牌均不进入默认模板，短信语音未配置不能保存', () => {
  for (const provider of supportedBusinesses) {
    for (const id of ['sms:aliyunSms', 'voice:aliyun']) {
      const record = create(provider, id)
      assert.doesNotMatch(JSON.stringify(record), /SMS_\d+|TTS_\d+|星河物联|calledNumber|phoneNumber/)
      assert.throws(() => model.buildTemplatePayload(model.createTemplateDraft(record)), id.startsWith('sms') ? /smsTemplateRequired/ : /voiceTemplateRequired/)
    }
  }
  const draft = model.createTemplateDraft(create('alarm-device', 'sms:aliyunSms'))
  const content = JSON.parse(draft.templateJson)
  content.code = 'real-reviewed-template'
  draft.templateJson = JSON.stringify(content)
  assert.throws(() => model.buildTemplatePayload(draft), /smsSignRequired/)
  content.signName = '实际签名'
  draft.templateJson = JSON.stringify(content)
  assert.equal(model.buildTemplatePayload(draft).template.code, content.code)
})

test('默认变量去除传入演示 defaultValue，示例替换只影响预览且复用既有告警样例', () => {
  const incoming = [{ id: 'detail.targetName', name: '设备名称', defaultValue: '不应保存的演示设备', expands: { source: true } }]
  const record = create('alarm-device', 'email:embedded', incoming)
  const original = structuredClone(record)
  const examples = defaults.prototypePreviewExamples(business('alarm-device'))
  assert.equal(examples['detail.targetName'], '温度设备 A')
  assert.equal(examples['detail.alarmTime'], '2026-01-01 12:00:00')
  assert.match(model.previewTemplateText(record.template.text, examples), /温度设备 A/)
  const payload = model.buildTemplatePayload(model.createTemplateDraft(record))
  assert.doesNotMatch(JSON.stringify(payload), /温度设备 A|不应保存的演示设备|2026-01-01/)
  assert.deepEqual(record, original)
  assert.equal(incoming[0].defaultValue, '不应保存的演示设备')
  assert.equal(payload.variableDefinitions.find(value => value.id === 'detail.targetName').expands.source, true)
  assert.equal(defaults.prototypePreviewExamples(business('alarm-device-relieve'))['detail.event'], 'relieve')
  assert.equal(Object.hasOwn(defaults.prototypePreviewExamples(business('scene')), 'detail.targetName'), false)
})

test('默认翻译只参与创建时的数据生成，已有草稿不会随另一语言的默认生成而变化', () => {
  const translate = (key, params) => key.endsWith('.alarmTitle') ? `Alarm: ${params.name}` : key
  const translated = create('alarm-device', 'dingTalk:dingTalkRobotWebHook', [], translate)
  assert.equal(translated.template.markdown.title, 'Alarm: ${detail.alarmConfigName}')
  const draft = model.createTemplateDraft(translated)
  create('alarm-device', 'dingTalk:dingTalkRobotWebHook')
  assert.equal(model.buildTemplatePayload(draft).template.markdown.title, translated.template.markdown.title)
})

test('不同业务和渠道内容互不共享，调用者可独立编辑附件和变量', () => {
  const first = create('alarm-device')
  first.template.attachments.push({ name: 'local.pdf', location: 'file-one' })
  first.variableDefinitions[0].name = '本地修改'
  const second = create('alarm-device')
  assert.deepEqual(second.template.attachments, [])
  assert.notEqual(second.variableDefinitions[0].name, '本地修改')
  assert.notEqual(create('scene').template.subject, second.template.subject)
})

test('动态目录允许额外 provider 保存原 JSON，省略目录仍沿用原渠道边界', () => {
  const custom = { ...channel('webhook:http'), id: 'extension:custom', type: 'extension', provider: 'custom' }
  const draft = model.createTemplateDraft({
    id: 'stored', name: 'Extension', type: custom.type, provider: custom.provider,
    template: { message: '${custom}', providerExtra: { preserve: true }, attachments: [{ name: 'x', location: 'opaque' }] },
    variableDefinitions: [{ id: 'custom', defaultValue: '真实默认值', expands: { x: true } }],
  })
  assert.throws(() => model.buildTemplatePayload(draft), /unsupportedProvider/)
  const payload = model.buildTemplatePayload(draft, [custom])
  assert.deepEqual(payload.template, JSON.parse(draft.templateJson))
  assert.deepEqual(payload.variableDefinitions, draft.variables)
  assert.throws(() => model.buildTemplatePayload(draft, []), /unsupportedProvider/)
})

test('邮件保存移除 UI message alias，保留真实扩展字段、附件和变量默认值', () => {
  const draft = model.createTemplateDraft({
    id: 'mail', name: 'Mail', type: 'email', provider: 'embedded',
    template: { subject: 'Subject', message: 'Legacy body', providerExtra: { keep: true }, attachments: [{ name: 'file', location: '/tmp/server-file' }] },
    variableDefinitions: [{ id: 'value', defaultValue: '真实默认值', format: 'literal' }],
  })
  assert.equal(draft.text, 'Legacy body')
  draft.text = 'Edited body'
  const payload = model.buildTemplatePayload(draft)
  assert.equal(payload.template.text, 'Edited body')
  assert.equal(Object.hasOwn(payload.template, 'message'), false)
  assert.deepEqual(payload.template.providerExtra, { keep: true })
  assert.deepEqual(payload.template.attachments, draft.attachments)
  assert.deepEqual(payload.variableDefinitions, draft.variables)
})

test('机器人归一化保留当前消息类型与嵌套扩展字段，不提交 message 编辑别名', () => {
  for (const messageType of ['markdown', 'text', 'link']) {
    const nested = messageType === 'text' ? { content: 'Stored', extension: true } : { title: 'Title', text: 'Stored', extension: true }
    const draft = model.createTemplateDraft({
      id: 'robot', name: 'Robot', type: 'dingTalk', provider: 'dingTalkRobotWebHook',
      template: { messageType, [messageType]: nested, providerExtra: true },
    })
    const payload = model.buildTemplatePayload(draft)
    assert.equal(payload.template[messageType][messageType === 'text' ? 'content' : 'text'], 'Stored')
    assert.equal(payload.template[messageType].extension, true)
    assert.equal(payload.template.providerExtra, true)
    assert.equal(Object.hasOwn(payload.template, 'message'), false)
  }
  const legacy = model.createTemplateDraft({ id: 'legacy', name: 'Legacy', type: 'dingTalk', provider: 'dingTalkRobotWebHook', template: { message: 'Legacy body' } })
  const normalized = model.buildTemplatePayload(legacy).template
  assert.equal(normalized.messageType, 'markdown')
  assert.equal(normalized.markdown.text, 'Legacy body')
  assert.equal(Object.hasOwn(normalized, 'message'), false)
})

test('语音复用既有 templateCode/ttsCode 归一化并清理 ttsmessage 编辑别名', () => {
  const draft = model.createTemplateDraft({
    id: 'voice', name: 'Voice', type: 'voice', provider: 'aliyun',
    template: { ttsCode: 'reviewed-code', ttsmessage: 'Edited ${value}', message: 'Old', playTimes: 2, providerExtra: true },
    variableDefinitions: [{ id: 'value', name: 'Value' }],
  })
  const payload = model.buildTemplatePayload(draft)
  assert.equal(payload.template.templateCode, 'reviewed-code')
  assert.equal(payload.template.ttsCode, 'reviewed-code')
  assert.equal(payload.template.message, 'Edited ${value}')
  assert.equal(payload.template.providerExtra, true)
  assert.equal(Object.hasOwn(payload.template, 'ttsmessage'), false)
  assert.equal(JSON.parse(draft.templateJson).message, 'Old')
})

test('Webhook 保留扩展字段且上下文请求体模式不提交过时的自定义请求体', () => {
  const draft = model.createTemplateDraft({
    id: 'hook', name: 'Hook', type: 'webhook', provider: 'http',
    template: { contextAsBody: true, body: 'stale', method: 'POST', providerExtra: true },
  })
  const payload = model.buildTemplatePayload(draft)
  assert.equal(payload.template.body, undefined)
  assert.equal(payload.template.providerExtra, true)
  assert.equal(payload.template.method, 'POST')
})
