import type { NotificationChannel, NotificationObject } from '../../shared'
import type { ChannelDefinition } from './channelMetadata'
import { channelHelpGuides } from './channelHelpGuides'
import { findEmailSmtpEndpoint } from './emailSmtpCatalog'

export type ChannelHelpBlock = { type: 'text'; text: string } | { type: 'image'; image: string; alt: string }
export interface ChannelHelpSection {
  id: string
  fields: string[]
  title: string
  blocks: ChannelHelpBlock[]
}
export interface ChannelHelpModel {
  channelId: string
  description: string
  overview: string
  link?: { label: string; href: string }
  sections: ChannelHelpSection[]
}

/** Match actual field identities, never paragraph order or translated labels. */
export function channelHelpSection(model: ChannelHelpModel, fieldKey: string): string | undefined {
  const key = fieldKey.startsWith('config:') ? fieldKey.slice(7) : fieldKey
  return key ? model.sections.find(section => section.fields.includes(key))?.id : undefined
}

/** Historical documents supply the illustrations; current fields and metadata own the contract. */
export function channelHelp(channel: NotificationChannel | undefined, definition: ChannelDefinition | undefined, t: (key: string) => string, configuration?: NotificationObject): ChannelHelpModel {
  const guide = channel && channelHelpGuides[channel.id]
  const sections: ChannelHelpSection[] = guide?.sections.map(section => ({
    id: section.id, fields: section.fields, title: t(section.titleKey),
    blocks: section.blocks.map(block => block.type === 'text'
      ? { type: 'text', text: t(block.key) }
      : { type: 'image', image: block.image, alt: t(section.titleKey) }),
  })) ?? []
  // Provider extensions keep their own explanations; hidden legacy settings are not advertised as inputs.
  for (const field of definition?.fields ?? []) {
    if (!field.property?.description || sections.some(section => section.fields.includes(field.key))
      || field.key === 'testTemplate' || channel?.id === 'dingTalk:dingTalkRobotWebHook' && field.key === 'secret') continue
    sections.push({ id: `field-${field.key}`, fields: [field.key], title: field.property.name || field.key,
      blocks: [{ type: 'text', text: field.property.description }] })
  }
  const smtp = channel?.id === 'email:embedded' && findEmailSmtpEndpoint(String(configuration?.host ?? ''))
  if (smtp && smtp.hintKey) sections.find(section => section.id === 'host')?.blocks.push({ type: 'text', text: t(smtp.hintKey) })
  const description = guide ? t(`messageNotification.channels.guidance.${guide.kind}.description`)
    : definition?.metadata.description || channel?.description || t('messageNotification.channels.guidance.generic')
  return {
    channelId: channel?.id || '', description,
    overview: guide ? t('messageNotification.channels.document.introduction') : description,
    link: guide?.link ? { label: t(guide.link.labelKey), href: guide.link.href } : undefined,
    sections,
  }
}
