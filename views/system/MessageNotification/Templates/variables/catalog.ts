import { computed, inject, provide, type ComputedRef, type InjectionKey } from 'vue'
import type { NotificationVariable } from '../../shared'
import type { TemplateCustomCaret } from '../hooks/useTemplateEditor'
import { getRecommendedVariables } from '../../../../notice/template/hooks/noticeTemplateModel'

/** 面板与编辑节点共用名称解析；仅生成展示副本，草稿声明保留原始元数据。 */
export function resolveTemplateVariables(available: NotificationVariable[], declared: NotificationVariable[], provider: string | undefined, t: (key: string) => string) {
  const variables = new Map(available.filter(item => item.id).map(item => [item.id, item]))
  for (const item of declared) {
    if (!item.id) continue
    const choice = variables.get(item.id)
    variables.set(item.id, { ...item, name: item.name || choice?.name, i18nName: item.i18nName || choice?.i18nName })
  }
  const recommended = new Map(getRecommendedVariables(provider).map(item => [item.id, item]))
  return [...variables.values()].map(item => {
    const nameKey = item.i18nName || recommended.get(item.id)?.i18nName
    const translated = nameKey ? t(nameKey) : ''
    return { ...item, name: translated && translated !== nameKey ? translated : item.name || item.id }
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
