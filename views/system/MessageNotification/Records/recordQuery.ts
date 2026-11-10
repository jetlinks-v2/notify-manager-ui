import type { InjectionKey } from 'vue'
import type { ConditionFilterTerm } from '@jetlinks-web-core/components/ConditionFilter'
import {
  findNotificationChannel, notificationCapabilities, notificationStates, NotificationRequestError,
  type NotificationHistory, type NotificationNavigation, type NotificationPage,
  type NotificationQuery, type NotifyState,
} from '../shared'

export interface NotificationHistoryAdapter {
  available: boolean
  query: (query: NotificationQuery, signal: AbortSignal) => Promise<NotificationPage<NotificationHistory>>
}

/** A future verified history adapter can be supplied at the owning page boundary. */
export const notificationHistoryAdapterKey: InjectionKey<NotificationHistoryAdapter> = Symbol('notification-history-adapter')

/** History querying stays disabled in this migration; production never substitutes test data or an empty success. */
export const unavailableNotificationHistoryAdapter: NotificationHistoryAdapter = {
  available: notificationCapabilities.history.query,
  query: async () => { throw new NotificationRequestError('unavailable') },
}

/** Only an unambiguous top-level equality is represented by the quick status control. */
export function selectedHistoryState(terms: ConditionFilterTerm[]): NotifyState | undefined {
  const states = terms.filter(term => term.column === 'state' && term.termType === 'eq')
  if (states.length !== 1 || terms.some(term => term.type === 'or')) return undefined
  const value = states[0].value
  return notificationStates.includes(value) ? value as NotifyState : undefined
}

/** Quick status buttons edit the same standard terms as ConditionFilter. */
export function replaceHistoryState(terms: ConditionFilterTerm[], state?: NotifyState): ConditionFilterTerm[] {
  const remaining = terms.filter(term => term.column !== 'state')
  return state ? [...remaining, { column: 'state', termType: 'eq', value: state, type: 'and' }] : remaining
}

/** History uses notifyType/notifierId, unlike config/template type/configId fields. */
export function buildHistoryQuery(
  terms: NotificationQuery['terms'], navigation: NotificationNavigation, pageIndex: number, pageSize: number,
): NotificationQuery {
  const channel = findNotificationChannel(navigation.channel)
  const scope = [
    ...(channel ? [
      { column: 'notifyType', termType: 'eq', value: channel.type },
      { column: 'provider', termType: 'eq', value: channel.provider },
    ] : []),
    ...(navigation.configId ? [{ column: 'notifierId', termType: 'eq', value: navigation.configId }] : []),
    ...(navigation.templateId ? [{ column: 'templateId', termType: 'eq', value: navigation.templateId }] : []),
  ]
  // Group the user expression so OR conditions cannot escape a navigation scope.
  return {
    paging: true, pageIndex, pageSize, sorts: [{ name: 'notifyTime', order: 'desc' }],
    terms: [...(terms?.length ? [{ terms, type: 'and' }] : []), ...scope],
  }
}

/** Route pagination is one-based for people; the adapter contract remains zero-based. */
export function historyPage(value: unknown, fallback: number, max?: number): number {
  const number = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(number) && number > 0 && (!max || number <= max) ? number : fallback
}
