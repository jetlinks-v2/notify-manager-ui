import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9200'
const output = process.env.SMOKE_OUTPUT || '/tmp/dingtalk-sign-browser'
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
  await page.getByRole('button', { name: label, exact: true }).click()
  const input = page.getByRole('textbox', { name: label, exact: true })
  // Password inputs have no implicit textbox role.
  const control = await input.count() ? input : page.locator('input').filter({ visible: true }).and(page.getByLabel(label, { exact: true }))
  await control.fill(value)
  await control.press('Enter')
  await page.getByRole('button', { name: label, exact: true }).waitFor()
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
  const cancelLabel = new RegExp((await t(page, 'messageNotification.common.cancel')).split('').join('\\s*'))
  assert.notEqual(label, 'messageNotification.channels.robot.secretLabel')
  const secretTrigger = page.getByRole('button', { name: label, exact: true })
  assert.match(await secretTrigger.innerText(), /••••••••/)
  await secretTrigger.click()
  const secretInput = page.getByLabel(label, { exact: true }).filter({ visible: true })
  assert.equal(await secretInput.inputValue(), '')
  const beforeBlank = await updates(page)
  await secretInput.press('Enter')
  await secretTrigger.waitFor()
  assert.equal(await updates(page), beforeBlank)
  assert.equal((await config(page, 'robot-one')).configuration.secret, 'SECfixture-one')
  pass('saved signing key is masked; a blank edit retains it without a write')
  await edit(page, label, 'SECreplacement')
  assert.equal((await config(page, 'robot-one')).configuration.secret, 'SECreplacement')
  await secretTrigger.click()
  await page.getByLabel(label, { exact: true }).fill('SECcancelled')
  await page.getByLabel(label, { exact: true }).press('Escape')
  assert.equal((await config(page, 'robot-one')).configuration.secret, 'SECreplacement')
  pass('replacement saves; cancelling an edited secret retains the saved value')
  await page.getByRole('button', { name: clearLabel, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByRole('button', { name: cancelLabel, exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal((await config(page, 'robot-one')).configuration.secret, 'SECreplacement')
  await page.evaluate(() => window.__notificationSmoke.failures.add('updateConfig'))
  await page.getByRole('button', { name: clearLabel, exact: true }).click()
  await dialog.getByRole('button', { name: clearLabel, exact: true }).click()
  await dialog.locator('.ant-alert-error').waitFor()
  assert.equal((await config(page, 'robot-one')).configuration.secret, 'SECreplacement')
  await snapshot(page, 'clear-failure')
  pass('clear cancellation and failed requests keep the saved key and allow retry')
  await dialog.getByRole('button', { name: clearLabel, exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal((await config(page, 'robot-one')).configuration.secret, '')
  assert.equal((await config(page, 'robot-one')).configuration.url, 'https://fixture.example.test/robot/one')
  assert.equal(await page.getByRole('button', { name: clearLabel, exact: true }).count(), 0)
  assert.equal(await page.evaluate(() => window.__notificationSmoke.calls.some(([method, payload]) => method === 'updateConfig' && JSON.stringify(payload).includes('clearSecret'))), false)
  await choose(page, 'robot-two')
  assert.equal((await config(page, 'robot-two')).configuration.secret, 'SECfixture-two')
  assert.match(await secretTrigger.innerText(), /••••••••/)
  await choose(page, 'robot-one')
  assert.equal(await page.getByRole('button', { name: clearLabel, exact: true }).count(), 0)
  pass('successful clear writes an empty secret only for the selected robot')
  await choose(page, 'robot-unsigned')
  await edit(page, urlLabel, 'https://fixture.example.test/robot/legacy-edited')
  assert.equal((await config(page, 'robot-unsigned')).configuration.secret, undefined)
  await edit(page, label, 'SECadded')
  assert.equal((await config(page, 'robot-unsigned')).configuration.secret, 'SECadded')
  pass('legacy robot without a key can edit its Webhook and add signing later')
  await choose(page, 'robot-masked')
  await page.getByRole('button', { name: urlLabel, exact: true }).click()
  await page.getByLabel(urlLabel, { exact: true }).fill('https://fixture.example.test/blocked')
  await page.getByLabel(urlLabel, { exact: true }).press('Enter')
  await page.locator('.inline-edit-field__editor .ant-input-affix-wrapper-status-error').first().waitFor()
  assert.equal((await config(page, 'robot-masked')).configuration.url, 'https://fixture.example.test/robot/masked')
  await page.getByLabel(urlLabel, { exact: true }).press('Escape')
  await page.getByRole('button', { name: clearLabel, exact: true }).click()
  await dialog.getByRole('button', { name: clearLabel, exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal((await config(page, 'robot-masked')).configuration.secret, '')
  pass('masked server credentials block ordinary editing but allow explicit clear')
  await choose(page, 'robot-two')
  for (const language of ['en', 'ja', 'zh']) {
    await page.evaluate(language => { window.__notificationSmoke.i18n.global.locale.value = language }, language)
    const translated = await t(page, 'messageNotification.channels.robot.secretLabel')
    assert.notEqual(translated, 'messageNotification.channels.robot.secretLabel')
    await page.getByRole('button', { name: translated, exact: true }).waitFor()
  }
  pass('signing labels resolve in Chinese, English and Japanese')
  await snapshot(page, 'signed-robot')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: clearLabel, exact: true }).click()
  await dialog.waitFor()
  await dialog.getByRole('button', { name: cancelLabel, exact: true }).hover()
  await snapshot(page, 'clear-narrow')
  const dimensions = await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth, document: document.documentElement.scrollWidth }
  })
  assert.ok(dimensions.left >= 0 && dimensions.right <= dimensions.viewport + 1, JSON.stringify(dimensions))
  assert.ok(dimensions.width >= 300 && dimensions.document <= dimensions.viewport + 1, JSON.stringify(dimensions))
  await dialog.getByRole('button', { name: cancelLabel, exact: true }).click()
  pass('clear confirmation remains usable at a 390px viewport')
  assert.equal(await page.evaluate(() => window.__notificationSmoke.calls.some(([method]) => ['send', 'sendInline'].includes(method))), false)
  await page.close()
  const legacy = await open('&legacyRobotMetadata')
  assert.equal(await legacy.getByRole('button', { name: label, exact: true }).count(), 0)
  assert.equal(await legacy.getByRole('button', { name: clearLabel, exact: true }).count(), 0)
  await edit(legacy, urlLabel, 'https://fixture.example.test/old-backend')
  assert.equal((await config(legacy, 'robot-one')).configuration.secret, 'SECfixture-one')
  pass('old backend metadata offers no signing controls and keeps existing fields when edited')
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
