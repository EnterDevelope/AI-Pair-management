// ============================================================
// scripts/flow-generator.ts — 유저플로우 생성 엔진 (04A-02-PLAN.md)
// ============================================================
// 목적: PRD 기반 section->page->action 3단계 파이프라인 생성 +
//       Zod 3회 재시도 + ID 고정 병합
//
// 설계 (feature-generator.ts 골격 재사용 — 새 병합 로직 발명 금지):
// - validateUserflowWithRetry(generator, extraCheck?): Zod safeParse 루프, max 3회
// - 단계 분할: Step1 generateSections → Step2 generatePages(per-section) → Step3 P-ID 배정
// - applyUserflowMergePolicy(current, proposed, mode): codex/force
// - generateUserflow(projectDir, mode): 오케스트레이터
//
// 보안:
// - JSON.parse만 사용 (AI 응답 파싱에 eval 계열 금지)
// - MAX_ATTEMPTS=3 고정 (환경변수·설정으로 변경 불가)
//
// 불변성:
// - 모든 객체 변환은 { ...spread } 사용, 원본 변경 금지
//
// Pitfall 5: versionId는 모든 nodes AND edges에 반드시 존재해야 한다.
//   (태그 없는 요소는 버전 필터에서 빈 배열 반환)
// Pitfall 6: page/section 노드 ID는 공유 usedIds Set으로 중복 방지
// ============================================================

import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { UserflowSchema } from "../src/schemas/graph/userflow.js"
import type { Userflow } from "../src/schemas/graph/userflow.js"
import { PrdSchema } from "../src/schemas/graph/prd.js"
import { FeaturesSchema } from "../src/schemas/graph/features.js"
import { generateId } from "../src/lib/id.js"
import { writeGraphFile } from "../src/lib/atomic-write.js"
import { deriveDocs } from "./doc-deriver.js"

// ESM __filename 재현 (isMain 비교용)
const __filename = fileURLToPath(import.meta.url)

// T-xx: 재시도 횟수는 3회 고정 — 환경변수 노출 금지
const MAX_ATTEMPTS = 3

// ============================================================
// 타입 정의
// ============================================================

/** applyUserflowMergePolicy 병합 모드 */
export type MergeMode = "codex" | "force" | "approve"

// ============================================================
// validateUserflowWithRetry
// ============================================================

/**
 * userflow 생성 함수를 최대 3회 호출하며 Zod 스키마 검증을 시도한다.
 * extraCheck가 주어지면 스키마 통과 후 추가 검증을 수행한다.
 *
 * @param generator - Userflow 객체를 반환하는 (비)동기 함수
 * @param extraCheck - 추가 검증. 실패 시 에러 메시지 문자열, 통과 시 null
 * @returns 검증된 Userflow 객체
 * @throws 3회 모두 실패 시 한국어 에러 메시지 Error
 */
export async function validateUserflowWithRetry(
  generator: () => Promise<Userflow> | Userflow,
  extraCheck?: (userflow: Userflow) => string | null
): Promise<Userflow> {
  let lastError = ""

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const raw = await generator()
    const result = UserflowSchema.safeParse(raw)
    if (!result.success) {
      lastError = result.error.message
      continue
    }
    const extraError = extraCheck?.(result.data) ?? null
    if (extraError != null) {
      lastError = extraError
      continue
    }
    return result.data
  }

  throw new Error(`유저플로우 스키마 검증 실패 (${MAX_ATTEMPTS}회): ${lastError}`)
}

// ============================================================
// applyUserflowMergePolicy
// ============================================================

/**
 * 병합 정책 모드에 따라 current userflow에 proposed를 합친다.
 *
 * - codex: 기존 노드/엣지 ID 고정 + 신규만 추가
 * - force: nodes/edges 전체를 proposed로 덮어씀
 *
 * 불변성: 원본 current를 변경하지 않고 새 객체를 반환
 */
export function applyUserflowMergePolicy(
  current: Userflow,
  proposed: Userflow,
  mode: MergeMode
): Userflow {
  const currentNodes = current.nodes ?? []
  const proposedNodes = proposed.nodes ?? []
  const currentEdges = current.edges ?? []
  const proposedEdges = proposed.edges ?? []
  // versions/versionGroups도 병합 대상 — 누락하면 생성된 버전이 파일에 저장되지 않아
  // VersionPanel 드롭다운·수정본 만들기(FLOW-04)가 동작하지 않는다.
  const currentVersions = current.versions ?? []
  const proposedVersions = proposed.versions ?? []
  const currentGroups = current.versionGroups ?? []
  const proposedGroups = proposed.versionGroups ?? []

  if (mode === "force") {
    return {
      ...current,
      nodes: proposedNodes.map((n) => ({ ...n })),
      edges: proposedEdges.map((e) => ({ ...e })),
      versions: proposedVersions.map((v) => ({ ...v })),
      versionGroups: proposedGroups.map((g) => ({ ...g })),
    }
  }

  // codex/approve 모드: 기존 ID 고정 + 신규만 추가 (versions/versionGroups도 동일 정책)
  const currentNodeIds = new Set(currentNodes.map((n) => n.id).filter(Boolean))
  const addedNodes = proposedNodes
    .filter((n) => n.id == null || !currentNodeIds.has(n.id))
    .map((n) => ({ ...n }))

  const currentEdgeIds = new Set(currentEdges.map((e) => e.id).filter(Boolean))
  const addedEdges = proposedEdges
    .filter((e) => e.id == null || !currentEdgeIds.has(e.id))
    .map((e) => ({ ...e }))

  const currentVersionIds = new Set(currentVersions.map((v) => v.id).filter(Boolean))
  const addedVersions = proposedVersions
    .filter((v) => v.id == null || !currentVersionIds.has(v.id))
    .map((v) => ({ ...v }))

  const currentGroupIds = new Set(currentGroups.map((g) => g.id).filter(Boolean))
  const addedGroups = proposedGroups
    .filter((g) => g.id == null || !currentGroupIds.has(g.id))
    .map((g) => ({ ...g }))

  return {
    ...current,
    nodes: [...currentNodes.map((n) => ({ ...n })), ...addedNodes],
    edges: [...currentEdges.map((e) => ({ ...e })), ...addedEdges],
    versions: [...currentVersions.map((v) => ({ ...v })), ...addedVersions],
    versionGroups: [...currentGroups.map((g) => ({ ...g })), ...addedGroups],
  }
}

// ============================================================
// generateUserflow — 오케스트레이터
// ============================================================

/**
 * PRD를 읽어 section->page->action 3단계 파이프라인으로 userflow.json을 생성하고
 * 병합 정책 적용 후 graph/userflow.json 저장 + docs 파생까지 수행한다.
 *
 * @param projectDir - 프로젝트 디렉토리 절대경로
 * @param mode - 병합 모드 ("codex" | "force" | "approve")
 * @returns 저장된 Userflow 객체
 * @throws prd.json overview 없으면 한국어 에러 throw
 */
export async function generateUserflow(
  projectDir: string,
  mode: MergeMode
): Promise<Userflow> {
  // 1. prd.json 읽기 + 검증 (의존성 게이트)
  const prdPath = path.join(projectDir, "graph", "prd.json")
  let prdOverview: string
  let prdTitle: string
  try {
    const raw = await fs.readFile(prdPath, "utf8")
    const parsed = PrdSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      throw new Error(parsed.error.message)
    }
    const prd = parsed.data
    // overview는 문자열(레거시) 또는 {summary: string} 객체(D-06 구조 PRD) 둘 다 허용.
    // PrdSchema가 z.unknown()이라 런타임 형태를 좁혀 텍스트를 추출한다.
    const overviewRaw: unknown = prd.overview
    let overviewText = ""
    if (typeof overviewRaw === "string") {
      overviewText = overviewRaw
    } else if (
      overviewRaw !== null &&
      typeof overviewRaw === "object" &&
      typeof (overviewRaw as { summary?: unknown }).summary === "string"
    ) {
      overviewText = (overviewRaw as { summary: string }).summary
    }
    if (overviewText.trim() === "") {
      throw new Error("prd.overview 없음")
    }
    prdOverview = overviewText
    prdTitle = prd.title ?? "제품"
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `유저플로우 생성 실패: 먼저 /aipm prd를 실행하세요. (${detail})`
    )
  }

  // 2. features.json 읽기 (없거나 파싱 실패 시 graceful skip — featureId 태깅만 생략)
  let featureItems: Array<{ id: string; title?: string }> = []
  try {
    const featuresPath = path.join(projectDir, "graph", "features.json")
    const rawFeatures = await fs.readFile(featuresPath, "utf8")
    const parsedFeatures = FeaturesSchema.safeParse(JSON.parse(rawFeatures))
    if (parsedFeatures.success) {
      featureItems = (parsedFeatures.data.items ?? [])
        .filter((i) => i.id.startsWith("F-"))
        .map((i) => ({ id: i.id, title: i.title }))
    }
  } catch {
    // 파일 없거나 파싱 실패 — featureId 태깅 없이 진행
  }

  // 3. 기존 userflow.json 읽기 (ID 고정 제약)
  const userflowPath = path.join(projectDir, "graph", "userflow.json")
  let existing: Userflow = { schemaVersion: "1.0" }
  try {
    const rawUserflow = await fs.readFile(userflowPath, "utf8")
    const parsedUserflow = UserflowSchema.safeParse(JSON.parse(rawUserflow))
    if (parsedUserflow.success) {
      existing = parsedUserflow.data
    }
  } catch {
    // 파일 없거나 파싱 실패 — 빈 상태에서 시작
  }

  // 4. versionId 생성 (이 실행의 버전 태그)
  const versionId = `v-${Date.now()}`

  // 5. Pitfall 6: page/section 노드 ID 공유 usedIds Set (중복 방지)
  const usedIds = new Set<string>()
  // 기존 노드 ID를 usedIds에 등록
  for (const node of existing.nodes ?? []) {
    if (node.id) usedIds.add(node.id)
  }

  // 6. Step1: section 레인 생성
  //    PRD overview를 기반으로 2-3개 섹션 파생 (결정론적)
  const sectionDefs = deriveSections(prdTitle, prdOverview)

  const sectionNodes: Userflow["nodes"] = sectionDefs.map((def) => {
    const id = generateId("P", usedIds)
    usedIds.add(id)
    return {
      type: "section" as const,
      id,
      label: def.label,
      versionId,
    }
  })

  // 7. Step2: 각 section별 page 노드 생성
  const pageNodes: Userflow["nodes"] = []
  const edges: Userflow["edges"] = []

  // start 노드 — 진입점.
  // sectionId를 첫 섹션에 부여해 스윔레인 레이아웃(섹션별 배치)이 start를
  // 1번 레인 진입 노드로 배치하게 한다. 없으면 레이아웃이 섹션 없는 노드를
  // 드롭해 start 노드와 start->첫 페이지 엣지가 렌더되지 않는다.
  const startId = generateId("P", usedIds)
  usedIds.add(startId)
  const startNode: NonNullable<Userflow["nodes"]>[number] = {
    type: "start" as const,
    id: startId,
    label: "시작",
    versionId,
    ...(sectionNodes[0]?.id ? { sectionId: sectionNodes[0].id } : {}),
  }

  for (let si = 0; si < sectionDefs.length; si++) {
    const sectionNode = sectionNodes[si]
    if (!sectionNode) continue
    const sectionId = sectionNode.id

    const pageDefs = derivePages(sectionDefs[si]!, featureItems)

    for (let pi = 0; pi < pageDefs.length; pi++) {
      const id = generateId("P", usedIds)
      usedIds.add(id)

      // featureId 태깅: features.json의 F- 항목과 매핑 (페이지 인덱스 순서로 순환 배정)
      const featureId =
        featureItems.length > 0
          ? (featureItems[pi % featureItems.length]?.id ?? undefined)
          : undefined

      const pageNode: NonNullable<Userflow["nodes"]>[number] = {
        type: "page" as const,
        id,
        label: pageDefs[pi]!.label,
        sectionId,
        versionId,
        ...(featureId != null ? { featureId } : {}),
      }
      pageNodes.push(pageNode)

      // 엣지: 섹션 내 페이지 간 순서 연결
      if (pi > 0) {
        const prevPage = pageNodes[pageNodes.length - 2]
        if (prevPage?.id) {
          const edgeId = generateId("P", usedIds)
          usedIds.add(edgeId)
          edges.push({
            id: edgeId,
            source: prevPage.id,
            target: id,
            versionId, // Pitfall 5: 엣지에도 versionId 필수
          })
        }
      }
    }

    // 섹션 간 엣지: start -> 첫 번째 섹션의 첫 페이지
    if (si === 0 && pageNodes.length > 0 && pageNodes[0]?.id) {
      const edgeId = generateId("P", usedIds)
      usedIds.add(edgeId)
      edges.push({
        id: edgeId,
        source: startId,
        target: pageNodes[0].id,
        versionId,
      })
    }
  }

  // 8. proposed userflow 조립
  const proposed: Userflow = {
    schemaVersion: "1.0",
    versions: [{ id: versionId, label: `생성 ${new Date().toISOString().slice(0, 10)}` }],
    nodes: [startNode, ...sectionNodes, ...pageNodes],
    edges,
  }

  // 9. Zod 검증
  const validated = await validateUserflowWithRetry(() => proposed)

  // 10. 병합 정책 적용
  const merged = applyUserflowMergePolicy(existing, validated, mode)

  // 11. 원자 저장 (fs.access 선생성 — atomic-write는 파일이 존재해야 가능)
  try {
    await fs.access(userflowPath)
  } catch {
    await fs.writeFile(
      userflowPath,
      JSON.stringify({ schemaVersion: "1.0" }) + "\n",
      "utf8"
    )
  }
  await writeGraphFile(userflowPath, merged)

  // 12. docs 파생 (USERFLOW.md 포함 — deriveDocs가 내부에서 처리)
  await deriveDocs(projectDir)

  return merged
}

// ============================================================
// 내부 파생 헬퍼 (결정론적 — PRD 텍스트 기반)
// ============================================================

interface SectionDef {
  label: string
}

interface PageDef {
  label: string
}

/**
 * PRD 개요 텍스트를 기반으로 섹션(레인) 정의를 결정론적으로 파생한다.
 * AI 호출 없음 — 단순 텍스트 분석으로 2-3개 섹션 생성.
 */
function deriveSections(title: string, overview: string): SectionDef[] {
  // 기본 섹션: 인증/핵심/설정 3레인 패턴 (결정론적 기본값)
  const sections: SectionDef[] = [
    { label: `${title} 진입` },
    { label: `${title} 핵심 플로우` },
    { label: `${title} 설정` },
  ]

  // overview 키워드 기반 추가 섹션 힌트 (선택적)
  if (overview.includes("대시보드") || overview.includes("dashboard")) {
    sections[1] = { label: "대시보드 플로우" }
  }
  if (overview.includes("결제") || overview.includes("payment")) {
    sections.push({ label: "결제 플로우" })
  }

  return sections
}

/**
 * 섹션 정의 + features를 기반으로 페이지 정의를 결정론적으로 파생한다.
 */
function derivePages(
  section: SectionDef,
  featureItems: Array<{ id: string; title?: string }>
): PageDef[] {
  const label = section.label

  // 진입/인증 섹션
  if (label.includes("진입") || label.includes("인증") || label.includes("로그인")) {
    return [
      { label: "랜딩 페이지" },
      { label: "로그인" },
      { label: "회원가입" },
    ]
  }

  // 핵심 플로우 섹션 — features에서 파생
  if (label.includes("핵심") || label.includes("플로우") || label.includes("대시보드")) {
    if (featureItems.length > 0) {
      return featureItems.slice(0, 3).map((f) => ({
        label: f.title ?? f.id,
      }))
    }
    return [
      { label: "메인 화면" },
      { label: "상세 화면" },
      { label: "결과 화면" },
    ]
  }

  // 설정/결제 섹션
  if (label.includes("설정") || label.includes("결제") || label.includes("payment")) {
    return [
      { label: "설정 메인" },
      { label: "프로필 편집" },
    ]
  }

  // 기본값: 2페이지
  return [
    { label: `${label} 메인` },
    { label: `${label} 상세` },
  ]
}

// ============================================================
// CLI 진입점 — process.argv[2]=projectDir, [3]=mode
// ============================================================

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(__filename)

if (isMain) {
  const projectDir = process.argv[2]
  const modeArg = process.argv[3] ?? "codex"

  if (projectDir == null || projectDir.length === 0) {
    console.error(
      "사용법: npx tsx scripts/flow-generator.ts <프로젝트경로> [codex|force|approve]"
    )
    process.exit(1)
  }
  if (modeArg !== "codex" && modeArg !== "force" && modeArg !== "approve") {
    console.error(`알 수 없는 모드: ${modeArg} (codex|force|approve 중 하나)`)
    process.exit(1)
  }

  generateUserflow(projectDir, modeArg)
    .then((result) => {
      const count = result.nodes?.length ?? 0
      console.log(`유저플로우 생성 완료: ${count}개 노드 (모드: ${modeArg})`)
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`유저플로우 생성 실패: ${message}`)
      process.exit(1)
    })
}
