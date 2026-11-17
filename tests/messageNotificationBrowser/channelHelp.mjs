import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { channelField, editButton, cancelChannelEdit } from './channelEditing.mjs'
const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9200'
const output = process.env.SMOKE_OUTPUT || '/tmp/jetlinks-channel-help/browser'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, base)
const report = { checks: [], screenshots: [], errors: [], blockedRequests: [] }
const browser = await chromium.launch({ headless: true })
await mkdir(output, { recursive: true })
const cases = [
  ['weixin:corpMessage', [['corpId','corpId'], ['corpSecret','corpSecret']], 2],
  ['dingTalk:dingTalkMessage', [['appKey','appKey'], ['agentId','dingTalkAgentId'], ['appSecret','appSecret']], 3],
  ['dingTalk:dingTalkRobotWebHook', [], 3],
  ['email:embedded', [['host','host'], ['port','port'], ['username','username'], ['password','password'], ['sender','sender']], 0],
  ['sms:aliyunSms', [['regionId','regionId'], ['accessKeyId','accessKeyId'], ['secret','accessKeySecret']], 2],
  ['voice:aliyun', [['regionId','regionId'], ['accessKeyId','accessKeyId'], ['secret','accessKeySecret']], 2],
  ['webhook:http', [['webhookAddress','url']], 0],
]
const t = (page, key) => page.evaluate(key => window.__notificationSmoke.i18n.global.t(key), key)
async function settle(check) {
  const end = Date.now() + 8000
  while (true) { try { return await check() } catch (error) { if (Date.now() >= end) throw error; await new Promise(resolve => setTimeout(resolve, 50)) } }
}
async function screenshot(page, name) {
  const file = path.join(output, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file)
}
async function split(page) {
  const left = await page.locator('.notification-channels__editor').boundingBox()
  const right = await page.locator('.channel-help').boundingBox()
  assert.ok(left && right && right.x > left.x && Math.abs(left.width - right.width) <= 1, JSON.stringify({ left, right }))
  const viewport = page.viewportSize()
  assert.ok(right.y + right.height <= viewport.height + 1, 'document stays inside the viewport')
}
async function field(page, key) {
  const label = key.startsWith('App') ? key : await t(page, key === 'webhookAddress' ? 'messageNotification.channels.webhook.address' : `messageNotification.channels.fields.${key}`)
  return channelField(page, label).locator('input, textarea').first()
}
try {
  for (const [id, fields, imageCount] of cases) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    page.setDefaultTimeout(10000)
    page.on('pageerror', error => report.errors.push({ id, message: error.message }))
    await page.routeWebSocket('**/*', () => {})
    await page.route('**/*', route => {
      const request = route.request()
      if (['fetch', 'xhr'].includes(request.resourceType()) || new URL(request.url()).origin !== new URL(base).origin) {
        report.blockedRequests.push(request.url()); return route.abort()
      }
      return route.continue()
    })
    await page.goto(`${entry.href}?unifiedTests#/channels?channel=${encodeURIComponent(id)}`)
    await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
    await page.locator('.channel-help').waitFor()
    await split(page)
    if (id === 'weixin:corpMessage') await screenshot(page, 'wechat-overview')
    assert.equal(await page.locator('.channel-help img').count(), imageCount)
    await settle(async () => assert.ok(await page.locator('.channel-help img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))))
    const doc = page.locator('.channel-help')
    if (fields.length) {
      assert.equal(await page.locator('.channel-configuration .inline-edit-field__hint').count(), 0)
      assert.equal(await page.locator('.inline-edit-field__trigger').count(), 0)
      for (const [key, section] of fields) {
        const input = await field(page, key)
        await input.focus()
        await settle(async () => assert.equal(await doc.locator('.channel-help__section--active').getAttribute('data-help-section'), section))
        const active = await doc.locator('.channel-help__section--active').boundingBox()
        const area = await doc.boundingBox()
        assert.ok(active.y >= area.y - 1 && active.y < area.y + area.height, `${id}:${key} document anchor visible`)
      }
      const [key, section] = fields.at(-1)
      // Reading elsewhere is stable until a new focus request, even when the field identity repeats.
      await doc.evaluate(element => { element.scrollTop = 0 })
      await page.waitForTimeout(120)
      assert.equal(await doc.evaluate(element => element.scrollTop), 0)
      await page.locator('.notification-channels__heading h2').click()
      await (await field(page, key)).focus()
      await settle(async () => assert.equal(await doc.locator('.channel-help__section--active').getAttribute('data-help-section'), section))
      if (id === 'weixin:corpMessage') {
        assert.ok(await doc.evaluate(element => element.scrollTop) > 0)
        const secret = await field(page, 'corpSecret')
        await doc.evaluate(element => { element.scrollTop = 0 })
        await secret.fill('draft-fixture-secret')
        await page.waitForTimeout(120)
        assert.equal(await doc.evaluate(element => element.scrollTop), 0, 'typing does not reposition the document')
        await cancelChannelEdit(page)
        assert.equal(await secret.inputValue(), '')
        await (await field(page, 'corpId')).focus()
        await settle(async () => assert.equal(await doc.locator('.channel-help__section--active').getAttribute('data-help-section'), 'corpId'))
        for (const width of [1280, 1920]) { await page.setViewportSize({ width, height: 1000 }); await split(page); await screenshot(page, `weixin-${width}`) }
        await page.setViewportSize({ width: 1440, height: 1000 })
        await doc.locator('.ant-image').first().click()
        await page.locator('.ant-image-preview:visible').waitFor()
        await page.locator('.ant-image-preview-operations-operation').first().click()
        await page.locator('.ant-image-preview:visible').waitFor({ state: 'hidden' })
      }
    }
    for (const lang of ['en', 'ja', 'zh']) {
      await page.evaluate(lang => { window.__notificationSmoke.i18n.global.locale.value = lang }, lang)
      await settle(async () => assert.equal((await doc.innerText()).includes('messageNotification.'), false))
      assert.equal(await editButton(page, await t(page, 'messageNotification.channels.helpTitle')).count(), 0)
      assert.equal(await doc.getByRole('heading', { name: await t(page, 'messageNotification.channels.helpTitle'), exact: true }).count(), 0)
      assert.equal(await editButton(doc, await t(page, 'messageNotification.channels.collapseHelp')).count(), 0)
      if (id === 'weixin:corpMessage') {
        assert.equal(await page.locator('.channel-configuration input').count(), 2)
        assert.deepEqual(await doc.locator('[data-help-section]').evaluateAll(sections => sections.map(section => section.dataset.helpSection)), ['corpId', 'corpSecret'])
        assert.doesNotMatch(await doc.innerText(), /AgentId/i)
        assert.doesNotMatch(await page.locator('.channel-configuration').innerText(), /AgentId/i)
      }
      await split(page)
    }
    await screenshot(page, id.replace(':', '-'))
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await editButton(page, await t(page, 'messageNotification.channels.helpTitle')).count(), 0)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    if (fields.length) {
      const input = await field(page, fields[0][0])
      await input.focus()
      await page.waitForTimeout(120)
      const box = await input.boundingBox()
      assert.ok(box.y >= 0 && box.y < 844, 'mobile focus keeps the input visible')
    }
    if (id === 'weixin:corpMessage') await screenshot(page, 'weixin-mobile')
    assert.equal(await page.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => ['createConfig','updateConfig','send','sendInline'].includes(method)).length), 0)
    report.checks.push(`${id}: equal columns, original images, field anchors, persistent editing, three languages and mobile`)
    await page.close()
  }
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.blockedRequests, [])
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  for (const page of browser.contexts().flatMap(context => context.pages())) await screenshot(page, 'failure').catch(() => {})
  process.exitCode = 1
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
