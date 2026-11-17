import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { beginChannelEdit, cancelChannelEdit, channelField, saveChannelDraft } from './channelEditing.mjs'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9200'
const output = process.env.SMOKE_OUTPUT || '/tmp/notification-smtp-browser'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, baseURL)
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
const report = { assertions: [], errors: [], blockedRequests: [], screenshots: [] }
page.setDefaultTimeout(8000)
page.on('pageerror', error => report.errors.push(error.message))
await mkdir(output, { recursive: true })
await page.routeWebSocket('**/*', () => {})
await page.route('**/*', route => {
  const request = route.request()
  if (['fetch', 'xhr'].includes(request.resourceType()) || new URL(request.url()).origin !== new URL(baseURL).origin) {
    report.blockedRequests.push(request.url())
    return route.abort()
  }
  return route.continue()
})
const translate = key => page.evaluate(key => window.__notificationSmoke.i18n.global.t(key), key)
const writes = () => page.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => method === 'updateConfig'))
const pass = message => report.assertions.push(message)
const screenshot = async name => {
  const filename = path.join(output, `${name}.png`)
  await page.screenshot({ path: filename, fullPage: true })
  report.screenshots.push(filename)
}
const brand = async id => page.getByRole('radio', { name: await translate(`messageNotification.channels.email.presets.${id}`), exact: true }).locator('..').click()
let hostField
const selectHost = async host => {
  await hostField.locator('.ant-select-selector').click()
  await hostField.getByRole('combobox').fill(host)
  const option = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: `${host}(` })
  await option.first().click()
}

try {
  await page.goto(`${entry.href}?writeDelay=100#/channels?channel=email:embedded&configId=smtp-primary`)
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
  const original = await page.evaluate(() => structuredClone(window.__notificationSmoke.configs.find(item => item.id === 'smtp-primary').configuration))
  await beginChannelEdit(page)
  hostField = channelField(page, await translate('messageNotification.channels.fields.host'))
  assert.equal(await page.getByRole('radio').count(), 5)
  assert.equal(await hostField.getByRole('combobox').inputValue(), original.host)
  for (const [id, host] of [['tencent', 'gz-smtp.qcloudmail.com'], ['aliyun', 'smtpdm-eu-central-1.aliyuncs.com'], ['netease', 'smtp.126.com'], ['exchange', 'smtp.partner.outlook.cn']]) {
    await brand(id)
    await selectHost(host)
    assert.ok((await hostField.innerText()).includes(host))
  }
  assert.equal((await writes()).length, 0)
  pass('Five segmented brands and searchable regional SMTP selections edit only the draft')
  const portField = channelField(page, await translate('messageNotification.channels.fields.port'))
  assert.equal(await portField.getByRole('spinbutton').inputValue(), '587')
  await selectHost('smtp-mail.outlook.com')
  assert.ok((await page.locator('.channel-help [data-help-section="host"]').innerText()).includes('OAuth2'))
  assert.equal(await hostField.locator('.inline-edit-field__hint').count(), 0)
  await brand('other')
  assert.equal(await hostField.getByRole('combobox').inputValue(), 'smtp-mail.outlook.com')
  await hostField.getByRole('combobox').fill('')
  const dropdown = page.locator('.ant-select-dropdown:visible')
  await dropdown.waitFor()
  const options = await dropdown.locator('.ant-select-item-option').allTextContents()
  assert.equal(options.length, 4)
  for (const host of ['smtp.gmail.com', 'smtp.mail.yahoo.com', 'smtp.mail.me.com', 'smtp.feishu.cn']) assert.ok(options.some(text => text.includes(host)))
  assert.equal(options.some(text => /qcloudmail|office365|outlook|aliyun|163\.com/.test(text)), false)
  await selectHost('smtp.gmail.com')
  assert.equal(await portField.getByRole('spinbutton').inputValue(), '465')
  await portField.getByRole('spinbutton').fill('2525')
  await hostField.getByRole('combobox').fill('smtp.qq.com')
  await hostField.getByRole('combobox').press('Tab')
  assert.equal(await page.getByRole('radio', { name: '其他', exact: true }).isChecked(), true)
  assert.equal(await portField.getByRole('spinbutton').inputValue(), '2525')
  assert.equal((await writes()).length, 0)
  pass('Other excludes brand endpoints, preserves current input and keeps custom parameters while typing')

  for (const language of ['zh', 'en', 'ja']) {
    await page.evaluate(language => { window.__notificationSmoke.i18n.global.locale.value = language }, language)
    hostField = channelField(page, await translate('messageNotification.channels.fields.host'))
    await page.setViewportSize({ width: 390, height: 844 })
    await brand('tencent')
    await selectHost('smtp.qq.com')
    await page.locator('.notification-channels__heading h2').click()
    await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
    await screenshot(`smtp-${language}-mobile`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
    assert.equal(await page.locator('.channel-configuration__brands').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true)
    assert.equal((await page.locator('.channel-configuration').innerText()).includes('messageNotification.'), false)
    await brand('other')
    await hostField.getByRole('combobox').fill('smtp.custom.example.test')
  }
  pass('Chinese, English and Japanese controls remain usable at 390px without page overflow')
  await page.evaluate(() => { window.__notificationSmoke.i18n.global.locale.value = 'zh' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await cancelChannelEdit(page)
  assert.equal((await writes()).length, 0)
  assert.deepEqual(await page.evaluate(() => window.__notificationSmoke.configs.find(item => item.id === 'smtp-primary').configuration), original)
  pass('Leaving and returning restores the saved configuration without writes')

  await beginChannelEdit(page)
  hostField = channelField(page, await translate('messageNotification.channels.fields.host'))
  await brand('exchange')
  await selectHost('smtp.partner.outlook.cn')
  await screenshot('smtp-desktop')
  await page.evaluate(() => window.__notificationSmoke.failures.add('updateConfig'))
  await saveChannelDraft(page)
  await page.locator('.ant-message-error').waitFor()
  assert.ok((await hostField.innerText()).includes('smtp.partner.outlook.cn'))
  await saveChannelDraft(page)
  await page.locator('.notification-channels__footer .ant-btn-primary:disabled:not(.ant-btn-loading)').waitFor()
  const saved = await page.evaluate(() => window.__notificationSmoke.configs.find(item => item.id === 'smtp-primary').configuration)
  assert.equal(saved.host, 'smtp.partner.outlook.cn')
  assert.equal(saved.port, 587)
  assert.equal(saved.password, original.password)
  assert.equal(saved.properties.find(item => item.name === 'mail.smtp.starttls.enable').value, 'true')
  assert.equal((await writes()).length, 2)
  await beginChannelEdit(page)
  assert.equal(await page.getByRole('radio', { name: '微软', exact: true }).isChecked(), true)
  assert.ok((await hostField.innerText()).includes('smtp.partner.outlook.cn'))
  await cancelChannelEdit(page)
  pass('Failure retains the draft; retry saves the endpoint and transport once, preserves credentials and restores the brand')
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.blockedRequests, [])
} catch (error) {
  report.failure = error.stack
  await screenshot('failure')
  throw error
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
