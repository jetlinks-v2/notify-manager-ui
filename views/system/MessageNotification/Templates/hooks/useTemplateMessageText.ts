import { computed } from 'vue'

export interface TemplateTextSegment { text: string; strong: boolean }
export interface TemplateTextBlock {
  tag: 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  segments: TemplateTextSegment[]
  empty: boolean
}

/** Parse emphasis into text nodes; HTML and link syntax never become executable markup. */
export function templateTextSegments(text: string, markdown = false): TemplateTextSegment[] {
  if (!markdown) return [{ text, strong: false }]
  const segments: TemplateTextSegment[] = []
  const pattern = /\*\*([^*\n]+)\*\*/g
  let end = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > end) segments.push({ text: text.slice(end, start), strong: false })
    segments.push({ text: match[1], strong: true })
    end = start + match[0].length
  }
  if (end < text.length) segments.push({ text: text.slice(end), strong: false })
  return segments
}

/** Support heading lines and explicit line breaks using only a fixed set of native text containers. */
export function templateTextBlocks(text: string, markdown = false): TemplateTextBlock[] {
  if (!markdown) return [{ tag: 'div', segments: templateTextSegments(text), empty: !text }]
  return text.split(/\r\n|\r|\n/).map(line => {
    const heading = /^(#{1,6})[ \t]+(.+)$/.exec(line)
    const content = heading?.[2] ?? line
    return {
      tag: heading ? `h${heading[1].length}` as TemplateTextBlock['tag'] : 'div',
      segments: templateTextSegments(content, true), empty: !content,
    }
  })
}

export function useTemplateMessageText(props: { text: string; markdown?: boolean }) {
  return { blocks: computed(() => templateTextBlocks(props.text, props.markdown)) }
}
