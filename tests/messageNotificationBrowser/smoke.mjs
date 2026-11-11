import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// An explicit installed tool path can supply Playwright without changing runtime dependencies.
const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')

// Run against the existing local Vite server; all business I/O stays in main.mjs.
const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9200'
const output = process.env.SMOKE_OUTPUT || '/tmp/message-notification-runtime-browser'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, baseURL)
const requireTranslations = process.env.SMOKE_REQUIRE_TRANSLATIONS !== '0'
const report = { assertions: [], screenshots: [], pages: [], errors: [], blockedRequests: [] }
const browser = await chromium.launch({ headless: true })
await mkdir(output, { recursive: true })

function pass(name, details) { report.assertions.push({ name, ...(details === undefined ? {} : { details }) }) }
async function eventually(assertion) {
  const until = Date.now() + 6000
  while (true) {
    try { return await assertion() } catch (error) {
      if (Date.now() >= until) throw error
      await new Promise(resolve => setTimeout(resolve, 60))
    }
  }
}
async function translation(page, key) {
  return page.evaluate(key => window.__notificationSmoke.i18n.global.t(key), key)
}
async function open(route, flags = '') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  page.setDefaultTimeout(6000)
  page.on('pageerror', error => report.errors.push({ route, message: error.message }))
  await page.route('**/*', request => {
    const item = request.request()
    if (['fetch', 'xhr'].includes(item.resourceType()) || new URL(item.url()).origin !== new URL(baseURL).origin) {
      report.blockedRequests.push({ route, type: item.resourceType(), url: item.url() })
      return request.abort()
    }
    return request.continue()
  })
  await page.goto(`${entry.href}${flags}#/${route}`)
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
  const titleKey = `messageNotification.${route}.title`
  const title = await translation(page, titleKey)
  if (requireTranslations) assert.notEqual(title, titleKey, `${route} must use the formal locale resources`)
  report.pages.push({ route, flags, title })
  return page
}
async function screenshot(page, name) {
  const target = path.join(output, `${name}.png`)
  await page.screenshot({ path: target, fullPage: true })
  report.screenshots.push(target)
}
async function narrow(page, name, editorSelector) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(160)
  if (editorSelector) await page.locator(editorSelector).waitFor()
  const dimensions = await page.evaluate(selector => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    editor: selector ? document.querySelector(selector)?.getBoundingClientRect().width : undefined,
  }), editorSelector)
  await screenshot(page, `${name}-narrow`)
  assert.ok(dimensions.document <= dimensions.viewport + 1, `${name}: document horizontal overflow`)
  if (editorSelector) assert.ok(dimensions.editor >= 270, `${name}: the editing area is too narrow (${dimensions.editor}px)`)
  pass(`${name}: narrow screen remains usable`, dimensions)
}
async function reachableByWheel(page, button, name) {
  const panel = await page.locator('.notification-channels__panel').last().boundingBox()
  const viewport = page.viewportSize()
  await page.mouse.move(Math.min(viewport.width - 24, panel.x + panel.width - 24), Math.min(viewport.height - 100, panel.y + 100))
  await page.mouse.wheel(0, 2000)
  await page.waitForTimeout(180)
  const result = await button.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    const panel = element.closest('.notification-channels__panel')
    return { top: rect.top, bottom: rect.bottom, viewport: innerHeight,
      panelScrollTop: panel.scrollTop, panelHeight: panel.clientHeight,
      directlyReachable: rect.top >= 0 && rect.bottom <= innerHeight && hit?.closest('button') === element }
  })
  assert.equal(result.directlyReachable, true, `${name}: the save button must be reachable by actual wheel scrolling`)
  pass(name, result)
}
function field(page, key, control = 'input') {
  return translation(page, key).then(label => page.locator('.template-editor > .ant-form-item').filter({ has: page.locator('.ant-form-item-label').filter({ hasText: label }) }).locator(control).first())
}
async function selectConfig(page, id) {
  await page.locator('.notification-channels__selector').click()
  await page.locator('.ant-select-item-option').filter({ hasText: id }).click()
  await page.locator('.channel-configuration').waitFor()
  await eventually(async () => assert.equal(await page.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.configId), id))
}
async function selectTemplate(page, name) {
  await page.locator('.template-directory .ant-tree-node-content-wrapper').filter({ hasText: name }).click()
  await page.locator('.cloud-detail-header__title').filter({ hasText: name }).waitFor()
  if (!await page.locator('.template-editor').count()) {
    await page.getByRole('button', { name: await translation(page, 'messageNotification.templates.edit'), exact: true }).click()
  }
  await page.locator('.template-editor').waitFor()
}

try {
  const records = await open('records')
  await eventually(async () => assert.equal(await records.locator('.ant-table-row').count(), 1))
  assert.match(await records.locator('.ant-table-row').innerText(), /设备 B 温度告警发送失败/)
  pass('records: default failure filter renders the saved failure and reason')
  const cancelLabel = await translation(records, 'messageNotification.records.state.cancel')
  await records.locator('.notification-records__toolbar .switch-group').getByRole('button', { name: new RegExp(cancelLabel) }).click()
  await eventually(async () => {
    assert.equal(await records.locator('.ant-table-row').count(), 1)
    assert.match(await records.locator('.ant-table-row').innerText(), /已取消的维护通知/)
  })
  assert.equal(await records.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.state), 'cancel')
  pass('records: cancel status filters historical state and updates the route')
  await records.locator('.notification-records__toolbar .switch-group button').first().click()
  await eventually(async () => assert.equal(await records.locator('.ant-table-row').count(), 3))
  const detailLabel = await translation(records, 'messageNotification.records.viewDetail')
  await records.getByRole('button', { name: '已保存的设备 A 温度告警', exact: true }).click()
  await records.locator('.ant-drawer-body').waitFor()
  const closeLabel = await translation(records, 'messageNotification.records.close')
  await eventually(async () => assert.equal(await records.evaluate(() => document.activeElement?.textContent?.replace(/\s+/g, '')), closeLabel.replace(/\s+/g, '')))
  assert.match(await records.locator('.ant-drawer-body').innerText(), /已保存的设备 A 温度告警/)
  assert.match(await records.locator('.ant-drawer-body').innerText(), /设备告警邮件/)
  assert.ok(!(await records.locator('.ant-drawer-body').innerText()).includes('template-alarm'))
  pass('records: drawer shows stored content and the corresponding template name')
  await screenshot(records, 'records-detail')
  await records.keyboard.press('Escape')
  await records.locator('.ant-drawer-open').waitFor({ state: 'hidden' })
  await eventually(async () => assert.equal(await records.evaluate(() => document.activeElement?.textContent?.trim()), '已保存的设备 A 温度告警'))
  pass('records: Escape closes drawer and restores invoking-button focus')
  await screenshot(records, 'records-desktop')
  await narrow(records, 'records')
  await records.getByRole('button', { name: detailLabel, exact: true }).first().click()
  await eventually(async () => assert.equal(await records.evaluate(() => document.activeElement?.textContent?.replace(/\s+/g, '')), closeLabel.replace(/\s+/g, '')))
  const drawerWidth = await records.locator('.ant-drawer-content-wrapper').evaluate(element => element.getBoundingClientRect().width)
  assert.ok(drawerWidth >= 320 && drawerWidth <= 390)
  await screenshot(records, 'records-narrow-detail')
  pass('records: narrow drawer stays within the viewport and receives focus', { width: drawerWidth })
  await records.close()

  const unavailable = await open('records', '?history=unavailable')
  await unavailable.locator('.ant-result').waitFor()
  assert.equal(await unavailable.evaluate(() => window.__notificationSmoke.calls.length), 0)
  assert.equal(await unavailable.locator('.notification-records__pagination').count(), 0)
  assert.equal(await unavailable.locator('.notification-records__toolbar .switch-group button:enabled').count(), 0)
  pass('records: unavailable capability makes no query or fabricated count')
  await screenshot(unavailable, 'records-unavailable')
  await unavailable.close()
  const denied = await open('records', '?permission=denied')
  await denied.locator('.ant-result').waitFor()
  assert.equal(await denied.evaluate(() => window.__notificationSmoke.calls.length), 0)
  assert.match(await denied.locator('.ant-result').innerText(), new RegExp(await translation(denied, 'messageNotification.records.feedback.forbidden')))
  pass('records: denied permission stays distinct and makes no query')
  await denied.close()

  const channels = await open('channels')
  await eventually(async () => assert.equal(await channels.evaluate(() => window.__notificationSmoke.calls.filter(item => item[0] === 'queryAllConfigs').length), 1))
  await eventually(async () => assert.equal(await channels.locator('.channel-configuration').count(), 1))
  assert.equal(await channels.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.configId), 'smtp-primary')
  assert.equal(await channels.locator('.notification-channels__selector').count(), 0)
  pass('channels: non-robot channel opens its saved record without configuration selection')
  const hostLabel = await translation(channels, 'messageNotification.channels.fields.host')
  const passwordLabel = await translation(channels, 'messageNotification.channels.fields.password')
  const initialCredential = await channels.evaluate(() => window.__notificationSmoke.configs.find(item => item.id === 'smtp-primary').configuration.password)
  assert.equal(await channels.locator('input[type="password"]').count(), 0)
  assert.match(await channels.getByRole('button', { name: passwordLabel, exact: true }).innerText(), /••••••••/)
  assert.equal(await channels.locator('.notification-page__footer').count(), 0)
  await channels.getByRole('button', { name: passwordLabel, exact: true }).click()
  assert.equal(await channels.locator('input[type="password"]').inputValue(), '')
  await channels.locator('input[type="password"]').press('Escape')
  pass('channels: saved details mask credentials and open an empty password editor without a page save footer')
  await channels.getByRole('button', { name: hostLabel, exact: true }).click()
  const hostInput = channels.locator(`input[aria-label=${JSON.stringify(hostLabel)}]`)
  await hostInput.fill('draft.smtp.example.test')
  await hostInput.press('Enter')
  await channels.getByRole('button', { name: hostLabel, exact: true }).waitFor()
  await channels.evaluate(() => window.__notificationSmoke.router.push({ path: '/channels', query: { channel: 'email:embedded', configId: 'smtp-backup' } }))
  await channels.evaluate(() => window.__notificationSmoke.router.push({ path: '/channels', query: { channel: 'email:embedded', configId: 'smtp-primary' } }))
  assert.equal(await channels.getByRole('button', { name: hostLabel, exact: true }).innerText(), 'draft.smtp.example.test')
  pass('channels: Enter saves one field and switching configurations restores the saved value')
  await channels.evaluate(() => window.__notificationSmoke.failures.add('updateConfig'))
  await channels.getByRole('button', { name: hostLabel, exact: true }).click()
  await hostInput.fill('retry.smtp.example.test')
  await hostInput.press('Enter')
  await channels.locator('.inline-edit-field__editor .ant-input-status-error').waitFor()
  assert.equal(await channels.locator('.inline-edit-field__error, .inline-edit-field__pending').count(), 0)
  assert.equal(await hostInput.inputValue(), 'retry.smtp.example.test')
  pass('channels: failed field save preserves the input and control error state without footer text')
  assert.equal(await channels.locator('.inline-edit-field__editor button').count(), 0)
  await hostInput.press('Tab')
  await channels.getByRole('button', { name: hostLabel, exact: true }).waitFor()
  const payloads = await channels.evaluate(() => window.__notificationSmoke.calls.filter(item => item[0] === 'updateConfig').map(item => item[1]))
  assert.equal(payloads.length, 3)
  assert.equal(payloads[2].id, 'smtp-primary')
  assert.equal(payloads[2].configuration.password, initialCredential)
  assert.equal(JSON.stringify(payloads[2]).includes('••••'), false)
  assert.equal(await channels.locator('input[type="password"]').count(), 0)
  pass('channels: retry saves the actual record while retaining its unchanged credential')
  await screenshot(channels, 'channels-desktop')
  await narrow(channels, 'channels', '.channel-configuration')
  await channels.getByRole('button', { name: hostLabel, exact: true }).click()
  await hostInput.fill('cancel.smtp.example.test')
  await hostInput.press('Escape')
  assert.equal(await channels.getByRole('button', { name: hostLabel, exact: true }).innerText(), 'retry.smtp.example.test')
  await screenshot(channels, 'channels-narrow-detail')
  pass('channels: narrow inline edit cancels back to the saved value')
  await channels.evaluate(() => window.__notificationSmoke.failures.add('updateConfig'))
  await channels.getByRole('button', { name: hostLabel, exact: true }).click()
  await hostInput.fill('unsaved.smtp.example.test')
  await hostInput.press('Enter')
  await channels.locator('.inline-edit-field__editor .ant-input-status-error').waitFor()
  assert.equal(await channels.locator('.inline-edit-field__error, .inline-edit-field__pending').count(), 0)
  await channels.evaluate(() => { void window.__notificationSmoke.router.push('/records') })
  await channels.locator('.jlc').waitFor()
  await channels.getByRole('button', { name: await translation(channels, 'messageNotification.channels.stay'), exact: true }).click()
  await channels.locator('.jlc').waitFor({ state: 'hidden' })
  assert.equal(await channels.evaluate(() => window.__notificationSmoke.router.currentRoute.value.path), '/channels')
  assert.equal(await hostInput.inputValue(), 'unsaved.smtp.example.test')
  pass('channels: failed unsaved field prompts before leaving and retains input when staying')
  await channels.close()

  const templates = await open('templates')
  await eventually(async () => assert.equal(await templates.locator('.template-directory .ant-tree-node-content-wrapper').count(), 2))
  await selectTemplate(templates, '设备告警邮件')
  const subject = await field(templates, 'messageNotification.templates.subject')
  await subject.fill('草稿：告警')
  await subject.evaluate(element => { element.focus(); element.setSelectionRange(3, 3); element.dispatchEvent(new Event('click', { bubbles: true })) })
  await templates.locator('.template-editor__tokens').getByRole('button', { name: '设备名称', exact: true }).click()
  await eventually(async () => assert.equal(await subject.inputValue(), '草稿：${deviceName}告警'))
  assert.deepEqual(await subject.evaluate(element => [element.selectionStart, element.selectionEnd, document.activeElement === element]), [16, 16, true])
  pass('templates: variable insertion uses the subject caret and restores focus')
  await selectTemplate(templates, '维护通知')
  await selectTemplate(templates, '设备告警邮件')
  assert.equal(await (await field(templates, 'messageNotification.templates.subject')).inputValue(), '草稿：${deviceName}告警')
  pass('templates: switching actual template IDs preserves the draft')
  const deviceExample = await templates.evaluate(() => window.__notificationSmoke.i18n.global.t('messageNotification.templates.sample', { name: '设备名称' }))
  assert.equal(await templates.locator('.template-preview input').count(), 0)
  await eventually(async () => assert.equal(await templates.locator('.template-preview h4').innerText(), `草稿：${deviceExample}告警`))
  assert.equal(await (await field(templates, 'messageNotification.templates.subject')).inputValue(), '草稿：${deviceName}告警')
  pass('templates: automatic preview examples leave the saved expression unchanged without a footer editor')
  await templates.evaluate(() => window.__notificationSmoke.failures.add('updateTemplate'))
  const templateSave = templates.getByRole('button', { name: await translation(templates, 'messageNotification.templates.save'), exact: true })
  await templateSave.click()
  await templates.locator('.message-templates__workspace .ant-alert-error').waitFor()
  assert.equal(await (await field(templates, 'messageNotification.templates.subject')).inputValue(), '草稿：${deviceName}告警')
  pass('templates: failed save retains the draft')
  await templateSave.click()
  await templates.locator('.message-templates__workspace .ant-alert-success').waitFor()
  await templateSave.waitFor({ state: 'hidden' })
  assert.equal(await templates.evaluate(() => window.__notificationSmoke.templates.find(item => item.id === 'template-alarm').template.subject), '草稿：${deviceName}告警')
  assert.equal(await templates.evaluate(() => window.__notificationSmoke.calls.filter(item => item[0] === 'updateTemplate').every(item => item[1].id === 'template-alarm')), true)
  pass('templates: one save writes only the actual template ID')
  await screenshot(templates, 'templates-desktop')
  await templates.getByRole('button', { name: await translation(templates, 'messageNotification.templates.edit'), exact: true }).click()
  await narrow(templates, 'templates', '.template-editor')
  assert.equal(await templates.locator('.message-templates__directory').count(), 0)
  const body = await field(templates, 'messageNotification.templates.body', 'textarea')
  await body.fill('窄屏正文：')
  await body.evaluate(element => { element.focus(); element.setSelectionRange(5, 5); element.dispatchEvent(new Event('click', { bubbles: true })) })
  await templates.locator('.template-editor__tokens').getByRole('button', { name: '告警名称', exact: true }).click()
  await eventually(async () => assert.equal(await body.inputValue(), '窄屏正文：${alarmName}'))
  await body.scrollIntoViewIfNeeded()
  assert.ok(await body.isVisible())
  await screenshot(templates, 'templates-narrow-editor')
  pass('templates: narrow workspace scrolls to the actual body field and supports variable insertion')
  for (const name of ['维护通知 (template-maintenance)', '设备告警邮件 (template-alarm)']) {
    await templates.locator('.message-templates__mobile-picker .ant-select').click()
    await templates.locator('.ant-select-item-option').filter({ hasText: name }).click()
    await templates.locator('.cloud-detail-header__title').filter({ hasText: name.split(' (')[0] }).waitFor()
    if (!await templates.locator('.template-editor').count()) {
      await templates.getByRole('button', { name: await translation(templates, 'messageNotification.templates.edit'), exact: true }).click()
    }
    await eventually(async () => assert.equal(await (await field(templates, 'messageNotification.templates.name')).inputValue(), name.split(' (')[0]))
  }
  assert.equal(await (await field(templates, 'messageNotification.templates.body', 'textarea')).inputValue(), '窄屏正文：${alarmName}')
  pass('templates: mobile template picker preserves per-ID body drafts')
  await templates.evaluate(() => { void window.__notificationSmoke.router.push('/records') })
  await templates.locator('.jlc').waitFor()
  await templates.getByRole('button', { name: await translation(templates, 'messageNotification.templates.keepEditing'), exact: true }).click()
  await templates.locator('.jlc').waitFor({ state: 'hidden' })
  assert.equal(await templates.evaluate(() => window.__notificationSmoke.router.currentRoute.value.path), '/templates')
  assert.equal(await (await field(templates, 'messageNotification.templates.body', 'textarea')).inputValue(), '窄屏正文：${alarmName}')
  pass('templates: leaving prompts for unsaved drafts and cancellation keeps the editor')
  await templates.close()

  assert.deepEqual(report.errors, [], 'No uncaught errors are allowed')
  assert.deepEqual(report.blockedRequests, [], 'No business or external request attempts are allowed')
  pass('isolation: no uncaught page errors or attempted business/external requests')
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = { message: error.message, stack: error.stack }
  process.exitCode = 1
} finally {
  await browser.close()
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ passed: report.passed, assertions: report.assertions.length, report: path.join(output, 'report.json'), failure: report.failure?.message }))
}
