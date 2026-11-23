import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9201'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, base)
const output = process.env.SMOKE_OUTPUT || '/tmp/jetlinks-template-variables'
const browser = await chromium.launch({ channel: process.env.SMOKE_CHROMIUM_CHANNEL })
const errors = []
const list = page => page.getByRole('region', { name: '变量列表', exact: true })
const row = (page, id) => list(page).locator(`tr[data-row-key="${id}"]`)
const formatOf = variable => variable.locator('td').nth(3).locator('.ant-select-selection-item').getAttribute('title')
const sampleOf = (page, id) => {
  const token = '${' + id + '}'
  return page.locator(`.template-variables button[title^="${token}"] .template-variables__sample`).innerText()
}
const dateTimeFormat = 'yyyy-MM-dd HH:mm:ss'
const edit = page => page.getByRole('button', { name: /^编\s*辑$/ })
const save = page => page.getByRole('button', { name: '保存模板', exact: true })

async function open(channel, width = 1543, business = 'device-config') {
  const page = await browser.newPage({ viewport: { width, height: 898 }, serviceWorkers: 'block' })
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => errors.push(error.message))
  await page.routeWebSocket('**/*', () => {})
  await page.route('**/*', route => {
    const request = route.request()
    if (['fetch', 'xhr'].includes(request.resourceType()) || new URL(request.url()).origin !== entry.origin) {
      errors.push(request.url())
      return route.abort()
    }
    return route.continue()
  })
  await page.goto(`${entry.href}?templateWorkspace&catalog=extended#/templates?channel=${encodeURIComponent(channel)}&business=${encodeURIComponent(business)}`,
    { waitUntil: 'domcontentloaded', timeout: 45000 })
  await edit(page).click()
  await list(page).waitFor()
  return page
}

async function choose(page, cell, label) {
  await cell.locator('.ant-select-selector').click()
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: new RegExp(`^${label}$`) }).click()
}

async function checkWechatVariableDeletion(page) {
  const property = '${detail.propertyName}', time = '${detail.alarmTime}'
  const body = page.getByRole('textbox', { name: '正文', exact: true })
  await page.getByRole('textbox', { name: '标题', exact: true }).fill('设备告警')
  await body.fill('请及时处理。')
  await body.press('End')
  await body.press('Enter')
  await page.keyboard.insertText('告警时间：')
  for (const id of [property, time]) await page.locator(`.template-variables button[title^="${id}"]`).click()
  const line = body.locator('p').last()
  const tokens = line.locator('[data-template-variable]')
  const ids = () => tokens.evaluateAll(nodes => nodes.map(node => node.dataset.templateVariable))
  assert.deepEqual(await ids(), [property, time])

  await line.scrollIntoViewIfNeeded()
  const last = await tokens.last().boundingBox()
  assert.ok(last)
  await page.mouse.click(last.x + last.width + 4, last.y + last.height / 2)
  await page.keyboard.press('Backspace')
  assert.deepEqual(await ids(), [property], '点击行末后退格应删除告警时间')
  await page.keyboard.press('Shift+ArrowLeft')
  assert.equal(await page.evaluate(() => String(getSelection()).replaceAll('\uFEFF', '')), '{属性名称}')
  await page.keyboard.press('ControlOrMeta+z')
  assert.deepEqual(await ids(), [property, time])

  await body.press('End')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Delete')
  assert.deepEqual(await ids(), [property], '两个变量之间的 Delete 应删除右侧变量')
  await page.keyboard.insertText('。')
  await save(page).click()
  await edit(page).waitFor()
  const message = await page.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => method === 'saveBusinessTemplate').at(-1)[1].item.template.template.message)
  assert.equal(message, '设备告警\n请及时处理。\n告警时间：${detail.propertyName}。')
}

await mkdir(output, { recursive: true })
try {
  for (const [business, title, space] of [['aiComplianceAlarm', '合规告警', '收银区'], ['aiSecurityAlarm', '安全告警', '仓储区']]) {
    const page = await open('weixin:corpMessage', 1543, business)
    const panel = page.getByRole('complementary', { name: '可用变量', exact: true })
    assert.deepEqual(await panel.locator('.template-variables__group').allTextContents(), ['通用', title])
    const samples = await panel.locator('.template-variables__sample').allTextContents()
    assert.equal(samples.length, 14)
    assert.ok(samples.every(value => value.trim() && value !== '—'))
    assert.equal(await sampleOf(page, 'detail.alarmTime'), '2026-01-01 12:00:00')
    const spaceRow = panel.locator('button[title^="${detail.spaceName}"]')
    assert.equal(await spaceRow.locator('.template-variables__name').innerText(), '{空间名称}')
    assert.equal(await spaceRow.locator('.template-variables__sample').innerText(), space)
    assert.match(await spaceRow.getAttribute('title'), /当前原生 AI 告警的投递数据未提供此字段/)
    const sourceId = '${detail.sourceId}'
    const body = page.getByRole('textbox', { name: '正文', exact: true })
    await body.click()
    await body.press('End')
    await panel.locator(`button[title^="${sourceId}"]`).click()
    assert.equal((await body.locator(`[data-template-variable="${sourceId}"]`).innerText()).replaceAll('\uFEFF', ''), '{告警源 ID}')
    await page.screenshot({ path: join(output, `${business}-variables.png`) })
    await page.close()
    console.log(title, '变量示例和中文标签通过')
  }

  const voice = await open('voice:aliyun')
  assert.deepEqual(await list(voice).getByRole('columnheader').allTextContents(), ['变量', '名称', '类型', '格式'])
  assert.equal(await list(voice).locator('tbody tr[data-row-key]').count(), 1)
  const device = row(voice, 'detail.targetName')
  assert.equal(await device.locator('td').first().locator('.template-variable-token').innerText(), '{设备名称}')
  assert.equal(await device.locator('.template-variable-token').getAttribute('title'), '${detail.targetName}')
  assert.equal(await device.locator('td').nth(1).innerText(), '设备名称')
  assert.equal(await device.locator('td').nth(3).innerText(), '%s')
  assert.ok(await save(voice).isDisabled())
  assert.equal(await voice.getByText('变量对应', { exact: true }).count(), 0)
  const source = voice.locator('.voice-editor .template-variable-input--multiline .ql-editor')
  await source.click()
  await source.press('End')
  const insertTime = voice.locator('.template-variables button[title^="${detail.alarmTime}"]')
  await insertTime.click()
  await insertTime.click()
  const time = row(voice, 'detail.alarmTime')
  assert.equal(await time.count(), 1)
  assert.equal(await time.locator('td').nth(1).innerText(), '告警时间')
  assert.equal(await formatOf(time), dateTimeFormat)
  assert.equal(await sampleOf(voice, 'detail.alarmTime'), '2026-01-01 12:00:00')
  await choose(voice, time.locator('td').nth(2), '字符串')
  await choose(voice, time.locator('td').nth(2), '时间')
  assert.equal(await formatOf(time), dateTimeFormat)
  await choose(voice, time.locator('td').nth(3), 'yyyy-MM-dd')
  assert.equal(await sampleOf(voice, 'detail.alarmTime'), '2026-01-01')
  await choose(voice, device.locator('td').nth(2), '数字')
  assert.equal(await device.getByRole('textbox').inputValue(), '%.2f')
  await device.getByRole('textbox').fill('%.3f')
  await list(voice).getByRole('heading').click()
  await voice.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
  await list(voice).scrollIntoViewIfNeeded()
  await voice.screenshot({ path: join(output, 'voice-variables.png') })
  await save(voice).click()
  await edit(voice).waitFor()
  const saved = await voice.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => method === 'saveBusinessTemplate').at(-1)[1].item.template)
  assert.equal(saved.variableDefinitions.find(item => item.id === 'detail.targetName').format, '%.3f')
  assert.equal(saved.variableDefinitions.find(item => item.id === 'detail.alarmTime').format, 'yyyy-MM-dd')
  assert.equal(saved.template.message.split('${detail.alarmTime}').length, 3)
  await edit(voice).click()
  assert.equal(await device.getByRole('textbox').inputValue(), '%.3f')
  assert.equal(await formatOf(time), 'yyyy-MM-dd')
  assert.ok(await save(voice).isDisabled())
  await source.fill('固定播报内容')
  await list(voice).getByText('当前模板未使用变量', { exact: true }).waitFor()
  await voice.getByRole('button', { name: '取消编辑' }).click()
  await voice.getByRole('button', { name: '放弃并继续' }).click()
  await edit(voice).click()
  assert.equal(await device.getByRole('textbox').inputValue(), '%.3f')
  assert.equal(await time.count(), 1)
  await voice.close()
  console.log('语音变量插入、去重、类型和格式、实际保存请求、重开及取消通过')

  for (const channel of ['sms:aliyunSms', 'email:embedded', 'dingTalk:dingTalkMessage', 'dingTalk:dingTalkRobotWebHook', 'weixin:corpMessage', 'webhook:http', 'extension:custom']) {
    const page = await open(channel, channel.startsWith('sms:') ? 390 : 1440)
    assert.equal(await sampleOf(page, 'notifyTime'), '2026-01-01 12:00:00', channel)
    const alarmTime = row(page, 'detail.alarmTime')
    if (await alarmTime.count()) assert.equal(await formatOf(alarmTime), dateTimeFormat, channel)
    assert.ok(await list(page).evaluate(element => element === element.closest('form').lastElementChild), channel)
    assert.equal(await page.getByText('变量对应', { exact: true }).count(), 0)
    if (channel === 'extension:custom') await list(page).getByText('当前模板未使用变量', { exact: true }).waitFor()
    else assert.ok(await list(page).locator('tbody tr[data-row-key]').count() > 0, channel)
    if (channel.startsWith('sms:')) {
      assert.equal(await row(page, 'detail.targetName').count(), 1)
      await list(page).scrollIntoViewIfNeeded()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      assert.ok(await row(page, 'detail.targetName').locator('.ant-select-selection-item').evaluate(item => item.scrollWidth <= item.clientWidth + 1))
      await page.screenshot({ path: join(output, 'sms-variables-mobile.png') })
    }
    if (channel === 'dingTalk:dingTalkMessage') {
      await page.locator('.template-variables button[title^="${detail.levelText}"]').click()
      const label = row(page, 'detail.levelText').locator('.template-variable-token')
      const token = page.locator('.ding-editor .ql-editor .template-variable-token[title="${detail.levelText}"]').first()
      assert.equal(await label.innerText(), '{级别名称}')
      assert.equal(await label.getAttribute('title'), '${detail.levelText}')
      const colors = node => [getComputedStyle(node).color, getComputedStyle(node).backgroundColor]
      assert.deepEqual(await label.evaluate(colors), await token.evaluate(colors))
      await label.scrollIntoViewIfNeeded()
      await page.screenshot({ path: join(output, 'dingtalk-variable-labels.png') })
    }
    if (channel === 'weixin:corpMessage') {
      const groupTitles = page.locator('.template-variables__group')
      assert.deepEqual(await groupTitles.allTextContents(), ['通用', '设备告警'])
      await checkWechatVariableDeletion(page)
      for (const name of ['场景联动', '告警解除']) {
        await page.locator('.template-directory').getByText(name, { exact: true }).click()
        const header = page.getByRole('heading', { level: 1, name, exact: true })
        await header.waitFor()
        await edit(page).click()
        await list(page).waitFor()
        assert.deepEqual(await groupTitles.allTextContents(), ['通用', await header.innerText()])
      }
    }
    await page.close()
    console.log(channel, '变量列表通过')
  }
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
