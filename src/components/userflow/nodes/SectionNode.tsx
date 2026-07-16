// SectionNode - 유저플로우 섹션 레이블 노드 (04A-03-PLAN.md Task 2)
//
// 형태: 굵은 좌측 보더(3px, 액센트 초록) + 섹션 레이블
// 핸들: 없음 (섹션은 연결선 endpoint 아님)
// 순수 흑백 금지, Inter 금지, em-dash 금지

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

export interface SectionNodeData {
  label?: string
}

export const SectionNode = memo(function SectionNode({ data }: NodeProps) {
  const nodeData = data as unknown as SectionNodeData

  return (
    <div
      style={{
        paddingLeft: 10,
        paddingTop: 6,
        paddingBottom: 6,
        paddingRight: 12,
        borderLeft: '3px solid oklch(0.58 0.18 150)',
        background: 'var(--color-surface)',
        color: 'var(--color-text)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.04em',
        userSelect: 'none',
        borderRadius: 2,
        minWidth: 80,
      }}
      title={nodeData.label ?? ''}
    >
      {nodeData.label ?? '섹션'}
    </div>
  )
})
