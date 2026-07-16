'use client'

// PrdForm — 구조화 PRD 편집 폼 (02A-02-PLAN.md Task 2)
// - 5섹션: 개요 / 문제와 해결방안 / 타겟과 시나리오 / 성공지표와 위험요소 / 속성설정
// - 500ms 디바운스 자동저장
// - Zod 인라인 에러 (id 형식 등 검증 위반 시 필드별 표시)
// - roles·devices 읽기 전용
// - 불변 업데이트: setState(prev => ({...prev, ...}))
// - 미지 필드 보존: fetch body에 원본 PRD spread
// - SSE 외부 변경 감지 + D-03 편집 보호 배너 (02A-03)

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSseWatcher } from './useSseWatcher'
import { SseBanner } from './SseBanner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PrdSchema, type Prd } from '@/schemas/graph/prd'
import { SaveButton, type SaveStatus } from './SaveButton'

interface PrdFormProps {
  projectId: string
  initialPrd: Prd
}

type FieldErrors = Partial<Record<keyof Prd, string[]>>

export function PrdForm({ projectId, initialPrd }: PrdFormProps) {
  const [formData, setFormData] = useState<Prd>({ ...initialPrd })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [showSseBanner, setShowSseBanner] = useState(false)

  // AI 수정요청 팝업 상태 (04B-04 Task 3)
  // activeSection: 현재 팝업이 열린 섹션 키 | null
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiSubmitting, setAiSubmitting] = useState(false)

  // 인라인 토스트 (04B-04 Task 3)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // isDirtyRef — 디바운스 중에도 최신 값을 읽을 수 있도록 ref로 관리 (D-03)
  const isDirtyRef = useRef(false)
  // externalPendingRef — 외부(하네스) 변경 감지 후 사용자가 배너로 결정하기 전까지
  // 자동저장을 보류한다. 보류 중 자동저장이 발사되면 하네스 변경을 덮어써 D-03이 깨진다.
  const externalPendingRef = useRef(false)

  function clearPendingSave() {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }

  const handleExternalChange = useCallback(() => {
    // 진행 중 자동저장 취소 + 사용자 결정 전까지 자동저장 보류 (CR-02, D-03)
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    externalPendingRef.current = true
    setShowSseBanner(true)
  }, [])

  // 디스크 최신본을 읽어 폼에 반영 — 배너 리로드와 클린 자동 갱신이 공유 (VIEW-03)
  const reloadFromDisk = useCallback(async () => {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/prd`)
    if (res.ok) {
      const freshPrd = (await res.json()) as Prd
      setFormData({ ...freshPrd })
      isDirtyRef.current = false
    }
  }, [projectId])

  const handleCleanChange = useCallback(() => {
    // 편집 중이 아닐 때(충돌 없음) 하네스 외부 변경 → 배너 없이 폼 자동 갱신 (VIEW-03)
    void reloadFromDisk().catch(() => {
      // 네트워크 오류 시 조용히 무시 — 다음 변경 이벤트에서 재시도
    })
  }, [reloadFromDisk])

  useSseWatcher({
    projectId,
    isDirtyRef,
    onExternalChange: handleExternalChange,
    onCleanChange: handleCleanChange,
  })

  // 언마운트 시 대기 중 디바운스 타이머 정리 (IN-01)
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleKeepEditing() {
    // 사용자가 자기 편집 유지를 선택 — 자동저장 재개 허용
    externalPendingRef.current = false
    setShowSseBanner(false)
  }

  async function handleReload() {
    // 대기 중 자동저장을 먼저 취소 — 옛 값이 신규 데이터를 덮어쓰지 못하게 (CR-01, D-03)
    clearPendingSave()
    try {
      await reloadFromDisk()
    } catch {
      // 네트워크 오류 시 배너만 닫음
    } finally {
      externalPendingRef.current = false
      setShowSseBanner(false)
    }
  }

  function handleChange(field: keyof Prd, value: string) {
    const updated = { ...formData, [field]: value }
    setFormData(updated)
    isDirtyRef.current = true

    // 외부 변경 대기 중에는 자동저장 스케줄 금지 — 사용자 결정 우선 (CR-02, D-03)
    if (externalPendingRef.current) {
      return
    }

    // 디바운스 리셋
    clearPendingSave()
    debounceRef.current = setTimeout(() => {
      savePrd(updated)
    }, 500)
  }

  // AI 수정요청 큐 등록 (04B-04 Task 3)
  // sectionKey: PRD 섹션 식별자 (overview / problemAndSolution / targetAndScenario / successAndRisk)
  async function handleAiSubmit(sectionKey: string) {
    if (!aiInstruction.trim()) return
    setAiSubmitting(true)
    try {
      const requestId = crypto.randomUUID()
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/queue`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schemaVersion: '1.0',
            requestId,
            targetArtifact: 'prd',
            targetId: sectionKey,
            instruction: aiInstruction.trim(),
            createdAt: new Date().toISOString(),
          }),
        }
      )
      if (!res.ok) throw new Error(`큐 등록 실패: ${res.status}`)
      setActiveSection(null)
      setAiInstruction('')
      showToast('/aipm apply 로 수정사항을 적용할 수 있어요.')
    } catch (err) {
      console.error('[PrdForm] AI 수정요청 실패:', err)
      showToast('AI 수정요청을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setAiSubmitting(false)
    }
  }

  function savePrd(data: Prd) {
    const result = PrdSchema.safeParse(data)
    if (!result.success) {
      const { fieldErrors: fe } = result.error.flatten()
      setFieldErrors(fe as FieldErrors)
      setSaveStatus('error')
      return
    }

    setFieldErrors({})
    setSaveStatus('saving')

    // 검증된 현재 폼 데이터를 그대로 전송. 미지 필드 보존은 서버 POST 핸들러가
    // 디스크 원본과 머지해 처리한다(WR-05 — 마운트 시점 stale initialPrd spread 제거).
    const toWrite = { ...data, ...result.data }

    fetch(`/api/projects/${encodeURIComponent(projectId)}/prd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prd: toWrite }),
    })
      .then((res) => {
        if (res.ok) {
          setSaveStatus('saved')
          isDirtyRef.current = false
        } else {
          setSaveStatus('error')
        }
      })
      .catch(() => {
        setSaveStatus('error')
      })
  }

  const hasErrors = Object.keys(fieldErrors).length > 0

  return (
    <div className="relative">
      <SseBanner
        visible={showSseBanner}
        onReload={handleReload}
        onKeepEditing={handleKeepEditing}
      />
    <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
      {/* 섹션 1: 개요 */}
      <section aria-labelledby="section-overview" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="section-overview" className="text-base font-semibold">
            개요
          </h2>
          <button
            type="button"
            aria-label="개요 섹션 AI 수정요청"
            onClick={() => {
              setActiveSection(activeSection === 'overview' ? null : 'overview')
              setAiInstruction('')
            }}
            className="rounded px-2 py-0.5 text-xs"
            style={{
              background: activeSection === 'overview' ? 'oklch(0.58 0.18 150 / 0.18)' : 'transparent',
              color: 'oklch(0.58 0.18 150)',
              border: '1px solid oklch(0.58 0.18 150 / 0.4)',
            }}
          >
            AI 수정요청
          </button>
        </div>
        {activeSection === 'overview' && (
          <div
            className="flex gap-2 rounded-md p-3"
            style={{ background: 'oklch(0.14 0.01 280)', border: '1px solid var(--color-border)' }}
          >
            <input
              type="text"
              autoFocus
              placeholder="수정 지시사항을 입력하세요"
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleAiSubmit('overview')
                }
                if (e.key === 'Escape') {
                  setActiveSection(null)
                  setAiInstruction('')
                }
              }}
              className="flex-1 rounded border bg-transparent px-2 py-1 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              disabled={aiSubmitting}
            />
            <button
              type="button"
              onClick={() => void handleAiSubmit('overview')}
              disabled={aiSubmitting || !aiInstruction.trim()}
              className="rounded px-3 py-1 text-xs font-medium"
              style={{
                background: 'oklch(0.58 0.18 150)',
                color: 'oklch(0.10 0.01 280)',
                opacity: aiSubmitting || !aiInstruction.trim() ? 0.5 : 1,
              }}
            >
              {aiSubmitting ? '...' : '요청'}
            </button>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="input-title">제목</Label>
          <Input
            id="input-title"
            data-testid="input-title"
            value={typeof formData.title === 'string' ? formData.title : ''}
            onChange={(e) => handleChange('title', e.target.value)}
            aria-invalid={!!fieldErrors.title?.length}
          />
          {fieldErrors.title?.map((msg) => (
            <p key={msg} className="text-sm text-destructive">
              {msg}
            </p>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="input-description">설명</Label>
          <Textarea
            id="input-description"
            data-testid="input-description"
            value={typeof formData.description === 'string' ? formData.description : ''}
            onChange={(e) => handleChange('description', e.target.value)}
            aria-invalid={!!fieldErrors.description?.length}
          />
          {fieldErrors.description?.map((msg) => (
            <p key={msg} className="text-sm text-destructive">
              {msg}
            </p>
          ))}
        </div>
      </section>

      {/* 섹션 2: 문제와 해결방안 */}
      <section aria-labelledby="section-problem" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="section-problem" className="text-base font-semibold">
            문제와 해결방안
          </h2>
          <button
            type="button"
            aria-label="문제와 해결방안 섹션 AI 수정요청"
            onClick={() => {
              setActiveSection(activeSection === 'problemAndSolution' ? null : 'problemAndSolution')
              setAiInstruction('')
            }}
            className="rounded px-2 py-0.5 text-xs"
            style={{
              background: activeSection === 'problemAndSolution' ? 'oklch(0.58 0.18 150 / 0.18)' : 'transparent',
              color: 'oklch(0.58 0.18 150)',
              border: '1px solid oklch(0.58 0.18 150 / 0.4)',
            }}
          >
            AI 수정요청
          </button>
        </div>
        {activeSection === 'problemAndSolution' && (
          <div
            className="flex gap-2 rounded-md p-3"
            style={{ background: 'oklch(0.14 0.01 280)', border: '1px solid var(--color-border)' }}
          >
            <input
              type="text"
              autoFocus
              placeholder="수정 지시사항을 입력하세요"
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleAiSubmit('problemAndSolution')
                }
                if (e.key === 'Escape') {
                  setActiveSection(null)
                  setAiInstruction('')
                }
              }}
              className="flex-1 rounded border bg-transparent px-2 py-1 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              disabled={aiSubmitting}
            />
            <button
              type="button"
              onClick={() => void handleAiSubmit('problemAndSolution')}
              disabled={aiSubmitting || !aiInstruction.trim()}
              className="rounded px-3 py-1 text-xs font-medium"
              style={{
                background: 'oklch(0.58 0.18 150)',
                color: 'oklch(0.10 0.01 280)',
                opacity: aiSubmitting || !aiInstruction.trim() ? 0.5 : 1,
              }}
            >
              {aiSubmitting ? '...' : '요청'}
            </button>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="input-problemAndSolution">내용</Label>
          <Textarea
            id="input-problemAndSolution"
            data-testid="input-problemAndSolution"
            value={
              typeof formData.problemAndSolution === 'string'
                ? formData.problemAndSolution
                : ''
            }
            onChange={(e) => handleChange('problemAndSolution', e.target.value)}
          />
        </div>
      </section>

      {/* 섹션 3: 타겟과 시나리오 */}
      <section aria-labelledby="section-target" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="section-target" className="text-base font-semibold">
            타겟과 시나리오
          </h2>
          <button
            type="button"
            aria-label="타겟과 시나리오 섹션 AI 수정요청"
            onClick={() => {
              setActiveSection(activeSection === 'targetAndScenario' ? null : 'targetAndScenario')
              setAiInstruction('')
            }}
            className="rounded px-2 py-0.5 text-xs"
            style={{
              background: activeSection === 'targetAndScenario' ? 'oklch(0.58 0.18 150 / 0.18)' : 'transparent',
              color: 'oklch(0.58 0.18 150)',
              border: '1px solid oklch(0.58 0.18 150 / 0.4)',
            }}
          >
            AI 수정요청
          </button>
        </div>
        {activeSection === 'targetAndScenario' && (
          <div
            className="flex gap-2 rounded-md p-3"
            style={{ background: 'oklch(0.14 0.01 280)', border: '1px solid var(--color-border)' }}
          >
            <input
              type="text"
              autoFocus
              placeholder="수정 지시사항을 입력하세요"
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleAiSubmit('targetAndScenario')
                }
                if (e.key === 'Escape') {
                  setActiveSection(null)
                  setAiInstruction('')
                }
              }}
              className="flex-1 rounded border bg-transparent px-2 py-1 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              disabled={aiSubmitting}
            />
            <button
              type="button"
              onClick={() => void handleAiSubmit('targetAndScenario')}
              disabled={aiSubmitting || !aiInstruction.trim()}
              className="rounded px-3 py-1 text-xs font-medium"
              style={{
                background: 'oklch(0.58 0.18 150)',
                color: 'oklch(0.10 0.01 280)',
                opacity: aiSubmitting || !aiInstruction.trim() ? 0.5 : 1,
              }}
            >
              {aiSubmitting ? '...' : '요청'}
            </button>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="input-targetAndScenario">내용</Label>
          <Textarea
            id="input-targetAndScenario"
            data-testid="input-targetAndScenario"
            value={
              typeof formData.targetAndScenario === 'string'
                ? formData.targetAndScenario
                : ''
            }
            onChange={(e) => handleChange('targetAndScenario', e.target.value)}
          />
        </div>
      </section>

      {/* 섹션 4: 성공지표와 위험요소 */}
      <section aria-labelledby="section-success" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="section-success" className="text-base font-semibold">
            성공지표와 위험요소
          </h2>
          <button
            type="button"
            aria-label="성공지표와 위험요소 섹션 AI 수정요청"
            onClick={() => {
              setActiveSection(activeSection === 'successAndRisk' ? null : 'successAndRisk')
              setAiInstruction('')
            }}
            className="rounded px-2 py-0.5 text-xs"
            style={{
              background: activeSection === 'successAndRisk' ? 'oklch(0.58 0.18 150 / 0.18)' : 'transparent',
              color: 'oklch(0.58 0.18 150)',
              border: '1px solid oklch(0.58 0.18 150 / 0.4)',
            }}
          >
            AI 수정요청
          </button>
        </div>
        {activeSection === 'successAndRisk' && (
          <div
            className="flex gap-2 rounded-md p-3"
            style={{ background: 'oklch(0.14 0.01 280)', border: '1px solid var(--color-border)' }}
          >
            <input
              type="text"
              autoFocus
              placeholder="수정 지시사항을 입력하세요"
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleAiSubmit('successAndRisk')
                }
                if (e.key === 'Escape') {
                  setActiveSection(null)
                  setAiInstruction('')
                }
              }}
              className="flex-1 rounded border bg-transparent px-2 py-1 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              disabled={aiSubmitting}
            />
            <button
              type="button"
              onClick={() => void handleAiSubmit('successAndRisk')}
              disabled={aiSubmitting || !aiInstruction.trim()}
              className="rounded px-3 py-1 text-xs font-medium"
              style={{
                background: 'oklch(0.58 0.18 150)',
                color: 'oklch(0.10 0.01 280)',
                opacity: aiSubmitting || !aiInstruction.trim() ? 0.5 : 1,
              }}
            >
              {aiSubmitting ? '...' : '요청'}
            </button>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="input-successAndRisk">내용</Label>
          <Textarea
            id="input-successAndRisk"
            data-testid="input-successAndRisk"
            value={
              typeof formData.successAndRisk === 'string' ? formData.successAndRisk : ''
            }
            onChange={(e) => handleChange('successAndRisk', e.target.value)}
          />
        </div>
      </section>

      {/* 섹션 5: 속성설정 (읽기 전용) */}
      <section aria-labelledby="section-attributes" className="space-y-4">
        <h2 id="section-attributes" className="text-base font-semibold">
          속성설정
        </h2>
        <div className="space-y-2">
          <Label htmlFor="input-roles">역할 (roles)</Label>
          <Input
            id="input-roles"
            data-testid="input-roles"
            value={Array.isArray(formData.roles) ? formData.roles.join(', ') : ''}
            readOnly
            className="cursor-not-allowed bg-muted text-muted-foreground"
            aria-label="역할 목록 (편집 불가)"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="input-devices">디바이스 (devices)</Label>
          <Input
            id="input-devices"
            data-testid="input-devices"
            value={Array.isArray(formData.devices) ? formData.devices.join(', ') : ''}
            readOnly
            className="cursor-not-allowed bg-muted text-muted-foreground"
            aria-label="디바이스 목록 (편집 불가)"
          />
        </div>
      </section>

      {/* 저장 버튼 */}
      <div className="flex items-center gap-4">
        <SaveButton
          status={hasErrors ? 'error' : saveStatus}
          disabled={hasErrors}
          data-testid="save-button"
        />
      </div>
    </form>

      {/* 인라인 토스트 (04B-04 Task 3) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md px-4 py-2 text-sm shadow-lg"
          style={{
            background: 'oklch(0.18 0.01 280)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
