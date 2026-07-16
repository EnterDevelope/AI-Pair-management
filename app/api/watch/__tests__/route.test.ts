// SSE Route Handler 테스트 — node 환경 (기본값)
// chokidar를 mock해 실제 파일 감시 없이 테스트
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock은 호이스팅됨 — 팩토리 안에서 변수 참조 불가. vi.hoisted()로 mock 객체 생성
const { mockWatcherClose, mockWatcherOn, mockWatcherInstance, mockChokidarWatch } = vi.hoisted(
  () => {
    const mockWatcherClose = vi.fn()
    const mockWatcherOn = vi.fn()
    const mockWatcherInstance = {
      on: mockWatcherOn,
      close: mockWatcherClose,
    }
    mockWatcherOn.mockReturnValue(mockWatcherInstance)

    const mockChokidarWatch = vi.fn().mockReturnValue(mockWatcherInstance)

    return { mockWatcherClose, mockWatcherOn, mockWatcherInstance, mockChokidarWatch }
  }
)

vi.mock('chokidar', () => ({
  default: {
    watch: mockChokidarWatch,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockWatcherOn.mockReturnValue(mockWatcherInstance)
  mockChokidarWatch.mockReturnValue(mockWatcherInstance)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/watch', () => {
  it('dynamic export가 force-dynamic이다', async () => {
    const mod = await import('../route')
    expect(mod.dynamic).toBe('force-dynamic')
  })

  it('SSE 스트림을 열고 Content-Type: text/event-stream 헤더를 반환한다', async () => {
    const { GET } = await import('../route')

    const abortController = new AbortController()
    const req = new Request('http://localhost/api/watch', {
      signal: abortController.signal,
    })

    const res = await GET(req as never)

    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
    expect(res.headers.get('Connection')).toBe('keep-alive')

    // 스트림 취소 (테스트 hang 방지)
    abortController.abort()
  })

  it('change 이벤트 트리거 시 스트림에 type:change 청크가 enqueue된다', async () => {
    const { GET } = await import('../route')

    const abortController = new AbortController()
    const req = new Request('http://localhost/api/watch', {
      signal: abortController.signal,
    })

    const res = await GET(req as never)

    // watcher.on('change', handler) 호출 확인
    expect(mockWatcherOn).toHaveBeenCalledWith('change', expect.any(Function))

    // 등록된 change 핸들러를 직접 호출해 청크 생성 트리거
    const changeHandler = mockWatcherOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'change'
    )?.[1] as ((path: string) => void) | undefined
    expect(changeHandler).toBeDefined()

    const reader = res.body!.getReader()
    changeHandler!('/some/path/graph/prd.json')

    // 첫 번째 청크 읽기
    const { value, done } = await reader.read()
    expect(done).toBe(false)
    const text = new TextDecoder().decode(value)
    expect(text).toContain('data:')
    expect(text).toContain('"type":"change"')

    abortController.abort()
    reader.cancel()
  })

  it('req abort 시 watcher.close()가 호출된다(누수 정리)', async () => {
    const { GET } = await import('../route')

    const abortController = new AbortController()
    const req = new Request('http://localhost/api/watch', {
      signal: abortController.signal,
    })

    await GET(req as never)

    // abort 전에는 close 미호출
    expect(mockWatcherClose).not.toHaveBeenCalled()

    // abort 발생 — signal abort 이벤트 핸들러가 동기적으로 실행
    abortController.abort()

    expect(mockWatcherClose).toHaveBeenCalledOnce()
  })

  it('?project=<id>의 해당 프로젝트 파일을 감시한다 (CR-03 — 편집 파일과 일치)', async () => {
    const { GET } = await import('../route')

    const abortController = new AbortController()
    const req = new Request('http://localhost/api/watch?project=sub', {
      signal: abortController.signal,
    })

    await GET(req as never)

    // 감시 대상이 sub 프로젝트의 prd.json·project.json인지 확인
    const targets = mockChokidarWatch.mock.calls[0]?.[0] as string[] | undefined
    expect(targets).toBeDefined()
    expect(targets!.some((t) => t.endsWith('sub/graph/prd.json'))).toBe(true)
    expect(targets!.some((t) => t.endsWith('sub/project.json'))).toBe(true)

    abortController.abort()
  })

  it('?project=../escape 같은 path traversal은 400으로 거부한다 (CR-03 보안)', async () => {
    const { GET } = await import('../route')

    const req = new Request('http://localhost/api/watch?project=../escape', {
      signal: new AbortController().signal,
    })

    const res = await GET(req as never)

    expect(res.status).toBe(400)
    // 거부 시 watcher를 생성하지 않는다
    expect(mockChokidarWatch).not.toHaveBeenCalled()
  })
})
