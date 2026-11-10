import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

/** One pending decision protects all channel drafts; browser refresh uses the native unload prompt. */
export function useChannelLeaveGuard(dirty: Ref<boolean>, busy: Ref<boolean>) {
  const leaveOpen = ref(false)
  let resolveDecision: ((decision: boolean) => void) | undefined

  function decideLeave(leave: boolean) {
    leaveOpen.value = false
    resolveDecision?.(leave)
    resolveDecision = undefined
  }

  function beforeUnload(event: BeforeUnloadEvent) {
    if (!dirty.value && !busy.value) return
    event.preventDefault()
    event.returnValue = ''
  }

  onBeforeRouteLeave(() => {
    if (busy.value) return false
    if (!dirty.value) return true
    resolveDecision?.(false)
    leaveOpen.value = true
    return new Promise<boolean>(resolve => { resolveDecision = resolve })
  })
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload)
    resolveDecision?.(false)
  })
  return { leaveOpen, decideLeave }
}
