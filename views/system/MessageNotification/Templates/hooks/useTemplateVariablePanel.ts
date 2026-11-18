import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import type { NotificationVariable } from '../../shared'
import type { TemplateDraft } from '../model'
import { resolveTemplateVariables } from '../variables/catalog'
import { useTemplatePreview } from './useTemplatePreview'

/** Available values are display-only; inserting a variable remains the editor's responsibility. */
export function useTemplateVariablePanel(props: { draft: TemplateDraft; business?: NoticeChannelConfig; variables: NotificationVariable[] }) {
  const { t } = useI18n()
  const preview = useTemplatePreview(props)
  const groups = computed(() => {
    const rows = resolveTemplateVariables(props.variables, props.draft.variables, props.business?.provider, t).map(item => {
      return { ...item,
        sample: preview.variableExample(item) ?? '—',
      }
    })
    return [
      { key: 'common', title: t('messageNotification.templates.visual.commonVariables'), rows: rows.filter(item => !item.id.startsWith('detail.')) },
      { key: 'business', title: t('messageNotification.templates.visual.businessVariables'), rows: rows.filter(item => item.id.startsWith('detail.')) },
    ].filter(group => group.rows.length)
  })
  return { t, groups }
}
