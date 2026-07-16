// PageNode - 유저플로우 페이지 노드 (04A-03-PLAN.md Task 2)
//
// 형태: 직사각형, IdChip + 레이블, 양쪽 핸들(opacity:0)
// 선택 시: border var(--color-accent)
// 순수 흑백 금지, Inter 금지, em-dash 금지

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'

import { IdChip } from '@/components/features/IdChip'

export interface PageNodeData {
  id?: string
  label?: string
  pageId?: string
  selected?: boolean
}

export const PageNode = memo(function PageNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as PageNodeData

  const chipId = nodeData.pageId ?? nodeData.id ?? ''
  const borderStyle =
    selected
      ? '1px solid var(--color-accent)'
      : '1px solid var(--color-border)'

  return (
    <div
      style={{
        minWidth: 140,
        maxWidth: 220,
        padding: '6px 10px',
        background: 'var(--color-surface)',
        border: borderStyle,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        color: 'var(--color-text)',
        userSelect: 'none',
      }}
      title={nodeData.label ?? ''}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />

      {chipId && <IdChip id={chipId} />}

      <span
        style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {nodeData.label ?? '(제목 없음)'}
      </span>

      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  )
})
