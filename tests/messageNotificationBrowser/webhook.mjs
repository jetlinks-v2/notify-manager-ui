import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.SMOKE_BASE_URL || 'http://localhost:9200'
const output = process.env.SMOKE_OUTPUT || '/tmp/webhook-example-browser'
const entryURL = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, baseURL)
const report = { checks: [], errors: [], screenshots: [] }
const browser = await chromium.launch({ headless: true })
await mkdir(output, { recursive: true })

async function open(mode = 'saved') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => report.errors.push(error.message))
  // All business operations are provided by the existing in-memory fixture.
  await page.route('**/*', route => ['fetch', 'xhr'].includes(route.request().resourceType()) || new URL(route.request().url()).origin !== new URL(baseURL).origin ? route.abort() : route.continue())
  await page.goto(`${entryURL}?${mode === 'fresh' ? 'fresh' : 'clearMessages'}&directory=tree${mode === 'denied' ? '&permission=no-template' : ''}#/channels?channel=email:embedded`)
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
  await page.locator('.channel-configuration').waitFor()
  await page.evaluate(async () => {
    const fixture = window.__notificationSmoke
    const config = fixture.configs.find(item => item.type === 'webhook')
    if (config) config.configuration = { url: 'https://receiver.example.test/hooks', headers: [{ key: 'Authorization', value: 'fixture-private-token' }] }
    fixture.templates.splice(0)
    fixture.failures.add('queryTemplates')
    fixture.failures.add('getTemplate')
    await fixture.router.push({ path: '/channels', query: { channel: 'webhook:http', ...(config ? { configId: config.id } : {}) } })
  })
  await page.locator('.webhook-preview .cb-body').waitFor()
  assert.equal(await page.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => ['queryTemplates', 'getTemplate', 'queryTemplateDirectory', 'getBusinessTemplate'].includes(method)).length), 0)
  assert.equal(await page.locator('.webhook-preview .ant-select, .webhook-preview .cloud-empty, .webhook-preview__hint').count(), 0)
  assert.equal(await page.getByRole('button', { name: '去消息模板 ›', exact: true }).count(), 0)
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
  const initial = await page.locator('.webhook-preview .cb-body').innerText()
  assert.match(initial, /^POST https:\/\/receiver.example.test\/hooks/)
  assert.match(initial, /Content-Type: application\/json/)
  assert.equal(JSON.parse(initial.split('\n\n')[1]).detail.targetId, 'device-001')
  assert.doesNotMatch(initial, /fixture-private-token|X-Signature/)
  await page.getByTitle('复制请求示例', { exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), initial)
  report.checks.push('example visible without saved templates or template/directory reads; masked copy')
  await screenshot(page, 'webhook-desktop')

  await page.getByRole('button', { name: '地址', exact: true }).click()
  await page.getByRole('textbox', { name: '地址', exact: true }).fill('https://receiver.example.test/updated')
  assert.equal(await page.locator('.webhook-preview .cb-body').innerText(), initial)
  await page.getByRole('textbox', { name: '地址', exact: true }).press('Enter')
  await page.waitForFunction(() => document.querySelector('.webhook-preview .cb-body')?.textContent?.startsWith('POST https://receiver.example.test/updated'))
  assert.equal(await page.evaluate(() => window.__notificationSmoke.calls.some(([method]) => ['queryTemplates', 'getTemplate', 'queryTemplateDirectory'].includes(method))), false)
  report.checks.push('address follows saved configuration without querying templates')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1)
  await screenshot(page, 'webhook-mobile')
  report.checks.push('390px layout has no horizontal overflow')

  const fresh = await open('fresh')
  assert.match(await fresh.locator('.webhook-preview .cb-body').innerText(), /^POST 接收地址\n/)
  report.checks.push('new configuration shows a local example immediately')
  const denied = await open('denied')
  assert.equal(await denied.getByRole('button', { name: '去消息模板 ›', exact: true }).count(), 0)
  assert.match(await denied.locator('.webhook-preview .cb-body').innerText(), /^POST https:/)
  report.checks.push('no template hint or navigation; example independent of template permission')
  assert.deepEqual(report.errors, [])
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
