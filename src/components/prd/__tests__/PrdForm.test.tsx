// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

// EventSource mock — jsdom에 없음. useSseWatcher가 PrdForm에 통합됨(02A-03)
const mockEsClose = vi.fn()
class MockEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  close = mockEsClose
  addEventListener = vi.fn()
}

// fetch mock — 전역에서 교체
const mockFetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ ok: true }), { status: 200 })
)

beforeEach(() => {
  vi.useFakeTimers()
  globalThis.EventSource = MockEventSource as unknown as typeof EventSource
  globalThis.fetch = mockFetch
  mockFetch.mockClear()
  mockEsClose.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const VALID_PRD = {
  schemaVersion: '1.0' as const,
  id: 'R-AAAAAA',
  title: '테스트 제품',
  description: '테스트 설명',
  roles: ['PM', '개발자'],
  devices: ['mobile', 'desktop'],
}

// PrdForm이 없으면 import가 실패해 RED 상태 — 구현 후 green
import { PrdForm } from '../PrdForm'

describe('PrdForm', () => {
  it('5개 섹션 라벨(개요/문제와 해결방안/타겟과 시나리오/성공지표와 위험요소/속성설정)을 렌더한다', () => {
    render(<PrdForm projectId="test-project" initialPrd={VALID_PRD} />)

    expect(screen.getByText('개요')).toBeDefined()
    expect(screen.getByText('문제와 해결방안')).toBeDefined()
    expect(screen.getByText('타겟과 시나리오')).toBeDefined()
    expect(screen.getByText('성공지표와 위험요소')).toBeDefined()
    expect(screen.getByText('속성설정')).toBeDefined()
  })

  it('유효 입력 변경 후 500ms 경과 시 fetch POST가 1회 호출되고 body에 {prd:...}가 포함된다', async () => {
    render(<PrdForm projectId="test-project" initialPrd={VALID_PRD} />)

    const titleInput = screen.getByTestId('input-title')
    fireEvent.change(titleInput, { target: { value: '수정된 제목' } })

    // 500ms 전 — fetch 미호출
    expect(mockFetch).not.toHaveBeenCalled()

    // 500ms 경과
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [_url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string) as { prd: unknown }
    expect(body.prd).toBeDefined()
  })

  it('Zod 검증 위반(id 형식 오류) 시 인라인 에러가 표시되고 저장 버튼이 비활성화된다', async () => {
    const badPrd = { ...VALID_PRD, id: 'BAD-ID' }
    render(<PrdForm projectId="test-project" initialPrd={badPrd} />)

    const titleInput = screen.getByTestId('input-title')
    fireEvent.change(titleInput, { target: { value: '수정' } })

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    // fetch가 호출되지 않아야 한다 (검증 실패 → 저장 차단)
    expect(mockFetch).not.toHaveBeenCalled()
    // 저장 버튼이 비활성
    const saveBtn = screen.getByTestId('save-button')
    expect(saveBtn.hasAttribute('disabled')).toBe(true)
  })

  it('roles/devices 필드는 readOnly로 표시된다(편집 불가)', () => {
    render(<PrdForm projectId="test-project" initialPrd={VALID_PRD} />)

    const rolesField = screen.getByTestId('input-roles')
    const devicesField = screen.getByTestId('input-devices')

    expect(rolesField.hasAttribute('readonly') || rolesField.hasAttribute('readOnly')).toBe(true)
    expect(devicesField.hasAttribute('readonly') || devicesField.hasAttribute('readOnly')).toBe(true)
  })

  it('AI 수정요청 POST body에는 baseVersion을 보내지 않는다', async () => {
    render(<PrdForm projectId="test-project" initialPrd={VALID_PRD} />)
    fireEvent.click(screen.getByLabelText('개요 섹션 AI 수정요청'))
    fireEvent.change(screen.getByPlaceholderText('수정 지시사항을 입력하세요'), {
      target: { value: '개요를 짧게 정리해줘' },
    })
    await act(async () => {
      fireEvent.click(screen.getByText('요청'))
    })

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string) as Record<string, unknown>
    expect(url).toContain('/queue')
    expect(body.baseVersion).toBeUndefined()
    expect(body.targetArtifact).toBe('prd')
  })

  it('AI 수정요청 실패 시 사용자에게 오류 토스트를 표시한다', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFetch.mockRejectedValueOnce(new Error('network down'))
    render(<PrdForm projectId="test-project" initialPrd={VALID_PRD} />)
    fireEvent.click(screen.getByLabelText('개요 섹션 AI 수정요청'))
    fireEvent.change(screen.getByPlaceholderText('수정 지시사항을 입력하세요'), {
      target: { value: '개요를 짧게 정리해줘' },
    })
    await act(async () => {
      fireEvent.click(screen.getByText('요청'))
    })

    expect(screen.getByText('AI 수정요청을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.'))
      .toBeDefined()
    consoleSpy.mockRestore()
  })
})
