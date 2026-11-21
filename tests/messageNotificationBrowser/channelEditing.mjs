export const editButton = (scope, text) => scope.getByRole('button', { name: new RegExp(`^${text.split('').join('\\s*')}$`) })
const translate = (page, key) => page.evaluate(key => window.__notificationSmoke.i18n.global.t(key), key)

export async function beginChannelEdit(page, configId) {
  if (await page.locator('.ant-dropdown:visible').count()) {
    await page.locator('.notification-channels__heading h2').click()
    await page.locator('.ant-dropdown:visible').waitFor({ state: 'hidden' })
  }
  const rows = page.locator('.channel-configurations__row')
  if (!await rows.count()) { await page.locator('.channel-configuration input:not([type=radio])').first().waitFor(); return }
  const id = configId ?? await page.evaluate(() => window.__notificationSmoke.router.currentRoute.value.query.configId)
  const scope = id ? page.locator(`.channel-configurations__row[data-config-id="${id}"]`) : rows.first()
  await editButton(scope, await translate(page, 'messageNotification.channels.more')).click()
  await page.locator('.ant-dropdown:visible').waitFor()
  await editButton(page.getByRole('menuitem'), await translate(page, 'messageNotification.common.edit')).click()
  await page.locator('.channel-configuration-modal').waitFor()
}

export async function saveChannelDraft(page) {
  const modal = page.locator('.channel-configuration-modal:visible')
  if (await modal.count()) { await modal.locator('.ant-modal-footer .ant-btn-primary').click(); return }
  await editButton(page.locator('.notification-channels__footer'), await translate(page, 'messageNotification.common.save')).click()
}

export async function cancelChannelEdit(page) {
  const modal = page.locator('.channel-configuration-modal:visible')
  if (await modal.count()) {
    await editButton(modal, await translate(page, 'messageNotification.common.cancel')).click()
    await modal.waitFor({ state: 'hidden' })
    return
  }
  const save = editButton(page.locator('.notification-channels__footer'), await translate(page, 'messageNotification.common.save'))
  if (await save.isDisabled()) return
  // Main forms only offer Save; discard unsaved drafts through the real route-leave guard.
  const route = await page.evaluate(() => window.__notificationSmoke.router.currentRoute.value.fullPath)
  await page.evaluate(() => { void window.__notificationSmoke.router.push('/records') })
  const dialog = page.locator('.jlc')
  await Promise.race([
    dialog.waitFor(),
    page.waitForFunction(() => window.__notificationSmoke.router.currentRoute.value.path === '/records'),
  ])
  if (await dialog.isVisible()) await editButton(dialog, await translate(page, 'messageNotification.channels.leave')).click()
  await page.waitForFunction(() => window.__notificationSmoke.router.currentRoute.value.path === '/records')
  await page.evaluate(route => window.__notificationSmoke.router.push(route), route)
  await page.locator('.channel-configuration input:not([type=radio])').first().waitFor()
}

export const channelField = (page, label) => page.locator('.inline-edit-field').filter({ has: page.locator('label').filter({ hasText: label }) })
