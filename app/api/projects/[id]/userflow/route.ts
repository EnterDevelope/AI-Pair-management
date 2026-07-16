// Userflow read/write API route (04A-04-PLAN.md Task 1)
//
// GET   /api/projects/[id]/userflow → graph/userflow.json 반환
// POST  /api/projects/[id]/userflow → Zod 검증 → atomic-write → deriveDocs
// PATCH /api/projects/[id]/userflow → 부분 업데이트 (노드/엣지) → atomic-write → deriveDocs
//
// 보안: resolveProjectDir로 path traversal 차단
// 정합: writeGraphFile(atomic-write) + deriveDocs(doc-deriver) 재사용
// 에러: ELOCKED → 423, 그 외 → throw(500) (Pitfall 7)

import { NextResponse } from 'next/server'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'

import { writeGraphFile } from '@/lib/atomic-write'
import { UserflowSchema } from '@/schemas/graph/userflow'
import { deriveDocs } from '../../../../../scripts/doc-deriver'

const UserflowPatchSchema = z.looseObject({
  nodes: z.array(z.looseObject({ id: z.string().min(1) })).optional(),
  edges: z.array(z.looseObject({ id: z.string().min(1) })).optional(),
  versions: z.array(z.looseObject({ id: z.string().min(1) })).optional(),
  versionGroups: z.array(z.looseObject({ id: z.string().min(1) })).optional(),
  deletedNodeIds: z.array(z.string().min(1)).optional(),
  deletedEdgeIds: z.array(z.string().min(1)).optional(),
})

/**
 * [id] 파라미터를 검증해 프로젝트 디렉토리 절대 경로를 반환한다.
 * base 디렉토리 밖으로 나가는 path traversal을 차단한다.
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

  const userflowPath = path.join(projectDir, 'graph', 'userflow.json')

  let raw: string
  try {
    raw = await fs.readFile(userflowPath, 'utf8')
  } catch {
    return NextResponse.json({ error: '유저플로우 파일을 찾을 수 없어요.' }, { status: 404 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(`[userflow GET] JSON 파싱 실패: ${userflowPath}`, err)
    return NextResponse.json({ error: '유저플로우 파일 형식이 올바르지 않아요.' }, { status: 422 })
  }

  const result = UserflowSchema.safeParse(parsed)
  if (!result.success) {
    console.error(`[userflow GET] 스키마 검증 실패: ${userflowPath}`, result.error.issues)
    return NextResponse.json({ error: '유저플로우 파일 형식이 올바르지 않아요.' }, { status: 422 })
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

  const userflowPath = path.join(projectDir, 'graph', 'userflow.json')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없어요.' }, { status: 400 })
  }

  const rawUserflow = (body as { userflow?: unknown })?.userflow

  // Zod 검증 — 실패 시 422 + fieldErrors
  const parseResult = UserflowSchema.safeParse(rawUserflow)
  if (!parseResult.success) {
    const flat = parseResult.error.flatten()
    return NextResponse.json(
      { fieldErrors: flat.fieldErrors, formErrors: flat.formErrors },
      { status: 422 }
    )
  }

  // 미지 필드 보존: 원본 객체에 검증된 데이터를 spread해 되쓴다
  const toWrite = { ...(rawUserflow as object), ...parseResult.data }

  try {
    // atomic-write + 락 (즉시 ELOCKED)
    await writeGraphFile(userflowPath, toWrite)
    // doc-deriver 재사용 — USERFLOW.md 동기 재생성
    await deriveDocs(projectDir)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ELOCKED') {
      // 락 충돌 → 423 (다른 에러는 절대 423 아님 — Pitfall 7)
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

export async function PATCH(
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

  const userflowPath = path.join(projectDir, 'graph', 'userflow.json')

  // 현재 파일 읽기 (없으면 404)
  let raw: string
  try {
    raw = await fs.readFile(userflowPath, 'utf8')
  } catch {
    return NextResponse.json({ error: '유저플로우 파일을 찾을 수 없어요.' }, { status: 404 })
  }

  let existing: unknown
  try {
    existing = JSON.parse(raw)
  } catch (err) {
    console.error(`[userflow PATCH] JSON 파싱 실패: ${userflowPath}`, err)
    return NextResponse.json({ error: '유저플로우 파일 형식이 올바르지 않아요.' }, { status: 422 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없어요.' }, { status: 400 })
  }

  const patchResult = UserflowPatchSchema.safeParse(body)
  if (!patchResult.success) {
    const flat = patchResult.error.flatten()
    return NextResponse.json(
      { fieldErrors: flat.fieldErrors, formErrors: flat.formErrors },
      { status: 422 }
    )
  }
  const patch = patchResult.data

  // 기존 데이터에 패치 적용 — 노드/엣지는 id 기준 머지, 버전/그룹은 id 기준 머지 (Rule 2: 추가)
  const existingObj = existing as {
    schemaVersion?: string
    nodes?: Array<{ id?: string; [key: string]: unknown }>
    edges?: Array<{ id?: string; [key: string]: unknown }>
    versions?: Array<{ id?: string; [key: string]: unknown }>
    versionGroups?: Array<{ id?: string; [key: string]: unknown }>
    [key: string]: unknown
  }

  const deletedNodeIds = new Set(patch.deletedNodeIds ?? [])
  let mergedNodes = (existingObj.nodes ?? []).filter(
    (node) => node.id == null || !deletedNodeIds.has(node.id)
  )
  if (patch.nodes && patch.nodes.length > 0) {
    const patchMap = new Map(patch.nodes.map((n) => [n.id, n]))
    mergedNodes = mergedNodes.map((n) =>
      n.id && patchMap.has(n.id) ? { ...n, ...patchMap.get(n.id) } : n
    )
    // 기존에 없는 id는 추가
    for (const pn of patch.nodes) {
      if (!mergedNodes.some((n) => n.id === pn.id)) {
        mergedNodes = [...mergedNodes, pn]
      }
    }
  }

  const deletedEdgeIds = new Set(patch.deletedEdgeIds ?? [])
  let mergedEdges = (existingObj.edges ?? []).filter(
    (edge) => edge.id == null || !deletedEdgeIds.has(edge.id)
  )
  if (patch.edges && patch.edges.length > 0) {
    const patchEdgeMap = new Map(patch.edges.map((e) => [e.id, e]))
    mergedEdges = mergedEdges.map((e) =>
      e.id && patchEdgeMap.has(e.id) ? { ...e, ...patchEdgeMap.get(e.id) } : e
    )
    // 기존에 없는 id는 추가
    for (const pe of patch.edges) {
      if (!mergedEdges.some((e) => e.id === pe.id)) {
        mergedEdges = [...mergedEdges, pe]
      }
    }
  }

  // versions: id 기준 머지 (없는 id는 추가) — VersionPanel 영속화에 필요
  let mergedVersions = existingObj.versions ?? []
  if (patch.versions && patch.versions.length > 0) {
    const patchVersionMap = new Map(patch.versions.map((v) => [v.id, v]))
    mergedVersions = mergedVersions.map((v) =>
      v.id && patchVersionMap.has(v.id) ? { ...v, ...patchVersionMap.get(v.id) } : v
    )
    for (const pv of patch.versions) {
      if (!mergedVersions.some((v) => v.id === pv.id)) {
        mergedVersions = [...mergedVersions, pv]
      }
    }
  }

  // versionGroups: id 기준 머지 (없는 id는 추가) — VersionPanel 영속화에 필요
  let mergedVersionGroups = existingObj.versionGroups ?? []
  if (patch.versionGroups && patch.versionGroups.length > 0) {
    const patchGroupMap = new Map(patch.versionGroups.map((g) => [g.id, g]))
    mergedVersionGroups = mergedVersionGroups.map((g) =>
      g.id && patchGroupMap.has(g.id) ? { ...g, ...patchGroupMap.get(g.id) } : g
    )
    for (const pg of patch.versionGroups) {
      if (!mergedVersionGroups.some((g) => g.id === pg.id)) {
        mergedVersionGroups = [...mergedVersionGroups, pg]
      }
    }
  }

  const merged = {
    ...existingObj,
    nodes: mergedNodes,
    edges: mergedEdges,
    ...(mergedVersions.length > 0 ? { versions: mergedVersions } : {}),
    ...(mergedVersionGroups.length > 0 ? { versionGroups: mergedVersionGroups } : {}),
  }

  // 머지 결과 Zod 검증
  const parseResult = UserflowSchema.safeParse(merged)
  if (!parseResult.success) {
    const flat = parseResult.error.flatten()
    return NextResponse.json(
      { fieldErrors: flat.fieldErrors, formErrors: flat.formErrors },
      { status: 422 }
    )
  }

  const toWrite = { ...merged, ...parseResult.data }

  try {
    await writeGraphFile(userflowPath, toWrite)
    await deriveDocs(projectDir)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ELOCKED') {
      return NextResponse.json(
        { error: '다른 프로세스가 이 파일을 수정 중이에요. 잠시 후 다시 시도해 주세요.' },
        { status: 423 }
      )
    }
    throw err
  }

  return NextResponse.json({ ok: true })
}
