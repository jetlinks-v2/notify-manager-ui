import type {
  NoticeCorpDepartment,
  NoticeCorpTag,
  NoticeCorpUser,
  NoticeSmsSignOption,
  NoticeSmsTemplateOption,
} from '@notify-manager-ui/api/notice-center'
import type { NoticeTemplateFieldOption } from './noticeTemplateFormModel'

type TreeOption = NoticeTemplateFieldOption & {
  children?: TreeOption[]
}

export const asList = <T>(response: any): T[] => {
  const result = response?.result
  if (Array.isArray(result)) return result as T[]
  if (Array.isArray(result?.data)) return result.data as T[]
  return []
}

export const asText = (value: unknown) =>
  value === undefined || value === null ? '' : String(value)

export const compactOptions = (options: NoticeTemplateFieldOption[]) => {
  const map = new Map<unknown, NoticeTemplateFieldOption>()
  options.forEach(option => {
    if (option.value !== undefined && option.value !== null && option.value !== '') {
      map.set(option.value, option)
    }
  })
  return Array.from(map.values())
}

export const ensureOption = (
  options: NoticeTemplateFieldOption[],
  value: unknown,
  label?: string,
) => {
  if (value === undefined || value === null || value === '') {
    return options
  }
  if (options.some(option => option.value === value)) {
    return options
  }
  return [{ value, label: label || String(value) }, ...options]
}

export const normalizeDepartments = (departments: NoticeCorpDepartment[] = []): TreeOption[] =>
  departments
    .filter(item => item?.id)
    .map(item => ({
      value: item.id,
      label: item.name || item.id,
      children: item.children?.length ? normalizeDepartments(item.children) : undefined,
    }))

export const normalizeWechatUsers = (users: NoticeCorpUser[] = []) =>
  compactOptions(users
    .filter(item => item?.id)
    .map(item => ({
      value: item.id,
      label: item.name ? `${item.name} (${item.id})` : item.id,
      raw: item,
    } as NoticeTemplateFieldOption)))

export const normalizeWechatTags = (tags: NoticeCorpTag[] = []) =>
  compactOptions(tags
    .filter(item => item?.id)
    .map(item => ({
      value: item.id,
      label: item.name || item.id,
    })))

export const normalizeSmsTemplates = (templates: NoticeSmsTemplateOption[] = []) =>
  compactOptions(templates
    .filter(item => item?.templateCode)
    .map(item => ({
      value: item.templateCode,
      label: item.templateName
        ? `${item.templateName} (${item.templateCode})`
        : item.templateCode,
      raw: item,
    } as NoticeTemplateFieldOption)))

export const normalizeSmsSigns = (signs: NoticeSmsSignOption[] = []) =>
  compactOptions(signs
    .filter(item => item?.signName)
    .map(item => ({
      value: item.signName,
      label: item.signName,
    })))
