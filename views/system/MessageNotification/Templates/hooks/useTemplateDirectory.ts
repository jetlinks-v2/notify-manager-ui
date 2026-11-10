import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { notificationEnumText, type NotificationTemplate, type NotificationLoadState } from '../../shared'

interface DirectoryProps { templates: NotificationTemplate[]; state: NotificationLoadState }
interface DirectoryEvents { (event: 'select', id: string): void; (event: 'reload'): void }

export function useTemplateDirectory(props: DirectoryProps, emit: DirectoryEvents) {
  const { t } = useI18n()
  const search = ref('')
  const failure = computed(() => ['unavailable', 'forbidden', 'error'].includes(props.state))
  const visibleTemplates = computed(() => props.templates
    .filter(item => `${item.name} ${item.id}`.toLowerCase().includes(search.value.toLowerCase()))
    .map(item => ({ id: item.id, name: item.name, typeText: notificationEnumText(item.type), providerText: notificationEnumText(item.provider) })))
  function select(info: { key: string | number }) { emit('select', String(info.key)) }
  function reload() { emit('reload') }

  return { t, search, failure, visibleTemplates, select, reload }
}
