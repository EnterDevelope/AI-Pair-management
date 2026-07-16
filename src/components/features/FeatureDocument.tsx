'use client'

// FeatureDocument — R 단위 선형 편집 도큐먼트 뷰 (03-05-PLAN.md Task 3)
//
// 규칙:
//   - R 항목 단위로 섹션 구성, --color-border 구분선
//   - 필드 수준 인라인 편집 (D-11): title=input, description=textarea, ac=per-item inputs
//   - 자유텍스트 블롭 편집 금지 (D-11)
//   - blur 시 800ms 디바운스 후 POST 저장
//   - Zustand selectedId 연동 → DetailPanel 발동 (D-07 재사용)
//   - pure #000/#fff 금지, var(--color-*) 우선, em-dash 금지, AP-01 색코딩 금지
//   - F 자식 목록: collapsible (기본 펼침)

import { useCallback, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { DetailPanel } from '@/components/features/DetailPanel'
import { IdChip } from '@/components/features/IdChip'
import { useFeaturesStore } from '@/stores/featuresStore'
import type { Features } from '@/schemas/graph/features'
import type { DetailPanelItem } from '@/components/features/DetailPanel'

type FeatureItem = NonNullable<Features['items']>[number]

// FeaturesShell이 projectId를 prop으로 넘기지 않는 구조이므로
// URL 쿼리에서 projectId를 읽는다 (AppShell 패턴 동일)
function useProjectId(): string {
  if (typeof window === 'undefined') return ''
  const params = new URLSearchParams(window.location.search)
  return params.get('project') ?? ''
}

// 800ms 디바운스 타이머 관리
function useDebounce(delay = 800) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedule = useCallback(
    (fn: () => void) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(fn, delay)
    },
    [delay]
  )
  return schedule
}

// 인라인 편집 가능한 단일 줄 필드 (title)
function InlineInput({
  value,
  placeholder,
  fontSize,
  fontWeight,
  onCommit,
}: {
  value: string
  placeholder: string
  fontSize?: string
  fontWeight?: string
  onCommit: (val: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  // value 외부 변경 시 동기화
  if (!editing && draft !== value) setDraft(value)

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          onCommit(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        style={{
          fontSize: fontSize ?? '14px',
          fontWeight: fontWeight ?? '400',
          color: 'var(--color-text)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-accent)',
          borderRadius: '4px',
          padding: '2px 6px',
          outline: 'none',
          width: '100%',
        }}
      />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEditing(true) }}
      style={{
        fontSize: fontSize ?? '14px',
        fontWeight: fontWeight ?? '400',
        color: value ? 'var(--color-text)' : 'var(--color-text-muted)',
        cursor: 'text',
        display: 'block',
        minHeight: '24px',
        padding: '2px 0',
        borderRadius: '4px',
      }}
    >
      {value || placeholder}
    </span>
  )
}

// 인라인 편집 가능한 textarea (description)
function InlineTextarea({
  value,
  placeholder,
  onCommit,
}: {
  value: string
  placeholder: string
  onCommit: (val: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing && draft !== value) setDraft(value)

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        placeholder={placeholder}
        rows={3}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          onCommit(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        style={{
          fontSize: '13px',
          color: 'var(--color-text)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-accent)',
          borderRadius: '4px',
          padding: '4px 6px',
          outline: 'none',
          width: '100%',
          resize: 'vertical',
          lineHeight: '1.5',
        }}
      />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEditing(true) }}
      style={{
        fontSize: '13px',
        color: value ? 'var(--color-text)' : 'var(--color-text-muted)',
        cursor: 'text',
        display: 'block',
        minHeight: '20px',
        padding: '2px 0',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap',
      }}
    >
      {value || placeholder}
    </span>
  )
}

// 수용 기준 한 항목 인라인 편집
function CriterionInput({
  value,
  placeholder,
  onCommit,
  onRemove,
}: {
  value: string
  placeholder: string
  onCommit: (val: string) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing && draft !== value) setDraft(value)

  return (
    <li className="flex items-start gap-2">
      <span style={{ color: 'var(--color-text-muted)', fontSize: '13px', paddingTop: '3px' }}>•</span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false)
            onCommit(draft)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          }}
          style={{
            fontSize: '13px',
            color: 'var(--color-text)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-accent)',
            borderRadius: '4px',
            padding: '1px 6px',
            outline: 'none',
            flex: 1,
          }}
        />
      ) : (
        <span
          role="button"
          tabIndex={0}
          onClick={() => setEditing(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEditing(true) }}
          style={{
            fontSize: '13px',
            color: value ? 'var(--color-text)' : 'var(--color-text-muted)',
            cursor: 'text',
            flex: 1,
            padding: '1px 0',
          }}
        >
          {value || placeholder}
        </span>
      )}
      <button
        type="button"
        aria-label="항목 삭제"
        onClick={onRemove}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <X size={12} />
      </button>
    </li>
  )
}

// R 단위 섹션 컴포넌트
function RSection({
  rItem,
  fItems,
  sItemsMap,
  onTitleCommit,
  onDescCommit,
  onAcCommit,
  onItemClick,
  selectedId,
}: {
  rItem: FeatureItem
  fItems: FeatureItem[]
  sItemsMap: Record<string, FeatureItem[]>
  onTitleCommit: (id: string, val: string) => void
  onDescCommit: (id: string, val: string) => void
  onAcCommit: (id: string, criteria: string[]) => void
  onItemClick: (id: string) => void
  selectedId: string | null
}) {
  const [fExpanded, setFExpanded] = useState<Record<string, boolean>>({})

  const isFExpanded = (id: string) => fExpanded[id] !== false // 기본 펼침

  const ac = rItem.acceptanceCriteria ?? []

  return (
    <section
      style={{
        borderBottom: '1px solid var(--color-border)',
        padding: '24px 0',
      }}
    >
      {/* R 제목 */}
      <div className="flex items-center gap-3 mb-3">
        <IdChip id={rItem.id} />
        <div style={{ flex: 1 }}>
          <InlineInput
            value={rItem.title ?? ''}
            placeholder="제목을 입력하세요"
            fontSize="20px"
            fontWeight="600"
            onCommit={(val) => onTitleCommit(rItem.id, val)}
          />
        </div>
        <button
          type="button"
          onClick={() => onItemClick(rItem.id)}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: '11px',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
          }}
        >
          상세
        </button>
      </div>

      {/* R 설명 */}
      <div className="mb-4">
        <InlineTextarea
          value={rItem.description ?? ''}
          placeholder="설명을 입력하세요"
          onCommit={(val) => onDescCommit(rItem.id, val)}
        />
      </div>

      {/* 수용 기준 */}
      <div className="mb-5">
        <div
          className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          수용 기준
        </div>
        <ul className="flex flex-col gap-1">
          {ac.map((c, idx) => (
            <CriterionInput
              key={idx}
              value={c}
              placeholder="수용 기준을 입력하세요"
              onCommit={(val) => {
                const next = [...ac]
                next[idx] = val
                onAcCommit(rItem.id, next)
              }}
              onRemove={() => {
                const next = ac.filter((_, i) => i !== idx)
                onAcCommit(rItem.id, next)
              }}
            />
          ))}
        </ul>
        <button
          type="button"
          onClick={() => onAcCommit(rItem.id, [...ac, ''])}
          className="flex items-center gap-1 mt-2"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
            fontSize: '12px',
            padding: '0',
          }}
        >
          <Plus size={12} />
          <span>항목 추가</span>
        </button>
      </div>

      {/* 자식 F 목록 */}
      {fItems.length > 0 && (
        <div>
          <div
            className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}
          >
            기능 ({fItems.length})
          </div>
          <div className="flex flex-col gap-3">
            {fItems.map((fItem) => {
              const sItems = sItemsMap[fItem.id] ?? []
              const expanded = isFExpanded(fItem.id)
              const isSelected = selectedId === fItem.id

              return (
                <div
                  key={fItem.id}
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    background: isSelected ? 'var(--color-accent-dim)' : 'transparent',
                  }}
                >
                  {/* F 헤더 행 */}
                  <div
                    className="flex items-center gap-2 px-3 py-2"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      onItemClick(fItem.id)
                      setFExpanded((prev) => ({ ...prev, [fItem.id]: !expanded }))
                    }}
                  >
                    {expanded ? (
                      <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    ) : (
                      <ChevronRight size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    )}
                    <IdChip id={fItem.id} />
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: 'var(--color-text)',
                        flex: 1,
                      }}
                    >
                      {fItem.title || '(제목 없음)'}
                    </span>
                  </div>

                  {/* F 펼침: 설명 + S 항목 */}
                  {expanded && (
                    <div
                      className="px-3 pb-3"
                      style={{ borderTop: '1px solid var(--color-border)' }}
                    >
                      {/* F 설명 */}
                      <div className="pt-2 mb-3">
                        <InlineTextarea
                          value={fItem.description ?? ''}
                          placeholder="기능 설명을 입력하세요"
                          onCommit={(val) => onDescCommit(fItem.id, val)}
                        />
                      </div>

                      {/* S 항목 */}
                      {sItems.length > 0 && (
                        <div>
                          <div
                            className="mb-1 text-[11px] font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--color-text-muted)' }}
                          >
                            상세기능 ({sItems.length})
                          </div>
                          <ul className="flex flex-col gap-1">
                            {sItems.map((sItem) => (
                              <li
                                key={sItem.id}
                                className="flex items-center gap-2 px-2 py-1 rounded"
                                style={{
                                  background: selectedId === sItem.id
                                    ? 'var(--color-accent-dim)'
                                    : 'transparent',
                                  cursor: 'pointer',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onItemClick(sItem.id)
                                }}
                              >
                                <IdChip id={sItem.id} />
                                <span
                                  style={{
                                    fontSize: '13px',
                                    color: 'var(--color-text)',
                                    flex: 1,
                                  }}
                                >
                                  {sItem.title || '(제목 없음)'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

export function FeatureDocument() {
  const items = useFeaturesStore((s) => s.items)
  const selectedId = useFeaturesStore((s) => s.selectedId)
  const setSelectedId = useFeaturesStore((s) => s.setSelectedId)
  const setItems = useFeaturesStore((s) => s.setItems)

  const projectId = useProjectId()
  const savingRef = useRef(false)
  const debounce = useDebounce(800)

  // 인라인 토스트 (04B-04 Task 2)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  // 항목 계층 파생
  const rItems = items.filter((i) => i.id.startsWith('R-'))
  const selectedItem = selectedId
    ? (items.find((i) => i.id === selectedId) ?? null)
    : null

  // F 항목: R별로 그룹
  const fByR: Record<string, FeatureItem[]> = {}
  items
    .filter((i) => i.id.startsWith('F-') && i.parent)
    .forEach((i) => {
      const p = i.parent!
      if (!fByR[p]) fByR[p] = []
      fByR[p].push(i)
    })

  // S 항목: F별로 그룹
  const sByF: Record<string, FeatureItem[]> = {}
  items
    .filter((i) => i.id.startsWith('S-') && i.parent)
    .forEach((i) => {
      const p = i.parent!
      if (!sByF[p]) sByF[p] = []
      sByF[p].push(i)
    })

  // POST 저장
  const saveItems = useCallback(
    async (updatedItems: FeatureItem[]) => {
      if (savingRef.current || !projectId) return
      savingRef.current = true
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/features`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              features: { schemaVersion: '1.0', items: updatedItems },
            }),
          }
        )
        if (!res.ok) throw new Error(`저장 실패: ${res.status}`)
        setItems(updatedItems)
      } finally {
        savingRef.current = false
      }
    },
    [projectId, setItems]
  )

  // 공통 필드 업데이트 + 800ms debounce 저장
  const updateField = useCallback(
    (id: string, patch: Partial<FeatureItem>) => {
      const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i))
      setItems(next) // 즉시 UI 반영
      debounce(() => void saveItems(next))
    },
    [items, setItems, debounce, saveItems]
  )

  // DetailPanel 저장 (즉시)
  const handlePanelSave = useCallback(
    async (updated: DetailPanelItem) => {
      const next = items.map((i) =>
        i.id === updated.id ? { ...i, ...updated } : i
      )
      await saveItems(next)
    },
    [items, saveItems]
  )

  // DetailPanel 삭제 (D-15: 자식 parent 제거)
  const handlePanelDelete = useCallback(
    (id: string) => {
      const next = items
        .map((i) => (i.parent === id ? { ...i, parent: undefined } : i))
        .filter((i) => i.id !== id)
      setSelectedId(null)
      void saveItems(next)
    },
    [items, saveItems, setSelectedId]
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

  // 빈 상태
  if (rItems.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <p className="text-sm">요구사항 항목이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="relative flex h-full">
      <ScrollArea className="flex-1 min-h-0">
        <div
          className="mx-auto"
          style={{
            maxWidth: '720px',
            padding: '0 24px',
          }}
        >
          {rItems.map((rItem) => (
            <RSection
              key={rItem.id}
              rItem={rItem}
              fItems={fByR[rItem.id] ?? []}
              sItemsMap={sByF}
              selectedId={selectedId}
              onTitleCommit={(id, val) => updateField(id, { title: val })}
              onDescCommit={(id, val) => updateField(id, { description: val })}
              onAcCommit={(id, criteria) =>
                updateField(id, { acceptanceCriteria: criteria })
              }
              onItemClick={(id) => setSelectedId(id)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* DetailPanel (D-07 재사용) */}
      <DetailPanel
        item={selectedItem}
        onClose={() => setSelectedId(null)}
        onSave={handlePanelSave}
        onDelete={handlePanelDelete}
        onAiRequest={handleAiRequest}
      />

      {/* 인라인 토스트 (04B-04 Task 2) */}
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
