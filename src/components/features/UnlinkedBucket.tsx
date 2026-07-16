'use client'

// UnlinkedBucket — parent 없는 F/S 항목 수집 버킷 (D-12, D-15)
//
// 규칙:
//   - parentless F/S items만 수집 (R은 루트라 제외)
//   - "부모 선택" 드롭다운으로 parent 재배정 가능
//   - 재배정 시 onReassign(itemId, newParentId) 호출 → 저장은 상위 컴포넌트 책임
//   - 행 클릭 → onSelect(itemId) → DetailPanel 발동 (D-07 재사용)
//   - pure #000/#fff 금지, var(--color-*) 우선, em-dash 금지, AP-01 색코딩 금지

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IdChip } from '@/components/features/IdChip'
import type { Features } from '@/schemas/graph/features'

type FeatureItem = NonNullable<Features['items']>[number]

interface UnlinkedBucketProps {
  /** parent 없는 F/S 항목 */
  items: FeatureItem[]
  /** 현재 선택된 항목 ID (DetailPanel 연동) */
  selectedId: string | null
  /** parent 재배정 가능한 후보 목록 (F 항목의 부모 = R, S 항목의 부모 = F) */
  candidates: FeatureItem[]
  onSelect: (id: string) => void
  onReassign: (itemId: string, newParentId: string) => void
}

export function UnlinkedBucket({
  items,
  selectedId,
  candidates,
  onSelect,
  onReassign,
}: UnlinkedBucketProps) {
  if (items.length === 0) return null

  return (
    <div
      className="shrink-0"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      {/* 버킷 헤더 */}
      <div
        className="px-3 py-2 text-[11px] font-semibold tracking-wider uppercase"
        style={{ color: 'var(--color-text-muted)' }}
      >
        미연결 항목
      </div>

      {/* 항목 목록 */}
      <ul role="list" className="flex flex-col">
        {items.map((item) => {
          const isSelected = item.id === selectedId

          // 이 항목에 재배정 가능한 부모 후보 필터
          const prefix = item.id.charAt(0)
          // F 항목 → R 목록 / S 항목 → F 목록
          const validParents = candidates.filter((c) =>
            prefix === 'F' ? c.id.startsWith('R-') : c.id.startsWith('F-')
          )

          return (
            <li
              key={item.id}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer"
              style={{
                background: isSelected
                  ? 'var(--color-accent-dim)'
                  : 'transparent',
              }}
              onClick={() => onSelect(item.id)}
            >
              <IdChip id={item.id} />
              <span
                className="flex-1 truncate text-sm"
                style={{ color: 'var(--color-text)' }}
              >
                {item.title || '(제목 없음)'}
              </span>

              {/* 부모 선택 드롭다운 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 rounded px-2 py-0.5 text-[11px]"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    부모 선택
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onClick={(e) => e.stopPropagation()}
                >
                  {validParents.length === 0 ? (
                    <DropdownMenuItem disabled>
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        후보 없음
                      </span>
                    </DropdownMenuItem>
                  ) : (
                    validParents.map((parent) => (
                      <DropdownMenuItem
                        key={parent.id}
                        onClick={() => onReassign(item.id, parent.id)}
                      >
                        <span className="font-mono text-[11px] mr-1">
                          {parent.id}
                        </span>
                        <span className="truncate">
                          {parent.title || '(제목 없음)'}
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
