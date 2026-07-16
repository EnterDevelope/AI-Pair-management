// ============================================================
// scripts/feature-generator.ts — 기능명세 생성 엔진 (03-02-PLAN.md)
// ============================================================
// 목적: PRD 기반 R→F→S 3단 위계 단계 분할 생성 + Zod 3회 재시도 + ID 고정 병합
//
// 설계 (prd-generator.ts 골격 재사용 — D-13, 새 병합 로직 발명 금지):
// - validateFeaturesWithRetry(generator, extraCheck?): Zod safeParse 루프, max 3회
// - 단계 분할(D-01): generateRequirements → generateFeatures → generateSpecs
// - applyFeaturesMergePolicy(current, proposed, mode, approvedIds?): codex/force/approve
// - generateFeatureSpec(projectDir, mode): 오케스트레이터 — 읽기 → 3단계 생성 → 병합
//   → writeGraphFile → deriveDocs
//
// 보안:
// - T-03-01: JSON.parse만 사용 (AI 응답 파싱에 eval 계열 금지)
// - T-03-03: MAX_ATTEMPTS=3 고정 (환경변수·설정으로 변경 불가)
//
// 불변성:
// - 모든 객체 변환은 { ...spread } 사용, 원본 변경 금지
// ============================================================

import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { FeaturesSchema } from "../src/schemas/graph/features.js"
import type { Features } from "../src/schemas/graph/features.js"
import { PrdSchema } from "../src/schemas/graph/prd.js"
import type { Prd } from "../src/schemas/graph/prd.js"
import { ProjectSchema } from "../src/schemas/project.js"
import { generateId, extractIds } from "../src/lib/id.js"
import { writeGraphFile } from "../src/lib/atomic-write.js"
import { deriveDocs } from "./doc-deriver.js"

// ESM __filename 재현 (isMain 비교용)
const __filename = fileURLToPath(import.meta.url)

// T-03-03: 재시도 횟수는 3회 고정 — 환경변수 노출 금지
const MAX_ATTEMPTS = 3

// ============================================================
// 타입 정의
// ============================================================

/** features.json items 단일 항목 타입 (FeaturesSchema 파생) */
export type FeatureItem = NonNullable<Features["items"]>[number]

/** applyFeaturesMergePolicy 병합 모드 (prd-generator MergeMode 동형, D-14) */
export type MergeMode = "codex" | "force" | "approve"

/** 단계 분할 생성기 주입 계약 (D-01) — 테스트·세션 주입 가능 */
export interface StageGenerators {
  generateRequirements: (
    prd: Prd,
    existing: ReadonlyArray<FeatureItem>
  ) => Promise<FeatureItem[]> | FeatureItem[]
  generateFeatures: (
    requirements: ReadonlyArray<FeatureItem>,
    roles: ReadonlyArray<string>,
    existing: ReadonlyArray<FeatureItem>
  ) => Promise<FeatureItem[]> | FeatureItem[]
  generateSpecs: (
    features: ReadonlyArray<FeatureItem>,
    existing: ReadonlyArray<FeatureItem>
  ) => Promise<FeatureItem[]> | FeatureItem[]
}

/** generateFeatureSpec 옵션 */
export interface GenerateFeatureSpecOptions {
  generators?: Partial<StageGenerators>
  approvedIds?: ReadonlyArray<string>
}

// ============================================================
// validateFeaturesWithRetry
// ============================================================

/**
 * features 생성 함수를 최대 3회 호출하며 Zod 스키마 검증을 시도한다.
 * extraCheck가 주어지면 스키마 통과 후 추가 검증(예: 역할 부분집합 D-03)을
 * 수행하고, 에러 문자열을 반환하면 재시도한다.
 *
 * T-03-03: MAX_ATTEMPTS는 항상 3 (환경변수·설정으로 변경 불가)
 *
 * @param generator - Features 객체를 반환하는 (비)동기 함수
 * @param extraCheck - 추가 검증. 실패 시 에러 메시지 문자열, 통과 시 null
 * @returns 검증된 Features 객체
 * @throws 3회 모두 실패 시 한국어 에러 메시지 Error
 */
export async function validateFeaturesWithRetry(
  generator: () => Promise<Features> | Features,
  extraCheck?: (features: Features) => string | null
): Promise<Features> {
  let lastError = ""

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const raw = await generator()
    const result = FeaturesSchema.safeParse(raw)
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

  throw new Error(`기능명세 스키마 검증 실패 (${MAX_ATTEMPTS}회): ${lastError}`)
}

// ============================================================
// 기본 단계 생성기 (D-01 — 결정론적 파생)
// ============================================================

/**
 * PRD에서 요구사항(R) 목록을 결정론적으로 파생한다.
 *
 * - 소스: prd.problemAndSolution.features (Phase 1 매핑표의 coreFeatures)
 * - 각 R에 Given/When/Then 수용기준 생성 (D-02, FEAT-03)
 * - 기존 항목은 제목 일치 시 그대로 보존 (D-13 ID 고정), 신규만 새 ID (FEAT-02)
 *
 * @param prd - 검증된 PRD 객체
 * @param existing - 기존 features.json의 R 항목 (고정 제약)
 * @returns R 항목 배열
 */
export function generateRequirements(
  prd: Prd,
  existing: ReadonlyArray<FeatureItem> = []
): FeatureItem[] {
  const pas = (prd.problemAndSolution ?? {}) as Record<string, unknown>
  const sourceFeatures = Array.isArray(pas.features)
    ? (pas.features as unknown[]).filter((f): f is string => typeof f === "string")
    : []

  const existingR = existing.filter((i) => i.id.startsWith("R-"))
  const byTitle = new Map(existingR.map((i) => [i.title ?? "", i]))
  const usedIds = extractIds([...existing])

  const derived: FeatureItem[] = sourceFeatures.map((title) => {
    const match = byTitle.get(title)
    if (match != null) {
      // D-13: 기존 항목은 ID·내용 그대로 보존
      return { ...match }
    }
    const id = generateId("R", usedIds)
    usedIds.add(id)
    return {
      id,
      title,
      description: `${title} 요구사항`,
      // D-02: R 단위 Given/When/Then 수용기준 필수
      acceptanceCriteria: [
        `Given 사용자가 프로젝트를 열어 둔 상태에서, When ${title} 동작을 수행하면, Then 결과가 산출물에 반영된다`,
      ],
      status: "todo" as const,
      importance: "medium" as const,
    }
  })

  // 소스에서 사라졌더라도 기존 R은 보존 (데이터 손실 0 — 병합 정책에서 처리)
  const derivedTitles = new Set(derived.map((i) => i.title ?? ""))
  const preserved = existingR.filter((i) => !derivedTitles.has(i.title ?? ""))

  return [...derived, ...preserved.map((i) => ({ ...i }))]
}

/**
 * 요구사항(R) 목록에서 기능(F) 항목을 결정론적으로 파생한다.
 *
 * - F.parent = 부모 R-ID (위계 표현)
 * - roleAssignments는 전달된 roles[] 부분집합만 (D-03, FEAT-04)
 * - F에는 acceptanceCriteria를 자동 생성하지 않음 (D-02)
 * - 기존 항목은 (parent, title) 일치 시 보존 (D-13)
 *
 * @param requirements - R 항목 배열
 * @param roles - project.json roles[] (역할 단일 출처)
 * @param existing - 기존 features.json의 F 항목 (고정 제약)
 * @returns F 항목 배열
 */
export function generateFeatures(
  requirements: ReadonlyArray<FeatureItem>,
  roles: ReadonlyArray<string>,
  existing: ReadonlyArray<FeatureItem> = []
): FeatureItem[] {
  const existingF = existing.filter((i) => i.id.startsWith("F-"))
  const byKey = new Map(existingF.map((i) => [`${i.parent ?? ""}::${i.title ?? ""}`, i]))
  const usedIds = extractIds([...existing, ...requirements])

  return requirements.map((r) => {
    const title = `${r.title ?? r.id} 기능`
    const match = byKey.get(`${r.id}::${title}`)
    if (match != null) {
      return { ...match }
    }
    const id = generateId("F", usedIds)
    usedIds.add(id)
    return {
      id,
      title,
      parent: r.id,
      // D-03: roles[] 부분집합 안에서만 배정 (빈 roles면 미배정)
      roleAssignments: roles.length > 0 ? [roles[0] as string] : [],
      status: "todo" as const,
      importance: r.importance ?? ("medium" as const),
    }
  })
}

/**
 * 기능(F) 목록에서 상세기능(S) 항목을 결정론적으로 파생한다.
 *
 * - S.parent = 부모 F-ID (위계 표현)
 * - S에는 acceptanceCriteria·roleAssignments를 자동 생성하지 않음 (D-02·D-03)
 * - 기존 항목은 (parent, title) 일치 시 보존 (D-13)
 *
 * @param features - F 항목 배열
 * @param existing - 기존 features.json의 S 항목 (고정 제약)
 * @returns S 항목 배열
 */
export function generateSpecs(
  features: ReadonlyArray<FeatureItem>,
  existing: ReadonlyArray<FeatureItem> = []
): FeatureItem[] {
  const existingS = existing.filter((i) => i.id.startsWith("S-"))
  const byKey = new Map(existingS.map((i) => [`${i.parent ?? ""}::${i.title ?? ""}`, i]))
  const usedIds = extractIds([...existing, ...features])

  return features.map((f) => {
    const title = `${f.title ?? f.id} 상세`
    const match = byKey.get(`${f.id}::${title}`)
    if (match != null) {
      return { ...match }
    }
    const id = generateId("S", usedIds)
    usedIds.add(id)
    return {
      id,
      title,
      parent: f.id,
      status: "todo" as const,
    }
  })
}

// ============================================================
// applyFeaturesMergePolicy (D-14 — prd-generator applyMergePolicy 의미론)
// ============================================================

/**
 * 병합 정책 모드에 따라 current features에 proposed items를 합친다.
 *
 * - codex: 기존 항목 보존 + 신규(기존에 없는 ID)만 추가 — D-14 비대화형 폴백
 * - force: items 전체를 proposed로 덮어씀 — D-14 --force
 * - approve: approvedIds에 포함된 항목만 교체/추가 — D-14 가지 단위 승인
 *
 * 불변성: 원본 current를 변경하지 않고 새 객체를 반환
 *
 * @param current - 현재 저장된 features
 * @param proposed - 새로 생성된 features
 * @param mode - 병합 모드 ("codex" | "force" | "approve")
 * @param approvedIds - approve 모드에서 적용할 항목 ID 배열
 * @returns 병합된 새 Features 객체 (원본 current 불변)
 */
export function applyFeaturesMergePolicy(
  current: Features,
  proposed: Features,
  mode: MergeMode,
  approvedIds: ReadonlyArray<string> = []
): Features {
  const currentItems = current.items ?? []
  const proposedItems = proposed.items ?? []

  if (mode === "force") {
    // items 전체 덮어쓰기 (불변: ...spread)
    return { ...current, items: proposedItems.map((i) => ({ ...i })) }
  }

  if (mode === "approve") {
    // 승인된 ID만 교체/추가
    const approved = new Set(approvedIds)
    const proposedById = new Map(proposedItems.map((i) => [i.id, i]))
    const replaced = currentItems.map((item) =>
      approved.has(item.id) && proposedById.has(item.id)
        ? { ...(proposedById.get(item.id) as FeatureItem) }
        : { ...item }
    )
    const currentIds = new Set(currentItems.map((i) => i.id))
    const added = proposedItems
      .filter((i) => approved.has(i.id) && !currentIds.has(i.id))
      .map((i) => ({ ...i }))
    return { ...current, items: [...replaced, ...added] }
  }

  // codex 모드: 기존 항목 그대로 보존 + 신규만 추가 (기존 ID 불변)
  const currentIds = new Set(currentItems.map((i) => i.id))
  const added = proposedItems
    .filter((i) => !currentIds.has(i.id))
    .map((i) => ({ ...i }))
  return { ...current, items: [...currentItems.map((i) => ({ ...i })), ...added] }
}

// ============================================================
// generateFeatureSpec — 오케스트레이터
// ============================================================

/** 역할 부분집합 검증 (D-03): roleAssignments ⊆ roles 위반 시 에러 메시지 반환 */
function checkRoleSubset(
  features: Features,
  roles: ReadonlyArray<string>
): string | null {
  const allowed = new Set(roles)
  for (const item of features.items ?? []) {
    for (const role of item.roleAssignments ?? []) {
      if (!allowed.has(role)) {
        return `역할 검증 실패: "${role}"은 project.json roles[] 밖의 역할이다 (항목 ${item.id})`
      }
    }
  }
  return null
}

/**
 * PRD·project를 읽어 R→F→S 3단 위계를 단계 분할 생성하고(D-01),
 * 병합 정책 적용(D-14) 후 graph/features.json 저장 + docs 파생(D-16)까지 수행한다.
 *
 * - 기존 features.json items를 고정 제약으로 각 단계에 주입 (D-13, FEAT-09)
 * - 단계별 출력은 validateFeaturesWithRetry로 검증·재시도 (최대 3회)
 * - F 단계는 roleAssignments ⊆ roles[] 추가 검증 (D-03, FEAT-04)
 *
 * @param projectDir - 프로젝트 디렉토리 절대경로
 * @param mode - 병합 모드 ("codex" | "force" | "approve")
 * @param options - 단계 생성기 주입(테스트·세션) 및 approve 모드 승인 ID
 * @returns 저장된 Features 객체
 * @throws prd.json 부재/검증 실패, 단계 검증 3회 실패 시 한국어 Error
 */
export async function generateFeatureSpec(
  projectDir: string,
  mode: MergeMode,
  options: GenerateFeatureSpecOptions = {}
): Promise<Features> {
  // 1. prd.json 읽기 + 검증 (의존성: PRD가 생성 입력)
  const prdPath = path.join(projectDir, "graph", "prd.json")
  let prd: Prd
  try {
    const raw = await fs.readFile(prdPath, "utf8")
    const parsed = PrdSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      throw new Error(parsed.error.message)
    }
    prd = parsed.data
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `prd.json을 읽을 수 없습니다. 먼저 /aipm prd를 실행하세요. (${detail})`
    )
  }

  // 2. project.json roles[] 읽기 (D-03 단일 출처 — 없으면 빈 배열)
  let roles: string[] = []
  try {
    const rawProject = await fs.readFile(path.join(projectDir, "project.json"), "utf8")
    const parsedProject = ProjectSchema.safeParse(JSON.parse(rawProject))
    if (parsedProject.success) {
      roles = parsedProject.data.roles ?? []
    }
  } catch {
    // project.json 없음 — 역할 미배정으로 진행 (게이트는 커맨드 레벨 D-05)
  }

  // 3. 기존 features.json 읽기 (D-13: ID 고정 제약으로 주입)
  const featuresPath = path.join(projectDir, "graph", "features.json")
  let existing: Features = { schemaVersion: "1.0", items: [] }
  try {
    const rawFeatures = await fs.readFile(featuresPath, "utf8")
    const parsedFeatures = FeaturesSchema.safeParse(JSON.parse(rawFeatures))
    if (parsedFeatures.success) {
      existing = parsedFeatures.data
    }
  } catch {
    // 파일 없거나 파싱 실패 — 빈 상태에서 시작
  }
  const existingItems = existing.items ?? []

  // 4. 단계 분할 생성 (D-01): R → F → S, 단계별 Zod 검증·재시도
  const gen: StageGenerators = {
    generateRequirements:
      options.generators?.generateRequirements ?? generateRequirements,
    generateFeatures: options.generators?.generateFeatures ?? generateFeatures,
    generateSpecs: options.generators?.generateSpecs ?? generateSpecs,
  }

  const reqStage = await validateFeaturesWithRetry(async () => ({
    schemaVersion: "1.0" as const,
    items: await gen.generateRequirements(prd, existingItems),
  }))
  const requirements = reqStage.items ?? []

  const featStage = await validateFeaturesWithRetry(
    async () => ({
      schemaVersion: "1.0" as const,
      items: await gen.generateFeatures(requirements, roles, existingItems),
    }),
    (f) => checkRoleSubset(f, roles)
  )
  const features = featStage.items ?? []

  const specStage = await validateFeaturesWithRetry(async () => ({
    schemaVersion: "1.0" as const,
    items: await gen.generateSpecs(features, existingItems),
  }))
  const specs = specStage.items ?? []

  // 5. 병합 정책 적용 (D-14)
  const proposed: Features = {
    schemaVersion: "1.0",
    items: [...requirements, ...features, ...specs],
  }
  const merged = applyFeaturesMergePolicy(existing, proposed, mode, options.approvedIds)

  // 6. 원자 저장 (Pitfall: 락은 파일이 존재해야 가능 — scaffold가 미리 생성)
  try {
    await fs.access(featuresPath)
  } catch {
    await fs.writeFile(featuresPath, JSON.stringify({ schemaVersion: "1.0" }) + "\n", "utf8")
  }
  await writeGraphFile(featuresPath, merged)

  // 7. docs 파생 (D-16: FEATURES.md 단방향 파생 포함)
  await deriveDocs(projectDir)

  return merged
}

// ============================================================
// CLI 진입점 — process.argv[2]=projectDir, [3]=mode, [4...]=approvedIds
// ============================================================

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(__filename)

if (isMain) {
  const projectDir = process.argv[2]
  const modeArg = process.argv[3] ?? "codex"
  const approvedIds = process.argv.slice(4)

  if (projectDir == null || projectDir.length === 0) {
    console.error("사용법: npx tsx scripts/feature-generator.ts <프로젝트경로> [codex|force|approve] [승인ID...]")
    process.exit(1)
  }
  if (modeArg !== "codex" && modeArg !== "force" && modeArg !== "approve") {
    console.error(`알 수 없는 모드: ${modeArg} (codex|force|approve 중 하나)`)
    process.exit(1)
  }

  generateFeatureSpec(projectDir, modeArg, { approvedIds })
    .then((result) => {
      const count = result.items?.length ?? 0
      console.log(`기능명세 생성 완료: ${count}개 항목 (모드: ${modeArg})`)
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`기능명세 생성 실패: ${message}`)
      process.exit(1)
    })
}
