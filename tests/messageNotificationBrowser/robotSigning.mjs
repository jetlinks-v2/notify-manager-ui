import { beginChannelEdit, saveChannelDraft, cancelChannelEdit } from './channelEditing.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9200'
const output = process.env.SMOKE_OUTPUT || '/tmp/dingtalk-secret-hidden/browser'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, baseURL)
const report = { assertions: [], screenshots: [], errors: [], blockedRequests: [] }
const browser = await chromium.launch({ headless: true })
await mkdir(output, { recursive: true })
const pass = message => report.assertions.push(message)
async function eventually(assertion) {
  const deadline = Date.now() + 6000
  while (true) {
    try { return await assertion() } catch (error) {
      if (Date.now() >= deadline) throw error
      await new Promise(resolve => setTimeout(resolve, 60))
    }
  }
}
const t = (page, key) => page.evaluate(key => window.__notificationSmoke.i18n.global.t(key), key)
const config = (page, id) => page.evaluate(id => window.__notificationSmoke.configs.find(row => row.id === id), id)
const updates = page => page.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => method === 'updateConfig').length)
async function open(extra = '') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  page.setDefaultTimeout(6000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.route('**/*', route => {
    const request = route.request()
    if (['fetch', 'xhr'].includes(request.resourceType()) || new URL(request.url()).origin !== new URL(baseURL).origin) {
      report.blockedRequests.push(request.url())
      return route.abort()
    }
    return route.continue()
  })
  await page.goto(`${entry.href}?robotSigning&writeDelay=200${extra}#/channels?channel=dingTalk:dingTalkRobotWebHook&configId=robot-one`)
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
  await page.locator('.channel-configuration').waitFor()
  return page
}
async function choose(page, id) {
  await page.locator('.notification-channels__selector').click()
  await page.locator('.ant-select-item-option').filter({ hasText: id }).click()
  await eventually(async () => assert.equal(await page.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.configId), id))
  await page.locator('.channel-configuration').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
}
async function edit(page, label, value) {
  await beginChannelEdit(page)
  const input = page.getByRole('textbox', { name: label, exact: true })
  // Password inputs have no implicit textbox role.
  const control = await input.count() ? input : page.locator('input').filter({ visible: true }).and(page.getByLabel(label, { exact: true }))
  await control.fill(value)
  await control.press('Enter')
  await saveChannelDraft(page)
  await page.locator('.notification-channels__footer').waitFor({ state: 'hidden' })
}
async function snapshot(page, name) {
  const target = path.join(output, `${name}.png`)
  await page.screenshot({ path: target, fullPage: true, animations: 'disabled' })
  report.screenshots.push(target)
}
try {
  const page = await open()
  const label = await t(page, 'messageNotification.channels.robot.secretLabel')
  const urlLabel = await t(page, 'messageNotification.channels.fields.url')
  const clearLabel = await t(page, 'messageNotification.channels.robot.clearSecret')
  async function assertHidden(current) {
    assert.equal(await current.getByRole('button', { name: label, exact: true }).count(), 0)
    assert.equal(await current.getByLabel(label, { exact: true }).count(), 0)
    assert.equal(await current.getByRole('button', { name: clearLabel, exact: true }).count(), 0)
  }
  await assertHidden(page)
  await edit(page, urlLabel, 'https://fixture.example.test/robot/one-edited')
  assert.equal((await config(page, 'robot-one')).configuration.secret, 'SECfixture-one')
  pass('signing input and clear action are hidden; Webhook edits retain the saved signing key')
  await choose(page, 'robot-two')
  await assertHidden(page)
  await edit(page, urlLabel, 'https://fixture.example.test/robot/two-edited')
  assert.equal((await config(page, 'robot-two')).configuration.secret, 'SECfixture-two')
  assert.equal((await config(page, 'robot-one')).configuration.secret, 'SECfixture-one')
  pass('switching robots keeps signing controls hidden and stored keys isolated')
  await choose(page, 'robot-unsigned')
  await assertHidden(page)
  await edit(page, urlLabel, 'https://fixture.example.test/robot/legacy-edited')
  assert.equal((await config(page, 'robot-unsigned')).configuration.secret, undefined)
  pass('unsigned legacy robots can still edit their Webhook without adding a signing key')
  await choose(page, 'robot-masked')
  await assertHidden(page)
  const beforeMasked = await updates(page)
  await beginChannelEdit(page)
  await page.getByLabel(urlLabel, { exact: true }).fill('https://fixture.example.test/blocked')
  await page.getByLabel(urlLabel, { exact: true }).press('Enter')
  await saveChannelDraft(page)
  await page.locator('.channel-configuration__error').waitFor()
  assert.equal(await updates(page), beforeMasked)
  assert.equal((await config(page, 'robot-masked')).configuration.secret, '********')
  await cancelChannelEdit(page)
  pass('masked signing keys remain protected from unsafe updates while controls are hidden')
  await choose(page, 'robot-one')
  for (const language of ['en', 'ja', 'zh']) {
    await page.evaluate(language => { window.__notificationSmoke.i18n.global.locale.value = language }, language)
    const translated = await t(page, 'messageNotification.channels.robot.secretLabel')
    const clear = await t(page, 'messageNotification.channels.robot.clearSecret')
    assert.equal(await page.getByRole('button', { name: translated, exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: clear, exact: true }).count(), 0)
  }
  await snapshot(page, 'hidden-signing-controls')
  pass('signing controls remain hidden in Chinese, English and Japanese')
  assert.equal(await page.evaluate(() => window.__notificationSmoke.calls.some(([method]) => ['send', 'sendInline'].includes(method))), false)
  await page.close()
  const legacy = await open('&legacyRobotMetadata')
  await assertHidden(legacy)
  await edit(legacy, urlLabel, 'https://fixture.example.test/old-backend')
  assert.equal((await config(legacy, 'robot-one')).configuration.secret, 'SECfixture-one')
  pass('old backend metadata keeps signing controls hidden and preserves saved configuration')
  await legacy.close()
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.blockedRequests, [])
} catch (error) {
  report.failure = error.stack
  process.exitCode = 1
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
