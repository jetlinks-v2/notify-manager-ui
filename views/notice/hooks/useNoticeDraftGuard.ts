import { onMounted, onScopeDispose } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { Modal } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'

/** 草稿只留在当前编辑器；离开前明确放弃，刷新交给浏览器原生保护。 */
export function useNoticeDraftGuard(dirty: () => boolean, busy: () => boolean = () => false) {
  const { t } = useI18n()
  let pending: Promise<boolean> | undefined
  function confirmDiscard(): Promise<boolean> {
    if (busy()) return Promise.resolve(false)
    if (!dirty()) return Promise.resolve(true)
    if (pending) return pending
    pending = new Promise<boolean>(resolve => {
      Modal.confirm({ title: t('NoticeCenter.draft.title'), content: t('NoticeCenter.draft.description'),
        okText: t('NoticeCenter.draft.discard'), cancelText: t('NoticeCenter.draft.keep'),
        onOk: () => resolve(true), onCancel: () => resolve(false) })
    }).finally(() => { pending = undefined })
    return pending
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (!dirty() && !busy()) return
    event.preventDefault()
    event.returnValue = ''
  }
  onBeforeRouteLeave(confirmDiscard)
  onBeforeRouteUpdate((to, from) => {
    if (to.query.topicProvider !== from.query.topicProvider || to.query.channelProvider !== from.query.channelProvider
      || to.query.aiAlarmType !== from.query.aiAlarmType) return confirmDiscard()
    return true
  })
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onScopeDispose(() => window.removeEventListener('beforeunload', beforeUnload))
  return { confirmDiscard }
}
