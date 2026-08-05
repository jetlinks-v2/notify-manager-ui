import type {
  NoticeCorpUser,
  NoticeSmsTemplateOption,
} from '@notice-center-ui/api/notice-center'
import type {
  NoticeTemplateData,
  NoticeTemplateEditorPayload,
  NoticeTemplateFieldOption,
  NoticeTemplateFieldSchema,
  NoticeTemplateFormContext,
} from './noticeTemplateFormModel'
import { getByPath, setByPath } from './noticeTemplateFormModel'
import { asText, ensureOption } from './noticeTemplateRemoteOptions'

export type TemplateRemoteStates = {
  smsTemplates: { options: NoticeTemplateFieldOption[]; loading: boolean }
  smsSigns: { options: NoticeTemplateFieldOption[]; loading: boolean }
  wechatDepartments: { options: NoticeTemplateFieldOption[]; loading: boolean }
  wechatUsers: { options: NoticeTemplateFieldOption[]; loading: boolean }
  wechatTags: { options: NoticeTemplateFieldOption[]; loading: boolean }
}

export const createTemplateRemoteFieldResolver = (
  context: NoticeTemplateFormContext,
  form: NoticeTemplateEditorPayload,
  states: TemplateRemoteStates,
  getConfigId: () => string,
  getAgentId: () => string,
  getSelectedDepartmentId: () => string,
  getSmsTemplate: (code: unknown) => NoticeSmsTemplateOption | undefined,
) => {
  const applySmsTemplateMessage = (code: unknown) => {
    const content = getSmsTemplate(code)?.templateContent
    if (content !== undefined && content !== null) {
      setByPath(form.template, ['message'], content)
    }
  }

  const onFieldChange = (field: NoticeTemplateFieldSchema, value: unknown) => {
    if (field.key === 'code' && context.type === 'sms') {
      applySmsTemplateMessage(value)
    }
    if (field.key === 'toParty' && context.type === 'weixin') {
      setByPath(form.template, ['toUser'], undefined)
      setByPath(form.template, ['toUserName'], undefined)
    }
    if (field.key === 'toUser' && context.type === 'weixin') {
      const option = states.wechatUsers.options.find(item => item.value === value)
      const raw = option?.raw as NoticeCorpUser | undefined
      setByPath(form.template, ['toUserName'], raw?.name || option?.label || undefined)
    }
  }

  const resolveSmsField = (
    field: NoticeTemplateFieldSchema,
    currentValue: unknown,
  ): NoticeTemplateFieldSchema | undefined => {
    const configId = getConfigId()
    if (field.key === 'code') {
      return {
        ...field,
        kind: 'select',
        options: ensureOption(states.smsTemplates.options, currentValue),
        loading: states.smsTemplates.loading,
        disabled: field.disabled || !configId,
        placeholderKey: configId
          ? 'NoticeCenter.template.placeholder.smsTemplate'
          : 'NoticeCenter.template.placeholder.boundConfigRequired',
      }
    }
    if (field.key === 'signName') {
      return {
        ...field,
        kind: 'select',
        options: ensureOption(states.smsSigns.options, currentValue),
        loading: states.smsSigns.loading,
        disabled: field.disabled || !configId,
        placeholderKey: configId
          ? 'NoticeCenter.template.placeholder.signName'
          : 'NoticeCenter.template.placeholder.boundConfigRequired',
      }
    }
    if (field.key === 'message') {
      return {
        ...field,
        disabled: true,
        placeholderKey: asText(form.template.code)
          ? 'NoticeCenter.template.placeholder.content'
          : 'NoticeCenter.template.placeholder.smsContentLocked',
      }
    }
    return undefined
  }

  const resolveWeixinField = (
    field: NoticeTemplateFieldSchema,
    currentValue: unknown,
    template: NoticeTemplateData,
  ): NoticeTemplateFieldSchema | undefined => {
    const disabledByAgent = !getConfigId() || !getAgentId()
    if (field.key === 'toParty') {
      return {
        ...field,
        kind: 'treeSelect',
        options: ensureOption(states.wechatDepartments.options, currentValue),
        loading: states.wechatDepartments.loading,
        disabled: field.disabled || disabledByAgent,
        placeholderKey: disabledByAgent
          ? 'NoticeCenter.template.placeholder.agentRequired'
          : 'NoticeCenter.template.placeholder.toPartySelect',
      }
    }
    if (field.key === 'toUser') {
      return {
        ...field,
        kind: 'select',
        options: ensureOption(states.wechatUsers.options, currentValue, asText(template.toUserName)),
        loading: states.wechatUsers.loading,
        disabled: field.disabled || disabledByAgent || !getSelectedDepartmentId(),
        placeholderKey: disabledByAgent
          ? 'NoticeCenter.template.placeholder.agentRequired'
          : 'NoticeCenter.template.placeholder.toUserSelect',
      }
    }
    if (field.key === 'toUserName') {
      return { ...field, hidden: true }
    }
    if (field.key === 'toTag') {
      return {
        ...field,
        kind: 'select',
        options: ensureOption(states.wechatTags.options, currentValue),
        loading: states.wechatTags.loading,
        disabled: field.disabled || disabledByAgent,
        placeholderKey: disabledByAgent
          ? 'NoticeCenter.template.placeholder.agentRequired'
          : 'NoticeCenter.template.placeholder.toTagSelect',
      }
    }
    return undefined
  }

  const resolveField = (field: NoticeTemplateFieldSchema): NoticeTemplateFieldSchema => {
    const template = form.template
    const currentValue = getByPath(template, field.path)

    if (context.type === 'sms') {
      return resolveSmsField(field, currentValue) || field
    }
    if (context.type === 'weixin' && context.provider === 'corpMessage') {
      return resolveWeixinField(field, currentValue, template) || field
    }
    return field
  }

  return {
    resolveField,
    onFieldChange,
  }
}
