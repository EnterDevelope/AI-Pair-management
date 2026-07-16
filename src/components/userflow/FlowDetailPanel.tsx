'use client'
// FlowDetailPanel - 유저플로우 노드 우측 슬라이드 패널 (04A-04-PLAN.md Task 2)
//
// 규칙:
//   - 너비 320px, 240ms 우측 슬라이드 (translate-x)
//   - UserflowSchema (not FeaturesSchema) - leaf import
//   - item->form sync deps: [item?.id] (루프 방지, not [item])
//   - onAiRequest?: optional — 없으면 버튼 미표시 (하위 호환)
//   - 타입 배지: read-only enum 표시 (start/section/page/action)
//   - featureId: read-only 표시
//   - 2단계 삭제 확인
//   - 순수 흑백 금지, var(--color-*) 우선, em-dash 금지

import { useState, useEffect } from 'react'
import { X, Trash2, Sparkles } from 'lucide-react'

import { UserflowSchema } from '@/schemas/graph/userflow'
import { SaveButton } from '@/components/prd/SaveButton'
import type { SaveStatus } from '@/components/prd/SaveButton'

// 유저플로우 스키마 NodeSchema에서 type 열거형
type NodeType = 'start' | 'section' | 'page' | 'action'

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  start: '시작',
  section: '섹션',
  page: '페이지',
  action: '액션',
}

// NodeType 배지 색상 (anti-slop: 칸데이터잉크 우선, 의미 배경색 X)
const NODE_TYPE_BADGE_STYLE: Record<NodeType, React.CSSProperties> = {
  start: {
    background: 'oklch(0.22 0.04 150)',
    color: 'oklch(0.75 0.12 150)',
    border: '1px solid oklch(0.35 0.08 150)',
  },
  section: {
    background: 'oklch(0.22 0.04 250)',
    color: 'oklch(0.75 0.10 250)',
    border: '1px solid oklch(0.35 0.08 250)',
  },
  page: {
    background: 'oklch(0.22 0.04 200)',
    color: 'oklch(0.75 0.10 200)',
    border: '1px solid oklch(0.35 0.08 200)',
  },
  action: {
    background: 'oklch(0.22 0.04 60)',
    color: 'oklch(0.75 0.10 60)',
    border: '1px solid oklch(0.35 0.08 60)',
  },
}

export interface FlowDetailPanelItem {
  id: string
  type?: NodeType
  label?: string
  description?: string
  featureId?: string
}

interface FlowDetailPanelProps {
  item: FlowDetailPanelItem | null
  onClose: () => void
  onSave: (updated: FlowDetailPanelItem) => Promise<void>
  onDelete: (id: string) => void
  onAiRequest?: (item: FlowDetailPanelItem, instruction: string) => Promise<void>
}

export function FlowDetailPanel({ item, onClose, onSave, onDelete, onAiRequest }: FlowDetailPanelProps) {
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAiPopup, setShowAiPopup] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiSubmitting, setAiSubmitting] = useState(false)

  // item 변경 시 폼 동기화
  // deps: [item?.id] - item 객체 전체 의존시 부모 리렌더에 의한 무한 루프 발생 (Pitfall 방지)
  useEffect(() => {
    if (!item) return
    setLabel(item.label ?? '')
    setDescription(item.description ?? '')
    setSaveStatus('idle')
    setShowDeleteConfirm(false)
    setShowAiPopup(false)
    setAiInstruction('')
  }, [item?.id])

  if (!item) return null

  const nodeType = (item.type ?? 'page') as NodeType
  const isOpen = Boolean(item)

  async function handleSave() {
    if (!item) return
    setSaveStatus('saving')

    const payload: FlowDetailPanelItem = {
      ...item,
      label,
      description,
    }

    // UserflowSchema.safeParse 호출 - nodes 배열로 감싸 스키마 검증
    const parsed = UserflowSchema.safeParse({
      schemaVersion: '1.0',
      nodes: [{ type: nodeType, id: payload.id, label: payload.label }],
    })

    if (!parsed.success) {
      setSaveStatus('error')
      return
    }

    try {
      await onSave(payload)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    } catch {
      setSaveStatus('error')
    }
  }

  function handleDeleteConfirm() {
    if (!item) return
    onDelete(item.id)
    setShowDeleteConfirm(false)
    onClose()
  }

  async function handleAiSubmit() {
    if (!item || !onAiRequest || !aiInstruction.trim()) return
    setAiSubmitting(true)
    try {
      await onAiRequest(item, aiInstruction.trim())
    } finally {
      setAiSubmitting(false)
      setShowAiPopup(false)
      setAiInstruction('')
    }
  }

  return (
    <aside
      role="complementary"
      aria-label="노드 상세"
      className="fixed right-0 top-0 h-full z-40 flex flex-col overflow-hidden"
      style={{
        width: 320,
        background: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 240ms ease',
        color: 'var(--color-text)',
      }}
    >
      {/* 헤더 */}
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {/* 노드 타입 배지 (read-only) */}
        <span
          className="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
          style={NODE_TYPE_BADGE_STYLE[nodeType]}
        >
          {NODE_TYPE_LABELS[nodeType]}
        </span>

        <span
          className="flex-1 text-sm font-medium truncate"
          style={{ color: 'var(--color-text)' }}
        >
          {label || '(이름 없음)'}
        </span>

        <button
          type="button"
          aria-label="패널 닫기"
          className="flex items-center justify-center rounded"
          style={{
            width: 28,
            height: 28,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
          }}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      {/* 본문 (스크롤) */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">

        {/* 노드 ID (read-only) */}
        <div className="flex flex-col gap-1">
          <span
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ID
          </span>
          <span
            className="text-xs font-mono rounded px-2 py-1"
            style={{
              background: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
            {item.id}
          </span>
        </div>

        {/* featureId (read-only, 있을 때만) */}
        {item.featureId && (
          <div className="flex flex-col gap-1">
            <span
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              연결 기능 ID
            </span>
            <span
              className="text-xs font-mono rounded px-2 py-1"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'oklch(0.65 0.10 150)',
              }}
            >
              {item.featureId}
            </span>
          </div>
        )}

        {/* 이름 (편집 가능) */}
        <div className="flex flex-col gap-1">
          <label
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
            htmlFor="flow-detail-label"
          >
            이름
          </label>
          <input
            id="flow-detail-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded px-2 py-1 text-sm w-full"
            style={{
              background: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              outline: 'none',
            }}
          />
        </div>

        {/* 설명 (편집 가능) */}
        <div className="flex flex-col gap-1">
          <label
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
            htmlFor="flow-detail-desc"
          >
            설명
          </label>
          <textarea
            id="flow-detail-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded px-2 py-1 text-sm w-full resize-y"
            style={{
              background: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              outline: 'none',
            }}
          />
        </div>

        {/* 삭제 */}
        {showDeleteConfirm ? (
          <div
            className="rounded p-3 flex flex-col gap-3"
            style={{
              background: 'var(--color-background)',
              border: '1px solid var(--color-border)',
            }}
          >
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>
              삭제하면 이 노드가 플로우에서 제거됩니다. 계속할까요?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded px-3 py-2 text-sm font-medium"
                style={{
                  background: 'oklch(0.45 0.18 25)',
                  border: 'none',
                  color: 'oklch(0.95 0.02 25)',
                  cursor: 'pointer',
                  minHeight: 36,
                }}
                onClick={handleDeleteConfirm}
              >
                삭제
              </button>
              <button
                type="button"
                className="flex-1 rounded px-3 py-2 text-sm"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                  minHeight: 36,
                }}
                onClick={() => setShowDeleteConfirm(false)}
              >
                돌아가기
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1 text-sm rounded px-2 py-1"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 size={14} />
            노드 삭제
          </button>
        )}
      </div>

      {/* 푸터: AI 수정요청 버튼 + 저장 버튼 */}
      <div
        className="px-4 py-3 shrink-0 flex flex-col gap-2"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        {/* AI 수정요청 팝업 — onAiRequest가 있을 때만 표시 */}
        {onAiRequest && showAiPopup && (
          <div
            className="rounded p-3 flex flex-col gap-3"
            style={{
              background: 'var(--color-background)',
              border: '1px solid oklch(0.40 0.10 150)',
            }}
          >
            <p className="text-xs font-medium" style={{ color: 'oklch(0.75 0.12 150)' }}>
              AI에게 수정 지시
            </p>
            <textarea
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder="이 노드를 어떻게 수정할까요? (예: 결제 확인 페이지를 두 단계로 나눠줘)"
              rows={3}
              className="rounded px-2 py-1 text-sm w-full resize-y"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={aiSubmitting || !aiInstruction.trim()}
                className="flex-1 rounded px-3 py-2 text-sm font-medium flex items-center justify-center gap-1"
                style={{
                  background: aiSubmitting || !aiInstruction.trim()
                    ? 'oklch(0.30 0.06 150)'
                    : 'oklch(0.58 0.18 150)',
                  border: 'none',
                  color: aiSubmitting || !aiInstruction.trim()
                    ? 'oklch(0.55 0.08 150)'
                    : 'oklch(0.10 0.01 150)',
                  cursor: aiSubmitting || !aiInstruction.trim() ? 'not-allowed' : 'pointer',
                  minHeight: 36,
                }}
                onClick={handleAiSubmit}
              >
                {aiSubmitting ? '요청 중...' : '요청 전송'}
              </button>
              <button
                type="button"
                className="flex-1 rounded px-3 py-2 text-sm"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                  minHeight: 36,
                }}
                onClick={() => { setShowAiPopup(false); setAiInstruction('') }}
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* AI 수정요청 버튼 — onAiRequest가 있을 때만 표시 */}
        {onAiRequest && !showAiPopup && (
          <button
            type="button"
            className="w-full rounded px-3 py-2 text-sm font-medium flex items-center justify-center gap-1"
            style={{
              background: 'transparent',
              border: '1px solid oklch(0.40 0.10 150)',
              color: 'oklch(0.65 0.12 150)',
              cursor: 'pointer',
              minHeight: 36,
            }}
            onClick={() => setShowAiPopup(true)}
          >
            <Sparkles size={14} />
            AI 수정요청
          </button>
        )}

        <div onClick={handleSave}>
          <SaveButton
            status={saveStatus}
            disabled={saveStatus === 'saving'}
            data-testid="flow-detail-panel-save"
          />
        </div>
      </div>
    </aside>
  )
}
