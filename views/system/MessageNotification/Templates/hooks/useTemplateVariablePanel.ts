import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoticeChannelConfig } from '../../../../../api/notice-center'
import type { NotificationVariable } from '../../shared'
import type { TemplateDraft } from '../model'
import { useTemplatePreview } from './useTemplatePreview'

/** Available values are display-only; inserting a variable remains the editor's responsibility. */
export function useTemplateVariablePanel(props: { draft: TemplateDraft; business?: NoticeChannelConfig; variables: NotificationVariable[] }) {
  const { t } = useI18n()
  const preview = useTemplatePreview(props)
  const groups = computed(() => {
    const variables = new Map(props.variables.filter(item => item.id).map(item => [item.id, item]))
    props.draft.variables.forEach(item => { if (item.id) variables.set(item.id, item) })
    const rows = [...variables.values()].map(item => ({ ...item,
      sample: preview.examples.value[item.id] || String(item.expands?.mockValue ?? item.defaultValue ?? '—'),
    }))
    return [
      { key: 'common', title: t('messageNotification.templates.visual.commonVariables'), rows: rows.filter(item => !item.id.startsWith('detail.')) },
      { key: 'business', title: t('messageNotification.templates.visual.businessVariables'), rows: rows.filter(item => item.id.startsWith('detail.')) },
    ].filter(group => group.rows.length)
  })
  return { t, groups }
}
