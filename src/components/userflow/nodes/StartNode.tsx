// StartNode - 유저플로우 시작 노드 (04A-03-PLAN.md Task 2)
//
// 형태: 48x48 원형, 액센트 초록 fill
// 핸들: source 핸들만 (Right, 진입점 - 역방향 없음)
// 순수 흑백 금지, Inter 금지, em-dash 금지

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'

export interface StartNodeData {
  label?: string
}

export const StartNode = memo(function StartNode({ data }: NodeProps) {
  const nodeData = data as unknown as StartNodeData

  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: 'oklch(0.58 0.18 150)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 600,
        color: 'oklch(0.12 0.01 150)',
        userSelect: 'none',
        flexShrink: 0,
      }}
      title={nodeData.label ?? 'START'}
    >
      {nodeData.label ?? 'START'}

      {/* source 핸들만 - 시작점은 들어오는 연결 없음 */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  )
})
