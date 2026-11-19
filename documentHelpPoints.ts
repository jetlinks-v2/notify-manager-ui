import i18n from '@jetlinks-web-core/locales'
import { registerDocumentHelpPoints } from '@jetlinks-web-core/utils/documentHelpRegistry'

export function registerNotificationHelpPoints() {
  registerDocumentHelpPoints([
    ['system/MessageNotification/Channels', 'channel.testParameters', 'testParameters', 'channels', 'channelTest'],
    ['system/MessageNotification/Templates', 'template.configuration', 'configuration', 'templates', 'templateEditor'],
    ['system/MessageNotification/Templates', 'template.variables', 'variables', 'templates', 'templateEditor'],
    ['system/MessageNotification/Records', 'record.state', 'recordState', 'records', 'recordDetails'],
  ].map(([code, key, name, page, location]) => ({
    code, key,
    name: () => i18n.global.t(`NotifyDocumentHelp.${name}`),
    page: () => i18n.global.t(`NotifyDocumentHelp.${page}`),
    location: () => i18n.global.t(`NotifyDocumentHelp.${location}`),
  })))
}
