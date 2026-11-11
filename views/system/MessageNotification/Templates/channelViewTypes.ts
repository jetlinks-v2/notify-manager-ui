import type { useTemplateEditor } from './hooks/useTemplateEditor'
import type { useTemplatePreview } from './hooks/useTemplatePreview'

/** Channel views share one editor/caret and one derived preview; they do not own requests or drafts. */
export type TemplateEditorController = ReturnType<typeof useTemplateEditor>
export type TemplatePreviewController = ReturnType<typeof useTemplatePreview>
