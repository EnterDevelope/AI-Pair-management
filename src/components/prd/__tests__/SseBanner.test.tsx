// @vitest-environment jsdom
// SseBanner + useSseWatcher + PrdForm 통합 테스트 (D-03 편집 보호)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

// EventSource mock — jsdom에 없음
const mockEsClose = vi.fn()
const mockEsAddEventListener = vi.fn()
let capturedOnMessage: ((e: MessageEvent) => void) | null = null

class MockEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  readyState = MockEventSource.OPEN
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  close = mockEsClose
  addEventListener = mockEsAddEventListener

  constructor(_url: string) {
    // 생성 직후 onmessage 참조를 캡처할 수 있도록 큐
    // 테스트에서 triggerChange()로 메시지 발행
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    currentMockEs = this
  }
}

let currentMockEs: MockEventSource | null = null

// fetch mock
const mockFetch = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  currentMockEs = null
  capturedOnMessage = null
  mockEsClose.mockClear()
  mockFetch.mockClear()
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 })
  )
  globalThis.EventSource = MockEventSource as unknown as typeof EventSource
  globalThis.fetch = mockFetch
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  currentMockEs = null
})

// 테스트 헬퍼 — SSE change 이벤트 발행
function triggerSseChange(filePath = '/some/graph/prd.json') {
  if (!currentMockEs) throw new Error('MockEventSource not created yet')
  const event = { data: JSON.stringify({ type: 'change', path: filePath }) } as MessageEvent
  if (currentMockEs.onmessage) {
    currentMockEs.onmessage(event)
  }
  capturedOnMessage = currentMockEs.onmessage
}

const VALID_PRD = {
  schemaVersion: '1.0' as const,
  id: 'R-AAAAAA',
  title: '테스트 제품',
  description: '테스트 설명',
  roles: ['PM'],
  devices: ['mobile'],
}

// PrdForm을 통해 SseBanner + useSseWatcher 통합 테스트
// 파일이 없으면 import 실패 → RED 상태
import { PrdForm } from '../PrdForm'

describe('SseBanner + useSseWatcher (D-03 편집 보호)', () => {
  it('isDirty=false 상태에서 SSE change 이벤트 → 배너 미표시', () => {
    render(<PrdForm projectId="test-project" initialPrd={VALID_PRD} />)

    // 폼 수정 없이 SSE change 트리거 (isDirty=false)
    act(() => {
      triggerSseChange()
    })

    // 배너 본문 카피가 없어야 함
    expect(screen.queryByText('하네스가 이 PRD를 변경했어요. 어떻게 처리할까요?')).toBeNull()
  })

  it('isDirty=false 상태에서 SSE change 이벤트 → 배너 없이 폼 자동 갱신(GET fetch + 최신값 반영, VIEW-03)', async () => {
    // 클린 상태에서 하네스가 외부 변경 → 폼이 최신본으로 자동 갱신되어야 한다
    const updatedPrd = { ...VALID_PRD, title: '하네스 자동갱신 제목' }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(updatedPrd), { status: 200 })
    )

    render(<PrdForm projectId="test-project" initialPrd={VALID_PRD} />)
    const titleInput = screen.getByTestId('input-title') as HTMLInputElement
    expect(titleInput.value).toBe('테스트 제품')

    // 편집하지 않은 상태(isDirty=false)에서 SSE change 발행
    await act(async () => {
      triggerSseChange()
    })

    // 배너는 뜨지 않아야 한다 (충돌 없음 — 조용히 갱신)
    expect(screen.queryByText('하네스가 이 PRD를 변경했어요. 어떻게 처리할까요?')).toBeNull()

    // GET fetch로 디스크 최신본을 읽어 폼이 자동 갱신되어야 한다
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit | undefined]
    expect(url).toContain('/api/projects/')
    expect(url).toContain('/prd')
    expect(options?.method ?? 'GET').toBe('GET')
    expect(titleInput.value).toBe('하네스 자동갱신 제목')
  })

  it('isDirty=true 상태에서 SSE change 이벤트 → 배너 표시(본문 카피 + 두 액션 버튼)', async () => {
    render(<PrdForm projectId="test-project" initialPrd={VALID_PRD} />)

    // 폼 수정 → isDirty=true
    const titleInput = screen.getByTestId('input-title')
    fireEvent.change(titleInput, { target: { value: '수정된 제목' } })

    // SSE change 트리거
    act(() => {
      triggerSseChange()
    })

    // 배너 표시 확인
    expect(screen.getByText('하네스가 이 PRD를 변경했어요. 어떻게 처리할까요?')).toBeDefined()
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeDefined()
    expect(screen.getByRole('button', { name: '내 편집 유지' })).toBeDefined()
  })

  it('"내 편집 유지" 클릭 → 배너 닫힘, 폼 편집값 보존(덮어쓰기 없음)', async () => {
    render(<PrdForm projectId="test-project" initialPrd={VALID_PRD} />)

    const titleInput = screen.getByTestId('input-title')
    fireEvent.change(titleInput, { target: { value: '수정된 제목' } })

    act(() => {
      triggerSseChange()
    })

    // 배너 표시 확인
    expect(screen.getByText('하네스가 이 PRD를 변경했어요. 어떻게 처리할까요?')).toBeDefined()

    // "내 편집 유지" 클릭
    fireEvent.click(screen.getByRole('button', { name: '내 편집 유지' }))

    // 배너 닫힘
    expect(screen.queryByText('하네스가 이 PRD를 변경했어요. 어떻게 처리할까요?')).toBeNull()

    // 폼 편집값 보존 — title이 수정된 제목 그대로
    expect((titleInput as HTMLInputElement).value).toBe('수정된 제목')

    // 덮어쓰기 fetch 미호출 (디바운스 전이므로 500ms 미경과 상태에서 확인)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('"다시 불러오기" 클릭 → GET fetch 호출 + 폼 리셋, 배너 닫힘', async () => {
    // GET fetch가 최신 PRD 반환
    const updatedPrd = { ...VALID_PRD, title: '하네스가 수정한 제목' }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(updatedPrd), { status: 200 })
    )

    render(<PrdForm projectId="test-project" initialPrd={VALID_PRD} />)

    const titleInput = screen.getByTestId('input-title')
    fireEvent.change(titleInput, { target: { value: '사용자 수정중' } })

    act(() => {
      triggerSseChange()
    })

    // 배너 표시 확인
    expect(screen.getByText('하네스가 이 PRD를 변경했어요. 어떻게 처리할까요?')).toBeDefined()

    // "다시 불러오기" 클릭
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    })

    // GET fetch 호출 확인
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit | undefined]
    expect(url).toContain('/api/projects/')
    expect(url).toContain('/prd')
    expect(options?.method ?? 'GET').toBe('GET')

    // 배너 닫힘
    expect(screen.queryByText('하네스가 이 PRD를 변경했어요. 어떻게 처리할까요?')).toBeNull()
  })

  it('언마운트 시 EventSource.close()가 호출된다', () => {
    const { unmount } = render(<PrdForm projectId="test-project" initialPrd={VALID_PRD} />)

    expect(currentMockEs).toBeTruthy()

    unmount()

    expect(mockEsClose).toHaveBeenCalledOnce()
  })
})
