// FeatureNode — React Flow 커스텀 노드 (03-04-PLAN.md Task 2)
//
// 레이아웃: [IdChip] [제목 14px] [상태 점]
// 노드 크기: min-w 160px, max-w 240px
// 배경: --color-surface, border 1px --color-border
// 선택 시: border 2px --color-accent (FeatureTree에서 selectedId로 제어)
// 상태 점: todo=--color-text-muted, in-progress=oklch(0.70 0.16 60), done=--color-accent
// hover: "+" 하위 추가 버튼 + trash 삭제 버튼 노출
// pure #000/#fff 금지, Inter 금지, em-dash 금지

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { Plus, Trash2 } from 'lucide-react'

import { IdChip } from '@/components/features/IdChip'

export interface FeatureNodeData {
  id: string
  title: string
  level: 'R' | 'F' | 'S'
  status?: 'todo' | 'in-progress' | 'done'
  onAddChild?: (parentId: string) => void
  onDelete?: (id: string) => void
  selected?: boolean
}

// 상태 점 색상 (실제 상태 인코딩 전용 — 장식 금지)
const STATUS_DOT_COLOR: Record<string, string> = {
  'todo': 'var(--color-text-muted)',
  'in-progress': 'oklch(0.70 0.16 60)',
  'done': 'var(--color-accent)',
}

function StatusDot({ status }: { status?: string }) {
  const color = STATUS_DOT_COLOR[status ?? 'todo'] ?? 'var(--color-text-muted)'
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: 6,
        height: 6,
        background: color,
        marginLeft: 4,
      }}
      aria-label={status ?? 'todo'}
    />
  )
}

// 컴포넌트 내부에서 nodeTypes를 정의하면 리렌더마다 새 객체 생성 → 50+ 노드 폭주
// 이 파일은 nodeTypes에 등록될 컴포넌트만 export (nodeTypes는 FeatureTree 모듈 스코프에 위치)
export const FeatureNode = memo(function FeatureNode({ data }: NodeProps) {
  const nodeData = data as unknown as FeatureNodeData

  const { id, title, status, onAddChild, onDelete, selected } = nodeData

  const borderStyle = selected
    ? '2px solid var(--color-accent)'
    : '1px solid var(--color-border)'

  return (
    <div
      className="group relative flex items-center gap-1 rounded px-2 py-1"
      style={{
        minWidth: 160,
        maxWidth: 240,
        background: 'var(--color-surface)',
        border: borderStyle,
        fontSize: 14,
        lineHeight: '1.5',
        color: 'var(--color-text)',
        userSelect: 'none',
      }}
    >
      {/* React Flow connection handles (hidden — 편집 불가) */}
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />

      {/* ID 칩 */}
      <IdChip id={id} />

      {/* 제목 */}
      <span
        className="flex-1 truncate"
        style={{ fontSize: 14 }}
        title={title}
      >
        {title ?? '(제목 없음)'}
      </span>

      {/* 상태 점 */}
      <StatusDot status={status} />

      {/* hover 버튼: 하위 추가 + 삭제 */}
      <span className="absolute right-[-44px] top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
        <button
          type="button"
          className="flex items-center justify-center rounded"
          style={{
            width: 20,
            height: 20,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
          }}
          title="하위 항목 추가"
          aria-label="하위 항목 추가"
          onClick={(e) => {
            e.stopPropagation()
            onAddChild?.(id)
          }}
        >
          <Plus size={12} />
        </button>
        <button
          type="button"
          className="flex items-center justify-center rounded"
          style={{
            width: 20,
            height: 20,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
          }}
          aria-label="항목 삭제"
          onClick={(e) => {
            e.stopPropagation()
            onDelete?.(id)
          }}
        >
          <Trash2 size={12} />
        </button>
      </span>
    </div>
  )
})
