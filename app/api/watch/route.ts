import chokidar from 'chokidar'
import { type NextRequest } from 'next/server'
import path from 'node:path'

// Next.js 정적 최적화 방지 — 없으면 SSE가 즉시 닫힘 (Pitfall 2)
export const dynamic = 'force-dynamic'

/**
 * API 라우트(/api/projects/[id]/prd)와 동일한 프로젝트 경로 해석 + path traversal 차단.
 * 편집 중인 프로젝트와 감시 대상이 일치하도록 동일 규칙을 쓴다 (CR-03, D-03, T-02A-04).
 * 잘못된 경로면 null 반환.
 */
function resolveProjectDir(id: string): string | null {
  const base = process.env.AIPM_PROJECT_DIR ?? process.cwd()
  const resolved = path.resolve(base, id)
  const normalizedBase = path.resolve(base)
  if (resolved !== normalizedBase && !resolved.startsWith(normalizedBase + path.sep)) {
    return null
  }
  return resolved
}

export async function GET(req: NextRequest) {
  // 편집 중인 프로젝트 id를 받아 해당 프로젝트의 파일을 감시한다(CR-03).
  // new URL(req.url)은 NextRequest·표준 Request 양쪽에서 동작(nextUrl 의존 회피).
  const id = new URL(req.url).searchParams.get('project') ?? ''
  const projectDir = resolveProjectDir(id)
  if (projectDir === null) {
    return new Response('유효하지 않은 프로젝트 경로예요.', { status: 400 })
  }

  const watchTargets = [
    path.join(projectDir, 'graph/prd.json'),
    path.join(projectDir, 'graph/features.json'),
    path.join(projectDir, 'graph/userflow.json'),
    // ROOT의 project.json (graph/ 하위 아님)
    path.join(projectDir, 'project.json'),
    // 큐 요청 파일 감시 — 추가/삭제 이벤트로 UI 실시간 반영 (04B-02)
    path.join(projectDir, '.aipm/queue'),
  ]

  // 정리는 한 번만 — abort/cancel 어느 경로로 와도 idempotent (WR-03/04)
  let watcher: ReturnType<typeof chokidar.watch> | null = null
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    watcher?.close()
    watcher = null
  }

  const stream = new ReadableStream({
    start(controller) {
      // watcher는 ReadableStream.start() 안에서 생성 — 모듈 레벨 싱글턴 금지 (Pitfall 1 HMR 누수)
      watcher = chokidar.watch(watchTargets, {
        ignoreInitial: true,
        persistent: true,
      })

      watcher.on('change', (changedPath: string) => {
        const event = `data: ${JSON.stringify({ type: 'change', path: changedPath })}\n\n`
        controller.enqueue(new TextEncoder().encode(event))
      })

      // 큐 파일 추가 이벤트 — AI 수정요청이 큐에 적재될 때 UI에 알림 (04B-02)
      watcher.on('add', (addedPath: string) => {
        const event = `data: ${JSON.stringify({ type: 'add', path: addedPath })}\n\n`
        controller.enqueue(new TextEncoder().encode(event))
      })

      // 큐 파일 삭제 이벤트 — apply-runner가 처리 후 이관할 때 UI에 알림 (04B-02)
      watcher.on('unlink', (removedPath: string) => {
        const event = `data: ${JSON.stringify({ type: 'unlink', path: removedPath })}\n\n`
        controller.enqueue(new TextEncoder().encode(event))
      })

      // 클라이언트 disconnect(abort) 시 watcher + stream 정리 (메모리 누수 방지, T-02A-07)
      req.signal.addEventListener('abort', () => {
        cleanup()
        try {
          controller.close()
        } catch {
          // 이미 닫힌/에러 상태의 컨트롤러 — close() throw 무시 (WR-04)
        }
      })
    },
    // 컨슈머가 stream을 취소하는 경로(abort 미발생)에서도 watcher 정리 (WR-03)
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
