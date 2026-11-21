import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { channelField, editButton, saveChannelDraft } from './channelEditing.mjs'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9201'
const output = process.env.SMOKE_OUTPUT || '/tmp/jetlinks-channel-message-templates'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, base)
const browser = await chromium.launch({ channel: process.env.SMOKE_CHROMIUM_CHANNEL })
const problems = []
await mkdir(output, { recursive: true })

const setup = scope => scope.getByRole('region', { name: '消息模板默认配置', exact: true })
const feedback = scope => scope.getByRole('region', { name: '消息模板', exact: true })
const text = (scope, name) => scope.getByRole('textbox', { name, exact: true })
const t = (page, key) => page.evaluate(key => window.__notificationSmoke.i18n.global.t(key), key)
const snapshot = page => page.evaluate(() => {
  const { calls, configs, templates, businessTypes } = window.__notificationSmoke
  return { calls, configs, templates, businessTypes }
})
const summary = (page, created, skipped, failed = 0) => page.getByText(`已创建 ${created} 个，跳过 ${skipped} 个，失败 ${failed} 个`, { exact: true }).waitFor()

async function open(channel, width = 1440, flags = '') {
  const page = await browser.newPage({ viewport: { width, height: width < 768 ? 844 : 1000 }, serviceWorkers: 'block' })
  page.on('pageerror', error => problems.push(error.message))
  await page.routeWebSocket('**/*', () => {})
  await page.route('**/*', route => {
    const request = route.request()
    if (['fetch', 'xhr'].includes(request.resourceType()) || new URL(request.url()).origin !== entry.origin) {
      problems.push(`Unexpected request ${request.url()}`)
      return route.abort()
    }
    return route.continue()
  })
  await page.goto(`${entry.href}?wechatTemplates&fresh&${flags}#/channels?channel=${encodeURIComponent(channel)}`)
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
  return page
}

async function savedTemplates(page, type, provider) {
  const { configs, templates, businessTypes } = await snapshot(page)
  const config = configs.find(item => item.type === type && item.provider === provider)
  const generated = templates.filter(item => item.configId === config.id)
  assert.equal(generated.length, 4)
  assert.equal(new Set(generated.map(item => item.id)).size, 4)
  for (const business of businessTypes) {
    const channel = business.channels.find(item => item.channelProvider === `notifier-${type}`)
    assert.equal(channel.state, 'enabled')
    assert.equal(channel.channelConfiguration.notifierId, config.id)
    assert.ok(generated.some(item => item.id === channel.channelConfiguration.templateId && item.provider === provider))
  }
  return { config, generated }
}

async function addRobot(page) {
  await editButton(page, await t(page, 'messageNotification.channels.robot.add')).click()
  const modal = page.getByRole('dialog')
  await text(modal, await t(page, 'messageNotification.channels.robot.name')).fill('验收机器人')
  await modal.getByLabel(await t(page, 'messageNotification.channels.robot.webhook'), { exact: true }).fill('https://fixture.example.test/robot')
  await setup(modal).waitFor()
  assert.equal(await setup(modal).locator('.ant-select-selection-item').innerText(), 'markdown')
  assert.equal(await setup(modal).getByRole('textbox', { name: /^(标题|正文)$/ }).count(), 0)
  return modal
}

try {
  const email = await open('email:embedded')
  const host = channelField(email, await t(email, 'messageNotification.channels.fields.host')).getByRole('combobox')
  await host.fill('smtp.fixture.test')
  await host.press('Tab')
  assert.equal(await setup(email).count(), 0)
  assert.equal(await email.getByRole('textbox', { name: /^(主题|正文)$/ }).count(), 0)
  await saveChannelDraft(email)
  await summary(email, 4, 0)
  const emailSaved = await savedTemplates(email, 'email', 'embedded')
  assert.equal(emailSaved.config.configuration.messageTemplateDefaults, undefined)
  assert.equal(new Set(emailSaved.generated.map(item => item.template.subject)).size, 4)
  assert.equal(new Set(emailSaved.generated.map(item => item.template.text)).size, 4)
  assert.ok(emailSaved.generated.every(item => item.template.subject && item.template.text))
  await editButton(feedback(email), '补齐消息模板').click()
  await summary(email, 0, 4)
  assert.deepEqual((await savedTemplates(email, 'email', 'embedded')).generated, emailSaved.generated)
  await email.screenshot({ path: join(output, 'email-templates.png') })
  await email.close()

  for (const [type, provider] of [['voice', 'aliyun'], ['sms', 'aliyunSms']]) {
    const page = await open(`${type}:${provider}`, type === 'voice' ? 390 : 1440, type === 'sms' ? 'fail=remoteOption' : '')
    const form = setup(page)
    for (const [key, value] of [['accessKeyId', 'fixture-key'], ['secret', 'fixture-secret']]) {
      await channelField(page, await t(page, `messageNotification.channels.fields.${key}`)).locator('input').fill(value)
    }
    if (type === 'voice') {
      await saveChannelDraft(page)
      await form.getByText(await t(page, 'messageNotification.channels.validation.required'), { exact: true }).first().waitFor()
      assert.equal((await snapshot(page)).configs.length, 0)
      await text(form, '语音模板编号').fill('TTS_FIRST')
      assert.equal(await text(form, '模板原文').count(), 0)
      await form.locator('.ant-select-selector').click()
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '语音通知' }).click()
      assert.equal(await text(form, '语音ID').inputValue(), '')
      assert.equal(await text(form, '模板原文').count(), 0)
      await text(form, '语音ID').fill('fixture.wav')
    } else {
      const code = channelField(page, '短信模板编号').getByRole('combobox')
      const sign = channelField(page, '短信签名').getByRole('combobox')
      assert.equal(await code.isDisabled(), true)
      assert.equal(await sign.isDisabled(), true)
      assert.equal((await snapshot(page)).calls.some(([method]) => method === 'remoteOption'), false)
      await editButton(page, '保存凭据').click()
      await editButton(form, await t(page, 'messageNotification.common.retry')).click()
      const saved = await snapshot(page)
      assert.equal(saved.configs.length, 1)
      const path = `/notifier/sms/aliyun/${saved.configs[0].id}/`
      for (const route of ['templates', 'signs']) assert.ok(saved.calls.some(([method, url]) => method === 'remoteOption' && url === path + route))
      assert.equal(saved.calls.some(([method]) => method === 'saveBusinessTemplate' || method === 'saveBusinessTemplates'), false)
      await code.click()
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '设备告警 (SMS_FIXTURE)' }).click()
      await saveChannelDraft(page)
      await form.getByText(await t(page, 'messageNotification.channels.validation.required'), { exact: true }).waitFor()
      await sign.click()
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '测试签名' }).click()
    }
    await saveChannelDraft(page)
    await summary(page, 4, 0)
    const { config, generated } = await savedTemplates(page, type, provider)
    const defaults = type === 'sms' ? { code: 'SMS_FIXTURE', signName: '测试签名' } : { templateType: 'voice', templateCode: 'fixture.wav' }
    assert.deepEqual(config.configuration.messageTemplateDefaults, defaults)
    for (const { template } of generated) {
      if (type === 'sms') {
        assert.deepEqual(template, { ...defaults, message: '设备 ${detail.targetName} 发生告警：${detail.alarmConfigName}' })
      } else {
        assert.equal(template.templateType, 'voice')
        assert.equal(template.templateCode, 'fixture.wav')
        assert.equal(template.ttsCode, 'fixture.wav')
        assert.equal(template.message, undefined)
      }
    }
    await editButton(form, '补齐消息模板').click()
    await summary(page, 0, 4)
    assert.equal((await snapshot(page)).calls.filter(([method]) => method === 'createConfig').length, 1)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: join(output, `${type}-templates.png`) })
    await editButton(form, '消息模板').click()
    const previewCode = page.locator(`.${type}-preview__code code`)
    await previewCode.waitFor()
    assert.equal(await previewCode.innerText(), type === 'sms' ? 'SMS_FIXTURE' : 'fixture.wav')
    if (type === 'voice') {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await editButton(page, '编辑').click()
      const codeField = page.locator('.voice-editor .ant-form-item').filter({ hasText: '服务商模板编号' }).locator('.ql-editor')
      await codeField.fill('business-only.wav')
      await editButton(page, '保存模板').click()
      await editButton(page, '编辑').waitFor()
      assert.equal(await previewCode.innerText(), 'business-only.wav')
      await page.evaluate(id => window.__notificationSmoke.router.push({ path: '/channels', query: { channel: 'voice:aliyun', configId: id } }), config.id)
      await text(form, '语音ID').fill('next-default.wav')
      await saveChannelDraft(page)
      await summary(page, 0, 4)
      const updated = (await savedTemplates(page, type, provider)).generated
      assert.equal(updated.filter(item => item.template.templateCode === 'business-only.wav').length, 1)
      assert.equal(updated.filter(item => item.template.templateCode === 'fixture.wav').length, 3)
    } else {
      await page.evaluate(id => {
        const { businessTypes, router } = window.__notificationSmoke
        businessTypes.push({ id: 'new-topic', provider: 'new-topic', name: '新增消息类型', state: 'enabled', channels: [] })
        return router.push({ path: '/channels', query: { channel: 'sms:aliyunSms', configId: id } })
      }, config.id)
      const codeField = channelField(page, '短信模板编号')
      const signField = channelField(page, '短信签名')
      await codeField.getByText('设备告警 (SMS_FIXTURE)', { exact: true }).waitFor()
      await signField.getByText('测试签名', { exact: true }).waitFor()
      const keyField = channelField(page, await t(page, 'messageNotification.channels.fields.accessKeyId'))
      await keyField.locator('input').fill('')
      await editButton(page, '保存凭据').click()
      await keyField.getByText(await t(page, 'messageNotification.channels.validation.required'), { exact: true }).waitFor()
      await keyField.locator('input').fill('fixture-key')
      await codeField.getByText('设备告警 (SMS_FIXTURE)', { exact: true }).waitFor({ timeout: 5000 })
      await signField.getByText('测试签名', { exact: true }).waitFor()
      await keyField.locator('input').fill('fixture-key-rotated')
      await channelField(page, await t(page, 'messageNotification.channels.fields.secret')).locator('input').fill('fixture-secret-rotated')
      assert.equal(await codeField.getByRole('combobox').isDisabled(), true)
      assert.equal(await signField.getByRole('combobox').isDisabled(), true)
      await editButton(page, '保存凭据').click()
      await codeField.getByRole('combobox').click()
      const saved = await snapshot(page)
      assert.equal(saved.configs.length, 1)
      assert.equal(saved.configs[0].id, config.id)
      assert.equal(saved.configs[0].configuration.messageTemplateDefaults?.code, undefined)
      assert.equal(saved.configs[0].configuration.messageTemplateDefaults?.signName, undefined)
      assert.deepEqual(saved.templates.filter(item => item.configId === config.id), generated)
      const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option')
      assert.equal(await options.filter({ hasText: 'SMS_FIXTURE' }).count(), 0)
      await options.filter({ hasText: '新账号通知 (SMS_ROTATED)' }).click()
      await signField.getByRole('combobox').click()
      assert.equal(await options.filter({ hasText: '测试签名' }).count(), 0)
      await options.filter({ hasText: '新账号签名' }).click()
      await saveChannelDraft(page)
      await summary(page, 1, 4)
      const all = (await snapshot(page)).templates.filter(item => item.configId === config.id)
      assert.deepEqual(all.filter(item => generated.some(known => known.id === item.id)), generated)
      const [added] = all.filter(item => !generated.some(known => known.id === item.id))
      assert.deepEqual(added.template, { code: 'SMS_ROTATED', signName: '新账号签名', message: '新账号通知 ${message}' })
    }
    await page.close()
  }

  const work = await open('dingTalk:dingTalkMessage', 1440, 'dingTalkRecipients&fail=dingTalkUsers')
  for (const [key, value] of [['appKey', 'fixture-key'], ['appSecret', 'fixture-secret']]) {
    await channelField(work, await t(work, `messageNotification.channels.fields.${key}`)).locator('input').fill(value)
  }
  assert.equal(await setup(work).count(), 0)
  assert.equal(await text(work, '正文').count(), 0)
  await saveChannelDraft(work)
  const agent = channelField(work, await t(work, 'messageNotification.channels.fields.agentId'))
  await agent.getByText(await t(work, 'messageNotification.channels.validation.required'), { exact: true }).waitFor()
  assert.equal((await snapshot(work)).configs.length, 0)
  await agent.locator('input').fill('1024')
  await saveChannelDraft(work)
  await summary(work, 4, 0)
  const workSaved = await savedTemplates(work, 'dingTalk', 'dingTalkMessage')
  assert.equal(workSaved.config.configuration.messageTemplateDefaults, undefined)
  assert.ok(workSaved.generated.every(item => item.template.agentId === '1024' && item.template.message))
  assert.equal(new Set(workSaved.generated.map(item => item.template.message)).size, 4)
  await work.evaluate(() => window.__notificationSmoke.router.push('/channels?channel=dingTalk:dingTalkRobotWebHook'))
  const occupied = await addRobot(work)
  await saveChannelDraft(work)
  await occupied.waitFor({ state: 'hidden' })
  await summary(work, 0, 4)
  const robotConfig = (await snapshot(work)).configs.find(item => item.provider === 'dingTalkRobotWebHook')
  assert.deepEqual(robotConfig.configuration.messageTemplateDefaults, { messageType: 'markdown', title: '${topic}', message: '${message}' })
  assert.deepEqual((await savedTemplates(work, 'dingTalk', 'dingTalkMessage')).generated, workSaved.generated)

  const [business] = (await snapshot(work)).businessTypes
  const templateId = business.channels.find(item => item.channelProvider === 'notifier-dingTalk').channelConfiguration.templateId
  await work.evaluate(({ businessId, templateId }) => {
    const { router, templates } = window.__notificationSmoke
    const template = templates.find(item => item.id === templateId).template
    template.departmentIdList = '101'
    template.userIdList = 'legacy-user'
    return router.push({ path: '/templates', query: { channel: 'dingTalk:dingTalkMessage', business: businessId } })
  }, { businessId: business.id, templateId })
  const editTemplate = work.getByRole('button', { name: /编\s*辑/ })
  await editTemplate.click()
  const saveTemplate = work.getByRole('button', { name: '保存模板', exact: true })
  await work.getByText('在此编辑消息内容。请到「通知渠道」管理接收范围。', { exact: true }).waitFor()
  assert.equal(await work.getByText(/接收部门|接收用户/).count(), 0)
  await text(work, '正文').fill('钉钉业务模板已更新')
  await saveTemplate.click()
  await editTemplate.waitFor()
  const savedRecipients = (await snapshot(work)).templates.find(item => item.id === templateId).template
  assert.equal(savedRecipients.departmentIdList, '101')
  assert.equal(savedRecipients.userIdList, 'legacy-user')
  assert.ok(savedRecipients.message.endsWith('\n钉钉业务模板已更新'))
  await work.close()

  const robot = await open('dingTalk:dingTalkRobotWebHook', 390)
  const modal = await addRobot(robot)
  await setup(modal).locator('.inline-edit-field').filter({ hasText: '消息类型' }).locator('.ant-select-selector').click()
  await robot.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: /^link$/ }).click()
  const link = text(setup(modal), '跳转地址')
  await link.waitFor()
  assert.equal(await setup(modal).getByRole('textbox', { name: /^(标题|正文)$/ }).count(), 0)
  await saveChannelDraft(robot)
  await setup(modal).getByText(await t(robot, 'messageNotification.channels.validation.required'), { exact: true }).waitFor()
  assert.equal((await snapshot(robot)).configs.length, 0)
  await link.fill('https://fixture.example.test/details')
  assert.ok(await robot.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await saveChannelDraft(robot)
  await modal.waitFor({ state: 'hidden' })
  await summary(robot, 4, 0)
  const robotSaved = await savedTemplates(robot, 'dingTalk', 'dingTalkRobotWebHook')
  assert.deepEqual(robotSaved.config.configuration.messageTemplateDefaults, {
    messageType: 'link', title: '${topic}', message: '${message}', messageUrl: 'https://fixture.example.test/details',
  })
  assert.ok(robotSaved.generated.every(item => item.template.messageType === 'link' && item.template.link.messageUrl === 'https://fixture.example.test/details'
    && item.template.link.title === '${topic}' && item.template.link.text === '${message}'))
  await editButton(robot.locator('.robot-configurations__row'), await t(robot, 'messageNotification.channels.more')).click()
  await editButton(robot.locator('.ant-dropdown:visible'), '补齐消息模板').click()
  await summary(robot, 0, 4)
  assert.deepEqual((await savedTemplates(robot, 'dingTalk', 'dingTalkRobotWebHook')).generated, robotSaved.generated)
  await robot.close()

  const webhook = await open('webhook:http', 1440, 'fail=saveBusinessTemplate')
  await text(webhook, await t(webhook, 'messageNotification.channels.webhook.address')).fill('https://fixture.example.test/webhook')
  assert.equal(await webhook.locator('.webhook-preview').count(), 0)
  assert.equal(await webhook.getByText('请求示例', { exact: true }).count(), 0)
  await saveChannelDraft(webhook)
  await summary(webhook, 0, 0, 1)
  await editButton(feedback(webhook), '重试补齐').click()
  await summary(webhook, 4, 0)
  const web = await savedTemplates(webhook, 'webhook', 'http')
  assert.equal(web.config.configuration.messageTemplateDefaults, undefined)
  assert.equal(new Set(web.generated.map(item => item.template.body)).size, 4)
  assert.ok(web.generated.every(item => item.template.contextAsBody === false && !Object.hasOwn(item.template, 'url') && JSON.parse(item.template.body)))
  assert.equal((await snapshot(webhook)).calls.filter(([method]) => method === 'createConfig').length, 1)
  await webhook.close()

  assert.deepEqual(problems, [])
  console.log('Email, Aliyun voice and SMS, both DingTalk providers and Webhook passed channel creation, required fields, exact binding, preservation and retry checks.')
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await browser.close()
}
