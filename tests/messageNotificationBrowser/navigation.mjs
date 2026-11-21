import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)(process.env.SMOKE_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:9200'
const output = process.env.SMOKE_OUTPUT || '/tmp/notification-menu-browser'
const entry = new URL(`/@fs${fileURLToPath(new URL('./index.html', import.meta.url))}`, base)
const report = { passed: [], errors: [], blockedRequests: [] }
const browser = await chromium.launch({ headless: true, channel: process.env.SMOKE_CHROMIUM_CHANNEL })
await mkdir(output, { recursive: true })
async function open(route, flags = '') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.route('**/*', request => {
    const item = request.request()
    if (['xhr', 'fetch'].includes(item.resourceType()) || new URL(item.url()).origin !== new URL(base).origin) {
      report.blockedRequests.push(item.url())
      return request.abort()
    }
    return request.continue()
  })
  await page.goto(`${entry.href}${flags}#/${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(() => document.documentElement.dataset.notificationSmoke === 'ready', undefined, { timeout: 30000 })
  return page
}
const translate = (page, key) => page.evaluate(key => window.__notificationSmoke.i18n.global.t(key), key)
const labels = async locator => (await locator.allTextContents()).map(text => text.trim())
const button = async (page, key, scope = page) => scope.getByRole('button', { name: new RegExp(`^${(await translate(page, key)).split('').join('\\s*')}$`) })
try {
  const channels = await open('channels?configId=smtp-backup')
  await channels.waitForFunction(() => window.__notificationSmoke.router.currentRoute.value.query.channel === 'email:embedded')
  await channels.locator('.channel-configuration').waitFor()
  assert.equal(await channels.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.configId), 'smtp-backup')
  assert.equal(await channels.evaluate(() => window.__notificationSmoke.calls.some(([method, id]) => method === 'getConfig' && id === 'smtp-primary')), false)
  report.passed.push('configId-only entry selects the exact configuration and its provider')
  await channels.evaluate(() => window.__notificationSmoke.router.replace('/channels?channel=voice:aliyun'))
  await channels.locator('.channel-configuration').waitFor()
  await channels.waitForFunction(() => window.__notificationSmoke.calls.some(([method, value]) => method === 'getConfigMetadata' && value.type === 'voice'))
  await channels.screenshot({ path: `${output}/voice-channel.png`, fullPage: true })
  report.passed.push('voice:aliyun opens the matching provider configuration')

  const linked = await open('templates?topicProvider=alarm-device-relieve&channelProvider=notifier-email', '?directory=tree')
  await linked.waitForFunction(() => window.__notificationSmoke.calls.some(([method, input]) => method === 'getBusinessTemplate' && input.providerId === 'relieve-config'))
  await linked.locator('.template-preview').getByText('告警解除通知内容', { exact: true }).waitFor()
  await linked.screenshot({ path: `${output}/business-template.png`, fullPage: true })
  const directoryRows = linked.locator('.template-directory__tree .ant-tree-treenode').filter({ has: linked.locator('.template-directory__node') })
  assert.equal(await directoryRows.evaluateAll(rows => rows.every(row => row.querySelectorAll('.ant-tree-indent-unit').length <= 1)), true)
  report.passed.push('business link selects the exact bound template in the two-level directory')
  await linked.close()

  const wechat = await open('templates?channel=email:embedded&business=wechat-device-topic', '?unifiedTests&wechatTemplates&existingWechatTemplates&robotSigning')
  const channelNav = wechat.locator('.template-channel-navigation')
  const wechatButton = channelNav.getByRole('button', { name: /^微信 ·/ })
  await wechatButton.click()
  await wechat.locator('.wechat-template__card').waitFor()
  await wechat.getByText('已保存', { exact: true }).waitFor()
  assert.equal(await wechatButton.getAttribute('aria-pressed'), 'true')
  assert.equal(await channelNav.getByRole('tab').count(), 0)
  assert.doesNotMatch(await channelNav.innerText(), /微信服务号/)
  assert.deepEqual(await wechat.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query),
    { channel: 'weixin:corpMessage', business: 'wechat-device-topic' })
  await wechat.setViewportSize({ width: 390, height: 844 })
  assert.equal(await channelNav.getByRole('tab').count(), 0)
  assert.ok(await wechat.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await wechat.setViewportSize({ width: 1440, height: 1000 })
  const businessRows = wechat.locator('.template-directory__name')
  await businessRows.first().waitFor()
  const directoryLabels = await labels(businessRows)
  await wechat.evaluate(() => {
    const { businessTypes, templates } = window.__notificationSmoke
    const business = businessTypes.find(item => item.id === 'wechat-device-topic')
    const template = {
      id: 'saved-robot-template', name: '设备告警', type: 'dingTalk', provider: 'dingTalkRobotWebHook',
      configId: 'robot-one', template: { messageType: 'text', text: { content: '已绑定机器人的正文' } },
    }
    templates.push(template)
    business.channels.push({
      id: 'saved-robot-channel', providerId: business.id, channelProvider: 'notifier-dingTalk',
      channelConfiguration: { notifierId: template.configId, templateId: template.id },
    })
  })
  await channelNav.getByRole('button', { name: /^钉钉 ·/ }).click()
  await channelNav.getByRole('tab', { name: '工作通知', exact: true }).waitFor()
  const expectedRobotLabels = await wechat.evaluate(() => window.__notificationSmoke.configs
    .filter(config => config.provider === 'dingTalkRobotWebHook').map(config => `群机器人·${config.name}`))
  assert.deepEqual((await labels(channelNav.getByRole('tab'))).filter(label => label.startsWith('群机器人·')).sort(), expectedRobotLabels.sort())
  const boundRobot = channelNav.getByRole('tab', { name: '群机器人·robot-one', exact: true })
  const otherRobot = channelNav.getByRole('tab', { name: '群机器人·robot-two', exact: true })
  await boundRobot.click()
  await wechat.locator('.template-preview').getByText('已绑定机器人的正文', { exact: true }).waitFor()
  assert.equal(await boundRobot.getAttribute('aria-selected'), 'true')
  await otherRobot.click()
  await wechat.waitForFunction(() => window.__notificationSmoke.router.currentRoute.value.query.configId === 'robot-two')
  await wechat.getByText('默认模板 · 未保存', { exact: true }).waitFor()
  await wechat.locator('.ding-preview__card').waitFor()
  assert.equal(await otherRobot.getAttribute('aria-selected'), 'true')
  assert.equal(await wechat.getByText('已绑定机器人的正文', { exact: true }).count(), 0)
  await (await button(wechat, 'messageNotification.templates.edit')).click()
  await wechat.getByRole('button', { name: '保存模板', exact: true }).click()
  await wechat.waitForFunction(() => window.__notificationSmoke.templates.some(item => item.configId === 'robot-two'
    && item.provider === 'dingTalkRobotWebHook'))
  await wechat.getByText('已保存', { exact: true }).waitFor()
  assert.deepEqual(await labels(businessRows), directoryLabels)
  await boundRobot.click()
  await wechat.locator('.template-preview').getByText('已绑定机器人的正文', { exact: true }).waitFor()
  assert.deepEqual(await labels(businessRows), directoryLabels)
  await wechat.setViewportSize({ width: 390, height: 844 })
  assert.ok(await wechat.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await wechat.setViewportSize({ width: 1440, height: 1000 })
  await otherRobot.click()
  await wechat.getByText('已保存', { exact: true }).waitFor()
  assert.equal(await wechat.locator('.template-preview').getByText('已绑定机器人的正文', { exact: true }).count(), 0)
  const workTab = channelNav.getByRole('tab', { name: '工作通知', exact: true })
  await workTab.click()
  await channelNav.getByRole('tab', { name: '工作通知', exact: true, selected: true }).waitFor()
  await wechat.locator('.template-preview').getByText('工作通知', { exact: true }).waitFor()
  assert.deepEqual(await labels(businessRows), directoryLabels)
  await boundRobot.click()
  await wechat.locator('.template-preview').getByText('已绑定机器人的正文', { exact: true }).waitFor()
  report.passed.push('WeChat opens work notifications; DingTalk saves and reopens the second robot without replacing the first one')
  report.passed.push('both robot configurations and work notifications share the same business directory')

  for (const language of ['zh', 'en', 'ja']) {
    await Promise.all([channels, wechat].map(page => page.evaluate(language => {
      window.__notificationSmoke.i18n.global.locale.value = language
    }, language)))
    const primary = await labels(channelNav.getByRole('button'))
    const groupRobot = await translate(wechat, 'messageNotification.channels.groupRobot')
    const providers = [...new Set((await labels(channelNav.getByRole('tab'))).map(label => label.startsWith(`${groupRobot}·`) ? groupRobot : label))]
    const tree = await labels(channels.locator('.notification-channels__tree .notification-channels__node-label'))
    assert.deepEqual(tree.sort(), [...primary, ...providers].sort(), language)

    await channels.setViewportSize({ width: 390, height: 844 })
    await channels.locator('.notification-channels__mobile-nav').click()
    const options = channels.locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    await options.first().waitFor()
    const dingTalk = await translate(channels, 'NoticeCenter.channel.type.dingTalk')
    const items = primary.flatMap(label => label === dingTalk ? providers.map(provider => `${label} · ${provider}`) : [label])
    assert.deepEqual((await labels(options)).sort(), items.sort(), language)
    if (language === 'zh') {
      await options.filter({ hasText: /^钉钉 · 群机器人$/ }).click()
      await channels.waitForFunction(() => window.__notificationSmoke.router.currentRoute.value.query.channel === 'dingTalk:dingTalkRobotWebHook')
    }
    await channels.setViewportSize({ width: 1440, height: 1000 })
  }
  await channels.close()
  report.passed.push('channel tree, mobile select and template navigation share the same labels in Chinese, English and Japanese')
  await wechat.evaluate(() => { window.__notificationSmoke.i18n.global.locale.value = 'zh' })
  const callsBeforeOfficial = await wechat.evaluate(() => window.__notificationSmoke.calls.length)
  await wechat.evaluate(() => window.__notificationSmoke.router.push({ path: '/templates', query: {
    channel: 'weixin:officialMessage', business: 'wechat-device-topic', configId: 'trial-officialMessage',
  } }))
  await wechat.locator('.message-templates__detail').getByText('当前模板能力不可用', { exact: true }).waitFor()
  assert.equal(await wechat.evaluate(start => window.__notificationSmoke.calls.slice(start).some(([method, input]) =>
    method.startsWith('saveBusiness') || method === 'getTemplateMetadata' && input.provider === 'officialMessage'
    || method === 'queryTemplates' && input.terms.some(term => term.column === 'provider' && term.value === 'officialMessage')), callsBeforeOfficial), false)
  report.passed.push('an explicit official-account link reports that the provider is unavailable without querying or editing its template')
  await wechat.close()

  const unboundRobot = await open('templates?channel=dingTalk:dingTalkRobotWebHook&business=alarm-device&configId=robot-two', '?directory=tree&robotSigning')
  await unboundRobot.locator('.ding-preview__card').waitFor()
  assert.equal(await unboundRobot.getByRole('tab', { name: '群机器人·robot-two', exact: true }).getAttribute('aria-selected'), 'true')
  await (await button(unboundRobot, 'messageNotification.templates.edit')).click()
  await unboundRobot.locator('.template-editor').waitFor()
  await (await button(unboundRobot, 'messageNotification.templates.save')).click()
  await unboundRobot.getByText('已保存', { exact: true }).waitFor()
  assert.equal(await unboundRobot.evaluate(() => {
    const { calls, router } = window.__notificationSmoke
    const request = calls.find(([method]) => method === 'saveBusinessTemplate')
    return request?.[1]?.item?.template?.configId === 'robot-two' && router.currentRoute.value.query.configId === 'robot-two'
  }), true)
  report.passed.push('an explicit robot link selects its configuration and the first template save uses that robot')
  await unboundRobot.close()

  const noRobot = await open('records', '?fresh&directory=tree')
  await noRobot.evaluate(async () => {
    const { configs, templates, businessTypes, router } = window.__notificationSmoke
    const topic = businessTypes.find(item => item.provider === 'alarm-device')
    const configId = 'work-only'
    configs.push({ id: configId, name: '工作通知配置', type: 'dingTalk', provider: 'dingTalkMessage', configuration: { agentId: '42' } })
    templates.push({
      id: 'work-template', name: topic.name, type: 'dingTalk', provider: 'dingTalkMessage', configId,
      template: { agentId: '42', message: '工作通知的已保存正文' },
    })
    topic.channels.push({
      id: 'work-binding', providerId: topic.id, channelProvider: 'notifier-dingTalk',
      channelConfiguration: { templateId: 'work-template', notifierId: configId },
    })
    await router.push({ path: '/templates', query: { channel: 'dingTalk:dingTalkMessage', business: topic.id } })
  })
  await noRobot.locator('.template-preview').getByText('工作通知的已保存正文', { exact: true }).waitFor()
  const beforeRobot = await noRobot.evaluate(() => window.__notificationSmoke.calls.filter(([name]) => name === 'getBusinessTemplate').length)
  await noRobot.getByRole('tab', { name: '群机器人', exact: true }).click()
  const missingConfig = noRobot.locator('.message-templates__detail .ant-alert-warning')
  await missingConfig.getByText('当前渠道尚未配置，配置后即可保存模板', { exact: true }).waitFor()
  assert.equal(await (await button(noRobot, 'messageNotification.templates.configure', missingConfig)).isVisible(), true)
  await noRobot.locator('.ding-preview__card').waitFor()
  assert.equal(await noRobot.locator('.template-preview').getByText('工作通知的已保存正文', { exact: true }).count(), 0)
  assert.equal(await noRobot.evaluate(() => window.__notificationSmoke.calls.filter(([name]) => name === 'getBusinessTemplate').length), beforeRobot)
  assert.equal(await noRobot.getByText('加载或保存失败，请重试', { exact: true }).count(), 0)
  report.passed.push('an unconfigured robot shows the shared setup notice and default preview beside a saved work notification')
  await noRobot.close()

  const missing = await open('templates?topicProvider=scene&channelProvider=notifier-email', '?directory=tree')
  await missing.locator('.template-preview').waitFor()
  assert.equal(await missing.evaluate(() => window.__notificationSmoke.calls.some(([method]) => method === 'getTemplate')), false)
  assert.equal(await missing.evaluate(() => window.__notificationSmoke.calls.some(([method]) => method.startsWith('saveBusiness') || method === 'setBusinessEnabled')), false)
  const businessState = missing.locator('.message-templates__business-state')
  assert.equal((await businessState.textContent()).trim(), await translate(missing, 'messageNotification.templates.businessStateDisabled'))
  assert.equal(await businessState.getAttribute('title'), await translate(missing, 'messageNotification.templates.businessDisabled'))
  const actions = missing.locator('.cloud-detail-header__actions')
  assert.equal(await actions.getByRole('button', { name: await translate(missing, 'messageNotification.templates.more'), exact: true }).count(), 0)
  assert.equal(await (await button(missing, 'messageNotification.templates.restoreDefault', actions)).count(), 1)
  await (await button(missing, 'messageNotification.templates.enableBusiness', actions)).click()
  await missing.waitForFunction(() => window.__notificationSmoke.router.currentRoute.value.query.topicProvider === 'actual-scene')
  assert.equal(await missing.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => method === 'setBusinessEnabled').length), 1)
  await missing.waitForFunction(text => document.querySelector('.message-templates__business-state')?.textContent?.trim() === text,
    await translate(missing, 'messageNotification.templates.businessStateEnabled'))
  assert.match(await businessState.getAttribute('class'), /ant-tag-success/)
  report.passed.push('business header exposes restore and enable beside edit without a more menu')
  await (await button(missing, 'messageNotification.templates.disableBusiness', actions)).click()
  await missing.waitForFunction(text => document.querySelector('.message-templates__business-state')?.textContent?.trim() === text,
    await translate(missing, 'messageNotification.templates.businessStateDisabled'))
  assert.deepEqual(await missing.evaluate(() => window.__notificationSmoke.calls.filter(([method]) => method === 'setBusinessEnabled').map(([, input]) => input.enabled)), [true, false])
  assert.equal(await missing.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.topicProvider), 'actual-scene')
  report.passed.push('header button disables the business directly and the state tag returns to disabled')
  await (await button(missing, 'messageNotification.templates.edit')).click()
  await missing.locator('.template-editor').waitFor()
  assert.equal(await missing.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.topicProvider), 'actual-scene')
  await missing.getByRole('button', { name: /^短信 ·/ }).click()
  await missing.waitForFunction(() => window.__notificationSmoke.router.currentRoute.value.query.channel === 'sms:aliyunSms')
  assert.equal(await missing.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.topicProvider), 'actual-scene')
  report.passed.push('unbound business previews defaults without writes and explicit enable preserves its concrete record across channels')
  await missing.screenshot({ path: `${output}/unbound-business.png`, fullPage: true })
  await missing.setViewportSize({ width: 390, height: 844 })
  await missing.screenshot({ path: `${output}/business-mobile.png`, fullPage: true })
  assert.equal(await missing.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await missing.close()

  const retry = await open('templates?topicProvider=alarm-device', '?directory=tree&fail=queryTemplateDirectory')
  await retry.locator('.message-templates__detail .ant-alert-warning').waitFor()
  assert.equal(await retry.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.templateId), undefined)
  await retry.locator('.message-templates__detail .ant-alert-warning button').click()
  await retry.locator('.template-preview').waitFor()
  report.passed.push('failed business directory stays explicit and retry restores the exact binding')
  await retry.close()

  const saved = await open('channels', '?directory=tree')
  await saved.evaluate(async () => {
    const session = 'a'.repeat(32)
    window.navigationEvents = []
    window.navigationListener = new BroadcastChannel(`jetlinks.visual-alarm-template.v1.${session}`)
    window.navigationListener.onmessage = event => window.navigationEvents.push(event.data)
    const state = window.__notificationSmoke
    state.businessTypes.find(item => item.provider === 'aiSecurityAlarm').id = 'actual-security'
    state.businessTypes.find(item => item.provider === 'aiSecurityAlarm').channels = [{ channelProvider: 'notifier-email', channelConfiguration: { templateId: 'template-alarm' } }]
    await state.router.push({ path: '/templates', query: { topicProvider: 'aiSecurityAlarm', aiAlarmType: 'aiSecurityAlarm', visualAlarmSession: session } })
  })
  await saved.locator('.template-preview').waitFor()
  await (await button(saved, 'messageNotification.templates.edit')).click()
  const subject = await translate(saved, 'messageNotification.templates.visual.subject')
  await saved.getByRole('textbox', { name: subject, exact: true }).fill('导航迁移保存测试')
  await (await button(saved, 'messageNotification.templates.save')).click()
  await saved.waitForFunction(() => window.navigationEvents.length === 1)
  assert.deepEqual(await saved.evaluate(() => window.navigationEvents), [{ type: 'template-saved', version: 1, alarmType: 'aiSecurityAlarm' }])
  assert.equal(await saved.evaluate(() => window.__notificationSmoke.calls.some(([method]) => method === 'send' || method === 'createTemplate')), false)
  report.passed.push('successful edit of a bound template publishes the originating AI alarm session event')
  await saved.evaluate(() => window.navigationListener.close())
  await saved.close()
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.blockedRequests, [])
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
