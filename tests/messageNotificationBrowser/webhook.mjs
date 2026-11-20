import { beginChannelEdit, editButton, saveChannelDraft } from './channelEditing.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.SMOKE_BASE_URL || 'http://localhost:9200'
const output = process.env.SMOKE_OUTPUT || '/tmp/webhook-channel-browser'
const entryURL = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, baseURL)
const report = { checks: [], errors: [], screenshots: [] }
const browser = await chromium.launch({ channel: process.env.SMOKE_CHROMIUM_CHANNEL })
await mkdir(output, { recursive: true })

const address = page => page.getByRole('textbox', { name: '地址', exact: true })
const templateRegion = page => page.getByRole('region', { name: '消息模板', exact: true })
async function checkChannelFields(page) {
  await address(page).waitFor()
  assert.equal(await page.locator('.webhook-preview').count(), 0)
  assert.equal(await page.getByText('请求示例', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('textbox', { name: '请求体', exact: true }).count(), 0)
}

async function open(mode = 'saved') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => report.errors.push(error.message))
  // All business operations are provided by the existing in-memory fixture.
  await page.routeWebSocket('**/*', () => {})
  await page.route('**/*', route => {
    const request = route.request()
    if (['fetch', 'xhr'].includes(request.resourceType()) || new URL(request.url()).origin !== entryURL.origin) {
      report.errors.push(`Unexpected request ${request.url()}`)
      return route.abort()
    }
    return route.continue()
  })
  await page.goto(`${entryURL}?${mode === 'fresh' ? 'fresh' : 'clearMessages'}&directory=tree${mode === 'denied' ? '&permission=no-template' : ''}#/channels?channel=email:embedded`)
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
  await page.locator('.channel-configuration').waitFor()
  await page.evaluate(async () => {
    const fixture = window.__notificationSmoke
    const config = fixture.configs.find(item => item.type === 'webhook')
    if (config) config.configuration = { url: 'https://receiver.example.test/hooks', headers: [{ key: 'Authorization', value: 'fixture-private-token' }] }
    fixture.templates.splice(0)
    await fixture.router.push({ path: '/channels', query: { channel: 'webhook:http', ...(config ? { configId: config.id } : {}) } })
  })
  await checkChannelFields(page)
  assert.equal(await page.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => ['queryTemplates', 'getTemplate', 'queryTemplateDirectory', 'getBusinessTemplate'].includes(method)).length), 0)
  return page
}
async function screenshot(page, name) {
  const path = `${output}/${name}.png`
  await page.screenshot({ path, fullPage: true })
  report.screenshots.push(path)
}

try {
  const page = await open()
  assert.equal(await page.locator('.notification-channels__title-row h2').innerText(), 'Webhook')
  assert.match(await page.locator('.channel-configuration').innerText(), /接收地址/)
  assert.doesNotMatch(await page.locator('.channel-configuration').innerText(), /超时|签名/)
  assert.equal(await address(page).inputValue(), 'https://receiver.example.test/hooks')
  const header = page.locator('.configuration-pairs input[autocomplete="new-password"]')
  const headerToggle = page.locator('.configuration-pairs .ant-input-password-icon')
  assert.equal(await header.getAttribute('type'), 'password')
  assert.equal(await header.inputValue(), 'fixture-private-token')
  await headerToggle.click()
  await page.locator('.configuration-pairs input[autocomplete="new-password"][type="text"]').waitFor()
  assert.equal(await header.inputValue(), 'fixture-private-token')
  await headerToggle.click()
  await page.locator('.configuration-pairs input[type="password"]').waitFor()
  report.checks.push('saved channel shows the address and a masked header value with a visibility toggle')
  await screenshot(page, 'webhook-desktop')

  await beginChannelEdit(page)
  await address(page).fill('https://receiver.example.test/updated')
  await saveChannelDraft(page)
  const templateLink = editButton(templateRegion(page), '消息模板')
  await templateLink.waitFor()
  const saved = await page.evaluate(() => window.__notificationSmoke.configs.find(config => config.type === 'webhook').configuration)
  assert.deepEqual(saved, { url: 'https://receiver.example.test/updated', headers: [{ key: 'Authorization', value: 'fixture-private-token' }] })
  await checkChannelFields(page)
  assert.equal(await header.getAttribute('type'), 'password')
  assert.equal(await header.inputValue(), 'fixture-private-token')
  report.checks.push('saving a changed address preserves the saved header and fills missing templates')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1)
  await screenshot(page, 'webhook-mobile')
  report.checks.push('390px layout has no horizontal overflow')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await templateLink.click()
  const preview = page.locator('.message-templates__workspace .webhook-preview')
  await preview.waitFor()
  assert.match(await preview.innerText(), /https:\/\/receiver\.example\.test\/updated/)
  await editButton(page.locator('.message-templates__header'), '编辑').click()
  const requestBody = page.getByRole('textbox', { name: '请求体', exact: true })
  await requestBody.waitFor()
  assert.equal(await requestBody.isEditable(), true)
  report.checks.push('the generated request body can be previewed and edited on the message templates page')

  const fresh = await open('fresh')
  assert.equal(await address(fresh).inputValue(), '')
  report.checks.push('new configuration shows channel inputs without a request example')
  const denied = await open('denied')
  assert.equal(await editButton(templateRegion(denied), '补齐消息模板').count(), 0)
  assert.equal(await editButton(templateRegion(denied), '消息模板').count(), 0)
  report.checks.push('channel configuration remains available without template permission')
  assert.deepEqual(report.errors, [])
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
