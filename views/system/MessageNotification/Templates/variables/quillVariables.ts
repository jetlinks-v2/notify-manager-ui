import type Quill from 'quill'
import type { Delta } from 'quill'
import type Embed from 'quill/blots/embed.js'

type QuillConstructor = typeof Quill
type DeltaConstructor = typeof import('quill')['Delta']
export const variableBlotName = 'templateVariable'
const tokenPattern = /\$\{([^{}]+)\}/g
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function variableLabel(token: string, names: ReadonlyMap<string, string>) {
  const id = token.slice(2, -1).trim()
  return '{' + (names.get(id) || id) + '}'
}

export function templateVariableDisplayText(value: string, names: ReadonlyMap<string, string>) {
  return value.replace(tokenPattern, token => variableLabel(token, names))
}

/** 每个编辑器独立注册变量节点；节点值始终是原始表达式，绝不按显示名称反查。 */
export function createTemplateVariableBlot(QuillClass: QuillConstructor, names: () => ReadonlyMap<string, string>) {
  const Base = QuillClass.import('blots/embed') as typeof Embed
  return class TemplateVariable extends Base {
    static blotName = variableBlotName
    static tagName = 'SPAN'
    static className = 'template-variable-token'
    static create(token: string) {
      const node = super.create(token) as HTMLElement
      node.setAttribute('data-template-variable', token)
      node.setAttribute('title', token)
      node.textContent = variableLabel(token, names())
      return node
    }
    static value(node: Node) { return node instanceof HTMLElement ? node.getAttribute('data-template-variable') || '' : '' }
    // 邮件和剪贴板 HTML 仅输出变量表达式，不输出编辑器专用 span / data 属性。
    html() { return escapeHtml(TemplateVariable.value(this.domNode)) }
  }
}

/** 把文本中的完整表达式变为原子节点，同时保留原 Delta 的格式。 */
export function tokenizeTemplateDelta(delta: Delta, DeltaClass: DeltaConstructor) {
  const result = new DeltaClass()
  for (const op of delta.ops) {
    if (typeof op.insert !== 'string') { result.push(op); continue }
    let offset = 0
    for (const match of op.insert.matchAll(tokenPattern)) {
      result.insert(op.insert.slice(offset, match.index), op.attributes)
      result.insert({ [variableBlotName]: match[0] }, op.attributes)
      offset = match.index + match[0].length
    }
    result.insert(op.insert.slice(offset), op.attributes)
  }
  return result
}

/** 文本 / JSON 的提交值和剪贴板文本包含完整 key，长度校验也基于此值。 */
export function templateDeltaText(delta: Delta) {
  return delta.ops.map(op => typeof op.insert === 'string' ? op.insert : String(op.insert?.[variableBlotName] ?? '')).join('')
}

/** 语言切换仅更新节点内容，不产生 Delta、撤销记录或草稿变化。 */
export function refreshTemplateVariableLabels(editor: Quill, names: ReadonlyMap<string, string>) {
  editor.root.querySelectorAll<HTMLElement>('.template-variable-token').forEach(node => {
    const content = node.querySelector('[contenteditable="false"]')
    const label = variableLabel(node.getAttribute('data-template-variable') || '', names)
    if (content && content.textContent !== label) content.textContent = label
  })
}

/** 手动键入完整表达式后也转成节点；调用方负责防重入及合并本次编辑。 */
export function promoteTemplateVariables(editor: Quill, DeltaClass: DeltaConstructor): Delta {
  const before = editor.getContents(), after = tokenizeTemplateDelta(before, DeltaClass)
  const change = before.diff(after)
  if (!change.ops.length) return change
  const range = editor.getSelection()
  editor.updateContents(change, 'user')
  if (range) {
    const start = change.transformPosition(range.index)
    const end = change.transformPosition(range.index + range.length)
    editor.setSelection(start, end - start, 'silent')
  }
  return change
}

/** Quill 的默认 getText 会跳过 embed；复制 / 剪切须显式输出原始表达式。 */
export function bindTemplateVariableClipboard(editor: Quill, editable: () => boolean) {
  const copy = (event: ClipboardEvent) => {
    const range = editor.getSelection()
    if (event.defaultPrevented || !event.clipboardData || !range?.length) return
    event.preventDefault(); event.stopImmediatePropagation()
    event.clipboardData.setData('text/plain', templateDeltaText(editor.getContents(range.index, range.length)))
    event.clipboardData.setData('text/html', editor.getSemanticHTML(range.index, range.length))
    if (event.type === 'cut' && editable()) {
      editor.history.cutoff()
      editor.deleteText(range.index, range.length, 'user')
      editor.setSelection(range.index, 0, 'silent')
    }
  }
  editor.root.addEventListener('copy', copy, true)
  editor.root.addEventListener('cut', copy, true)
  return () => { editor.root.removeEventListener('copy', copy, true); editor.root.removeEventListener('cut', copy, true) }
}

export function copyTemplateEditorHistory(stack: Quill['history']['stack']): Quill['history']['stack'] {
  const copy = (items: Quill['history']['stack']['undo']) => items.map(item => ({ ...item, range: item.range && { ...item.range } }))
  return { undo: copy(stack.undo), redo: copy(stack.redo) }
}
