import type { NotificationObject, NotificationTemplatePayload, NotifierConfig } from '../../shared'
import { notificationEnumValue } from '../../shared'
import { readTestSettings, testSettingsIssues, testText } from './channelTestConfig'

export type ChannelTestRecipientKind = 'email' | 'phone' | 'member' | 'openid' | 'group' | 'endpoint'
interface TrialInput { config: NotifierConfig; recipient: string; message: string; title: string }
interface TrialPayload { template: NotificationObject; context?: NotificationObject; variableDefinitions?: NotificationTemplatePayload['variableDefinitions'] }
interface ChannelTestAdapter {
  recipient: ChannelTestRecipientKind
  providerTemplate?: boolean
  missing: (configuration: NotificationObject) => string[]
  build: (input: TrialInput) => TrialPayload
}
const requireAgent = (configuration: NotificationObject) => testText(configuration.agentId) ? [] : ['agentId']
const ready = () => []

/** Vendor template variables are explicit samples; they never include an inherited recipient or routing override. */
function vendorPayload(input: TrialInput, template: NotificationObject): TrialPayload {
  const settings = readTestSettings(input.config.configuration.testTemplate)
  const parameters = settings.parameters || []
  return {
    template,
    context: Object.fromEntries(parameters.map(row => [row.name.trim(), row.value])),
    variableDefinitions: parameters.map(row => ({ id: row.name.trim(), name: row.name.trim(), type: 'string', required: true })),
  }
}

/** Only verified providers participate; future extensions cannot silently become email or webhook trials. */
export const channelTestAdapters: Readonly<Record<string, ChannelTestAdapter>> = {
  'email:embedded': { recipient: 'email', missing: ready, build: input => ({ template: { subject: input.title, text: input.message, sendTo: [input.recipient] } }) },
  'dingTalk:dingTalkMessage': { recipient: 'member', missing: requireAgent, build: input => ({ template: { agentId: testText(input.config.configuration.agentId), message: input.message, userIdList: input.recipient, toAllUser: false } }) },
  'weixin:corpMessage': { recipient: 'member', missing: requireAgent, build: input => ({ template: { agentId: testText(input.config.configuration.agentId), message: input.message, toUser: input.recipient } }) },
  'dingTalk:dingTalkRobotWebHook': { recipient: 'group', missing: ready, build: input => ({ template: { messageType: 'text', text: { content: input.message }, at: { atAll: false } } }) },
  'webhook:http': { recipient: 'endpoint', missing: ready, build: input => ({ template: { method: 'POST', url: '', contextAsBody: false, body: JSON.stringify({ message: input.message }) } }) },
  'sms:aliyunSms': {
    recipient: 'phone', providerTemplate: true, missing: config => testSettingsIssues('sms:aliyunSms', config.testTemplate, true),
    build: input => { const settings = readTestSettings(input.config.configuration.testTemplate); return vendorPayload(input, { signName: testText(settings.signName), code: testText(settings.code), phoneNumber: input.recipient }) },
  },
}

export const configChannelId = (config: NotifierConfig) => `${notificationEnumValue(config.type)}:${notificationEnumValue(config.provider)}`
export const fixedTestTarget = (kind?: ChannelTestRecipientKind) => kind === 'group' || kind === 'endpoint'

/** The test targets exactly one receiver. Native member IDs and OpenIDs cannot expand into a broadcast. */
export function testRecipientIssue(kind: ChannelTestRecipientKind | undefined, value: string): string {
  if (fixedTestTarget(kind)) return ''
  const recipient = value.trim()
  if (!recipient) return 'recipientRequired'
  if (kind === 'email') return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient) ? '' : 'emailInvalid'
  if (kind === 'phone') return /^\+?[0-9]{6,15}$/.test(recipient) ? '' : 'phoneInvalid'
  const memberPattern = kind === 'openid' ? /^[A-Za-z0-9_-]{1,128}$/ : /^[A-Za-z0-9_.@-]{1,128}$/
  return kind && memberPattern.test(recipient) && !['@all', 'all'].includes(recipient.toLowerCase()) ? '' : 'memberInvalid'
}

/** Build a fresh inline template using saved configuration only; no caller-owned objects are mutated. */
export function buildChannelTest(input: TrialInput): { template: NotificationTemplatePayload; context: NotificationObject } {
  const adapter = channelTestAdapters[configChannelId(input.config)]
  if (!adapter || adapter.missing(input.config.configuration).length || testRecipientIssue(adapter.recipient, input.recipient)) throw new Error('invalid-channel-test')
  const result = adapter.build({ ...input, recipient: input.recipient.trim() })
  return {
    template: { name: input.title, configId: input.config.id, type: notificationEnumValue(input.config.type), provider: notificationEnumValue(input.config.provider), template: result.template, variableDefinitions: result.variableDefinitions },
    context: result.context || {},
  }
}
