import { nextTick, watch, type Ref } from 'vue'
import type { ChannelHelpModel } from './channelHelp'

export interface ChannelHelpProps {
  model: ChannelHelpModel
  activeSection?: string
  focusVersion: number
}

/** Scroll only this document on an explicit focus request; typing and manual reading never reposition it. */
export function useChannelHelpNavigation(container: Ref<HTMLElement | undefined>, props: ChannelHelpProps) {
  watch([container, () => props.model.channelId, () => props.activeSection, () => props.focusVersion], async (_, __, onCleanup) => {
    let cancelled = false
    onCleanup(() => { cancelled = true })
    await nextTick()
    const element = container.value
    if (cancelled || !element || typeof window === 'undefined' || window.matchMedia('(max-width: 64rem)').matches) return
    if (!props.activeSection) return
    const section = Array.from(element.querySelectorAll<HTMLElement>('[data-help-section]'))
      .find(item => item.dataset.helpSection === props.activeSection)
    if (!section) return
    const top = section.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop
    element.scrollTo({ top: Math.max(0, top - 16), behavior: 'auto' })
  }, { immediate: true, flush: 'post' })
}
