import DOMPurify from 'dompurify'

const htmlTag = /<\/?(?:a|abbr|address|article|aside|b|blockquote|body|br|caption|center|code|dd|del|div|dl|dt|em|font|footer|h[1-6]|head|header|hr|html|i|iframe|img|li|link|main|meta|ol|p|pre|s|script|section|small|span|strike|strong|style|sub|sup|svg|table|tbody|td|th|thead|tr|u|ul)\b[^>]*>/i
const htmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** 旧版纯文本保留换行；已有 HTML 不做二次转义，也不改变保存内容。 */
export function toEmailBodyHtml(value: string): string {
  return htmlTag.test(value) ? value : escapeEmailText(value)
}

/** 仅转义文本，供旧模板与无 DOM 环境安全降级使用。 */
function escapeEmailText(value: string): string {
  return value.replace(/[&<>"']/g, character => htmlEntities[character]).replace(/\r\n?|\n/g, '<br>')
}

/** 图片仅接受 HTTP(S)、同源根路径或真实变量占位；协议本身不能由变量构造。 */
export function isEmailImageSource(value: string, allowVariables = true): boolean {
  const source = value.trim()
  if (!source || /[\s\u0000-\u001f\u007f<>"'\\]/.test(source)) return false
  if (allowVariables && /^\$\{[^${}\s]+\}$/.test(source)) return true
  const prepared = allowVariables ? source.replace(/\$\{[^${}\s]+\}/g, 'template-variable') : source
  if (/[{}]/.test(prepared) || !/^(?:https?:\/\/|\/(?![\/\\]))/i.test(prepared)) return false
  try {
    const url = new URL(prepared, 'https://email-template.invalid')
    if (!['http:', 'https:'].includes(url.protocol)) return false
    let path = url.pathname
    try { path = decodeURIComponent(path) } catch { /* 非法百分号不会改变已校验的 URL 协议。 */ }
    return !/\.svgz?$/i.test(path)
  } catch { return false }
}

/** 邮件发送端需要绝对 HTTP(S) 图片地址；按站点源补全根路径，同时保留变量占位原文。 */
export function normalizeEmailImageSource(value: string, origin: string): string {
  const source = value.trim()
  if (!isEmailImageSource(source)) return ''
  if (!source.startsWith('/')) return source.replace(/^https?:/i, scheme => scheme.toLowerCase())
  try {
    const base = new URL(origin)
    return ['http:', 'https:'].includes(base.protocol) ? base.origin + source : ''
  } catch { return '' }
}

/** 从图片标签读取真实 src 属性，忽略 alt 等属性值中的相同文本。 */
function imageSourceAttribute(tag: string): string | undefined {
  for (const match of tag.matchAll(/\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    if (match[1].toLowerCase() === 'src') return match[2] ?? match[3] ?? match[4] ?? ''
  }
}

/** 空段落不构成正文；仅含合法图片或变量图片的邮件也可保存，无需浏览器 DOM。 */
export function hasEmailBodyContent(value: string): boolean {
  const markup = htmlTag.test(value) ? value
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style|iframe)\b[^>]*>[^]*?<\/\1\s*>/gi, '') : value
  const text = htmlTag.test(value) ? markup.replace(/<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g, '') : value
  if (text.replace(/&(?:nbsp|#0*160|#x0*a0);/gi, ' ').replace(/[\u200b\ufeff]/g, '').trim()) return true
  return [...markup.matchAll(/<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)].some(match => {
    const source = imageSourceAttribute(match[0])
    return source !== undefined && isEmailImageSource(source)
  })
}

/** 预览只在变量替换后净化；未解析的图片变量不产生请求，也不改动保存的模板。 */
export function sanitizeEmailPreview(value: string): string {
  if (!DOMPurify.isSupported) return escapeEmailText(value)
  const fragment = DOMPurify.sanitize(toEmailBodyHtml(value), {
    ALLOWED_TAGS: ['a', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i',
      'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'],
    ALLOWED_ATTR: ['href', 'title', 'colspan', 'rowspan', 'src', 'alt', 'width', 'height', 'data-list'],
    ADD_URI_SAFE_ATTR: ['colspan', 'rowspan', 'width', 'height', 'data-list'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[#/]|\.{1,2}\/)/i,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  })
  for (const image of Array.from(fragment.querySelectorAll('img'))) {
    if (!isEmailImageSource(image.getAttribute('src') ?? '', false)) image.remove()
  }
  // Quill 的语义 HTML 仅为复选列表保留 data-list；不放行编辑器内部或任意 data-* 属性。
  for (const item of Array.from(fragment.querySelectorAll('[data-list]'))) {
    if (item.localName !== 'li' || !['checked', 'unchecked'].includes(item.getAttribute('data-list') ?? '')) item.removeAttribute('data-list')
  }
  const container = fragment.ownerDocument.createElement('div')
  container.append(fragment)
  return container.innerHTML
}
