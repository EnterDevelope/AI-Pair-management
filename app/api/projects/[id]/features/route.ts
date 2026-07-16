// Features read/write API route (03-03-PLAN.md Task 1)
//
// GET  /api/projects/[id]/features → graph/features.json 반환
// POST /api/projects/[id]/features → Zod 검증 → atomic-write → deriveDocs
//
// 보안: resolveProjectDir로 path traversal 차단 (T-03-PT)
// 정합: writeGraphFile(atomic-write) + deriveDocs(doc-deriver) 재사용
// 에러: ELOCKED → 423, 그 외 → throw(500) (Pitfall 7, T-03-LK)

import { NextResponse } from 'next/server'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { writeGraphFile } from '@/lib/atomic-write'
import { FeaturesSchema } from '@/schemas/graph/features'
import { deriveDocs } from '../../../../../scripts/doc-deriver'

/**
 * [id] 파라미터를 검증해 프로젝트 디렉토리 절대 경로를 반환한다.
 * base 디렉토리 밖으로 나가는 path traversal을 차단한다 (T-03-PT).
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

  const featuresPath = path.join(projectDir, 'graph', 'features.json')

  let raw: string
  try {
    raw = await fs.readFile(featuresPath, 'utf8')
  } catch {
    return NextResponse.json({ error: '기능명세 파일을 찾을 수 없어요.' }, { status: 404 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(`[features GET] JSON 파싱 실패: ${featuresPath}`, err)
    return NextResponse.json({ error: '기능명세 파일 형식이 올바르지 않아요.' }, { status: 422 })
  }

  const result = FeaturesSchema.safeParse(parsed)
  if (!result.success) {
    console.error(`[features GET] 기능명세 스키마 검증 실패: ${featuresPath}`, result.error.issues)
    return NextResponse.json({ error: '기능명세 파일 형식이 올바르지 않아요.' }, { status: 422 })
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

  const featuresPath = path.join(projectDir, 'graph', 'features.json')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없어요.' }, { status: 400 })
  }

  const rawFeatures = (body as { features?: unknown })?.features

  // Zod 검증 — 실패 시 422 + fieldErrors (T-03-IN prototype pollution 방어)
  const parseResult = FeaturesSchema.safeParse(rawFeatures)
  if (!parseResult.success) {
    const { fieldErrors, formErrors } = parseResult.error.flatten()
    return NextResponse.json({ fieldErrors, formErrors }, { status: 422 })
  }

  // 미지 필드 보존: 원본 객체에 검증된 데이터를 spread해 되쓴다
  const toWrite = { ...(rawFeatures as object), ...parseResult.data }

  try {
    // atomic-write + 락 (retries:0 — 즉시 ELOCKED)
    await writeGraphFile(featuresPath, toWrite)
    // D-02: doc-deriver 재사용 — PM 문서 5종 동기 재생성
    await deriveDocs(projectDir)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ELOCKED') {
      // T-03-LK: 락 충돌 → 423 (다른 에러는 절대 423 아님 — Pitfall 7)
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
