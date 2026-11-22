import { extractVariableIds, getByPath } from '../../../../notice/template/hooks/noticeTemplateFormModel'
import { isReceiverVariable } from '../../../../notice/template/hooks/noticeTemplateChannelVariables'
import { defaultTemplateDateFormat, explicitTemplateVariableFormat } from '../../../../notice/template/hooks/noticeAlarmPreview'
import { templateVariableType } from '../../../../notice/template/hooks/noticeTemplateModel'
import type { NotificationObject, NotificationVariable } from '../../shared'
import { hasKnownTemplatePresentation, readPresentationTemplate, resolveProviderTemplateForm, templateContentFields } from '../hooks/templatePresentation'
import type { TemplateDraft } from '../model'

export const variableTypeFormats = { string: '%s', date: defaultTemplateDateFormat, double: '%.2f' } as const
export type TemplateVariableType = keyof typeof variableTypeFormats
export type UsedTemplateVariable = NotificationVariable & { name: string; type: string }

export function isTemplateVariableType(value: unknown): value is TemplateVariableType {
  return typeof value === 'string' && Object.hasOwn(variableTypeFormats, value)
}

/** 日期统一默认到秒，缺省的存量数值保留服务端原始精度。 */
export function templateVariableFormat(variable: NotificationVariable, stored = false): string | undefined {
  const format = explicitTemplateVariableFormat(variable)
  if (format !== undefined) return format
  if (stored && variable.type === 'double') return '%s'
  const type = variable.type || 'string'
  return isTemplateVariableType(type) ? variableTypeFormats[type] : undefined
}

/** 邮件字段独立于 JSON 草稿。其他内置渠道按当前表单模式提取，扩展渠道直接读取模板 JSON。 */
function referencedIds(draft: TemplateDraft): string[] {
  let source: string
  if (!hasKnownTemplatePresentation(draft)) {
    source = draft.templateJson
  } else if (draft.type === 'email') {
    source = JSON.stringify([draft.subject, draft.text, draft.attachments])
  } else {
    const parsed = readPresentationTemplate(draft)
    if (!parsed.valid) return extractVariableIds(draft.templateJson)
    const { type, provider, payload } = resolveProviderTemplateForm(draft, parsed.template)
    const values = templateContentFields({ type, provider }, payload).map(field => getByPath(payload.template, field.path))
    source = JSON.stringify(values)
  }
  return extractVariableIds(source)
}

export function usedTemplateVariables(draft: TemplateDraft, available: NotificationVariable[]): UsedTemplateVariable[] {
  const saved = new Map(draft.variables.map(item => [item.id, item]))
  const catalog = new Map(available.map(item => [item.id, item]))
  return referencedIds(draft).map(id => {
    const declaration = saved.get(id)
    const choice = catalog.get(id)
    const source = declaration ?? choice
    const type = templateVariableType(declaration, choice) || 'string'
    const variable = { ...source, id, name: declaration?.name || choice?.name || id, type }
    const format = templateVariableFormat(variable, !!declaration)
    if (format !== undefined) variable.format = format
    // 业务目录的默认值可用作预览示例，只有模板自己保存的默认值可以随模板提交。
    if (!declaration) delete variable.defaultValue
    return variable
  })
}

/** 只清理已移除的内容引用；存量独立声明、收件映射及其扩展字段仍属于投递契约。 */
export function variablesForTemplateSave(draft: TemplateDraft, baseline: TemplateDraft, available: NotificationVariable[], content: NotificationObject) {
  const used = usedTemplateVariables(draft, available)
  const previouslyUsed = new Set(referencedIds(baseline))
  // 服务商扩展或存量收件字段仍可能使用同一 ID，删除最后一处可见引用时也须保留这些声明。
  const retained = new Set(extractVariableIds(JSON.stringify(content)))
  for (const variable of baseline.variables) {
    if (!previouslyUsed.has(variable.id) || isReceiverVariable(variable)) retained.add(variable.id)
  }
  const byId = new Map(used.map(item => [item.id, item]))
  const result: NotificationVariable[] = []
  for (const variable of draft.variables) {
    const current = byId.get(variable.id)
    if (current) {
      result.push(current)
      byId.delete(variable.id)
    } else if (retained.has(variable.id)) result.push(variable)
  }
  return [...result, ...byId.values()]
}
