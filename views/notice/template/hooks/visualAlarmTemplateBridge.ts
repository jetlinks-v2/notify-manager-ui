/** Public same-origin navigation contract for returning an AI alarm template save to its originating tab. */
export interface VisualAlarmTemplateContext {
  alarmType: 'aiSecurityAlarm' | 'aiComplianceAlarm'
  session: string
}

export function parseVisualAlarmTemplateContext(query: Record<string, unknown>): VisualAlarmTemplateContext | undefined {
  const type = query.aiAlarmType
  const session = query.visualAlarmSession
  if ((type !== 'aiSecurityAlarm' && type !== 'aiComplianceAlarm') || typeof session !== 'string' || !/^[0-9a-f]{32}$/.test(session)) return undefined
  return { alarmType: type, session }
}

export function notifyVisualAlarmTemplateSaved(context: VisualAlarmTemplateContext | undefined, providerCode: string): void {
  if (!context || providerCode !== context.alarmType || typeof BroadcastChannel === 'undefined') return
  try {
    const channel = new BroadcastChannel(`jetlinks.visual-alarm-template.v1.${context.session}`)
    channel.postMessage({ type: 'template-saved', version: 1, alarmType: providerCode })
    channel.close()
  } catch {
    // The original page also refreshes when it regains focus if browser messaging is unavailable.
  }
}
