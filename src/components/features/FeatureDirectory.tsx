'use client'

// FeatureDirectory — R→F→S 3컬럼 드릴다운 디렉토리 뷰 (03-05-PLAN.md Task 2)
//
// 규칙:
//   - 3컬럼 grid: R 전체 | 선택된 R의 F | 선택된 F의 S
//   - 로컬 상태: selectedR, selectedF (컬럼 드릴다운) — Zustand selectedId는 DetailPanel용
//   - 행 클릭 → 로컬 선택 + setSelectedId → DetailPanel 발동 (D-07 재사용)
//   - UnlinkedBucket: parent 없는 F/S 항목 수집 (D-12)
//   - 삭제 시 자식 parent 제거 → 미연결 버킷 이동 (D-15, 손실 0)
//   - 저장: POST /api/projects/[id]/features { features: { schemaVersion, items } }
//   - pure #000/#fff 금지, var(--color-*) 우선, em-dash 금지, AP-01 색코딩 금지

import { useCallback, useEffect, useRef, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { DetailPanel } from '@/components/features/DetailPanel'
import { IdChip } from '@/components/features/IdChip'
import { UnlinkedBucket } from '@/components/features/UnlinkedBucket'
import { useFeaturesStore } from '@/stores/featuresStore'
import type { Features } from '@/schemas/graph/features'
import type { DetailPanelItem } from '@/components/features/DetailPanel'

type FeatureItem = NonNullable<Features['items']>[number]

interface FeatureDirectoryProps {
  projectId: string
}

// 항목 행 컴포넌트 (인라인 — 단순 표현)
function ItemRow({
  item,
  isSelected,
  onClick,
}: {
  item: FeatureItem
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <li
      role="option"
      aria-selected={isSelected}
      className="flex items-center gap-2 px-3 py-2 cursor-pointer"
      style={{
        background: isSelected ? 'var(--color-accent-dim)' : 'transparent',
      }}
      onClick={onClick}
    >
      <IdChip id={item.id} />
      <span
        className="flex-1 truncate text-sm"
        style={{ color: 'var(--color-text)' }}
      >
        {item.title || '(제목 없음)'}
      </span>
    </li>
  )
}

// 컬럼 헤더 + 빈 상태 처리
function Column({
  label,
  children,
  isEmpty,
}: {
  label: string
  children: React.ReactNode
  isEmpty: boolean
}) {
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div
        className="px-3 py-2 text-[11px] font-semibold tracking-wider uppercase shrink-0"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </div>
      <ScrollArea className="flex-1 min-h-0">
        {isEmpty ? (
          <div
            className="flex items-center justify-center h-24 text-sm"
            style={{ color: 'var(--color-text-muted)' }}
          >
            항목 없음
          </div>
        ) : (
          <ul role="listbox" className="flex flex-col">
            {children}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}

export function FeatureDirectory({ projectId }: FeatureDirectoryProps) {
  const items = useFeaturesStore((s) => s.items)
  const selectedId = useFeaturesStore((s) => s.selectedId)
  const setSelectedId = useFeaturesStore((s) => s.setSelectedId)
  const setItems = useFeaturesStore((s) => s.setItems)

  // 드릴다운 로컬 상태 (컬럼 탐색용) — Zustand selectedId와 독립
  const [selectedR, setSelectedR] = useState<string | null>(null)
  const [selectedF, setSelectedF] = useState<string | null>(null)

  // 인라인 토스트 (라이브러리 없음 — 2초 자동 해제)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  // AI 수정 대기 큐 카운트 (04B-04 Task 3) — .aipm/queue/ 파일 add/unlink 추적
  const [queueCount, setQueueCount] = useState(0)
  const queueRefreshSequenceRef = useRef(0)

  const refreshQueueCount = useCallback(async () => {
    const sequence = ++queueRefreshSequenceRef.current
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/queue`)
    if (!res.ok) return
    const data = (await res.json()) as { count?: number }
    if (sequence === queueRefreshSequenceRef.current && typeof data.count === 'number') {
      setQueueCount(data.count)
    }
  }, [projectId])

  useEffect(() => {
    void refreshQueueCount().catch(() => undefined)

    const es = new EventSource(`/api/watch?project=${encodeURIComponent(projectId)}`)
    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { type: string; path: string }
        if (data.type === 'add' || data.type === 'unlink') {
          void refreshQueueCount().catch(() => undefined)
        }
      } catch {
        // JSON 파싱 실패 무시
      }
    }
    return () => {
      queueRefreshSequenceRef.current += 1
      es.close()
    }
  }, [projectId, refreshQueueCount])

  // 저장 중 중복 방지
  const savingRef = useRef(false)

  // 컬럼별 항목 파생
  const rItems = items.filter((i) => i.id.startsWith('R-'))
  const fItems = items.filter(
    (i) => i.id.startsWith('F-') && i.parent === selectedR
  )
  const sItems = items.filter(
    (i) => i.id.startsWith('S-') && i.parent === selectedF
  )

  // 미연결 항목 (D-12): parent 없는 F/S
  const unlinkedItems = items.filter(
    (i) =>
      (i.id.startsWith('F-') || i.id.startsWith('S-')) && !i.parent
  )

  // 현재 선택된 항목 (DetailPanel용)
  const selectedItem = selectedId
    ? (items.find((i) => i.id === selectedId) ?? null)
    : null

  // --- 행 클릭 핸들러 ---

  function handleRClick(item: FeatureItem) {
    setSelectedR(item.id)
    setSelectedF(null) // F 선택 초기화
    setSelectedId(item.id)
  }

  function handleFClick(item: FeatureItem) {
    setSelectedF(item.id)
    setSelectedId(item.id)
  }

  function handleSClick(item: FeatureItem) {
    setSelectedId(item.id)
  }

  function handleUnlinkedSelect(id: string) {
    setSelectedId(id)
  }

  // --- 저장 ---

  const saveItems = useCallback(
    async (updatedItems: FeatureItem[]) => {
      if (savingRef.current) return
      savingRef.current = true
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/features`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              features: {
                schemaVersion: '1.0',
                items: updatedItems,
              },
            }),
          }
        )
        if (!res.ok) {
          throw new Error(`저장 실패: ${res.status}`)
        }
        setItems(updatedItems)
      } finally {
        savingRef.current = false
      }
    },
    [projectId, setItems]
  )

  // DetailPanel onSave: 수정된 항목을 items에 반영
  const handlePanelSave = useCallback(
    async (updated: DetailPanelItem) => {
      const next = items.map((i) =>
        i.id === updated.id ? { ...i, ...updated } : i
      )
      await saveItems(next)
    },
    [items, saveItems]
  )

  // DetailPanel onDelete: D-15 — 자식 parent 제거 후 해당 항목 삭제
  const handlePanelDelete = useCallback(
    (id: string) => {
      const next = items
        .map((i) => (i.parent === id ? { ...i, parent: undefined } : i))
        .filter((i) => i.id !== id)

      // 드릴다운 상태 정리
      if (selectedR === id) {
        setSelectedR(null)
        setSelectedF(null)
      }
      if (selectedF === id) {
        setSelectedF(null)
      }

      setSelectedId(null)
      void saveItems(next)
    },
    [items, selectedR, selectedF, saveItems, setSelectedId]
  )

  // UnlinkedBucket 부모 재배정 (D-12)
  const handleReassign = useCallback(
    (itemId: string, newParentId: string) => {
      const next = items.map((i) =>
        i.id === itemId ? { ...i, parent: newParentId } : i
      )
      void saveItems(next)
    },
    [items, saveItems]
  )

  // AI 수정요청 큐 등록 (04B-04 Task 2)
  const handleAiRequest = useCallback(
    async (item: DetailPanelItem, instruction: string) => {
      const requestId = crypto.randomUUID()
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/queue`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schemaVersion: '1.0',
            requestId,
            targetArtifact: 'features',
            targetId: item.id,
            instruction,
            createdAt: new Date().toISOString(),
          }),
        }
      )
      if (!res.ok) throw new Error(`큐 등록 실패: ${res.status}`)
      showToast('/aipm apply 로 수정사항을 적용할 수 있어요.')
    },
    [projectId]
  )

  return (
    <div className="relative flex h-full flex-col">
      {/* AI 수정 대기 배지 (04B-04 Task 3) */}
      {queueCount > 0 && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-md px-3 py-1 text-xs font-medium"
          style={{
            background: 'oklch(0.14 0.01 280)',
            color: 'oklch(0.58 0.18 150)',
            border: '1px solid oklch(0.58 0.18 150 / 0.4)',
          }}
        >
          AI 수정 대기 중 {queueCount}건
        </div>
      )}

      {/* 3컬럼 그리드 */}
      <div
        className="grid flex-1 min-h-0"
        style={{
          gridTemplateColumns: '1fr 1fr 1fr',
          borderBottom: unlinkedItems.length > 0
            ? '1px solid var(--color-border)'
            : 'none',
          height: unlinkedItems.length > 0 ? 'calc(100% - auto)' : '100%',
        }}
      >
        {/* R 컬럼 */}
        <div
          style={{ borderRight: '1px solid var(--color-border)' }}
          className="min-h-0 flex flex-col"
        >
          <Column label="요구사항" isEmpty={rItems.length === 0}>
            {rItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                isSelected={item.id === selectedR}
                onClick={() => handleRClick(item)}
              />
            ))}
          </Column>
        </div>

        {/* F 컬럼 */}
        <div
          style={{ borderRight: '1px solid var(--color-border)' }}
          className="min-h-0 flex flex-col"
        >
          <Column
            label={selectedR ? `${selectedR} 기능` : '기능'}
            isEmpty={!selectedR || fItems.length === 0}
          >
            {fItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                isSelected={item.id === selectedF}
                onClick={() => handleFClick(item)}
              />
            ))}
          </Column>
        </div>

        {/* S 컬럼 */}
        <div className="min-h-0 flex flex-col">
          <Column
            label={selectedF ? `${selectedF} 상세` : '상세기능'}
            isEmpty={!selectedF || sItems.length === 0}
          >
            {sItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                isSelected={item.id === selectedId}
                onClick={() => handleSClick(item)}
              />
            ))}
          </Column>
        </div>
      </div>

      {/* 미연결 버킷 (D-12) */}
      <UnlinkedBucket
        items={unlinkedItems}
        selectedId={selectedId}
        candidates={items}
        onSelect={handleUnlinkedSelect}
        onReassign={handleReassign}
      />

      {/* DetailPanel (D-07 재사용) */}
      <DetailPanel
        item={selectedItem}
        onClose={() => setSelectedId(null)}
        onSave={handlePanelSave}
        onDelete={handlePanelDelete}
        onAiRequest={handleAiRequest}
      />

      {/* 인라인 토스트 (04B-04 Task 2 — 라이브러리 없음) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md px-4 py-2 text-sm shadow-lg"
          style={{
            background: 'oklch(0.18 0.01 280)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
