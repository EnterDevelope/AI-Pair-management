'use client'

// useSseWatcher — SSE 파일 변경 감시 훅 (02A-03)
// - /api/watch에 EventSource 연결
// - 변경 이벤트 수신 시:
//   · isDirty=true  → onExternalChange() (D-03 편집 보호: 배너로 사용자 결정 요청)
//   · isDirty=false → onCleanChange() (VIEW-03 자동 갱신: 충돌 없으니 조용히 리로드)
// - 컴포넌트 언마운트 시 EventSource.close() 정리

import { useEffect, useRef } from 'react'

interface UseSseWatcherOptions {
  /** 감시할 프로젝트 id — 편집 중인 프로젝트와 동일해야 한다(CR-03, D-03) */
  projectId: string
  /** isDirty ref — 외부에서 관리하는 ref를 그대로 전달 */
  isDirtyRef: React.RefObject<boolean>
  /** SSE change 이벤트 수신 + isDirty=true일 때 호출 (편집 충돌 → 배너) */
  onExternalChange: () => void
  /** SSE change 이벤트 수신 + isDirty=false일 때 호출 (충돌 없음 → 자동 갱신) */
  onCleanChange?: () => void
  /** SSE add/unlink 이벤트 수신 시 호출 — 큐 파일 추가·삭제 알림 (04B-04 Task 3) */
  onQueueEvent?: (event: { type: 'add' | 'unlink'; path: string }) => void
}

export function useSseWatcher({
  projectId,
  isDirtyRef,
  onExternalChange,
  onCleanChange,
  onQueueEvent,
}: UseSseWatcherOptions) {
  // 핸들러 최신 참조를 ref로 유지 — useEffect 재구독 없이 항상 최신 핸들러 호출
  const onExternalChangeRef = useRef(onExternalChange)
  onExternalChangeRef.current = onExternalChange
  const onCleanChangeRef = useRef(onCleanChange)
  onCleanChangeRef.current = onCleanChange
  const onQueueEventRef = useRef(onQueueEvent)
  onQueueEventRef.current = onQueueEvent

  useEffect(() => {
    // 편집 중인 프로젝트의 파일을 감시한다 — watch 라우트가 API 라우트와 동일한
    // 프로젝트 경로 규칙으로 대상을 구성하므로 편집 파일과 감시 파일이 일치한다(CR-03).
    const es = new EventSource(`/api/watch?project=${encodeURIComponent(projectId)}`)

    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { type: string; path: string }
        if (data.type === 'add' || data.type === 'unlink') {
          // 큐 파일 추가·삭제 이벤트 — 구독자에게 전달 (04B-04 Task 3)
          onQueueEventRef.current?.({ type: data.type as 'add' | 'unlink', path: data.path })
          return
        }
        if (data.type !== 'change') return
        if (isDirtyRef.current) {
          // 편집 중 — 사용자 편집을 덮어쓰지 않도록 배너로 결정을 위임(D-03)
          onExternalChangeRef.current()
        } else {
          // 편집 안 함 — 충돌이 없으니 최신본으로 조용히 자동 갱신(VIEW-03)
          onCleanChangeRef.current?.()
        }
      } catch {
        // JSON 파싱 실패는 무시 (불완전한 청크 등)
      }
    }

    return () => {
      es.close()
    }
    // isDirtyRef는 ref object — 참조가 변하지 않으므로 deps 불필요. projectId 변경 시 재구독.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])
}
