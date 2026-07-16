// ============================================================
// scripts/prd-generator.ts — PRD 구조화 생성 엔진 (01-03-PLAN.md)
// ============================================================
// 목적: 6축 intake → 5섹션 PRD 결정론적 매핑 + Zod 3회 재시도 + 재생성 병합 정책
//
// 설계:
// - generatePrd(projectDir, intake): 6축 → 5섹션 매핑 후 graph/prd.json 저장
// - validatePrdWithRetry(generator): Zod safeParse 루프, max 3회, 실패 시 한국어 throw
// - diffPrdSections(current, proposed): 5섹션 JSON.stringify 비교
// - applyMergePolicy(current, proposed, mode, approved?): codex/force/approve
//
// 보안:
// - T-03-01: JSON.parse만 사용, eval/Function/require() 금지
// - T-03-02: projectDir — 검증된 호출자에서만 수신 (scaffold 출력값)
// - T-03-03: maxAttempts=3 고정 (환경변수·설정으로 변경 불가)
// - T-03-04: codex/approve 모드는 사용자 편집을 덮어쓰지 않는다
//
// 불변성:
// - 모든 객체 변환은 { ...spread } 사용, 원본 변경 금지
// ============================================================

import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { PrdSchema } from "../src/schemas/index.js"
import type { Prd } from "../src/schemas/index.js"
import type { Intake } from "../src/lib/intake.js"
import { generateId, extractIds } from "../src/lib/id.js"
import { writeGraphFile } from "../src/lib/atomic-write.js"
import { mapIntakeToPrdSections } from "./prd-section-mapper.js"

// ESM __filename 재현 (isMain 비교용)
const __filename = fileURLToPath(import.meta.url)

// ============================================================
// 타입 정의
// ============================================================

/** 5개 섹션 키 */
const SECTION_KEYS = [
  "overview",
  "problemAndSolution",
  "targetAndScenario",
  "successAndRisk",
  "attributes",
] as const

type SectionKey = (typeof SECTION_KEYS)[number]

/** diffPrdSections 결과 항목 */
export interface SectionDiff {
  sectionKey: SectionKey
  current: unknown
  proposed: unknown
  hasChange: boolean
}

/** applyMergePolicy 병합 모드 */
export type MergeMode = "codex" | "force" | "approve"

// ============================================================
// generatePrd
// ============================================================

/**
 * 6축 intake를 읽어 5섹션 PRD를 생성하고 graph/prd.json에 저장한다.
 *
 * ID 안정성: 기존 prd.json에 R-ID가 있으면 재사용.
 * 새 ID가 필요한 경우에만 generateId()로 생성.
 *
 * @param projectDir - scaffold()로 생성된 프로젝트 디렉토리 절대경로
 * @param intake - 6축 intake 데이터
 * @returns 저장된 Prd 객체
 * @throws graph/prd.json 읽기/쓰기 실패 시 Error
 */
export async function generatePrd(projectDir: string, intake: Intake): Promise<Prd> {
  const prdPath = path.join(projectDir, "graph", "prd.json")

  // 기존 prd.json 읽기 (ID 안정성: 기존 R-ID 재사용)
  let existingPrd: Prd | null = null
  try {
    const raw = await fs.readFile(prdPath, "utf8")
    const parsed = PrdSchema.safeParse(JSON.parse(raw))
    if (parsed.success) {
      existingPrd = parsed.data
    }
  } catch {
    // 파일 없거나 파싱 실패 — 새로 생성
  }

  // ID 결정: 기존 ID 재사용 or 새 생성
  const existingIds = existingPrd != null
    ? extractIds([{ id: existingPrd.id }])
    : new Set<string>()

  const prdId = existingPrd?.id ?? generateId("R", existingIds)

  // 6축 → 5섹션 매핑
  const sections = mapIntakeToPrdSections(intake)

  // 새 PRD 객체 조립 (불변: ...spread)
  const newPrd: Prd = {
    schemaVersion: "1.0",
    id: prdId,
    ...sections,
  }

  // graph/prd.json에 원자 저장 (Pitfall 3: scaffold()가 먼저 파일 생성 필요)
  await writeGraphFile(prdPath, newPrd)

  return newPrd
}

// ============================================================
// validatePrdWithRetry
// ============================================================

/**
 * PRD 생성 함수를 최대 3회 호출하며 Zod 스키마 검증을 시도한다.
 * 3회 모두 실패하면 한국어 에러 메시지와 함께 throw한다.
 *
 * T-03-03: maxAttempts는 항상 3 (환경변수·설정으로 변경 불가)
 *
 * @param generator - PRD 객체를 반환하는 비동기 함수
 * @returns 검증된 Prd 객체
 * @throws 3회 모두 실패 시 한국어 에러 메시지 Error
 */
export async function validatePrdWithRetry(
  generator: () => Promise<Prd>
): Promise<Prd> {
  const MAX_ATTEMPTS = 3
  let lastError: string = ""

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const raw = await generator()
    const result = PrdSchema.safeParse(raw)
    if (result.success) {
      return result.data
    }
    lastError = result.error.message
  }

  throw new Error(`PRD 스키마 검증 실패 (${MAX_ATTEMPTS}회): ${lastError}`)
}

// ============================================================
// diffPrdSections
// ============================================================

/**
 * 두 PRD 객체의 5개 섹션을 JSON.stringify로 비교하여 변경 여부를 반환한다.
 *
 * @param current - 현재 저장된 PRD
 * @param proposed - 새로 생성된 PRD
 * @returns 5개 섹션별 SectionDiff 배열
 */
export function diffPrdSections(current: Prd, proposed: Prd): SectionDiff[] {
  return SECTION_KEYS.map((key) => {
    const cur = (current as Record<string, unknown>)[key]
    const prop = (proposed as Record<string, unknown>)[key]
    return {
      sectionKey: key,
      current: cur,
      proposed: prop,
      hasChange: JSON.stringify(cur) !== JSON.stringify(prop),
    }
  })
}

// ============================================================
// applyMergePolicy
// ============================================================

/**
 * 병합 정책 모드에 따라 current PRD에 proposed 섹션을 합친다.
 *
 * - codex: 비어있는 섹션만 채움 (사용자 편집 보존) — T-03-04
 * - force: 모든 섹션을 proposed로 덮어씀
 * - approve: approvedSections에 포함된 섹션만 proposed로 교체
 *
 * 불변성: 원본 current를 변경하지 않고 새 객체를 반환
 *
 * @param current - 현재 저장된 PRD
 * @param proposed - 새로 생성된 PRD
 * @param mode - 병합 모드 ("codex" | "force" | "approve")
 * @param approvedSections - approve 모드에서 교체할 섹션 키 배열
 * @returns 병합된 새 Prd 객체 (원본 current 불변)
 */
export function applyMergePolicy(
  current: Prd,
  proposed: Prd,
  mode: MergeMode,
  approvedSections: Array<keyof Prd> = []
): Prd {
  if (mode === "force") {
    // 모든 5섹션을 proposed로 덮어씀 (불변: ...spread)
    return {
      ...current,
      overview: proposed.overview,
      problemAndSolution: proposed.problemAndSolution,
      targetAndScenario: proposed.targetAndScenario,
      successAndRisk: proposed.successAndRisk,
      attributes: proposed.attributes,
    }
  }

  if (mode === "approve") {
    // 승인된 섹션만 교체
    const updated: Prd = { ...current }
    for (const key of approvedSections) {
      if (SECTION_KEYS.includes(key as SectionKey)) {
        ;(updated as Record<string, unknown>)[key as string] =
          (proposed as Record<string, unknown>)[key as string]
      }
    }
    return updated
  }

  // codex 모드: 비어있는 섹션만 채움 (사용자 편집 보존)
  const updated: Prd = { ...current }
  for (const key of SECTION_KEYS) {
    const currentVal = (current as Record<string, unknown>)[key]
    const proposedVal = (proposed as Record<string, unknown>)[key]
    // 현재 값이 undefined/null인 경우에만 proposed 값으로 채움
    if (currentVal == null && proposedVal != null) {
      ;(updated as Record<string, unknown>)[key] = proposedVal
    }
  }
  return updated
}

// ============================================================
// CLI 진입점
// ============================================================

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(__filename)

if (isMain) {
  console.error(
    "prd-generator.ts는 라이브러리 모듈입니다. CLI 사용법: /aipm prd <프로젝트경로>"
  )
  process.exit(1)
}
