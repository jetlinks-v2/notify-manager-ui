import { computed, inject, provide, type ComputedRef, type InjectionKey } from 'vue'
import type { NotificationVariable } from '../../shared'
import type { TemplateCustomCaret } from '../hooks/useTemplateEditor'
import { getRecommendedVariables, mergeTemplateVariableDeclarations } from '../../../../notice/template/hooks/noticeTemplateModel'

/** 面板与编辑节点共用名称解析；仅生成展示副本，草稿声明保留原始元数据。 */
export function resolveTemplateVariables(available: NotificationVariable[], declared: NotificationVariable[], provider: string | undefined, t: (key: string) => string, businessMode = false) {
  const availableById = new Map(available.filter(item => item.id).map(item => [item.id, item]))
  const declaredById = new Map(declared.filter(item => item.id).map(item => [item.id, item]))
  const variables = mergeTemplateVariableDeclarations(available, declared, businessMode)
  const recommended = new Map(getRecommendedVariables(provider).map(item => [item.id, item]))
  return variables.map(item => {
    // 历史无前缀字段只借用对应 detail 字段的展示名称，不重写表达式、类型或格式。
    const detailId = item.id.startsWith('detail.') ? item.id : `detail.${item.id}`
    const fallback = availableById.get(item.id) || availableById.get(detailId)
    const nameKey = item.i18nName || recommended.get(item.id)?.i18nName || recommended.get(detailId)?.i18nName
    const translated = nameKey ? t(nameKey) : ''
    const identifiers = [item.id, detailId, detailId.slice(7), nameKey]
    const declaredName = declaredById.get(item.id)?.name
    const customName = declaredName?.trim() && !identifiers.includes(declaredName) ? declaredName : undefined
    const savedName = item.name?.trim() && !identifiers.includes(item.name) ? item.name : undefined
    const fallbackName = fallback?.name?.trim() && !identifiers.includes(fallback.name) ? fallback.name : undefined
    return { ...item, name: customName || (translated && translated !== nameKey ? translated : savedName || fallbackName || item.id) }
  })
}

export interface TemplateVariableEditingContext {
  names: ComputedRef<ReadonlyMap<string, string>>
  identity: ComputedRef<object>
  captureCaret: (caret: TemplateCustomCaret) => void
}
const editingContext: InjectionKey<TemplateVariableEditingContext> = Symbol('template-variable-editing')

/** 变量领域只共享当前编辑器的目录与草稿身份，不创建全局状态。 */
export function provideTemplateVariableEditing(context: TemplateVariableEditingContext) { provide(editingContext, context) }
export function useTemplateVariableEditing() { return inject(editingContext, undefined) }
export function templateVariableNames(variables: () => NotificationVariable[]) {
  return computed<ReadonlyMap<string, string>>(() => new Map(variables().map(item => [item.id, item.name || item.id])))
}
