// Existing all-for-save shape; this fixture is imported only by tests.
const channel = templateId => ({ channelProvider: 'notifier-email', channelConfiguration: { templateId } })
export default {
  templates: [
    { id: 'template-relieve', name: '设备告警解除邮件', type: 'email', provider: 'embedded', template: { subject: '设备告警已解除', text: '告警解除通知内容', sendTo: [], attachments: [] } },
  ],
  businessTypes: [
    { id: 'device-config', provider: 'alarm-device', name: '设备告警', type: { id: 'iot', name: '物联告警' }, channels: [channel('template-alarm')] },
    { id: 'relieve-config', provider: 'alarm-device-relieve', name: '告警解除', type: { id: 'iot', name: '物联告警' }, channels: [channel('template-relieve')] },
    { provider: 'aiComplianceAlarm', name: '合规告警', type: { id: 'video', name: '视联告警' }, channels: [] },
    { provider: 'aiSecurityAlarm', name: '安全告警', type: { id: 'video', name: '视联告警' }, channels: [] },
    { provider: 'scene', name: '场景联动', type: { id: 'other', name: '其他' }, channels: [] },
    { provider: 'system-event', name: '系统运维', type: { id: 'other', name: '其他' }, channels: [channel('template-maintenance')] },
  ],
}
