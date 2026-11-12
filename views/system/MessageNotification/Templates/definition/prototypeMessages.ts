export type PrototypeTranslate = (key: string, params?: Record<string, unknown>) => string

/** 默认文案是新模板的数据；生成后不会随界面语言重写已保存内容。 */
export const prototypeDefaultMessages = {
  alarmTitle: '{level}告警：{name}',
  alarmSubject: '【{level}告警】{name}{target}',
  relieveTitle: '告警已解除：{name}',
  relieveSubject: '【告警解除】{name}{target}',
  alarmIntro: '设备产生了一条{level}告警，请及时处理。',
  relieveIntro: '一条{level}告警已解除。',
  complianceIntro: '视频 AI 识别到一条{level}合规告警，请及时核实。',
  securityIntro: '视频 AI 识别到一条{level}安全告警，请立即处理。',
  recovered: '{device} 已恢复正常',
  alarmName: '告警名称：{value}',
  device: '设备：{value}',
  channel: '通道：{value}',
  value: '告警值：{value}',
  currentValue: '当前值：{value}',
  alarmTime: '告警时间：{value}',
  relieveTime: '解除时间：{value}',
  sceneTitle: '「{scene}」已执行',
  sceneSubject: '【场景联动】{title}',
  sceneIntro: '场景「{scene}」已执行，这个场景设置了通知你。',
  triggerType: '触发方式：{value}',
  bulletinSubject: '【{kind}】{title}',
  footer: '这封邮件由系统自动发送，请勿直接回复。不想再收到这类邮件，可以在个人中心的通知设置里关掉。',
  alarmSms: '{level}告警：{device} {name}，{time}，请及时处理。',
  alarmVoice: '您好，这里是告警通知。{device} 发生{level}告警：{name}，请及时处理。',
  relieveSms: '告警解除：{device} {name}已恢复正常。',
  relieveVoice: '您好，这里是告警通知。{device} 的{name}告警已解除。',
  complianceSms: '{level}告警：{name}，{time}，请及时核实。',
  complianceVoice: '您好，这里是告警通知。{name}，请及时核实。',
  securitySms: '{level}告警：{name}，{time}，请立即处理。',
  securityVoice: '您好，这里是告警通知。{name}，请立即处理。',
  sceneSms: '场景「{scene}」已执行。',
  sceneVoice: '您好，这里是场景通知。场景{scene}已执行。',
  bulletinSms: '平台公告：{title}，详情请登录平台查看。',
  bulletinVoice: '您好，这里是公告通知：{title}。详情请登录平台查看。',
} as const

export type PrototypeMessageKey = keyof typeof prototypeDefaultMessages

/** 缺失翻译时使用原型中文；参数是实际变量 token，不把演示值写入文案。 */
export function prototypeText(key: PrototypeMessageKey, params: Record<string, unknown> = {}, translate?: PrototypeTranslate): string {
  const path = `messageNotification.templates.defaults.${key}`
  const translated = translate?.(path, params)
  if (translated && translated !== path) return translated
  return prototypeDefaultMessages[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}
