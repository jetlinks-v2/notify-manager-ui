import type { Rule } from 'ant-design-vue/es/form'
import { phoneRegEx } from '@jetlinks-web-core/utils/validate'
import type { NoticeTemplateFieldSchema } from './noticeTemplateFormModel'

type Translate = (key: string, args?: unknown[]) => string

export const useTemplateFieldRules = (t: Translate) => {
  const getFieldRules = (field: NoticeTemplateFieldSchema): Rule[] => {
    const label = t(field.labelKey)
    const rules: Rule[] = []

    if (field.required) {
      rules.push({
        required: true,
        message: t('NoticeCenter.template.validation.required', [label]),
        trigger: 'blur',
      })
    }

    if (field.maxLength) {
      rules.push({
        max: field.maxLength,
        message: t('NoticeCenter.template.validation.maxLength', [label, field.maxLength]),
        trigger: 'change',
      })
    }

    if (field.validator === 'phone') {
      rules.push({
        validator: (_rule, value) => {
          if (!value || phoneRegEx(String(value))) {
            return Promise.resolve()
          }
          return Promise.reject(t('NoticeCenter.template.validation.phoneInvalid'))
        },
        trigger: 'blur',
      })
    }

    return rules
  }

  return {
    getFieldRules,
  }
}
