import { classifyNotificationFailure, NotificationRequestError } from './messageNotificationState'
import type { NotificationHistoryCounts } from './messageNotificationTypes'

/** The finite aggregation Flux is returned as SSE. Decode complete data events, including stream errors. */
export function readHistoryCounts(response: unknown): NotificationHistoryCounts {
  if (typeof response !== 'string') throw new NotificationRequestError(classifyNotificationFailure(response), response)
  const counts: NotificationHistoryCounts = { all: 0, success: 0, error: 0, retrying: 0, cancel: 0 }
  const seen = new Set<string>()
  for (const event of response.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n\n')) {
    const lines = event.split('\n')
    const failed = lines.some(line => /^event:\s*error\s*$/.test(line))
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n')
    // Empty successful Flux responses and SSE comments contain no data records.
    if (!data) {
      if (failed) throw new NotificationRequestError('error')
      if (lines.some(line => line && !/^(?:data:|event:|id:|retry:|:)/.test(line))) throw new NotificationRequestError('error')
      continue
    }
    let row: { state?: unknown; total?: unknown; status?: unknown }
    try { row = JSON.parse(data) } catch { throw new NotificationRequestError('error') }
    if (failed || row?.status && row.status !== 200) {
      throw new NotificationRequestError(classifyNotificationFailure(row), row)
    }
    const state = row?.state
    const total = typeof row?.total === 'string' && row.total.trim() ? Number(row.total) : row?.total
    if (typeof state !== 'string' || !state || seen.has(state) || typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
      throw new NotificationRequestError('error')
    }
    seen.add(state)
    counts.all += total
    if (!Number.isSafeInteger(counts.all)) throw new NotificationRequestError('error')
    if (state !== 'all' && Object.prototype.hasOwnProperty.call(counts, state)) counts[state as keyof NotificationHistoryCounts] = total
  }
  return counts
}
