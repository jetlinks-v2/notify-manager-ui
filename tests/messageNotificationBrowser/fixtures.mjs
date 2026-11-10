// These records exist exclusively in the browser test entry; production pages import none of them.
export default {
  configs: [
    { id: 'smtp-primary', name: '主要邮件配置', type: 'email', provider: 'embedded', configuration: { host: 'smtp.example.test', port: 465, sender: 'notify@example.test', username: 'sender', password: 'test-fixture-secret', properties: [{ name: 'mail.smtp.ssl.enable', value: 'true' }] } },
    { id: 'smtp-backup', name: '备用邮件配置', type: 'email', provider: 'embedded', configuration: { host: 'backup.example.test', port: 465, sender: 'backup@example.test', username: 'backup', password: 'another-fixture-secret', properties: [] } },
  ],
  templates: [
    { id: 'template-alarm', name: '设备告警邮件', type: 'email', provider: 'embedded', configId: 'smtp-primary', template: { subject: '设备 ${deviceName} 告警', text: '告警内容：${alarmName}', sendTo: ['receiver@example.test'], attachments: [] }, variableDefinitions: [{ id: 'deviceName', name: '设备名称', type: 'string', required: true }, { id: 'alarmName', name: '告警名称', type: 'string' }], description: '测试邮件模板' },
    { id: 'template-maintenance', name: '维护通知', type: 'email', provider: 'embedded', template: { subject: '维护通知', text: '计划维护内容', sendTo: [], attachments: [] }, variableDefinitions: [] },
  ],
  history: [
    { id: 'history-success', notifierId: 'smtp-primary', templateId: 'template-alarm', notifyType: 'email', provider: 'embedded', state: { value: 'success', text: '发送成功' }, notifyTime: 1794182400000, receiver: ['receiver@example.test'], notifyMessage: '已保存的设备 A 温度告警', template: '{"subject":"设备告警快照","text":"历史内容 ${deviceName}"}', context: { deviceName: '设备 A' }, result: { response: 'accepted' }, bizType: 'alarm', bizId: 'alarm-001', description: '历史发送记录' },
    { id: 'history-cancel', notifierId: 'smtp-backup', templateId: 'template-maintenance', notifyType: 'email', provider: 'embedded', state: 'cancel', notifyTime: 1794182000000, receiver: ['cancelled@example.test'], notifyMessage: '已取消的维护通知', template: '{"subject":"维护通知快照"}', context: {}, result: {}, description: '发送方已取消' },
  ],
}
