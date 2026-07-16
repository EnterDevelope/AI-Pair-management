// PRD read/write API route (02A-02-PLAN.md Task 1)
//
// GET  /api/projects/[id]/prd → graph/prd.json 반환
// POST /api/projects/[id]/prd → Zod 검증 → atomic-write → deriveDocs
//
// 보안: resolveProjectDir로 path traversal 차단 (T-02A-04)
// 정합: writeGraphFile(atomic-write) + deriveDocs(doc-deriver) 재사용 (D-02)
// 에러: ELOCKED → 423, 그 외 → throw(500) (Pitfall 7, T-02A-05)

import { NextResponse } from 'next/server'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { writeGraphFile } from '@/lib/atomic-write'
import { PrdSchema } from '@/schemas/graph/prd'
import { deriveDocs } from '../../../../../scripts/doc-deriver'

/**
 * [id] 파라미터를 검증해 프로젝트 디렉토리 절대 경로를 반환한다.
 * base 디렉토리 밖으로 나가는 path traversal을 차단한다 (T-02A-04).
 */
function resolveProjectDir(id: string): string {
  const base = process.env.AIPM_PROJECT_DIR ?? process.cwd()
  const resolved = path.resolve(base, id)
  const normalizedBase = path.resolve(base)

  // prefix 검증: resolved가 base 하위인지 확인
  if (resolved !== normalizedBase && !resolved.startsWith(normalizedBase + path.sep)) {
    throw Object.assign(new Error('유효하지 않은 프로젝트 경로예요.'), { status: 400 })
  }

  return resolved
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  let projectDir: string

  try {
    projectDir = resolveProjectDir(id)
  } catch {
    return NextResponse.json({ error: '유효하지 않은 프로젝트 경로예요.' }, { status: 400 })
  }

  const prdPath = path.join(projectDir, 'graph', 'prd.json')

  let raw: string
  try {
    raw = await fs.readFile(prdPath, 'utf8')
  } catch {
    return NextResponse.json({ error: 'PRD 파일을 찾을 수 없어요.' }, { status: 404 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    // 디스크 prd.json 손상은 서버 결함이 아니라 데이터 상태 문제 → 422. 원인은 기록(WR-06, CLAUDE.md)
    console.error(`[prd GET] JSON 파싱 실패: ${prdPath}`, err)
    return NextResponse.json({ error: 'PRD 파일 형식이 올바르지 않아요.' }, { status: 422 })
  }

  const result = PrdSchema.safeParse(parsed)
  if (!result.success) {
    console.error(`[prd GET] PRD 스키마 검증 실패: ${prdPath}`, result.error.issues)
    return NextResponse.json({ error: 'PRD 파일 형식이 올바르지 않아요.' }, { status: 422 })
  }

  return NextResponse.json(result.data)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  let projectDir: string

  try {
    projectDir = resolveProjectDir(id)
  } catch {
    return NextResponse.json({ error: '유효하지 않은 프로젝트 경로예요.' }, { status: 400 })
  }

  const prdPath = path.join(projectDir, 'graph', 'prd.json')

  // Pitfall 4: proper-lockfile은 대상 파일이 존재해야 락 가능 — 미리 확인
  try {
    await fs.access(prdPath)
  } catch {
    return NextResponse.json({ error: 'PRD 파일을 찾을 수 없어요.' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없어요.' }, { status: 400 })
  }

  const rawPrd = (body as { prd?: unknown })?.prd

  // Zod 검증 — 실패 시 400 + fieldErrors (T-02A-03 prototype pollution 방어)
  const parseResult = PrdSchema.safeParse(rawPrd)
  if (!parseResult.success) {
    const { fieldErrors, formErrors } = parseResult.error.flatten()
    return NextResponse.json({ fieldErrors, formErrors }, { status: 400 })
  }

  // 미지 필드 보존: 원본 객체에 검증된 데이터를 spread해 되쓴다
  const toWrite = { ...(rawPrd as object), ...parseResult.data }

  try {
    // atomic-write + 락 (retries:0 — 즉시 ELOCKED)
    await writeGraphFile(prdPath, toWrite)
    // D-02: doc-deriver 재사용 — PM 문서 5종 동기 재생성
    await deriveDocs(projectDir)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ELOCKED') {
      // T-02A-05: 락 충돌 → 423 (다른 에러는 절대 423 아님 — Pitfall 7)
      return NextResponse.json(
        { error: '다른 프로세스가 이 파일을 수정 중이에요. 잠시 후 다시 시도해 주세요.' },
        { status: 423 }
      )
    }
    // 그 외 에러는 throw로 전파 → 500 (절대 삼키지 않음)
    throw err
  }

  return NextResponse.json({ ok: true })
}
