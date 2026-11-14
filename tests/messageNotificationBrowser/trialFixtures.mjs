// Saved channel records for isolated trial checks; no usable credentials or remote targets.
export const trialConfigurations = {
  'email:embedded': { host: 'smtp.fixture.test', port: 465, sender: 'fixture@example.test', username: 'fixture', password: 'fixture-only' },
  'dingTalk:dingTalkMessage': { appKey: 'fixture', appSecret: 'fixture-only', agentId: '1001' },
  'dingTalk:dingTalkRobotWebHook': { url: 'https://fixture.example.test/robot' },
  'weixin:corpMessage': { corpId: 'fixture', corpSecret: 'fixture-only', agentId: '1002' },
  'sms:aliyunSms': { regionId: 'cn-hangzhou', accessKeyId: 'fixture', secret: 'fixture-only', testTemplate: { signName: '测试签名', code: 'SMS_FIXTURE', parameters: [{ name: 'code', value: '123456' }] } },
  'voice:aliyun': { regionId: 'cn-hangzhou', accessKeyId: 'fixture', secret: 'fixture-only', testTemplate: { templateType: 'tts', templateCode: 'TTS_FIXTURE', parameters: [{ name: 'name', value: '测试用户' }] } },
  'webhook:http': { url: 'https://fixture.example.test/hook', headers: [] },
  'weixin:officialMessage': { appId: 'fixture', secret: 'fixture-only', testTemplate: { wxTemplateId: 'WX_FIXTURE', parameters: [{ name: 'thing1', value: '测试通知' }] } },
}
export const trialRecords = Object.entries(trialConfigurations).map(([key, configuration]) => {
  const [type, provider] = key.split(':')
  return { id: `trial-${provider}`, name: key, type, provider, configuration }
})
export const officialWireMetadata = { properties: [
  { property: 'appId', name: 'AppId', type: { type: 'string' } },
  { property: 'secret', name: 'AppSecret', type: { type: 'password' } },
] }
