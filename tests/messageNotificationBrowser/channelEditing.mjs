export const editButton = (scope, text) => scope.getByRole('button', { name: new RegExp(`^${text.split('').join('\\s*')}$`) })
const translate = (page, key) => page.evaluate(key => window.__notificationSmoke.i18n.global.t(key), key)

export async function beginChannelEdit(page) {
  if (await page.locator('.ant-dropdown:visible').count()) {
    await page.locator('.notification-channels__heading h2').click()
    await page.locator('.ant-dropdown:visible').waitFor({ state: 'hidden' })
  }
  await editButton(page, await translate(page, 'messageNotification.channels.more')).click()
  await page.locator('.ant-dropdown:visible').waitFor()
  await editButton(page.getByRole('menuitem'), await translate(page, 'messageNotification.common.edit')).click()
  await page.locator('.notification-channels__footer').waitFor()
}

export async function saveChannelDraft(page) {
  await editButton(page.locator('.notification-channels__footer'), await translate(page, 'messageNotification.common.save')).click()
}

export async function cancelChannelEdit(page) {
  await editButton(page.locator('.notification-channels__footer'), await translate(page, 'messageNotification.common.cancel')).click()
  await page.locator('.notification-channels__footer').waitFor({ state: 'hidden' })
}

export const channelField = (page, label) => page.locator('.inline-edit-field').filter({ has: page.locator('label').filter({ hasText: label }) })
