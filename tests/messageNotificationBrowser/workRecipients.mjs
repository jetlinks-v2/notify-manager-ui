import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9201'
const output = process.env.SMOKE_OUTPUT || '/tmp/notification-work-recipients'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, base)
const browser = await chromium.launch({ channel: process.env.SMOKE_CHROMIUM_CHANNEL })
const errors = []
await mkdir(output, { recursive: true })

async function open(channel, width = 1440, options = '') {
  const page = await browser.newPage({ viewport: { width, height: 960 }, serviceWorkers: 'block' })
  page.on('pageerror', error => errors.push(error.message))
  await page.routeWebSocket('**/*', () => {})
  await page.route('**/*', route => {
    const request = route.request()
    if (['fetch', 'xhr'].includes(request.resourceType()) || new URL(request.url()).origin !== entry.origin) {
      errors.push(`Unexpected live request ${request.url()}`)
      return route.abort()
    }
    return route.continue()
  })
  await page.goto(`${entry.href}?wechat&workRecipients${options}#/channels?channel=${encodeURIComponent(channel)}`)
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready')
  try {
    await page.getByRole('region', { name: '部门对应', exact: true }).waitFor()
  } catch (error) {
    process.stderr.write(JSON.stringify({ channel, errors, body: (await page.locator('body').innerText()).slice(0, 300) }) + '\n')
    throw error
  }
  return page
}

const snapshot = page => page.evaluate(() => {
  const { calls, configs, templates, businessTypes, memberBindings } = window.__notificationSmoke
  return { calls, configs, templates, businessTypes, memberBindings }
})
const groupRegion = (page, name) => page.getByRole('region', { name, exact: true })
const drawer = (page, type) => page.locator('.ant-drawer-open').filter({ hasText: `管理${type}对应` })
const preview = page => page.getByRole('dialog', { name: '确认接收范围' })
const button = (scope, name) => scope.getByRole('button', { name, exact: true })
const manage = (page, type) => groupRegion(page, `${type}对应`).getByRole('button', { name: '管理对应 ›' })
const status = page => page.getByText('消息模板接收范围已同步。', { exact: true })
const openGroup = async (page, type, waitFor) => {
  await manage(page, type).click()
  const currentDrawer = drawer(page, type)
  await currentDrawer.getByText(waitFor, { exact: true }).waitFor()
  assert.equal(await currentDrawer.getByRole('radio').count(), 0)
  return currentDrawer
}

try {
  const page = await open('weixin:corpMessage')
  const memberRegion = groupRegion(page, '成员对应')
  const departmentRegion = groupRegion(page, '部门对应')
  const tagRegion = groupRegion(page, '标签对应')
  for (const section of [memberRegion, departmentRegion, tagRegion]) {
    assert.equal(await button(section, '自动匹配').count(), 1)
    assert.equal(await section.getByRole('button', { name: '管理对应 ›' }).count(), 1)
  }
  assert.equal(await groupRegion(page, '接收范围').count(), 0)
  await departmentRegion.getByText(/已对应 0 \/ 3 项/).waitFor()
  await tagRegion.getByText(/已对应 0 \/ 1 项/).waitFor()
  await page.screenshot({ path: join(output, 'wechat-separate-mappings.png') })

  const departmentDrawer = await openGroup(page, '部门', '研发组')
  assert.equal(await departmentDrawer.getByText('值班员', { exact: true }).count(), 0)
  await departmentDrawer.getByRole('button', { name: /关\s*闭/ }).click()
  await departmentDrawer.waitFor({ state: 'hidden' })
  await button(departmentRegion, '自动匹配').click()
  await preview(page).getByText(/legacy-dept/).first().waitFor()
  assert.equal(await page.locator('.ant-drawer-open').count(), 0)
  assert.equal((await snapshot(page)).calls.some(([method]) => method === 'updateConfig'), false)
  await page.screenshot({ path: join(output, 'wechat-preview.png') })
  await page.evaluate(() => window.__notificationSmoke.failures.add('saveRecipient:work-2'))
  await button(preview(page), '确认并同步').click()
  await page.getByText(/设备告警解除.*重试/).waitFor()
  let state = await snapshot(page)
  const first = state.templates.find(template => template.id === 'fixture-template-work-1-notifier-weixin')
  const failed = state.templates.find(template => template.id === 'fixture-template-work-2-notifier-weixin')
  assert.deepEqual(first.template, { agentId: '42', message: '旧正文 work-1', toParty: 'team', toUser: 'corp-existing', toTag: '' })
  assert.equal(failed.template.toParty, 'legacy-dept')
  const channel = state.businessTypes[0].channels.find(item => item.channelProvider === 'notifier-weixin')
  assert.equal(channel.channelConfiguration.variables.toUser, undefined)
  assert.equal(channel.channelConfiguration.variables.business, 'keep')
  assert.equal(channel.state, 'enabled')
  assert.equal(state.templates.find(template => template.id === 'fixture-template-work-1-notifier-dingTalk').template.departmentIdList, 'legacy-ding')
  const config = state.configs.find(record => record.id === 'corp-fixture')
  assert.equal(config.configuration.corpSecret, 'fixture-only-secret')
  assert.deepEqual(config.configuration.workNotificationRecipients.departments, [{ platformId: 'org-team', externalId: 'team' }])
  assert.deepEqual(config.configuration.workNotificationRecipients.tags, [])

  await button(page, '同步消息模板').click()
  await status(page).waitFor()
  state = await snapshot(page)
  assert.deepEqual(state.calls.filter(([method]) => method === 'saveBusinessTemplate').map(([, payload]) => payload.providerId), ['work-1', 'work-2', 'work-2'])
  assert.equal(state.templates.find(template => template.id === failed.id).template.toParty, 'team')
  assert.equal(state.businessTypes[1].channels.find(item => item.channelProvider === 'notifier-weixin').state, 'disabled')

  const tagDrawer = await openGroup(page, '标签', '值班员')
  assert.equal(await tagDrawer.getByText('研发组', { exact: true }).count(), 0)
  await button(tagDrawer, '自动匹配').click()
  await tagDrawer.getByText('值班员 · tag-duty').waitFor()
  await button(tagDrawer, '保存对应关系').click()
  await status(page).waitFor()
  await tagRegion.getByText(/已对应 1 \/ 1 项/).waitFor()
  state = await snapshot(page)
  assert.deepEqual(state.configs.find(record => record.id === 'corp-fixture').configuration.workNotificationRecipients.tags,
    [{ platformId: 'role-duty', externalId: 'tag-duty' }])
  assert.equal(state.templates.find(template => template.id === first.id).template.toTag, 'tag-duty')

  await button(memberRegion, '自动匹配').click()
  await memberRegion.getByText('对应关系已更新', { exact: false }).waitFor()
  await status(page).waitFor()
  state = await snapshot(page)
  assert.ok(state.memberBindings.some(item => item.userId === 'platform-phone' && item.thirdPartyUserId === 'corp-phone'))
  assert.equal(state.templates.find(template => template.id === first.id).template.toUser, 'corp-existing,corp-phone')

  await page.evaluate(() => window.__notificationSmoke.router.push('/templates?channel=weixin:corpMessage&business=work-3'))
  const editTemplate = page.getByRole('button', { name: /编\s*辑/ })
  if (!await page.getByRole('button', { name: '保存模板', exact: true }).isVisible()) await editTemplate.click()
  await page.getByText('在此编辑消息内容。请到「通知渠道」管理接收范围。').waitFor()
  assert.equal(await page.getByText(/接收部门|接收用户|接收标签/).count(), 0)
  await page.getByRole('textbox', { name: '正文', exact: true }).fill('新模板继承渠道收件人')
  await button(page, '保存模板').click()
  await page.getByRole('button', { name: /编\s*辑/ }).waitFor()
  state = await snapshot(page)
  const created = state.templates.find(template => template.id === 'fixture-template-work-3-notifier-weixin')
  assert.equal(created.template.toTag, 'tag-duty')
  assert.equal(created.template.toParty, 'team')

  await page.evaluate(() => window.__notificationSmoke.router.push('/channels?channel=weixin:corpMessage'))
  const savedTagDrawer = await openGroup(page, '标签', '值班员')
  await button(savedTagDrawer, '解除对应').click()
  await page.locator('.ant-popover:visible').getByRole('button', { name: '解除对应', exact: true }).click()
  await button(savedTagDrawer, '保存对应关系').click()
  await status(page).waitFor()
  state = await snapshot(page)
  assert.equal(state.templates.find(template => template.id === created.id).template.toTag, '')
  assert.equal(state.templates.find(template => template.id === created.id).template.toParty, 'team')
  await button(groupRegion(page, '标签对应'), '自动匹配').click()
  await status(page).waitFor()
  assert.equal(await page.locator('.ant-drawer-open').count(), 0)
  assert.equal((await snapshot(page)).templates.find(template => template.id === created.id).template.toTag, 'tag-duty')
  await page.close()

  const mobile = await open('dingTalk:dingTalkMessage', 390)
  assert.equal(await groupRegion(mobile, '标签对应').count(), 0)
  const dingDrawer = await openGroup(mobile, '部门', '研发组')
  await button(dingDrawer, '自动匹配').click()
  await dingDrawer.getByText('研发组 · ding-team').waitFor()
  await button(dingDrawer, '保存对应关系').click()
  await button(preview(mobile), '确认并同步').click()
  await status(mobile).waitFor()
  state = await snapshot(mobile)
  assert.equal(state.templates.find(template => template.id === 'fixture-template-work-1-notifier-dingTalk').template.departmentIdList, 'ding-team')
  assert.equal(state.templates.find(template => template.id === 'fixture-template-work-1-notifier-dingTalk').template.toAllUser, false)
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await mobile.screenshot({ path: join(output, 'dingtalk-mobile.png') })
  await mobile.close()

  const readonly = await open('weixin:corpMessage', 1440, '&permission=no-bind')
  assert.equal(await manage(readonly, '部门').isDisabled(), true)
  assert.deepEqual((await snapshot(readonly)).calls.filter(([method]) => ['updateConfig', 'saveBusinessTemplate', 'recipientDirectory'].includes(method)), [])
  assert.deepEqual(errors, [])
  process.stdout.write('Work recipient browser checks passed.\n')
} finally {
  await browser.close()
}
