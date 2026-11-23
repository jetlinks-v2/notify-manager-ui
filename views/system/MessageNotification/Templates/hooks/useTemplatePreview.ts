import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import type { NotificationChannel, NotificationObject, NotificationVariable, NotifierConfig } from '../../shared'
import { isEmailDraft, previewTemplateText, type TemplateDraft } from '../model'
import { prototypePreviewExamples } from '../definition/templateDefaults'
import { builtinEmailTemplates } from '../../shared/builtinEmailTemplates'
import { formatPreviewValue } from '../../../../notice/template/hooks/noticeAlarmPreview'
import { hasKnownTemplatePresentation, matchesTemplateConfiguration, readPresentationTemplate, safePreviewStructure } from './templatePresentation'
import { templateTextBlocks } from './useTemplateMessageText'
import { getRecommendedVariables, mergeTemplateVariableDeclarations } from '../../../../notice/template/hooks/noticeTemplateModel'
import { usedTemplateVariables } from '../variables/definitions'

export type TemplatePreviewKind = 'email' | 'dingTalk' | 'robot' | 'wechat' | 'voice' | 'sms' | 'webhook' | 'generic'
interface PreviewProps {
  draft: TemplateDraft
  business?: NoticeChannelConfig
  channel?: NotificationChannel
  config?: NotifierConfig
  availableVariables?: NotificationVariable[]
}

const asText = (value: unknown): string => ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : ''
const asObject = (value: unknown): NotificationObject => value && typeof value === 'object' && !Array.isArray(value) ? value as NotificationObject : {}
const firstText = (...values: unknown[]): string => values.map(asText).find(Boolean) ?? ''

/** Format only a defined sample, preserving unknown tokens and never changing persisted variables. */
export function templatePreviewExample(value: unknown, variable?: NotificationVariable): string {
  if (variable?.type === 'date' && typeof value === 'string' && !Number.isFinite(Number(value))) {
    const timestamp = Date.parse(value)
    if (!Number.isFinite(timestamp)) return value
    return formatPreviewValue(timestamp, variable)
  }
  return formatPreviewValue(value, variable)
}

/** Build a sample context for contextAsBody without inserting example data into the draft. */
function contextPreview(examples: Record<string, string>): NotificationObject {
  const result: NotificationObject = {}
  const detail: NotificationObject = {}
  for (const [key, value] of Object.entries(examples)) {
    if (key.startsWith('detail.')) detail[key.slice(7)] = value
    else result[key] = value
  }
  if (Object.keys(detail).length) result.detail = detail
  return result
}

/** Read the current draft on every edit; a provider's schema never implies another provider's body. */
export function useTemplatePreview(props: PreviewProps) {
  const { t } = useI18n()
  const parsed = computed(() => readPresentationTemplate(props.draft))
  const template = computed(() => parsed.value.template)
  const emailDraft = computed(() => isEmailDraft(props.draft))
  const exampleValues = computed(() => {
    const builtin = props.business ? undefined : builtinEmailTemplates(t).find(item => item.key === props.draft.builtinKey)
    return builtin ? builtin.examples : prototypePreviewExamples(props.business)
  })
  const recommended = computed(() => props.business ? getRecommendedVariables(
    props.business.provider === 'alarm-device' ? 'alarm-device-relieve' : props.business.provider, t,
  ) : [])
  const detailIds = computed(() => new Set(recommended.value.filter(variable => variable.id.startsWith('detail.')).map(variable => variable.id.slice(7))))
  /** 面板和正文复用同一示例解析；业务详情必须使用真实的 detail 前缀。 */
  function variableExample(variable: NotificationVariable): string | undefined {
    // 已保存的错误表达式保留供用户修正，但不编造示例；告警发生时也没有解除时间。
    if (detailIds.value.has(variable.id)
      || props.business?.provider === 'alarm-device' && variable.id === 'detail.relieveTime') return ''
    const values = exampleValues.value
    const fallback = recommended.value.filter(item => item.id === variable.id)
    const [definition] = mergeTemplateVariableDeclarations(fallback, [variable])
    const sampleTime = definition?.type === 'date' ? values.notifyTime ?? values['detail.alarmTime'] : undefined
    const source = [variable.expands?.mockValue, values[variable.id],
      variable.id.startsWith('detail.') ? undefined : values[`detail.${variable.id}`], variable.defaultValue, sampleTime]
      .find(value => value != null && (typeof value !== 'string' || value.trim() !== ''))
    return source === undefined ? undefined : templatePreviewExample(source, definition)
  }
  const examples = computed(() => {
    const values = { ...exampleValues.value }
    const available = props.availableVariables ?? recommended.value
    const variables = new Map(props.draft.variables.map(variable => [variable.id, variable]))
    const usedDates = new Set(usedTemplateVariables(props.draft, available)
      .filter(variable => variable.type === 'date').map(variable => variable.id))
    // 直接输入的时间占位符也使用目录示例，进入预览时保持草稿声明不变。
    for (const variable of mergeTemplateVariableDeclarations(available, props.draft.variables)) {
      if (usedDates.has(variable.id)) variables.set(variable.id, variable)
    }
    for (const variable of variables.values()) {
      values[variable.id] = variableExample(variable)
        ?? t('messageNotification.templates.sample', { name: variable.name || variable.id })
    }
    return values
  })
  const render = (value: unknown) => previewTemplateText(asText(value), examples.value)
  /** Resolve JSON leaves before serialization, matching the backend's quote-safe body substitution. */
  function renderStructure(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(renderStructure)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [render(key), renderStructure(item)]))
    return typeof value === 'string' ? render(value) : value
  }
  const kind = computed<TemplatePreviewKind>(() => {
    if (!hasKnownTemplatePresentation(props.draft)) return 'generic'
    if (emailDraft.value) return 'email'
    if (props.draft.type === 'dingTalk') return props.draft.provider === 'dingTalkRobotWebHook' ? 'robot' : 'dingTalk'
    const kinds: Record<string, TemplatePreviewKind> = { weixin: 'wechat', voice: 'voice', sms: 'sms', webhook: 'webhook' }
    return kinds[props.draft.type] ?? 'generic'
  })
  const markdown = computed(() => kind.value === 'robot' && template.value.messageType === 'markdown')
  const robotContent = computed(() => asObject(template.value[asText(template.value.messageType) || 'markdown']))
  const subject = computed(() => render(emailDraft.value ? props.draft.subject : kind.value === 'robot'
    ? firstText(robotContent.value.title, template.value.title) : firstText(template.value.title, template.value.subject)))
  const text = computed(() => render(emailDraft.value ? props.draft.text : kind.value === 'robot'
    ? firstText(robotContent.value.content, robotContent.value.text, template.value.message)
    : firstText(template.value.message, template.value.ttsmessage, template.value.content, template.value.text)))
  // The rendered body keeps its heading; suppress only an identical first-line Markdown title outside it.
  const showInstantSubject = computed(() => {
    if (!subject.value) return false
    if (!markdown.value) return true
    const first = templateTextBlocks(text.value, true)[0]
    return !first || first.tag === 'div' || first.segments.map(segment => segment.text).join('').trim() !== subject.value.trim()
  })
  const providerContent = computed(() => parsed.value.valid
    ? JSON.stringify(renderStructure(safePreviewStructure(template.value)), null, 2) : props.draft.templateJson)
  const selectedConfig = computed(() => props.config?.id === props.draft.configId && matchesTemplateConfiguration(props.draft, props.config) ? props.config : undefined)
  // Only the explicit sender field is used; credentials and connection URLs never enter the preview.
  const sender = computed(() => render(selectedConfig.value?.configuration.sender))
  const channelName = computed(() => props.channel?.name || t(props.channel?.labelKey || ({
    email: 'messageNotification.channel.email', dingTalk: 'messageNotification.channel.dingTalkCorp',
    robot: 'messageNotification.channel.dingTalkRobot', wechat: 'messageNotification.channel.wechatCorp',
    voice: 'messageNotification.channel.voice', sms: 'messageNotification.channel.sms', webhook: 'messageNotification.channel.webhook',
  } as Record<string, string>)[kind.value] || 'messageNotification.templates.presentation.channelMessage'))
  const recipients = computed(() => emailDraft.value ? props.draft.sendTo.map(render).join(', ') : render(firstText(
    template.value.toUserName, template.value.toUser, template.value.userIdList, template.value.touser,
    template.value.phoneNumber, template.value.calledNumber, template.value.CalledNumber)))
  const attachmentNames = computed(() => props.draft.attachments.map(item => render(item.name)).join(', '))
  const signature = computed(() => render(template.value.signName))
  const code = computed(() => render(firstText(template.value.code, template.value.ttsCode, template.value.templateCode, template.value.wxTemplateId)))
  const caller = computed(() => render(template.value.calledShowNumbers))
  const messageUrl = computed(() => render(robotContent.value.messageUrl))
  const contextAsBody = computed(() => template.value.contextAsBody === true)
  const webhookMethod = computed(() => asText(template.value.method) || 'POST')
  const webhookBody = computed(() => {
    if (contextAsBody.value) return JSON.stringify(safePreviewStructure(contextPreview(examples.value)), null, 2)
    const body = template.value.body
    if (typeof body === 'object' && body !== null) return JSON.stringify(renderStructure(safePreviewStructure(body)), null, 2)
    try { return JSON.stringify(renderStructure(safePreviewStructure(JSON.parse(asText(body)))), null, 2) }
    catch { return render(body) }
  })
  const summary = computed(() => {
    const safe = safePreviewStructure(template.value) as NotificationObject
    return Object.entries(safe).map(([key, value]) => ({ key, value: render(typeof value === 'object' && value !== null ? JSON.stringify(value) : value) }))
  })
  const displayTime = computed(() => examples.value.notifyTime || '')
  const applicationName = computed(() => selectedConfig.value?.name || channelName.value)
  const webhookUrl = computed(() => {
    const value = selectedConfig.value?.configuration.url
    if (typeof value !== 'string') return ''
    try { const url = new URL(value); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.toString() }
    catch { return '' }
  })
  const playTimes = computed(() => Number(template.value.playTimes) || 1)
  return { t, kind, parsed, emailDraft, subject, showInstantSubject, text, providerContent, attachmentNames, recipients, sender, displayTime, applicationName, webhookUrl, playTimes, examples, variableExample,
    channelName, markdown, signature, code, caller, messageUrl, webhookBody, webhookMethod, contextAsBody, summary }
}
