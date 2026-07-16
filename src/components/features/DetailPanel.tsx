'use client'
// DetailPanel — 기능 항목 우측 슬라이드 패널 (03-04-PLAN.md Task 2)
//
// 규칙:
//   - 너비 320px, 240ms 우측 슬라이드 (translate-x)
//   - FeaturesSchema.safeParse 호출 후 저장 (D-15 손실 0 원칙)
//   - D-15 삭제 문구: "삭제하면 자식 항목이 미연결 버킷으로 이동합니다. 계속할까요?"
//   - SaveButton 재사용
//   - onAiRequest?: optional — 없으면 버튼 미표시 (하위 호환)
//   - pure #000/#fff 금지, var(--color-*) 우선, em-dash 금지

import { useState, useEffect } from 'react'
import { X, Trash2, Sparkles } from 'lucide-react'

import { FeaturesSchema } from '@/schemas/graph/features'
import { IdChip } from '@/components/features/IdChip'
import { SaveButton } from '@/components/prd/SaveButton'
import type { SaveStatus } from '@/components/prd/SaveButton'

type Status = 'todo' | 'in-progress' | 'done'
type Importance = 'high' | 'medium' | 'low'

export interface DetailPanelItem {
  id: string
  title?: string
  description?: string
  acceptanceCriteria?: string[]
  status?: Status
  importance?: Importance
  links?: string[]
  parent?: string
}

interface DetailPanelProps {
  item: DetailPanelItem | null
  onClose: () => void
  onSave: (updated: DetailPanelItem) => Promise<void>
  onDelete: (id: string) => void
  onAiRequest?: (item: DetailPanelItem, instruction: string) => Promise<void>
}

const STATUS_LABELS: Record<Status, string> = {
  'todo': '예정',
  'in-progress': '진행 중',
  'done': '완료',
}

const IMPORTANCE_LABELS: Record<Importance, string> = {
  'high': '높음',
  'medium': '보통',
  'low': '낮음',
}

export function DetailPanel({ item, onClose, onSave, onDelete, onAiRequest }: DetailPanelProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<Status>('todo')
  const [importance, setImportance] = useState<Importance>('medium')
  const [criteria, setCriteria] = useState<string[]>([])
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAiPopup, setShowAiPopup] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiSubmitting, setAiSubmitting] = useState(false)

  // item 변경 시 폼 동기화
  // deps: [item?.id] — item 객체 전체 의존 시 부모 리렌더에 의한 무한 루프 발생 (Pitfall 방지)
  useEffect(() => {
    if (!item) return
    setTitle(item.title ?? '')
    setDescription(item.description ?? '')
    setStatus(item.status ?? 'todo')
    setImportance(item.importance ?? 'medium')
    setCriteria(item.acceptanceCriteria ?? [])
    setSaveStatus('idle')
    setShowDeleteConfirm(false)
    setShowAiPopup(false)
    setAiInstruction('')
  }, [item?.id])

  if (!item) return null

  const isOpen = Boolean(item)

  async function handleSave() {
    if (!item) return
    setSaveStatus('saving')

    const payload = {
      ...item,
      title,
      description,
      status,
      importance,
      acceptanceCriteria: criteria,
    }

    // FeaturesSchema.safeParse 호출 — features.json 전체 감싸기
    const parsed = FeaturesSchema.safeParse({
      schemaVersion: '1.0',
      items: [payload],
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
    <>
      {/* 배경 오버레이 없음 — 전체 화면 투명 오버레이는 다른 행/노드 클릭을 삼켜
          연속 드릴다운(R→F→S 행 클릭 전환)을 막는다. 닫기는 X 버튼과
          각 뷰의 빈 영역 클릭(트리 onPaneClick 등)이 담당한다. */}

      {/* 패널 본체 */}
      <aside
        role="complementary"
        aria-label="항목 상세"
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
          <IdChip id={item.id} />
          <span
            className="flex-1 text-sm font-medium truncate"
            style={{ color: 'var(--color-text)' }}
          >
            {title || '(제목 없음)'}
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

          {/* 제목 */}
          <div className="flex flex-col gap-1">
            <label
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
              htmlFor="detail-title"
            >
              제목
            </label>
            <input
              id="detail-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded px-2 py-1 text-sm w-full"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
          </div>

          {/* 상태 */}
          <div className="flex flex-col gap-1">
            <label
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
              htmlFor="detail-status"
            >
              상태
            </label>
            <select
              id="detail-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="rounded px-2 py-1 text-sm w-full"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* 중요도 */}
          <div className="flex flex-col gap-1">
            <label
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
              htmlFor="detail-importance"
            >
              중요도
            </label>
            <select
              id="detail-importance"
              value={importance}
              onChange={(e) => setImportance(e.target.value as Importance)}
              className="rounded px-2 py-1 text-sm w-full"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              {(Object.keys(IMPORTANCE_LABELS) as Importance[]).map((i) => (
                <option key={i} value={i}>{IMPORTANCE_LABELS[i]}</option>
              ))}
            </select>
          </div>

          {/* 설명 */}
          <div className="flex flex-col gap-1">
            <label
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
              htmlFor="detail-desc"
            >
              설명
            </label>
            <textarea
              id="detail-desc"
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

          {/* 수용 기준 */}
          {criteria.length > 0 && (
            <div className="flex flex-col gap-1">
              <span
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                수용 기준
              </span>
              <ul className="flex flex-col gap-1">
                {criteria.map((c, i) => (
                  <li key={i} className="flex items-start gap-1 text-sm">
                    <span style={{ color: 'var(--color-accent)' }}>+</span>
                    <span style={{ color: 'var(--color-text)' }}>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 연결 링크 */}
          {item.links && item.links.length > 0 && (
            <div className="flex flex-col gap-1">
              <span
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                링크
              </span>
              <ul className="flex flex-col gap-1">
                {item.links.map((link, i) => (
                  <li key={i}>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm underline"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 삭제 확인 영역 */}
          {showDeleteConfirm ? (
            <div
              className="rounded p-3 flex flex-col gap-3"
              style={{
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
              }}
            >
              <p className="text-sm" style={{ color: 'var(--color-text)' }}>
                삭제하면 자식 항목이 미연결 버킷으로 이동합니다. 계속할까요?
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
              항목 삭제
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
                placeholder="이 항목을 어떻게 수정할까요? (예: 결제 기능을 결제·환불 둘로 쪼개줘)"
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
              data-testid="detail-panel-save"
            />
          </div>
        </div>
      </aside>
    </>
  )
}
