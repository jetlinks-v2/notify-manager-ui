import { computed, type Ref } from 'vue'
import type { NoticeTemplateVariable } from '@notify-manager-ui/api/notice-center'

export type PreviewMode = 'token' | 'resolved'

export type TemplateSegment = {
  text: string
  variable: boolean
}

const mockVariableValues: Record<string, string> = {
  location: '陆家嘴 IFC 店',
  alarmTypeName: '吸烟检测',
  deviceName: 'CAM-218',
  triggerTime: '14:32',
  confidence: '96%',
  userName: '值班员',
  alarmId: 'ALM-20260526-218',
}

export const useTemplatePreviewSegments = (
  variables: () => NoticeTemplateVariable[],
  emptyText: () => string,
  previewTitle: Ref<string>,
  previewMessage: Ref<string>,
  previewMode: Ref<PreviewMode>,
) => {
  const getVariablePreview = (id: string) => {
    const variable = variables().find(item => item.id === id)
    if (typeof variable?.expands?.mockValue === 'string') {
      return variable.expands.mockValue
    }
    return mockVariableValues[id] || variable?.name || variable?.description || id
  }

  const renderSegments = (text: string, mode: PreviewMode): TemplateSegment[] => {
    const source = text || emptyText()
    const segments: TemplateSegment[] = []
    const pattern = /\$\{([^}]+)\}/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(source))) {
      if (match.index > lastIndex) {
        segments.push({ text: source.slice(lastIndex, match.index), variable: false })
      }
      segments.push({
        text: mode === 'resolved' ? getVariablePreview(match[1]) : match[0],
        variable: true,
      })
      lastIndex = pattern.lastIndex
    }

    if (lastIndex < source.length) {
      segments.push({ text: source.slice(lastIndex), variable: false })
    }

    return segments
  }

  return {
    resolvedTitleSegments: computed(() => renderSegments(previewTitle.value, 'resolved')),
    resolvedMessageSegments: computed(() => renderSegments(previewMessage.value, 'resolved')),
    visibleTitleSegments: computed(() => renderSegments(previewTitle.value, previewMode.value)),
    visibleMessageSegments: computed(() => renderSegments(previewMessage.value, previewMode.value)),
  }
}
