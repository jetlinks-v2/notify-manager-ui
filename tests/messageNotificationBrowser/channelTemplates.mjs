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
const summary = (page, created, skipped, failed = 0) => feedback(page).getByText(`已创建 ${created} 个，跳过 ${skipped} 个，失败 ${failed} 个`, { exact: true }).waitFor()

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
  await text(modal, await t(page, 'messageNotification.channels.robot.webhook')).fill('https://fixture.example.test/robot')
  await setup(modal).waitFor()
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

  const work = await open('dingTalk:dingTalkMessage')
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
  assert.deepEqual((await savedTemplates(work, 'dingTalk', 'dingTalkMessage')).generated, workSaved.generated)
  await work.close()

  const robot = await open('dingTalk:dingTalkRobotWebHook', 390)
  const modal = await addRobot(robot)
  await setup(modal).locator('.inline-edit-field').filter({ hasText: '消息类型' }).locator('.ant-select-selector').click()
  await robot.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: /^link$/ }).click()
  const link = text(setup(modal), '跳转地址')
  await saveChannelDraft(robot)
  await setup(modal).getByText(await t(robot, 'messageNotification.channels.validation.required'), { exact: true }).waitFor()
  assert.equal((await snapshot(robot)).configs.length, 0)
  await link.fill('https://fixture.example.test/details')
  assert.ok(await robot.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await saveChannelDraft(robot)
  await modal.waitFor({ state: 'hidden' })
  await summary(robot, 4, 0)
  const robotSaved = await savedTemplates(robot, 'dingTalk', 'dingTalkRobotWebHook')
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
  console.log('Email, both DingTalk providers and Webhook passed channel creation, required fields, exact binding, preservation and retry checks.')
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await browser.close()
}
