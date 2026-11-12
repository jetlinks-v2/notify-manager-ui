import { beginChannelEdit, saveChannelDraft, cancelChannelEdit } from './channelEditing.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { trialRecords } from './trialFixtures.mjs'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9200'
const output = process.env.SMOKE_OUTPUT || '/tmp/channel-unified-browser'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, baseURL)
const report = { assertions: [], screenshots: [], errors: [], blockedRequests: [] }
const browser = await chromium.launch({ headless: true })
await mkdir(output, { recursive: true })
const pass = value => report.assertions.push(value)
const button = (scope, text) => scope.getByRole('button', { name: new RegExp(`^${text.split('').join('\\s*')}$`) })
const sends = page => page.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => method === 'sendInline'))
async function eventually(check) {
  const deadline = Date.now() + 8000
  while (true) { try { return await check() } catch (error) { if (Date.now() >= deadline) throw error; await new Promise(resolve => setTimeout(resolve, 70)) } }
}
async function open(extra = '', record = trialRecords[0]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  page.setDefaultTimeout(8000)
  page.on('pageerror', error => report.errors.push(error.message))
  // Keep a fixed source snapshot: concurrent workspace builds must not reload the Vite fixture mid-trial.
  await page.routeWebSocket('**/*', () => {})
  // Vite source requests are allowed. Every business fetch/XHR and external request is blocked.
  await page.route('**/*', route => {
    const request = route.request()
    if (['fetch', 'xhr'].includes(request.resourceType()) || new URL(request.url()).origin !== new URL(baseURL).origin) {
      report.blockedRequests.push(request.url()); return route.abort()
    }
    return route.continue()
  })
  await page.goto(`${entry.href}?unifiedTests&permission=no-template&writeDelay=900${extra}#/channels?channel=${record.type}:${record.provider}&configId=${record.id}`)
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
  await page.locator('.channel-configuration').waitFor()
  return page
}
async function choose(page, record) {
  await page.evaluate(record => window.__notificationSmoke.router.push({ name: 'system/MessageNotification/Channels', query: { channel: `${record.type}:${record.provider}`, configId: record.id } }), record)
  await page.locator('.channel-configuration').waitFor()
  await eventually(async () => assert.equal(await button(page, '发送测试消息').isEnabled(), true))
}
async function show(page) {
  await button(page, '发送测试消息').click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await eventually(async () => assert.match(await dialog.innerText(), /发给自己|发送到当前配置/))
  return dialog
}
async function snapshot(page, name) {
  const file = path.join(output, `${name}.png`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file)
}
try {
  if (!process.env.TRIAL_SETTINGS_ONLY) {
    const page = await open()
    for (const record of trialRecords.filter(item => !['officialMessage', 'aliyun'].includes(item.provider))) {
      await choose(page, record)
      await beginChannelEdit(page)
      assert.equal(await page.locator('.inline-edit-field__trigger').count(), 0)
      assert.ok(await page.locator('.inline-edit-field__editor').count() > 0)
      await cancelChannelEdit(page)
      assert.equal(await page.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => method === 'updateConfig').length), 0)
      await page.getByRole('button', { name: '更多操作' }).click()
      assert.doesNotMatch(await page.locator('.ant-dropdown:visible').innerText(), /管理模[板版]/)
      await page.locator('.notification-channels__heading h2').click()
      const dialog = await show(page)
      assert.match(await dialog.innerText(), /发一条测试 ·/)
      assert.equal(await dialog.locator('textarea, .ant-select').count(), 0)
      const vendor = record.provider === 'aliyunSms'
      if (vendor) assert.match(await dialog.innerText(), /实际内容以服务商模板为准/)
      else assert.match(await dialog.innerText(), /隔离验证平台/)
      await eventually(async () => assert.equal(await button(dialog, '发送').isEnabled(), true))
      if (['dingTalkRobotWebHook', 'http'].includes(record.provider)) assert.equal(await dialog.getByRole('radio').count(), 0)
      else assert.equal(await dialog.getByRole('radio', { name: /发给自己/ }).isChecked(), true)
      if (record.provider === 'dingTalkMessage') await snapshot(page, 'dingtalk-unified-modal')
      const before = (await sends(page)).length
      await button(dialog, '发送').click()
      assert.equal(await button(dialog, '取消').isDisabled(), true)
      assert.equal(await dialog.locator('.ant-modal-footer .ant-btn-primary').isDisabled(), true)
      await dialog.getByText('已提交，请检查接收端', { exact: true }).waitFor()
      assert.equal((await sends(page)).length, before + 1)
      const payload = (await sends(page)).at(-1)[1]
      assert.equal(payload.configId, record.id)
      assert.equal(payload.template.id, undefined)
      if (record.provider === 'dingTalkMessage') assert.equal(payload.template.template.userIdList, 'self_dingTalkMessage')
      if (record.provider === 'corpMessage') assert.equal(payload.template.template.toUser, 'self_corpMessage')
      await button(dialog, '关闭').click()
      await dialog.waitFor({ state: 'hidden' })
    }
    pass('All six supported providers share the modal, saved target rules, submitted feedback and template-free menu/permissions')
    await choose(page, trialRecords[0])
    let dialog = await show(page)
    await dialog.getByRole('radio', { name: '其他接收人', exact: true }).check()
    const address = dialog.getByRole('textbox', { name: '其他接收人', exact: true })
    await address.fill('first@example.test,second@example.test'); await address.blur()
    assert.equal(await button(dialog, '发送').isDisabled(), true)
    await address.fill('other@example.test')
    await page.evaluate(() => window.__notificationSmoke.failures.add('sendInline'))
    await button(dialog, '发送').click()
    await dialog.locator('.ant-alert-error').waitFor()
    await button(dialog, '再发一条').click()
    assert.equal(await address.inputValue(), 'other@example.test')
    await button(dialog, '发送').click()
    await dialog.getByText('已提交，请检查接收端', { exact: true }).waitFor()
    assert.deepEqual((await sends(page)).at(-1)[1].template.template.sendTo, ['other@example.test'])
    await button(dialog, '再发一条').click()
    await page.setViewportSize({ width: 390, height: 844 })
    await snapshot(page, 'unified-modal-narrow')
    const dimensions = await dialog.evaluate(el => ({ width: innerWidth, right: el.getBoundingClientRect().right, left: el.getBoundingClientRect().left, document: document.documentElement.scrollWidth }))
    assert.ok(dimensions.left >= 0 && dimensions.right <= dimensions.width + 1 && dimensions.document <= dimensions.width + 1, JSON.stringify(dimensions))
    await button(dialog, '取消').click(); await dialog.waitFor({ state: 'hidden' })
    pass('Other recipient validates one address, preserves failed input, retries, and fits a 390px viewport')
    await page.setViewportSize({ width: 1440, height: 1000 })
    dialog = await show(page)
    await page.evaluate(() => window.__notificationSmoke.deniedPermissions.add('system/MessageNotification/Channels:action'))
    await dialog.waitFor({ state: 'hidden' })
    await page.evaluate(() => window.__notificationSmoke.deniedPermissions.clear())
    dialog = await show(page)
    await button(dialog, '发送').click()
    await choose(page, trialRecords[1])
    await dialog.waitFor({ state: 'hidden' })
    const nextDialog = await show(page)
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.equal(await nextDialog.getByText('已提交，请检查接收端', { exact: true }).count(), 0)
    await button(nextDialog, '取消').click()
    const forbidden = await page.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => /Template/.test(method)))
    assert.deepEqual(forbidden, [])
    pass('Permission changes and configuration switches invalidate open and pending trials; no business templates are read or written')
    await page.close()

    for (const [record, flag, operation] of [[trialRecords[0], 'noEmail', 'getCurrentEmail'], [trialRecords[4], 'noPhone', 'getCurrentPhone'], [trialRecords[3], 'noBinding', 'getCurrentBindings']]) {
      const missing = await open(`&${flag}`, record)
      const modal = await show(missing)
      await modal.getByText(/未绑定/).waitFor()
      assert.equal(await modal.getByRole('radio', { name: '其他接收人', exact: true }).isChecked(), true)
      assert.equal(await button(modal, '发送').isDisabled(), true)
      await missing.close()
      const failed = await open(`&fail=${operation}`, record)
      const failedModal = await show(failed)
      await failedModal.getByText(/读取失败/).waitFor()
      await button(failedModal, await failed.evaluate(() => window.__notificationSmoke.i18n.global.t('messageNotification.common.retry'))).click()
      await eventually(async () => assert.equal(await failedModal.getByRole('radio', { name: /发给自己/ }).isEnabled(), true))
      await failedModal.getByRole('radio', { name: /发给自己/ }).check()
      assert.equal(await button(failedModal, '发送').isEnabled(), true)
      await failed.close()
    }
    pass('Email, phone and exact-configuration bindings distinguish missing data from failed reads and allow retry')

  }
  const voicePage = await open('', trialRecords[5])
  for (const language of ['zh', 'en', 'ja']) {
    await voicePage.evaluate(language => { window.__notificationSmoke.i18n.global.locale.value = language }, language)
    await beginChannelEdit(voicePage)
    assert.equal(await voicePage.locator('.inline-edit-field__value').count(), 1, 'provider remains readonly')
    await cancelChannelEdit(voicePage)
    const labels = await voicePage.evaluate(() => ['messageNotification.channels.test', 'messageNotification.channels.groups.test', 'messageNotification.channelTest.fields.parameters'].map(key => window.__notificationSmoke.i18n.global.t(key)))
    assert.equal(await button(voicePage, labels[0]).count(), 0)
    assert.equal(await voicePage.getByText(labels[1], { exact: true }).count(), 0)
    assert.equal(await voicePage.getByText(labels[2], { exact: true }).count(), 0)
    assert.match(await voicePage.locator('.channel-configuration').innerText(), /AccessKey/)
  }
  await voicePage.evaluate(() => { window.__notificationSmoke.i18n.global.locale.value = 'zh' })
  await snapshot(voicePage, 'voice-configuration')
  await voicePage.setViewportSize({ width: 390, height: 844 })
  await snapshot(voicePage, 'voice-configuration-mobile')
  assert.equal(await voicePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  assert.deepEqual(await voicePage.evaluate(() => window.__notificationSmoke.configs.find(row => row.id === 'trial-aliyun').configuration), trialRecords[5].configuration)
  assert.equal((await sends(voicePage)).length, 0)
  await voicePage.close()
  pass('Aliyun voice hides channel trials and sample settings in all languages and retains saved configuration on desktop and mobile')
  const officialPage = await open('', trialRecords[7])
  if (!await officialPage.locator('.channel-help').count()) await button(officialPage, '配置说明').click()
  for (const language of ['zh', 'en', 'ja']) {
    await officialPage.evaluate(language => { window.__notificationSmoke.i18n.global.locale.value = language }, language)
    await beginChannelEdit(officialPage)
    await cancelChannelEdit(officialPage)
    const labels = await officialPage.evaluate(() => ['messageNotification.channels.test', 'messageNotification.channels.groups.test', 'messageNotification.channelTest.fields.parameters'].map(key => window.__notificationSmoke.i18n.global.t(key)))
    assert.equal(await button(officialPage, labels[0]).count(), 0)
    assert.equal(await officialPage.getByText(labels[1], { exact: true }).count(), 0)
    assert.equal(await officialPage.getByText(labels[2], { exact: true }).count(), 0)
    assert.equal(await officialPage.locator('.channel-help__steps > li').count(), 3)
    assert.match(await officialPage.locator('.channel-help').innerText(), /AppID/)
    assert.match(await officialPage.locator('.channel-help').innerText(), /AppSecret/)
    assert.match(await officialPage.locator('.channel-help').innerText(), /mp\.weixin\.qq\.com/)
  }
  await officialPage.evaluate(() => { window.__notificationSmoke.i18n.global.locale.value = 'zh' })
  await snapshot(officialPage, 'official-account-configuration')
  await officialPage.setViewportSize({ width: 390, height: 844 })
  await snapshot(officialPage, 'official-account-configuration-mobile')
  assert.equal(await officialPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  assert.equal((await sends(officialPage)).length, 0)
  await officialPage.close()
  pass('Official-account configuration hides channel trials and sample settings, with localized AppID/AppSecret guidance on desktop and mobile')
  const smsPage = await open('', trialRecords[4])
  for (const language of ['zh', 'en', 'ja']) {
    await smsPage.evaluate(language => { window.__notificationSmoke.i18n.global.locale.value = language }, language)
    const group = await smsPage.evaluate(() => window.__notificationSmoke.i18n.global.t('messageNotification.channels.groups.test'))
    assert.equal(await smsPage.getByText(group, { exact: true }).count(), 0)
    await beginChannelEdit(smsPage)
    assert.equal(await smsPage.getByText(group, { exact: true }).count(), 0)
    assert.equal(await smsPage.locator('.channel-test-settings').count(), 0)
    await cancelChannelEdit(smsPage)
  }
  await smsPage.evaluate(() => { window.__notificationSmoke.i18n.global.locale.value = 'zh' })
  await beginChannelEdit(smsPage)
  const accessKey = smsPage.getByRole('textbox', { name: 'AccessKey ID', exact: true })
  await accessKey.fill('updated-fixture-key')
  await saveChannelDraft(smsPage)
  await smsPage.locator('.notification-channels__footer').waitFor({ state: 'hidden' })
  const savedSettings = await smsPage.evaluate(() => window.__notificationSmoke.configs.find(row => row.id === 'trial-aliyunSms').configuration.testTemplate)
  assert.deepEqual(savedSettings, trialRecords[4].configuration.testTemplate)
  const smsDialog = await show(smsPage)
  assert.equal(await button(smsDialog, '发送').isEnabled(), true)
  await button(smsDialog, '发送').click()
  await smsDialog.getByText('已提交，请检查接收端', { exact: true }).waitFor()
  assert.equal((await sends(smsPage)).length, 1)
  await button(smsDialog, '关闭').click()
  await smsDialog.waitFor({ state: 'hidden' })
  await snapshot(smsPage, 'sms-without-test-settings')
  await smsPage.setViewportSize({ width: 390, height: 844 })
  await beginChannelEdit(smsPage)
  await snapshot(smsPage, 'sms-without-test-settings-editing-mobile')
  assert.equal(await smsPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await cancelChannelEdit(smsPage)
  await smsPage.close()
  pass('SMS hides channel test settings in view/edit and all languages; credential saves preserve existing test data and trial sending')
  const settingsPage = await open('&missingTestSettings', trialRecords[4])
  const missingDialog = await show(settingsPage)
  assert.equal(await button(missingDialog, '发送').isDisabled(), true)
  await button(missingDialog, '取消').click()
  await missingDialog.waitFor({ state: 'hidden' })
  for (const [record, label, value] of [[trialRecords[1], '应用 ID（AgentId）', '1010']]) {
    await choose(settingsPage, record)
    const modal = await show(settingsPage)
    assert.equal(await button(modal, '发送').isDisabled(), true)
    await button(modal, '去改配置').click()
    await modal.waitFor({ state: 'hidden' })
    const control = settingsPage.getByRole('textbox', { name: label, exact: true })
    await control.fill(value)
    await settingsPage.locator('.notification-channels__heading h2').click()
    await saveChannelDraft(settingsPage)
    await control.waitFor({ state: 'hidden' })
    const trial = await show(settingsPage)
    await eventually(async () => assert.equal(await button(trial, '发送').isEnabled(), true))
    await button(trial, '取消').click()
    await trial.waitFor({ state: 'hidden' })
  }
  pass('AgentId saves and reopens correctly')
  for (const language of ['en', 'ja', 'zh']) {
    await settingsPage.evaluate(language => { window.__notificationSmoke.i18n.global.locale.value = language }, language)
    const name = await settingsPage.evaluate(() => window.__notificationSmoke.i18n.global.t('messageNotification.channels.test'))
    await button(settingsPage, name).click()
    const translated = settingsPage.getByRole('dialog')
    await translated.waitFor()
    assert.doesNotMatch(await translated.innerText(), /messageNotification\./)
    const cancel = await settingsPage.evaluate(() => window.__notificationSmoke.i18n.global.t('messageNotification.common.cancel'))
    await button(translated, cancel).click(); await translated.waitFor({ state: 'hidden' })
  }
  pass('Unified test dialog resolves Chinese, English and Japanese copy')
  await settingsPage.close()
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.blockedRequests, [])
} catch (error) {
  report.failure = error.stack
  for (const context of browser.contexts()) for (const page of context.pages()) await snapshot(page, `failure-${report.screenshots.length}`)
  process.exitCode = 1
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
