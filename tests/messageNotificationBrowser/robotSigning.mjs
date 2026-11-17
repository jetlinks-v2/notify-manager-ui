import { editButton } from './channelEditing.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9200'
const output = process.env.SMOKE_OUTPUT || '/tmp/robot-configurations-browser'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, baseURL)
const report = { assertions: [], screenshots: [], errors: [], blockedRequests: [] }
const browser = await chromium.launch({ headless: true })
await mkdir(output, { recursive: true })
const pass = message => report.assertions.push(message)
async function eventually(assertion) {
  const deadline = Date.now() + 8000
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
const row = (page, id) => page.locator(`.robot-configurations__row[data-config-id="${id}"]`)
const modal = page => page.locator('.robot-configuration-modal')
async function open(flags = 'robotSigning', configId = 'robot-one') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  page.setDefaultTimeout(8000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.routeWebSocket('**/*', () => {})
  await page.route('**/*', route => {
    const request = route.request()
    if (['fetch', 'xhr'].includes(request.resourceType()) || new URL(request.url()).origin !== new URL(baseURL).origin) {
      report.blockedRequests.push(request.url()); return route.abort()
    }
    return route.continue()
  })
  await page.goto(`${entry.href}?${flags}&writeDelay=350#/channels?channel=dingTalk:dingTalkRobotWebHook${configId ? `&configId=${configId}` : ''}`)
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
  await eventually(async () => assert.equal(await editButton(page, await t(page, 'messageNotification.channels.robot.add')).isEnabled(), !flags.includes('permission=read')))
  return page
}
async function action(page, id, key) {
  if (key === 'test') return editButton(row(page, id), await t(page, 'messageNotification.channels.robot.test')).click()
  await editButton(row(page, id), await t(page, 'messageNotification.channels.more')).click()
  await editButton(page.locator('.ant-dropdown:visible'), await t(page, `messageNotification.common.${key}`)).click()
  await page.locator('.ant-dropdown:visible').waitFor({ state: 'hidden' })
  if (key === 'edit') await modal(page).waitFor()
}
async function fill(page, key, value) {
  await modal(page).getByRole('textbox', { name: await t(page, `messageNotification.channels.robot.${key}`), exact: true }).fill(value)
}
async function save(page) { await modal(page).locator('.ant-modal-footer .ant-btn-primary').click() }
async function cancel(page) {
  await editButton(modal(page), await t(page, 'messageNotification.common.cancel')).click()
  await modal(page).waitFor({ state: 'hidden' })
}
async function assertHidden(page) {
  assert.equal(await page.getByLabel(await t(page, 'messageNotification.channels.robot.secretLabel'), { exact: true }).count(), 0)
  assert.equal(await editButton(page, await t(page, 'messageNotification.channels.robot.clearSecret')).count(), 0)
}
async function snapshot(page, name) {
  const target = path.join(output, `${name}.png`)
  await page.screenshot({ path: target, fullPage: true, animations: 'disabled' })
  report.screenshots.push(target)
}
try {
  const page = await open()
  await row(page, 'robot-one').waitFor()
  assert.equal(await page.locator('.robot-configurations__row').count(), 4)
  assert.equal(await page.locator('.notification-channels__selector, .channel-configuration').count(), 0)
  const help = page.locator('#notification-channel-help')
  await help.waitFor()
  assert.equal(await editButton(page, await t(page, 'messageNotification.channels.helpTitle')).count(), 0)
  assert.equal(await help.locator('.channel-help__section').count(), 1)
  const listBounds = await page.locator('.robot-configurations').boundingBox()
  const helpBounds = await help.boundingBox()
  assert.ok(helpBounds.x >= listBounds.x + listBounds.width)
  assert.equal(await help.getByRole('heading', { name: await t(page, 'messageNotification.channels.helpTitle'), exact: true }).count(), 0)
  assert.equal(await editButton(help, await t(page, 'messageNotification.channels.collapseHelp')).count(), 0)
  pass('robot list retains configuration guidance without a panel title or collapse button')
  for (const id of ['one', 'two', 'unsigned']) {
    await action(page, `robot-${id}`, 'edit')
    await assertHidden(page)
    assert.equal(await modal(page).locator('input').count(), 2)
    await fill(page, 'webhook', `https://oapi.dingtalk.com/robot/send?access_token=private-${id}-1234`)
    await save(page)
    await modal(page).waitFor({ state: 'hidden' })
    assert.equal((await config(page, `robot-${id}`)).configuration.secret, id === 'unsigned' ? undefined : `SECfixture-${id}`)
    assert.match(await row(page, `robot-${id}`).innerText(), /access_token=…1234/)
    assert.doesNotMatch(await row(page, `robot-${id}`).innerHTML(), new RegExp(`private-${id}`))
  }
  pass('list rows replace the selector; two-field modal edits preserve isolated signed and unsigned configuration, and redact URLs')
  await snapshot(page, 'robot-list')
  await action(page, 'robot-two', 'edit')
  await fill(page, 'name', 'Cancel this name')
  await cancel(page)
  assert.equal((await config(page, 'robot-two')).name, 'robot-two')
  await action(page, 'robot-two', 'edit')
  await fill(page, 'name', 'Updated robot name')
  await page.evaluate(() => window.__notificationSmoke.failures.add('updateConfig'))
  await save(page)
  await eventually(async () => assert.equal(await modal(page).locator('.ant-modal-footer .ant-btn-primary').isEnabled(), true))
  assert.equal(await modal(page).getByRole('textbox', { name: await t(page, 'messageNotification.channels.robot.name'), exact: true }).inputValue(), 'Updated robot name')
  await save(page)
  await modal(page).waitFor({ state: 'hidden' })
  assert.equal((await config(page, 'robot-two')).name, 'Updated robot name')
  pass('cancel restores saved values; failed updates keep input and retry the selected robot')
  await action(page, 'robot-masked', 'edit')
  const beforeMasked = await updates(page)
  await fill(page, 'name', 'Blocked masked key')
  await save(page)
  await modal(page).locator('.ant-alert-error').waitFor()
  assert.equal(await updates(page), beforeMasked)
  assert.equal((await config(page, 'robot-masked')).configuration.secret, '********')
  await assertHidden(page)
  await cancel(page)
  pass('masked signing credentials block unsafe saves with a visible error and no signing controls')
  await action(page, 'robot-two', 'test')
  await page.locator('.notification-channel-test').waitFor()
  assert.equal(await page.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.configId), 'robot-two')
  await editButton(page.locator('.notification-channel-test'), await t(page, 'messageNotification.channelTest.send')).click()
  await eventually(async () => assert.equal(await page.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => method === 'sendInline').at(-1)?.[1].configId), 'robot-two'))
  await editButton(page.locator('.notification-channel-test'), await t(page, 'messageNotification.common.close')).click()
  await action(page, 'robot-two', 'delete')
  await page.locator('.notification-channels__clear').waitFor()
  assert.match(await page.locator('.notification-channels__clear').innerText(), /Updated robot name/)
  await editButton(page.locator('.notification-channels__clear'), await t(page, 'messageNotification.channels.clearConfirm')).click()
  await row(page, 'robot-two').waitFor({ state: 'hidden' })
  assert.equal((await config(page, 'robot-one')).configuration.secret, 'SECfixture-one')
  pass('row test and delete use the clicked robot ID and keep other robots intact')
  for (const language of ['zh', 'en', 'ja']) {
    await page.evaluate(language => { window.__notificationSmoke.i18n.global.locale.value = language }, language)
    await action(page, 'robot-one', 'edit')
    await assertHidden(page)
    assert.equal(await modal(page).getByRole('textbox').count(), 2)
    await page.setViewportSize({ width: 390, height: 844 })
    await snapshot(page, `robot-edit-${language}-mobile`)
    const dimensions = await modal(page).evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, viewport: innerWidth, document: document.documentElement.scrollWidth }))
    assert.ok(dimensions.left >= 0 && dimensions.right <= dimensions.viewport + 1 && dimensions.document <= dimensions.viewport + 1, JSON.stringify(dimensions))
    await cancel(page)
    assert.equal(await editButton(page, await t(page, 'messageNotification.channels.robot.add')).isVisible(), true)
    assert.equal(await help.isVisible(), true)
    const mobileList = await page.locator('.robot-configurations').boundingBox()
    const mobileHelp = await help.boundingBox()
    assert.ok(mobileHelp.y >= mobileList.y + mobileList.height)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await snapshot(page, 'robot-list-mobile')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  pass('Chinese, English and Japanese modal labels and compact list fit 390px without horizontal overflow')
  await page.close()

  const fresh = await open('fresh', '')
  await fresh.locator('#notification-channel-help').waitFor()
  assert.equal(await editButton(fresh, await t(fresh, 'messageNotification.channels.helpTitle')).count(), 0)
  await snapshot(fresh, 'robot-empty-help')
  await editButton(fresh, await t(fresh, 'messageNotification.channels.robot.add')).click()
  await fill(fresh, 'name', '')
  await save(fresh)
  await modal(fresh).locator('.ant-form-item-explain-error').first().waitFor()
  await fill(fresh, 'name', '运维值班群')
  await fill(fresh, 'webhook', 'invalid')
  await save(fresh)
  await modal(fresh).getByText(await t(fresh, 'messageNotification.channels.validation.url'), { exact: true }).waitFor()
  await cancel(fresh)
  assert.equal(await fresh.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => method === 'createConfig').length), 0)
  await editButton(fresh, await t(fresh, 'messageNotification.channels.robot.add')).click()
  assert.equal(await modal(fresh).getByRole('textbox', { name: await t(fresh, 'messageNotification.channels.robot.webhook'), exact: true }).inputValue(), '')
  await fill(fresh, 'name', '运维值班群')
  await fill(fresh, 'webhook', 'https://oapi.dingtalk.com/robot/send?access_token=new-private-a8f3')
  await snapshot(fresh, 'robot-add-modal')
  await save(fresh)
  await modal(fresh).waitFor({ state: 'hidden' })
  await fresh.locator('.robot-configurations__row').waitFor()
  assert.equal(await fresh.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => method === 'createConfig').length), 1)
  await snapshot(fresh, 'robot-added')
  pass('empty-state Add opens the dialog; validation, cancel, reopen and one-write save produce a redacted named row')
  await fresh.close()
  const noAdd = await open('fresh&permission=read', '')
  assert.equal(await editButton(noAdd, await t(noAdd, 'messageNotification.channels.robot.add')).isDisabled(), true)
  await noAdd.close()
  const legacy = await open('robotSigning&legacyRobotMetadata')
  await action(legacy, 'robot-one', 'edit')
  await assertHidden(legacy)
  await fill(legacy, 'webhook', 'https://fixture.example.test/old-backend')
  await save(legacy)
  await modal(legacy).waitFor({ state: 'hidden' })
  assert.equal((await config(legacy, 'robot-one')).configuration.secret, 'SECfixture-one')
  await legacy.close()
  pass('add permission and old-backend hidden signing-key preservation remain effective')
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.blockedRequests, [])
} catch (error) {
  report.failure = error.stack
  for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) await snapshot(page, `failure-${index}`).catch(() => {})
  process.exitCode = 1
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
