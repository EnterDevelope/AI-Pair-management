// ActionNode - 유저플로우 액션 노드 (04A-03-PLAN.md Task 2)
//
// 형태: 작은 직사각형(borderRadius:8), 배경 약간 밝은 surface
// 핸들: 양쪽(opacity:0)
// 순수 흑백 금지, Inter 금지, em-dash 금지

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'

export interface ActionNodeData {
  label?: string
}

export const ActionNode = memo(function ActionNode({ data }: NodeProps) {
  const nodeData = data as unknown as ActionNodeData

  return (
    <div
      style={{
        minWidth: 100,
        maxWidth: 180,
        padding: '4px 8px',
        // PageNode보다 배경 약간 밝음 - oklch 명도 +0.04
        background: 'oklch(0.18 0.008 280)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        color: 'var(--color-text-muted)',
        userSelect: 'none',
      }}
      title={nodeData.label ?? ''}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />

      <span
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {nodeData.label ?? '액션'}
      </span>

      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  )
})
