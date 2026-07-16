// ============================================================
// 큐 쓰기 POST API 라우트 (04B-02-PLAN.md Task 1)
// ============================================================
// POST /api/projects/[id]/queue → .aipm/queue/<timestamp>-<requestId>.json 적재
//
// 보안: resolveProjectDir(null 변형)으로 path traversal 차단 (watch/route.ts 패턴)
// 정합: write-file-atomic으로 tmp→rename 원자 쓰기 (큐는 append-only, proper-lockfile 불필요)
// 에러: ELOCKED 분기 없음(고유 파일명이라 충돌 없음), 그 외 throw (절대 삼키지 않음)
// deriveDocs: 큐 쓰기는 누적만 — apply-runner가 호출하는 몫, 여기서 호출 안 함
// ============================================================

import { NextResponse } from 'next/server'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import writeFileAtomic from 'write-file-atomic'

import { FeaturesSchema } from '@/schemas/graph/features'
import { PrdSchema } from '@/schemas/graph/prd'
import { UserflowSchema } from '@/schemas/graph/userflow'
import { QueueCreateRequestSchema, type QueueTargetArtifact } from '@/schemas/queue'
import { computeContentHash } from '@/lib/content-hash'
import { extractTargetSubtree, TargetNotFoundError } from '@/lib/extract-subtree'

/**
 * [id] 파라미터를 검증해 프로젝트 디렉토리 절대 경로를 반환한다.
 * base 디렉토리 밖으로 나가는 path traversal을 차단한다.
 * 잘못된 경로면 null 반환 (watch/route.ts 패턴 — 큐는 append-only라 throw 불필요).
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

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function logServerError(stage: string, targetArtifact: QueueTargetArtifact | undefined, error: unknown) {
  console.error('[queue] 서버 처리 실패', {
    stage,
    targetArtifact,
    code: (error as NodeJS.ErrnoException).code,
    errorType: error instanceof Error ? error.name : 'UnknownError',
  })
}

async function loadTargetSubtree(
  projectDir: string,
  targetArtifact: QueueTargetArtifact,
  targetId: string
): Promise<unknown> {
  switch (targetArtifact) {
    case 'features': {
      const raw = await fs.readFile(path.join(projectDir, 'graph', 'features.json'), 'utf8')
      return extractTargetSubtree(targetArtifact, FeaturesSchema.parse(JSON.parse(raw)), targetId)
    }
    case 'flow': {
      const raw = await fs.readFile(path.join(projectDir, 'graph', 'userflow.json'), 'utf8')
      return extractTargetSubtree(targetArtifact, UserflowSchema.parse(JSON.parse(raw)), targetId)
    }
    case 'prd': {
      const raw = await fs.readFile(path.join(projectDir, 'graph', 'prd.json'), 'utf8')
      return extractTargetSubtree(targetArtifact, PrdSchema.parse(JSON.parse(raw)), targetId)
    }
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params // Next.js 16: params는 Promise — 반드시 await (Pitfall 4)

  // path traversal 검증
  const projectDir = resolveProjectDir(id)
  if (projectDir === null) {
    return NextResponse.json({ error: '유효하지 않은 프로젝트 경로예요.' }, { status: 400 })
  }

  // body 파싱
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없어요.' }, { status: 400 })
  }

  // Zod 검증 — 실패 시 422 + fieldErrors
  const parseResult = QueueCreateRequestSchema.safeParse(body)
  if (!parseResult.success) {
    const { fieldErrors, formErrors } = parseResult.error.flatten()
    return NextResponse.json({ fieldErrors, formErrors }, { status: 422 })
  }

  const createRequest = parseResult.data

  let subtree: unknown
  try {
    subtree = await loadTargetSubtree(
      projectDir,
      createRequest.targetArtifact,
      createRequest.targetId
    )
  } catch (error) {
    if (error instanceof TargetNotFoundError || isMissingFile(error)) {
      return NextResponse.json({ error: '수정할 산출물 또는 항목을 찾을 수 없어요.' }, { status: 404 })
    }
    logServerError('read-target', createRequest.targetArtifact, error)
    return NextResponse.json({ error: '수정요청을 준비하지 못했어요.' }, { status: 500 })
  }

  // looseObject가 보존한 클라이언트 baseVersion보다 서버 계산값을 마지막에 덮어쓴다.
  const data = {
    ...createRequest,
    baseVersion: computeContentHash(subtree),
  }

  // 파일명: {createdAt sanitized}-{requestId}.json (타임스탬프 선두 → 자연 정렬 = apply 처리 순서)
  const sanitizedAt = data.createdAt.replace(/[:.]/g, '-')
  const filename = `${sanitizedAt}-${data.requestId}.json`
  const queueDir = path.join(projectDir, '.aipm', 'queue')
  const queuePath = path.join(queueDir, filename)

  // .aipm/queue/ 디렉토리 보장 (없으면 생성)
  try {
    await fs.mkdir(queueDir, { recursive: true })

    // write-file-atomic: tmp→rename 원자 쓰기 (큐는 고유 파일명 append-only — proper-lockfile 불필요)
    await writeFileAtomic(queuePath, JSON.stringify(data, null, 2), { encoding: 'utf8' })
  } catch (error) {
    logServerError('write-queue', data.targetArtifact, error)
    return NextResponse.json({ error: '수정요청을 저장하지 못했어요.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, requestId: data.requestId, filename }, { status: 201 })
}

// ============================================================
// 큐 카운트 GET (04B-04 Task 4 후속 — 배지 재수화)
// ============================================================
// GET /api/projects/[id]/queue → { count } (.aipm/queue/*.json 개수)
// SSE(watch)는 ignoreInitial:true라 mount 시 기존 큐를 통보하지 않는다.
// 컴포넌트가 mount/네비게이션/새로고침 시 이 GET으로 대기 카운트를 1회 재수화한다.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params // Next.js 16: params는 Promise — 반드시 await (Pitfall 4)

  // path traversal 검증
  const projectDir = resolveProjectDir(id)
  if (projectDir === null) {
    return NextResponse.json({ error: '유효하지 않은 프로젝트 경로예요.' }, { status: 400 })
  }

  const queueDir = path.join(projectDir, '.aipm', 'queue')

  // 큐 디렉토리 미존재(요청 0건)는 정상 — count 0 반환 (그 외 에러는 throw, 삼키지 않음)
  let count = 0
  try {
    const entries = await fs.readdir(queueDir)
    count = entries.filter((f) => f.endsWith('.json')).length
  } catch (err) {
    if (!isMissingFile(err)) {
      logServerError('read-queue-count', undefined, err)
      return NextResponse.json({ error: '대기 중인 요청을 확인하지 못했어요.' }, { status: 500 })
    }
  }

  return NextResponse.json({ count }, { status: 200 })
}
