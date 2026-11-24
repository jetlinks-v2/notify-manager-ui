import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { channelField } from './channelEditing.mjs'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9201'
const output = process.env.SMOKE_OUTPUT || '/tmp/jetlinks-wechat-message-templates'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, base)
const browser = await chromium.launch({ channel: process.env.SMOKE_CHROMIUM_CHANNEL })
const problems = []
const route = '#/channels?channel=weixin%3AcorpMessage'
const subscriptionAction = /^(启\s*用|禁\s*用)$/
const subscriptionStatus = /^消息订阅已(?:启用|禁用)$/
await mkdir(output, { recursive: true })

function setup(page) { return page.getByRole('region', { name: '消息模板默认配置' }) }
function save(page) { return page.getByRole('button', { name: '保存', exact: true }) }
function wechatSwitch(page) { return page.getByRole('switch', { name: '启用微信渠道', exact: true }) }
function openTemplate(page, business) {
  return page.evaluate(business => window.__notificationSmoke.router.push({ path: '/templates', query: { channel: 'weixin:corpMessage', business } }), business)
}
async function checkCredentialLabels(page) {
  const labels = await page.locator('.notification-channels__editor .inline-edit-field__label').evaluateAll(elements => {
    return elements.slice(0, 3).map(label => {
      const { color, fontSize, fontWeight, marginBottom } = getComputedStyle(label)
      const required = label.querySelector('.inline-edit-field__required')
      if (required?.textContent !== '*') throw new Error('Missing required field marker')
      return { color, fontSize, fontWeight, marginBottom, requiredColor: getComputedStyle(required).color }
    })
  })
  assert.equal(labels.length, 3)
  assert.deepEqual(labels[2], labels[0])
  assert.deepEqual(labels[2], labels[1])
}

async function snapshot(page) {
  return page.evaluate(() => {
    const { calls, configs, templates, businessTypes } = window.__notificationSmoke
    return { calls, configs, templates, businessTypes }
  })
}

async function open(flags, width = 1440) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, serviceWorkers: 'block' })
  page.on('pageerror', error => problems.push(error.message))
  await page.routeWebSocket('**/*', () => {})
  await page.route('**/*', request => {
    const resource = request.request()
    if (['fetch', 'xhr'].includes(resource.resourceType()) || new URL(resource.url()).origin !== entry.origin) {
      problems.push(`Unexpected request ${resource.url()}`)
      return request.abort()
    }
    return request.continue()
  })
  await page.goto(`${entry.href}?wechatTemplates&${flags}${route}`)
  await setup(page).waitFor()
  return page
}

try {
  const existing = await open('wechat&existingWechatTemplates')
  const agentInput = setup(existing).getByRole('textbox', { name: 'AgentId' })
  assert.equal(await agentInput.inputValue(), '1000002')
  assert.equal(await agentInput.getAttribute('inputmode'), 'numeric')
  await setup(existing).locator('.inline-edit-field__label').click()
  assert.equal(await agentInput.evaluate(input => document.activeElement === input), true)
  await checkCredentialLabels(existing)
  assert.equal(await setup(existing).locator('input').count(), 1)
  assert.equal(await setup(existing).getByText(/接收部门|接收用户|接收标签/).count(), 0)
  const seeded = (await snapshot(existing)).templates.filter(item => item.id.startsWith('fixture-template-'))
  assert.equal(seeded.length, 2)
  const fill = setup(existing).getByRole('button', { name: '补齐消息模板' })
  await fill.click()
  await setup(existing).getByText('已创建 2 个，跳过 2 个，失败 0 个').waitFor()
  const stored = await snapshot(existing)
  const config = stored.configs.find(item => item.id === 'corp-fixture')
  assert.equal(config.configuration.corpSecret, 'fixture-only-secret')
  assert.equal(config.configuration.agentId, '1000002')
  assert.equal(stored.calls.filter(([method]) => method === 'updateConfig').length, 0)
  const generated = stored.templates.filter(item => item.id.startsWith('fixture-template-') && item.type === 'weixin')
  assert.equal(generated.length, 4)
  for (const before of seeded) {
    assert.deepEqual(generated.find(item => item.id === before.id), before)
    const channel = stored.businessTypes.flatMap(item => item.channels).find(item => item.channelConfiguration?.templateId === before.id)
    assert.equal(channel.state, 'disabled')
  }
  const added = generated.filter(item => !seeded.some(before => before.id === item.id))
  for (const template of added) {
    assert.equal(template.configId, config.id)
    assert.equal(template.template.agentId, '1000002')
    assert.deepEqual(Object.keys(template.template).sort(), ['agentId', 'message'])
    const channel = stored.businessTypes.flatMap(item => item.channels).find(item => item.channelConfiguration?.templateId === template.id)
    assert.equal(channel.state, 'enabled')
    assert.equal(channel.channelConfiguration.variables.toUser.relation.objectSource.upperKey, 'subscriber')
  }
  const alarm = stored.businessTypes.find(item => item.provider === 'alarm-device')
  assert.equal(alarm.state, 'enabled')
  const relieve = stored.businessTypes.find(item => item.provider === 'alarm-device-relieve')
  assert.equal(relieve.state, 'disabled')
  const bulletin = stored.businessTypes.find(item => item.provider === 'SystemBulletin')
  assert.equal(bulletin.state, 'enabled')
  assert.equal(bulletin.defaultSubscribed, false)
  assert.equal(bulletin.channels.find(item => item.channelProvider === 'inside-mail').state, 'enabled')
  assert.match(added.find(item => item.name.includes('场景联动')).template.message, /detail\.sceneName/)
  assert.match(added.find(item => item.name.includes('系统公告')).template.message, /detail\.title/)
  assert.equal(stored.calls.some(([method]) => method.startsWith('send') || method === 'saveBusinessChannel'), false)
  await setup(existing).scrollIntoViewIfNeeded()
  await existing.screenshot({ path: join(output, 'wechat-message-templates-desktop.png') })
  await fill.click()
  await setup(existing).getByText('已创建 0 个，跳过 4 个，失败 0 个').waitFor()
  assert.equal((await snapshot(existing)).calls.filter(([method]) => method.startsWith('saveBusiness')).length, 2)
  await setup(existing).getByRole('button', { name: '消息模板', exact: true }).click()
  await existing.waitForFunction(() => window.__notificationSmoke.router.currentRoute.value.path === '/templates')
  await openTemplate(existing, alarm.id)
  await existing.getByText('已保存', { exact: true }).waitFor()
  const inboxSetup = existing.getByRole('button', { name: '补齐站内信', exact: true })
  await inboxSetup.click()
  await existing.getByText('站内信渠道已补齐', { exact: true }).waitFor()
  await inboxSetup.waitFor({ state: 'hidden' })
  const repaired = await snapshot(existing)
  assert.deepEqual(repaired.calls.filter(([method]) => method === 'saveBusinessChannel'), [['saveBusinessChannel', {
    providerId: alarm.id, channel: { channelProvider: 'inside-mail', name: '站内信', state: 'enabled' },
  }]])
  const repairedAlarm = repaired.businessTypes.find(item => item.id === alarm.id)
  assert.deepEqual(repairedAlarm.channels.find(item => item.channelProvider === 'notifier-weixin'), alarm.channels[0])
  assert.equal(repairedAlarm.channels.find(item => item.channelProvider === 'inside-mail').state, 'enabled')
  assert.equal(repairedAlarm.state, 'enabled')
  await openTemplate(existing, relieve.id)
  await existing.getByText('已保存', { exact: true }).waitFor()
  const existingHeader = existing.locator('.message-templates__header')
  assert.equal(await existingHeader.getByText(subscriptionStatus).count(), 0)
  const channelSwitch = wechatSwitch(existing)
  assert.equal(await channelSwitch.count(), 0)
  assert.equal(await existingHeader.getByRole('button', { name: subscriptionAction }).count(), 0)

  const edit = existing.getByRole('button', { name: /编\s*辑/ })
  await edit.click()
  await existing.getByText('在此编辑消息内容。请到「通知渠道」管理接收范围。').waitFor()
  assert.equal(await existing.getByText(/接收部门|接收用户|接收标签/).count(), 0)
  assert.equal(await channelSwitch.count(), 0)
  const message = '设备告警解除提醒已更新'
  await existing.getByRole('textbox', { name: '正文', exact: true }).fill(message)
  await existing.getByRole('button', { name: '保存模板', exact: true }).click()
  await edit.waitFor()
  const updated = await snapshot(existing)
  const [, change] = updated.calls.filter(([method]) => method === 'saveBusinessTemplate').at(-1)
  assert.equal(change.providerId, relieve.id)
  assert.equal(change.channelProvider, 'notifier-weixin')
  assert.equal(change.item.channel.state, undefined)
  assert.equal(updated.businessTypes.find(item => item.id === relieve.id).channels[0].state, 'disabled')
  assert.equal(updated.businessTypes.find(item => item.provider === 'alarm-device').channels[0].state, 'disabled')
  const originalTemplate = seeded.find(item => item.id === relieve.channels[0].channelConfiguration.templateId)
  assert.equal(change.item.template.id, originalTemplate.id)
  assert.equal(change.item.template.template.agentId, originalTemplate.template.agentId)
  assert.equal(change.item.template.template.message, message)
  await existing.evaluate(() => window.__notificationSmoke.router.push('/channels'))
  await openTemplate(existing, relieve.id)
  await existing.locator('.wechat-template__card').getByText(message, { exact: true }).waitFor()
  await existing.screenshot({ path: join(output, 'wechat-template-channel-disabled.png') })
  assert.equal(await existingHeader.getByText(subscriptionStatus).count(), 0)
  assert.equal((await snapshot(existing)).calls
    .some(([method, input]) => method === 'saveBusinessChannel' && input.channel.channelProvider === 'notifier-weixin'), false)
  await openTemplate(existing, alarm.id)
  await existing.getByText('已保存', { exact: true }).waitFor()
  assert.equal(await inboxSetup.count(), 0)
  await existing.close()

  const fresh = await open('fresh', 390)
  await checkCredentialLabels(fresh)
  const agent = setup(fresh).getByRole('textbox', { name: 'AgentId' })
  assert.equal(await agent.isDisabled(), false)
  assert.equal((await snapshot(fresh)).calls.some(([method]) => method === 'queryTemplateDirectory'), false)
  await channelField(fresh, '企业 ID（CorpID）').locator('input').fill('fixture-fresh-corp')
  await channelField(fresh, 'Secret').locator('input').fill('fixture-fresh-secret')
  await save(fresh).click()
  await setup(fresh).getByText('请输入有效的 AgentId').waitFor()
  assert.equal((await snapshot(fresh)).configs.length, 0)
  await agent.fill('8000002')
  await save(fresh).click()
  await setup(fresh).getByText('已创建 4 个，跳过 0 个，失败 0 个').waitFor()
  const provisioned = await snapshot(fresh)
  const [newConfig] = provisioned.configs
  assert.deepEqual(newConfig.configuration.alarmTemplateDefaults, { agentId: '8000002' })
  assert.equal(provisioned.calls.filter(([method]) => method === 'createConfig').length, 1)
  assert.equal(provisioned.calls.filter(([method]) => method === 'updateConfig').length, 0)
  assert.equal(provisioned.templates.filter(item => item.configId === newConfig.id && item.template.agentId === '8000002').length, 4)
  assert.ok(provisioned.businessTypes.every(item => item.state === 'enabled' && item.channels[0].state === 'enabled'))
  const newBusinesses = provisioned.businessTypes.filter(item => ['alarm-device-relieve', 'SystemBulletin'].includes(item.provider))
  assert.ok(newBusinesses.every(item => item.defaultSubscribed === false
    && item.channels.some(channel => channel.channelProvider === 'inside-mail' && channel.state === 'enabled')))
  assert.ok(await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await setup(fresh).scrollIntoViewIfNeeded()
  await fresh.screenshot({ path: join(output, 'wechat-message-templates-mobile.png') })
  await openTemplate(fresh, newBusinesses[0].id)
  await fresh.locator('.wechat-template__card').waitFor()
  const freshHeader = fresh.locator('.message-templates__header')
  await freshHeader.getByText('已保存', { exact: true }).waitFor()
  assert.equal(await freshHeader.getByText(subscriptionStatus).count(), 0)
  assert.equal(await freshHeader.getByRole('button', { name: subscriptionAction }).count(), 0)
  assert.equal(await wechatSwitch(fresh).count(), 0)
  assert.ok(await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await fresh.close()

  const denied = await open('wechat&permission=no-template')
  await setup(denied).getByRole('textbox', { name: 'AgentId' }).fill('8000003')
  await save(denied).click()
  await setup(denied).getByText('当前账号没有补齐消息模板的权限').waitFor()
  const readOnly = await snapshot(denied)
  assert.equal(readOnly.calls.filter(([method]) => method === 'updateConfig').length, 1)
  assert.equal(readOnly.calls.some(([method]) => method === 'queryTemplateDirectory' || method.startsWith('saveBusiness')), false)
  await denied.close()

  assert.deepEqual(problems, [])
  console.log('WeCom auto-provisioning, inbox repair, header-only business controls, template save, permission and narrow viewport checks passed.')
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await browser.close()
}
