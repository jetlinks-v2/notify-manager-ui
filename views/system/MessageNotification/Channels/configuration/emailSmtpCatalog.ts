import type { EmailEncryption } from './emailSettings'

export const emailBrands = ['tencent', 'aliyun', 'netease', 'exchange', 'other'] as const
export type EmailBrand = typeof emailBrands[number]

export interface EmailSmtpEndpoint {
  brand: EmailBrand
  labelKey: string
  host: string
  port: number
  encryption: EmailEncryption
  hintKey?: string
}

/** Public SMTP submission endpoints only; source documents and verification scope are recorded in README. */
export const emailSmtpEndpoints: readonly EmailSmtpEndpoint[] = [
  { brand: 'tencent', labelKey: 'messageNotification.channels.email.servers.tencentEnterprise', host: 'smtp.exmail.qq.com', port: 465, encryption: 'ssl' },
  { brand: 'tencent', labelKey: 'messageNotification.channels.email.servers.tencentPersonal', host: 'smtp.qq.com', port: 465, encryption: 'ssl' },
  { brand: 'tencent', labelKey: 'messageNotification.channels.email.servers.tencentOverseas', host: 'hwsmtp.exmail.qq.com', port: 465, encryption: 'ssl' },
  { brand: 'tencent', labelKey: 'messageNotification.channels.email.servers.tencentSesHongKong', host: 'smtp.qcloudmail.com', port: 465, encryption: 'ssl' },
  { brand: 'tencent', labelKey: 'messageNotification.channels.email.servers.tencentSesGuangzhou', host: 'gz-smtp.qcloudmail.com', port: 465, encryption: 'ssl' },
  { brand: 'tencent', labelKey: 'messageNotification.channels.email.servers.tencentSesInternational', host: 'sg-smtp.qcloudmail.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.aliyunEnterprise', host: 'smtp.qiye.aliyun.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.aliyunPersonal', host: 'smtp.aliyun.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.aliyunXinchuang', host: 'smtp.xc.aliyun.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.aliyunHongKong', host: 'smtphk.qiye.aliyun.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.aliyunLegacy', host: 'smtp.mxhichina.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.aliyunSingaporeSite', host: 'smtp.sg.aliyun.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.aliyunHongKongSite', host: 'smtp.hk.aliyun.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.aliyunGermanySite', host: 'smtp.de.alibabacloud.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.aliyunUsSite', host: 'smtp.us.alibabacloud.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.directMailHangzhou', host: 'smtpdm.aliyun.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.directMailSingapore', host: 'smtpdm-ap-southeast-1.aliyuncs.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.directMailUs', host: 'smtpdm-us-east-1.aliyuncs.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.directMailGermany', host: 'smtpdm-eu-central-1.aliyuncs.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.directMailLegacySingapore', host: 'smtpdm-ap-southeast-1.aliyun.com', port: 465, encryption: 'ssl' },
  { brand: 'aliyun', labelKey: 'messageNotification.channels.email.servers.directMailLegacySydney', host: 'smtpdm-ap-southeast-2.aliyun.com', port: 465, encryption: 'ssl' },
  { brand: 'netease', labelKey: 'messageNotification.channels.email.servers.neteaseEnterprise', host: 'smtp.qiye.163.com', port: 465, encryption: 'ssl' },
  { brand: 'netease', labelKey: 'messageNotification.channels.email.servers.neteaseHangzhou', host: 'smtphz.qiye.163.com', port: 465, encryption: 'ssl' },
  { brand: 'netease', labelKey: 'messageNotification.channels.email.servers.netease163', host: 'smtp.163.com', port: 465, encryption: 'ssl' },
  { brand: 'netease', labelKey: 'messageNotification.channels.email.servers.netease126', host: 'smtp.126.com', port: 465, encryption: 'ssl' },
  { brand: 'netease', labelKey: 'messageNotification.channels.email.servers.neteaseYeah', host: 'smtp.yeah.net', port: 465, encryption: 'ssl' },
  { brand: 'exchange', labelKey: 'messageNotification.channels.email.servers.exchangeOnline', host: 'smtp.office365.com', port: 587, encryption: 'starttls' },
  { brand: 'exchange', labelKey: 'messageNotification.channels.email.servers.exchangeChina', host: 'smtp.partner.outlook.cn', port: 587, encryption: 'starttls' },
  { brand: 'exchange', labelKey: 'messageNotification.channels.email.servers.outlook', host: 'smtp-mail.outlook.com', port: 587, encryption: 'starttls', hintKey: 'messageNotification.channels.email.outlookAuthentication' },
  { brand: 'exchange', labelKey: 'messageNotification.channels.email.servers.azure', host: 'smtp.azurecomm.net', port: 587, encryption: 'starttls' },
  { brand: 'other', labelKey: 'messageNotification.channels.email.servers.gmail', host: 'smtp.gmail.com', port: 465, encryption: 'ssl' },
  { brand: 'other', labelKey: 'messageNotification.channels.email.servers.yahoo', host: 'smtp.mail.yahoo.com', port: 465, encryption: 'ssl' },
  { brand: 'other', labelKey: 'messageNotification.channels.email.servers.icloud', host: 'smtp.mail.me.com', port: 587, encryption: 'starttls' },
  { brand: 'other', labelKey: 'messageNotification.channels.email.servers.feishu', host: 'smtp.feishu.cn', port: 465, encryption: 'ssl' },
]

/** Keep the existing enterprise defaults when a user explicitly switches to another brand. */
export const emailBrandDefaults: Record<Exclude<EmailBrand, 'other'>, string> = {
  tencent: 'smtp.exmail.qq.com',
  aliyun: 'smtp.qiye.aliyun.com',
  netease: 'smtp.qiye.163.com',
  exchange: 'smtp.office365.com',
}

/** Normalize only for matching; opening a saved record must never rewrite its original host. */
export function findEmailSmtpEndpoint(host: unknown): EmailSmtpEndpoint | undefined {
  if (typeof host !== 'string') return undefined
  const normalized = host.trim().toLowerCase()
  return emailSmtpEndpoints.find(endpoint => endpoint.host === normalized)
}

export function emailBrandForHost(host: unknown): EmailBrand {
  return findEmailSmtpEndpoint(host)?.brand || 'other'
}
