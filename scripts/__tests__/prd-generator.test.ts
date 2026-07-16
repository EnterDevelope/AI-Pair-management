// ============================================================
// prd-generator.test.ts — TDD RED: prd-generator 실패 테스트 (01-03-PLAN.md)
// ============================================================
// 커버리지:
//   1. 매핑: 6축 intake → 5섹션 PRD 필드 매핑
//   2. 3재시도-throw: validatePrdWithRetry — 3회 실패 후 한국어 에러 throw
//   3. ID불변: 동일 intake 두 번 실행 → 동일 R-ID 유지
//   4. diff: diffPrdSections — 변경된 섹션만 hasChange=true
//   5. 병합모드: applyMergePolicy — codex/force/approve 세 가지 모드
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

import { scaffold } from "../scaffold.js"
import {
  generatePrd,
  validatePrdWithRetry,
  diffPrdSections,
  applyMergePolicy,
} from "../prd-generator.js"
import type { Intake } from "../../src/lib/intake.js"
import type { Prd } from "../../src/schemas/index.js"

// ============================================================
// 픽스처 헬퍼
// ============================================================

let tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aipm-prd-gen-test-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

/**
 * 완전한 mock Intake — 6축 모두 채움
 */
function makeMockIntake(overrides: Partial<Intake> = {}): Intake {
  return {
    schemaVersion: "1.0",
    targetAndScenario: "IT PM·기획자가 로컬에서 기획 산출물을 생성",
    problemStatement: "클라우드 의존 없이 AI 기획 도구가 필요하다",
    coreFeatures: ["PRD 자동 생성", "기능명세 트리", "유저플로우 다이어그램"],
    scopeAndPriority: "Phase 1: PRD + 기능명세, Phase 2: 유저플로우",
    platformDevice: ["macOS", "Desktop"],
    successCriteria: "1회 입력으로 4단계 기획 산출물 생성, 정합성 유지",
    rawIdea: "로컬 AI 기획 하네스 아이디어",
    detectedLang: "ko",
    ...overrides,
  }
}

// ============================================================
// 1. 매핑: 6축 intake → 5섹션 PRD 필드 결정론적 매핑
// ============================================================

describe("generatePrd — 매핑", () => {
  let projectDir: string

  beforeEach(async () => {
    const baseDir = await makeTempDir()
    projectDir = await scaffold("test-project", baseDir)
  })

  it("Q1(targetAndScenario)이 PRD targetAndScenario 섹션에 반영된다", async () => {
    const intake = makeMockIntake()
    const prd = await generatePrd(projectDir, intake)

    expect(prd.targetAndScenario).toBeDefined()
    const ts = prd.targetAndScenario as Record<string, unknown>
    expect(JSON.stringify(ts)).toContain("IT PM")
  })

  it("Q2(problemStatement)이 PRD overview 또는 problemAndSolution에 반영된다", async () => {
    const intake = makeMockIntake()
    const prd = await generatePrd(projectDir, intake)

    const overview = JSON.stringify(prd.overview ?? "")
    const pas = JSON.stringify(prd.problemAndSolution ?? "")
    expect(overview + pas).toContain("클라우드 의존")
  })

  it("Q3(coreFeatures)이 PRD problemAndSolution 또는 successAndRisk에 반영된다", async () => {
    const intake = makeMockIntake()
    const prd = await generatePrd(projectDir, intake)

    const pas = JSON.stringify(prd.problemAndSolution ?? "")
    const sar = JSON.stringify(prd.successAndRisk ?? "")
    expect(pas + sar).toContain("PRD 자동 생성")
  })

  it("Q4(scopeAndPriority)이 PRD attributes 또는 milestones에 반영된다", async () => {
    const intake = makeMockIntake()
    const prd = await generatePrd(projectDir, intake)

    const attrs = JSON.stringify(prd.attributes ?? "")
    const milestones = JSON.stringify(prd.milestones ?? [])
    expect(attrs + milestones).toContain("Phase 1")
  })

  it("Q5(platformDevice)이 PRD attributes에 반영된다", async () => {
    const intake = makeMockIntake()
    const prd = await generatePrd(projectDir, intake)

    const attrs = JSON.stringify(prd.attributes ?? "")
    expect(attrs).toContain("macOS")
  })

  it("Q6(successCriteria)이 PRD successAndRisk 또는 northStar에 반영된다", async () => {
    const intake = makeMockIntake()
    const prd = await generatePrd(projectDir, intake)

    const sar = JSON.stringify(prd.successAndRisk ?? "")
    const northStar = JSON.stringify(prd.northStar ?? "")
    expect(sar + northStar).toContain("4단계 기획 산출물")
  })

  it("생성된 PRD가 graph/prd.json에 저장된다", async () => {
    const intake = makeMockIntake()
    await generatePrd(projectDir, intake)

    const prdPath = path.join(projectDir, "graph", "prd.json")
    const raw = await fs.readFile(prdPath, "utf8")
    const parsed = JSON.parse(raw) as Prd
    expect(parsed.schemaVersion).toBe("1.0")
    expect(parsed.id).toMatch(/^R-[A-Z0-9]{6}$/)
  })
})

// ============================================================
// 2. 3재시도-throw: validatePrdWithRetry
// ============================================================

describe("validatePrdWithRetry — 3재시도-throw", () => {
  it("유효한 PRD 객체는 바로 반환한다", async () => {
    const validPrd: Prd = {
      schemaVersion: "1.0",
      id: "R-ABCDEF",
    }
    const result = await validatePrdWithRetry(
      async () => Promise.resolve(validPrd)
    )
    expect(result.id).toBe("R-ABCDEF")
  })

  it("3회 모두 실패하면 한국어 에러 메시지와 함께 throw한다", async () => {
    let callCount = 0
    // 항상 스키마 위반 객체 반환 (id 형식 위반)
    const badGenerator = async () => {
      callCount++
      return { schemaVersion: "1.0", id: "not-valid-id" } as unknown as Prd
    }

    await expect(validatePrdWithRetry(badGenerator)).rejects.toThrow(
      /PRD 스키마 검증 실패/
    )
    expect(callCount).toBe(3)
  })

  it("2회 실패 후 3회차에 성공하면 결과를 반환한다", async () => {
    let callCount = 0
    const generator = async () => {
      callCount++
      if (callCount < 3) {
        return { schemaVersion: "1.0", id: "bad-id" } as unknown as Prd
      }
      return { schemaVersion: "1.0", id: "R-ABC123" } as Prd
    }

    const result = await validatePrdWithRetry(generator)
    expect(result.id).toBe("R-ABC123")
    expect(callCount).toBe(3)
  })

  it("throw 메시지는 한국어를 포함한다", async () => {
    const badGenerator = async () =>
      ({ schemaVersion: "1.0", id: "bad-id" }) as unknown as Prd

    await expect(validatePrdWithRetry(badGenerator)).rejects.toThrow(
      /PRD.*검증.*실패/
    )
  })
})

// ============================================================
// 3. ID불변: 동일 intake 두 번 실행 → 동일 R-ID 유지
// ============================================================

describe("generatePrd — ID불변", () => {
  let projectDir: string

  beforeEach(async () => {
    const baseDir = await makeTempDir()
    projectDir = await scaffold("test-id-stability", baseDir)
  })

  it("동일한 intake로 두 번 generatePrd 호출 시 R-ID가 동일하게 유지된다", async () => {
    const intake = makeMockIntake()

    const prd1 = await generatePrd(projectDir, intake)
    const prd2 = await generatePrd(projectDir, intake)

    expect(prd1.id).toMatch(/^R-[A-Z0-9]{6}$/)
    expect(prd1.id).toBe(prd2.id)
  })

  it("기존 prd.json에 R-ID가 있으면 새 ID를 생성하지 않는다", async () => {
    const intake = makeMockIntake()

    // 첫 번째 실행으로 ID 확정
    const firstPrd = await generatePrd(projectDir, intake)
    const originalId = firstPrd.id

    // 두 번째 실행 — ID 변경 없어야 함
    const secondPrd = await generatePrd(projectDir, intake)
    expect(secondPrd.id).toBe(originalId)
  })
})

// ============================================================
// 4. diff: diffPrdSections — 변경된 섹션만 hasChange=true
// ============================================================

describe("diffPrdSections — diff", () => {
  const basePrd: Prd = {
    schemaVersion: "1.0",
    id: "R-AAAAAA",
    overview: { summary: "기존 요약" },
    problemAndSolution: { problem: "기존 문제" },
    targetAndScenario: { target: "기존 타겟" },
    successAndRisk: { success: "기존 성공지표" },
    attributes: { scope: "기존 범위" },
  }

  it("동일한 PRD를 비교하면 모든 섹션 hasChange=false", () => {
    const diffs = diffPrdSections(basePrd, basePrd)

    expect(diffs).toHaveLength(5)
    for (const d of diffs) {
      expect(d.hasChange).toBe(false)
    }
  })

  it("overview 섹션만 변경되면 해당 섹션만 hasChange=true", () => {
    const proposed: Prd = {
      ...basePrd,
      overview: { summary: "새로운 요약" },
    }
    const diffs = diffPrdSections(basePrd, proposed)

    const overviewDiff = diffs.find((d) => d.sectionKey === "overview")
    expect(overviewDiff?.hasChange).toBe(true)

    const others = diffs.filter((d) => d.sectionKey !== "overview")
    for (const d of others) {
      expect(d.hasChange).toBe(false)
    }
  })

  it("5개 섹션 키를 모두 반환한다", () => {
    const diffs = diffPrdSections(basePrd, basePrd)
    const keys = diffs.map((d) => d.sectionKey)
    expect(keys).toContain("overview")
    expect(keys).toContain("problemAndSolution")
    expect(keys).toContain("targetAndScenario")
    expect(keys).toContain("successAndRisk")
    expect(keys).toContain("attributes")
  })

  it("각 diff 항목에 current와 proposed 값이 포함된다", () => {
    const proposed: Prd = {
      ...basePrd,
      overview: { summary: "새로운 요약" },
    }
    const diffs = diffPrdSections(basePrd, proposed)

    const overviewDiff = diffs.find((d) => d.sectionKey === "overview")
    expect(overviewDiff?.current).toEqual({ summary: "기존 요약" })
    expect(overviewDiff?.proposed).toEqual({ summary: "새로운 요약" })
  })
})

// ============================================================
// 5. 병합모드: applyMergePolicy — codex/force/approve
// ============================================================

describe("applyMergePolicy — 병합모드", () => {
  const current: Prd = {
    schemaVersion: "1.0",
    id: "R-AAAAAA",
    overview: { summary: "사용자가 작성한 기존 개요" },
    problemAndSolution: { problem: "기존 문제 정의" },
    targetAndScenario: undefined,
    successAndRisk: undefined,
    attributes: undefined,
  }

  const proposed: Prd = {
    schemaVersion: "1.0",
    id: "R-AAAAAA",
    overview: { summary: "AI가 새로 생성한 개요" },
    problemAndSolution: { problem: "AI가 새로 정의한 문제" },
    targetAndScenario: { target: "새 타겟" },
    successAndRisk: { success: "새 성공지표" },
    attributes: { scope: "새 범위" },
  }

  it("codex 모드: 비어있는 섹션만 채우고 기존 내용은 보존한다", () => {
    const result = applyMergePolicy(current, proposed, "codex")

    // 기존 값 보존
    const ov = result.overview as Record<string, unknown>
    expect(ov.summary).toBe("사용자가 작성한 기존 개요")
    const pas = result.problemAndSolution as Record<string, unknown>
    expect(pas.problem).toBe("기존 문제 정의")

    // 비어있던 필드는 채움
    expect(result.targetAndScenario).toEqual({ target: "새 타겟" })
    expect(result.successAndRisk).toEqual({ success: "새 성공지표" })
    expect(result.attributes).toEqual({ scope: "새 범위" })
  })

  it("force 모드: 모든 섹션을 proposed로 덮어쓴다", () => {
    const result = applyMergePolicy(current, proposed, "force")

    const ov = result.overview as Record<string, unknown>
    expect(ov.summary).toBe("AI가 새로 생성한 개요")
    const pas = result.problemAndSolution as Record<string, unknown>
    expect(pas.problem).toBe("AI가 새로 정의한 문제")
  })

  it("approve 모드: 승인된 섹션만 proposed로 교체한다", () => {
    const approvedSections: Array<keyof Prd> = ["targetAndScenario", "successAndRisk"]
    const result = applyMergePolicy(current, proposed, "approve", approvedSections)

    // 승인된 섹션 교체
    expect(result.targetAndScenario).toEqual({ target: "새 타겟" })
    expect(result.successAndRisk).toEqual({ success: "새 성공지표" })

    // 승인 안 된 섹션 보존
    const ov = result.overview as Record<string, unknown>
    expect(ov.summary).toBe("사용자가 작성한 기존 개요")
  })

  it("codex 모드: 기존 값이 있는 경우 덮어쓰지 않는다 (사용자 편집 보존)", () => {
    const withUserEdit: Prd = {
      ...current,
      successAndRisk: { success: "사용자가 직접 편집한 성공지표" },
    }
    const result = applyMergePolicy(withUserEdit, proposed, "codex")

    const sar = result.successAndRisk as Record<string, unknown>
    expect(sar.success).toBe("사용자가 직접 편집한 성공지표")
  })

  it("approve 모드: approvedSections 없으면 아무것도 변경하지 않는다", () => {
    const result = applyMergePolicy(current, proposed, "approve", [])

    expect(result.overview).toEqual(current.overview)
    expect(result.problemAndSolution).toEqual(current.problemAndSolution)
  })

  it("결과 객체는 항상 불변 — 원본 current를 변경하지 않는다", () => {
    const currentCopy = JSON.parse(JSON.stringify(current)) as Prd
    applyMergePolicy(current, proposed, "force")

    // current가 변경되지 않았는지 확인
    expect(current.overview).toEqual(currentCopy.overview)
  })
})
