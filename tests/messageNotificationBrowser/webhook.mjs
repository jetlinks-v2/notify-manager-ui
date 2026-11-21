import { beginChannelEdit, cancelChannelEdit, editButton, saveChannelDraft } from './channelEditing.mjs'
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

const rows = page => page.locator('.channel-configurations__row')
const row = (page, id) => rows(page).and(page.locator(`[data-config-id="${id}"]`))
const modal = page => page.locator('.channel-configuration-modal:visible')
const name = page => modal(page).getByRole('textbox', { name: '配置名称', exact: true })
const address = page => modal(page).getByRole('textbox', { name: '地址', exact: true })
const templateRegion = page => page.getByRole('region', { name: '消息模板', exact: true })
const savedConfigs = page => page.evaluate(() => window.__notificationSmoke.configs.filter(config => config.type === 'webhook'))
const calls = (page, method) => page.evaluate(method => window.__notificationSmoke.calls.filter(([key]) => key === method).map(([, value]) => value), method)
const empty = page => page.getByText('此渠道暂无通知配置，可新增配置', { exact: true })
async function checkChannelFields(page) {
  await address(page).waitFor()
  assert.equal(await page.locator('.webhook-preview').count(), 0)
  assert.equal(await page.getByText('请求示例', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('textbox', { name: '请求体', exact: true }).count(), 0)
}

async function add(page) {
  await editButton(page.locator('.notification-channels__heading'), '新增配置').click()
  await modal(page).getByText('新增 Webhook 配置', { exact: true }).waitFor()
  await checkChannelFields(page)
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
  await page.goto(`${entryURL}?${mode === 'fresh' ? 'fresh' : 'clearMessages'}&directory=tree${mode === 'denied' ? '&permission=no-template' : ''}#/records`,
    { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
  await page.evaluate(async () => {
    const fixture = window.__notificationSmoke
    const config = fixture.configs.find(item => item.type === 'webhook')
    if (config) config.configuration = { url: 'https://receiver.example.test/hooks/path-token?key=query-token#fragment', headers: [{ key: 'Authorization', value: 'fixture-private-token' }] }
    fixture.templates.splice(0)
    await fixture.router.push({ path: '/channels', query: { channel: 'webhook:http', ...(config ? { configId: config.id } : {}) } })
  })
  await (mode === 'fresh' ? empty(page) : rows(page).first()).waitFor()
  assert.equal(await page.locator('.channel-configuration').count(), 0)
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
  const [initial] = await savedConfigs(page)
  assert.equal(await page.locator('.notification-channels__title-row h2').innerText(), 'Webhook')
  assert.equal(await row(page, initial.id).locator('.channel-configurations__url').getAttribute('title'), 'https://receiver.example.test')
  assert.doesNotMatch(await row(page, initial.id).innerText(), /path-token|query-token|fixture-private-token/)
  await screenshot(page, 'webhook-desktop')
  await beginChannelEdit(page, initial.id)
  await checkChannelFields(page)
  await modal(page).getByText('编辑 Webhook 配置', { exact: true }).waitFor()
  assert.match(await modal(page).innerText(), /接收地址/)
  assert.doesNotMatch(await modal(page).innerText(), /超时|签名/)
  assert.equal(await name(page).inputValue(), initial.name)
  assert.equal(await address(page).inputValue(), initial.configuration.url)
  const header = modal(page).locator('.configuration-pairs input[autocomplete="new-password"]')
  const headerToggle = modal(page).locator('.configuration-pairs .ant-input-password-icon')
  assert.equal(await header.getAttribute('type'), 'password')
  assert.equal(await header.inputValue(), 'fixture-private-token')
  await headerToggle.click()
  await header.and(modal(page).locator('[type="text"]')).waitFor()
  assert.equal(await header.inputValue(), 'fixture-private-token')
  await headerToggle.click()
  await header.and(modal(page).locator('[type="password"]')).waitFor()
  report.checks.push('list masks credentials and the edit dialog restores the address and protected header')

  await address(page).fill('https://receiver.example.test/updated')
  await header.fill('')
  await saveChannelDraft(page)
  await modal(page).waitFor({ state: 'hidden' })
  const templateLink = editButton(templateRegion(page), '消息模板')
  await templateLink.waitFor()
  assert.deepEqual((await savedConfigs(page))[0].configuration, {
    url: 'https://receiver.example.test/updated', headers: [{ key: 'Authorization', value: 'fixture-private-token' }],
  })
  report.checks.push('saving a changed address preserves the saved header and fills missing templates')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1)
  await screenshot(page, 'webhook-mobile')
  await beginChannelEdit(page, initial.id)
  assert.equal(await header.getAttribute('type'), 'password')
  assert.equal(await header.inputValue(), 'fixture-private-token')
  const box = await modal(page).boundingBox()
  assert.ok(box && box.x >= 0 && box.x + box.width <= 391)
  await screenshot(page, 'webhook-mobile-edit')
  await cancelChannelEdit(page)
  report.checks.push('390px list and Webhook editor fit the viewport')
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
  await add(fresh)
  assert.equal(await address(fresh).inputValue(), '')
  await name(fresh).fill('取消的配置')
  await address(fresh).fill('https://receiver.example.test/cancelled')
  await cancelChannelEdit(fresh)
  await empty(fresh).waitFor()
  assert.deepEqual(await calls(fresh, 'createConfig'), [])
  report.checks.push('empty list opens a new draft and cancel discards only that draft')

  const endpoints = [
    { name: '设备告警 Webhook', url: 'https://receiver.example.test/alarms' },
    { name: '场景联动 Webhook', url: 'https://receiver.example.test/scenes' },
  ]
  for (const endpoint of endpoints) {
    await add(fresh)
    assert.equal(await address(fresh).inputValue(), '')
    await name(fresh).fill(endpoint.name)
    await address(fresh).fill(endpoint.url)
    await saveChannelDraft(fresh)
    await modal(fresh).waitFor({ state: 'hidden' })
    await rows(fresh).getByText(endpoint.name, { exact: true }).waitFor()
  }
  const [first, second] = await savedConfigs(fresh)
  assert.notEqual(first.id, second.id)
  assert.equal(await rows(fresh).count(), 2)
  assert.equal((await calls(fresh, 'createConfig')).length, 2)
  await screenshot(fresh, 'webhook-two-configurations')
  report.checks.push('two configurations can be added from the same list')

  for (const config of [first, second]) {
    await editButton(row(fresh, config.id), '测试').click()
    const trial = fresh.locator('.notification-channel-test:visible')
    await editButton(trial, '发送').click()
    await trial.getByText('已提交，请检查接收端', { exact: true }).waitFor()
    await editButton(trial, '关闭').click()
    await trial.waitFor({ state: 'hidden' })
  }
  assert.deepEqual((await calls(fresh, 'sendInline')).map(call => call.configId), [first.id, second.id])
  report.checks.push('trial sending uses the configuration ID of the clicked row')

  await beginChannelEdit(fresh, first.id)
  assert.equal(await address(fresh).inputValue(), endpoints[0].url)
  await address(fresh).fill(endpoints[0].url + '/updated')
  await saveChannelDraft(fresh)
  await modal(fresh).waitFor({ state: 'hidden' })
  await beginChannelEdit(fresh, second.id)
  assert.equal(await address(fresh).inputValue(), endpoints[1].url)
  await cancelChannelEdit(fresh)
  assert.deepEqual((await savedConfigs(fresh)).map(config => [config.id, config.configuration.url]), [
    [first.id, endpoints[0].url + '/updated'], [second.id, endpoints[1].url],
  ])
  await editButton(row(fresh, second.id), '更多操作').click()
  await editButton(fresh.getByRole('menuitem'), '删除').click()
  const confirm = fresh.locator('.jlc-modal:visible')
  await confirm.getByText('删除 Webhook 配置？', { exact: true }).waitFor()
  assert.match(await confirm.innerText(), /场景联动 Webhook/)
  await editButton(confirm, '删除').click()
  await row(fresh, second.id).waitFor({ state: 'hidden' })
  assert.deepEqual(await calls(fresh, 'deleteConfig'), [second.id])
  assert.deepEqual((await savedConfigs(fresh)).map(config => config.id), [first.id])
  report.checks.push('editing and deleting a row affect only that Webhook')

  const denied = await open('denied')
  await editButton(rows(denied).first(), '更多操作').click()
  await denied.getByRole('menuitem').first().waitFor()
  assert.equal(await editButton(denied.getByRole('menuitem'), '补齐消息模板').count(), 0)
  assert.equal(await editButton(templateRegion(denied), '消息模板').count(), 0)
  report.checks.push('channel configuration remains available without template permission')
  assert.deepEqual(report.errors, [])
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  for (const context of browser.contexts()) await context.close()
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
