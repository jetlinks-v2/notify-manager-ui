import type { NoticeTemplateVariable } from '@notice-center-ui/api/notice-center'

export type BuildNoticeTemplateChannelVariablesOptions = {
  channelProvider?: string
  variableDefinitions?: NoticeTemplateVariable[]
  currentVariables?: Record<string, unknown>
}

const channelReceiverVariableMap: Record<string, string> = {
  'notifier-dingTalk': 'userIdList',
  'notifier-weixin': 'toUser',
  'notifier-email': 'sendTo',
  'notifier-voice': 'calledNumber',
  'notifier-sms': 'phoneNumber',
}

const receiverBusinessTypes = new Set(['user', 'org', 'tag'])

// 模板页复用 NoticeRule 的默认接收人策略：从上游 subscriber 关系取当前订阅人。
export const subscriberRelationVariable = {
  source: 'relation',
  relation: {
    objectType: 'user',
    objectSource: {
      source: 'upper',
      upperKey: 'subscriber',
    },
  },
}

const getVariableBusinessType = (variable: NoticeTemplateVariable) =>
  String(variable.expands?.businessType || variable.type || '')

export const buildNoticeTemplateChannelVariables = ({
  channelProvider,
  variableDefinitions = [],
  currentVariables = {},
}: BuildNoticeTemplateChannelVariablesOptions): Record<string, unknown> => {
  const variableIds = new Set<string>()
  const receiverVariable = channelProvider
    ? channelReceiverVariableMap[channelProvider]
    : undefined

  if (receiverVariable) {
    variableIds.add(receiverVariable)
  }

  variableDefinitions.forEach((variable) => {
    if (variable?.id && receiverBusinessTypes.has(getVariableBusinessType(variable))) {
      variableIds.add(variable.id)
    }
  })

  const defaults = Array.from(variableIds).reduce<Record<string, unknown>>((result, id) => {
    result[id] = subscriberRelationVariable
    return result
  }, {})

  return {
    ...defaults,
    ...currentVariables,
  }
}
