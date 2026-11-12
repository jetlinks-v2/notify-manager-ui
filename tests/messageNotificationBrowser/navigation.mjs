import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9200'
const output = process.env.SMOKE_OUTPUT || '/tmp/notification-menu-browser'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, base)
const report = { passed: [], errors: [], blockedRequests: [] }
const browser = await chromium.launch({ headless: true })
await mkdir(output, { recursive: true })
async function open(route, flags = '') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.route('**/*', request => {
    const item = request.request()
    if (['xhr', 'fetch'].includes(item.resourceType()) || new URL(item.url()).origin !== new URL(base).origin) {
      report.blockedRequests.push(item.url())
      return request.abort()
    }
    return request.continue()
  })
  await page.goto(`${entry.href}${flags}#/${route}`)
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
  return page
}
const translate = (page, key) => page.evaluate(key => window.__notificationSmoke.i18n.global.t(key), key)
const button = async (page, key) => page.getByRole('button', { name: new RegExp(`^${(await translate(page, key)).split('').join('\\s*')}$`) })
try {
  const channels = await open('channels?configId=smtp-backup')
  await channels.waitForFunction(() => window.__notificationSmoke.router.currentRoute.value.query.channel === 'email:embedded')
  await channels.locator('.channel-configuration').waitFor()
  assert.equal(await channels.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.configId), 'smtp-backup')
  assert.equal(await channels.evaluate(() => window.__notificationSmoke.calls.some(([method, id]) => method === 'getConfig' && id === 'smtp-primary')), false)
  report.passed.push('configId-only entry selects the exact configuration and its provider')
  await channels.evaluate(() => window.__notificationSmoke.router.replace('/channels?channel=voice:aliyun'))
  await channels.locator('.channel-configuration').waitFor()
  await channels.waitForFunction(() => window.__notificationSmoke.calls.some(([method, value]) => method === 'getConfigMetadata' && value.type === 'voice'))
  await channels.screenshot({ path: `${output}/voice-channel.png`, fullPage: true })
  report.passed.push('voice:aliyun opens the matching provider configuration')
  await channels.close()

  const linked = await open('templates?topicProvider=alarm-device-relieve&channelProvider=notifier-email', '?directory=tree')
  await linked.waitForFunction(() => window.__notificationSmoke.calls.some(([method, input]) => method === 'getBusinessTemplate' && input.providerId === 'relieve-config'))
  await linked.locator('.template-preview').getByText('告警解除通知内容', { exact: true }).waitFor()
  await linked.screenshot({ path: `${output}/business-template.png`, fullPage: true })
  report.passed.push('business link selects the exact bound child template in the new page')
  await linked.close()

  const missing = await open('templates?topicProvider=scene&channelProvider=notifier-email', '?directory=tree')
  await missing.locator('.template-preview').waitFor()
  assert.equal(await missing.evaluate(() => window.__notificationSmoke.calls.some(([method]) => method === 'getTemplate')), false)
  assert.equal(await missing.evaluate(() => window.__notificationSmoke.calls.some(([method]) => method.startsWith('saveBusiness') || method === 'setBusinessEnabled')), false)
  await missing.getByRole('button', { name: await translate(missing, 'messageNotification.templates.enableBusiness'), exact: true }).click()
  await missing.waitForFunction(() => window.__notificationSmoke.router.currentRoute.value.query.topicProvider === 'actual-scene')
  await (await button(missing, 'messageNotification.templates.edit')).click()
  await missing.locator('.template-editor').waitFor()
  assert.equal(await missing.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.topicProvider), 'actual-scene')
  await missing.getByRole('button', { name: await translate(missing, 'messageNotification.channel.sms'), exact: true }).click()
  await missing.waitForFunction(() => window.__notificationSmoke.router.currentRoute.value.query.channel === 'sms:aliyunSms')
  assert.equal(await missing.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.topicProvider), 'actual-scene')
  report.passed.push('unbound business previews defaults without writes and explicit enable preserves its concrete record across channels')
  await missing.screenshot({ path: `${output}/unbound-business.png`, fullPage: true })
  await missing.setViewportSize({ width: 390, height: 844 })
  await missing.screenshot({ path: `${output}/business-mobile.png`, fullPage: true })
  assert.equal(await missing.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await missing.close()

  const retry = await open('templates?topicProvider=alarm-device', '?directory=tree&fail=queryTemplateDirectory')
  await retry.locator('.message-templates__detail .ant-alert-warning').waitFor()
  assert.equal(await retry.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.templateId), undefined)
  await retry.locator('.message-templates__detail .ant-alert-warning button').click()
  await retry.locator('.template-preview').waitFor()
  report.passed.push('failed business directory stays explicit and retry restores the exact binding')
  await retry.close()

  const saved = await open('channels', '?directory=tree')
  await saved.evaluate(async () => {
    const session = 'a'.repeat(32)
    window.navigationEvents = []
    window.navigationListener = new BroadcastChannel(`jetlinks.visual-alarm-template.v1.${session}`)
    window.navigationListener.onmessage = event => window.navigationEvents.push(event.data)
    const state = window.__notificationSmoke
    state.businessTypes.find(item => item.provider === 'aiSecurityAlarm').id = 'actual-security'
    state.businessTypes.find(item => item.provider === 'aiSecurityAlarm').channels = [{ channelProvider: 'notifier-email', channelConfiguration: { templateId: 'template-alarm' } }]
    await state.router.push({ path: '/templates', query: { topicProvider: 'aiSecurityAlarm', aiAlarmType: 'aiSecurityAlarm', visualAlarmSession: session } })
  })
  await saved.locator('.template-preview').waitFor()
  await (await button(saved, 'messageNotification.templates.edit')).click()
  const subject = await translate(saved, 'messageNotification.templates.visual.subject')
  await saved.locator('.template-editor .ant-form-item').filter({ has: saved.locator('.ant-form-item-label').filter({ hasText: subject }) }).locator('input').fill('导航迁移保存测试')
  await (await button(saved, 'messageNotification.templates.save')).click()
  await saved.waitForFunction(() => window.navigationEvents.length === 1)
  assert.deepEqual(await saved.evaluate(() => window.navigationEvents), [{ type: 'template-saved', version: 1, alarmType: 'aiSecurityAlarm' }])
  assert.equal(await saved.evaluate(() => window.__notificationSmoke.calls.some(([method]) => method === 'send' || method === 'createTemplate')), false)
  report.passed.push('successful edit of a bound template publishes the originating AI alarm session event')
  await saved.evaluate(() => window.navigationListener.close())
  await saved.close()
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.blockedRequests, [])
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
