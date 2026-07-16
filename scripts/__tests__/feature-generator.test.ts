// ============================================================
// feature-generator.test.ts — TDD RED: feature-generator 실패 테스트 (03-02-PLAN.md)
// ============================================================
// 커버리지 (PLAN behavior 9개):
//   1. 3재시도-throw: validateFeaturesWithRetry — 3회 실패 후 한국어 에러 throw
//   2. 단계 분할: generateRequirements → generateFeatures → generateSpecs 순서 (D-01)
//   3. R 항목 acceptanceCriteria Given/When/Then (D-02, FEAT-03)
//   4. 역할 부분집합: roleAssignments ⊆ roles[] 위반 시 재시도 (D-03, FEAT-04)
//   5. 위계: F.parent=R-ID, S.parent=F-ID
//   6. 병합 codex: 기존 보존 + 신규 추가, 기존 ID 불변 (D-14)
//   7. 병합 force: 전체 덮어쓰기 (D-14)
//   8. 재생성 ID 고정: 같은 입력 재실행 시 기존 ID 불변 (D-13, FEAT-09)
//   9. 신규 항목만 generateId로 새 ID 발급 (FEAT-02)
// + Task 2: aipm-features.md 커맨드 형상 스모크 (01-05 smoke 패턴)
// ============================================================

import { describe, it, expect, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

import { scaffold } from "../scaffold.js"
import { generatePrd } from "../prd-generator.js"
import {
  validateFeaturesWithRetry,
  generateRequirements,
  generateFeatures,
  generateSpecs,
  applyFeaturesMergePolicy,
  generateFeatureSpec,
} from "../feature-generator.js"
import type { FeatureItem } from "../feature-generator.js"
import type { Features } from "../../src/schemas/graph/features.js"
import type { Intake } from "../../src/lib/intake.js"

// ============================================================
// 픽스처 헬퍼
// ============================================================

let tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aipm-feat-gen-test-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

function makeMockIntake(overrides: Partial<Intake> = {}): Intake {
  return {
    schemaVersion: "1.0",
    targetAndScenario: "IT PM·기획자가 로컬에서 기획 산출물을 생성",
    problemStatement: "클라우드 의존 없이 AI 기획 도구가 필요하다",
    coreFeatures: ["PRD 자동 생성", "기능명세 트리"],
    scopeAndPriority: "Phase 1: PRD + 기능명세",
    platformDevice: ["macOS", "Desktop"],
    successCriteria: "1회 입력으로 4단계 기획 산출물 생성",
    rawIdea: "로컬 AI 기획 하네스",
    detectedLang: "ko",
    ...overrides,
  }
}

/** scaffold + PRD 생성 + roles[] 주입까지 끝낸 프로젝트 디렉토리를 만든다 */
async function makeProjectWithPrd(roles: string[] = ["기획자", "개발자"]): Promise<string> {
  const baseDir = await makeTempDir()
  const projectDir = await scaffold("feat-gen-test", baseDir)
  await generatePrd(projectDir, makeMockIntake())

  // project.json에 roles[] 주입 (D-03 단일 출처)
  const projectPath = path.join(projectDir, "project.json")
  const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as Record<string, unknown>
  await fs.writeFile(
    projectPath,
    JSON.stringify({ ...project, roles }, null, 2) + "\n",
    "utf8"
  )
  return projectDir
}

function readFeatures(projectDir: string): Promise<Features> {
  return fs
    .readFile(path.join(projectDir, "graph", "features.json"), "utf8")
    .then((raw) => JSON.parse(raw) as Features)
}

// ============================================================
// 1. 3재시도-throw: validateFeaturesWithRetry
// ============================================================

describe("validateFeaturesWithRetry — 3재시도-throw", () => {
  it("유효한 features 객체는 바로 반환한다", async () => {
    const valid: Features = {
      schemaVersion: "1.0",
      items: [{ id: "R-ABC234" }],
    }
    const result = await validateFeaturesWithRetry(async () => valid)
    expect(result.items?.[0]?.id).toBe("R-ABC234")
  })

  it("3회 모두 실패하면 한국어 에러 메시지와 함께 throw한다", async () => {
    let callCount = 0
    const badGenerator = async () => {
      callCount++
      return { schemaVersion: "1.0", items: [{ id: "invalid-id" }] } as unknown as Features
    }

    await expect(validateFeaturesWithRetry(badGenerator)).rejects.toThrow(
      /기능명세 스키마 검증 실패/
    )
    expect(callCount).toBe(3)
  })

  it("2회 실패 후 3회차에 성공하면 결과를 반환한다", async () => {
    let callCount = 0
    const generator = async (): Promise<Features> => {
      callCount++
      if (callCount < 3) {
        return { schemaVersion: "1.0", items: [{ id: "bad" }] } as unknown as Features
      }
      return { schemaVersion: "1.0", items: [{ id: "F-ABC234", parent: "R-ABC234" }] }
    }

    const result = await validateFeaturesWithRetry(generator)
    expect(result.items?.[0]?.id).toBe("F-ABC234")
    expect(callCount).toBe(3)
  })

  it("extraCheck가 에러 문자열을 반환하면 재시도한다", async () => {
    let callCount = 0
    const generator = async (): Promise<Features> => {
      callCount++
      return { schemaVersion: "1.0", items: [{ id: "R-ABC234" }] }
    }
    const extraCheck = (f: Features): string | null =>
      callCount < 2 ? "검증 실패: 역할 위반" : null

    const result = await validateFeaturesWithRetry(generator, extraCheck)
    expect(result.items?.[0]?.id).toBe("R-ABC234")
    expect(callCount).toBe(2)
  })
})

// ============================================================
// 2. 단계 분할: R → F → S 순서 (D-01)
// ============================================================

describe("generateFeatureSpec — 단계 분할 (D-01)", () => {
  it("generateRequirements → generateFeatures → generateSpecs 순서로 호출된다", async () => {
    const projectDir = await makeProjectWithPrd()
    const order: string[] = []

    await generateFeatureSpec(projectDir, "codex", {
      generators: {
        generateRequirements: () => {
          order.push("requirements")
          return [{ id: "R-AAA234", title: "요구1", acceptanceCriteria: ["Given a, When b, Then c"] }]
        },
        generateFeatures: () => {
          order.push("features")
          return [{ id: "F-AAA234", title: "기능1", parent: "R-AAA234", roleAssignments: ["기획자"] }]
        },
        generateSpecs: () => {
          order.push("specs")
          return [{ id: "S-AAA234", title: "상세1", parent: "F-AAA234" }]
        },
      },
    })

    expect(order).toEqual(["requirements", "features", "specs"])
  })

  it("결과가 graph/features.json에 저장되고 docs/FEATURES.md가 파생된다", async () => {
    const projectDir = await makeProjectWithPrd()

    await generateFeatureSpec(projectDir, "codex")

    const saved = await readFeatures(projectDir)
    expect(saved.schemaVersion).toBe("1.0")
    expect(saved.items?.length).toBeGreaterThan(0)

    const featuresMd = await fs.readFile(
      path.join(projectDir, "docs", "FEATURES.md"),
      "utf8"
    )
    expect(featuresMd.length).toBeGreaterThan(0)
  })

  it("prd.json이 없으면 한국어 에러로 throw한다 (의존성 게이트)", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("no-prd-test", baseDir)
    await fs.rm(path.join(projectDir, "graph", "prd.json"))

    await expect(generateFeatureSpec(projectDir, "codex")).rejects.toThrow(/prd/i)
  })
})

// ============================================================
// 3. R 항목 acceptanceCriteria — Given/When/Then (D-02)
// ============================================================

describe("generateRequirements — GWT 수용기준 (D-02)", () => {
  it("각 R 항목에 Given/When/Then 구조 acceptanceCriteria가 채워진다", async () => {
    const projectDir = await makeProjectWithPrd()
    const prdRaw = await fs.readFile(path.join(projectDir, "graph", "prd.json"), "utf8")
    const prd = JSON.parse(prdRaw)

    const requirements = generateRequirements(prd, [])

    expect(requirements.length).toBeGreaterThan(0)
    for (const r of requirements) {
      expect(r.id).toMatch(/^R-[A-Z0-9]{6}$/)
      expect(r.acceptanceCriteria?.length).toBeGreaterThan(0)
      const joined = (r.acceptanceCriteria ?? []).join(" ")
      expect(joined).toContain("Given")
      expect(joined).toContain("When")
      expect(joined).toContain("Then")
    }
  })

  it("F/S 항목에는 acceptanceCriteria를 자동 생성하지 않는다 (D-02)", async () => {
    const reqs: FeatureItem[] = [
      { id: "R-AAA234", title: "요구1", acceptanceCriteria: ["Given a, When b, Then c"] },
    ]
    const features = generateFeatures(reqs, ["기획자"], [])
    const specs = generateSpecs(features, [])

    for (const f of features) {
      expect(f.acceptanceCriteria).toBeUndefined()
    }
    for (const s of specs) {
      expect(s.acceptanceCriteria).toBeUndefined()
    }
  })
})

// ============================================================
// 4. 역할 부분집합 강제 (D-03, FEAT-04)
// ============================================================

describe("generateFeatureSpec — 역할 부분집합 (D-03)", () => {
  it("roleAssignments가 roles[]를 벗어나면 재시도가 트리거된다", async () => {
    const projectDir = await makeProjectWithPrd(["기획자", "개발자"])
    let featuresCalls = 0

    const result = await generateFeatureSpec(projectDir, "codex", {
      generators: {
        generateRequirements: () => [
          { id: "R-AAA234", title: "요구1", acceptanceCriteria: ["Given a, When b, Then c"] },
        ],
        generateFeatures: () => {
          featuresCalls++
          if (featuresCalls === 1) {
            // roles[] 밖의 역할 — 검증 실패해야 함
            return [{ id: "F-AAA234", title: "기능1", parent: "R-AAA234", roleAssignments: ["해커"] }]
          }
          return [{ id: "F-AAA234", title: "기능1", parent: "R-AAA234", roleAssignments: ["기획자"] }]
        },
        generateSpecs: () => [],
      },
    })

    expect(featuresCalls).toBe(2)
    const f = result.items?.find((i) => i.id === "F-AAA234")
    expect(f?.roleAssignments).toEqual(["기획자"])
  })

  it("3회 모두 역할 위반이면 한국어 에러로 throw한다", async () => {
    const projectDir = await makeProjectWithPrd(["기획자"])

    await expect(
      generateFeatureSpec(projectDir, "codex", {
        generators: {
          generateRequirements: () => [
            { id: "R-AAA234", title: "요구1", acceptanceCriteria: ["Given a, When b, Then c"] },
          ],
          generateFeatures: () => [
            { id: "F-AAA234", title: "기능1", parent: "R-AAA234", roleAssignments: ["해커"] },
          ],
          generateSpecs: () => [],
        },
      })
    ).rejects.toThrow(/검증 실패/)
  })

  it("기본 generateFeatures는 roles[] 부분집합 안에서만 역할을 배정한다", async () => {
    const roles = ["기획자", "개발자"]
    const reqs: FeatureItem[] = [
      { id: "R-AAA234", title: "요구1", acceptanceCriteria: ["Given a, When b, Then c"] },
    ]
    const features = generateFeatures(reqs, roles, [])

    for (const f of features) {
      for (const role of f.roleAssignments ?? []) {
        expect(roles).toContain(role)
      }
    }
  })
})

// ============================================================
// 5. 위계: F.parent = R-ID, S.parent = F-ID
// ============================================================

describe("위계 — parent 필드", () => {
  it("기본 generateFeatures의 F.parent는 부모 R-ID다", () => {
    const reqs: FeatureItem[] = [
      { id: "R-AAA234", title: "요구1", acceptanceCriteria: ["Given a, When b, Then c"] },
      { id: "R-BBB234", title: "요구2", acceptanceCriteria: ["Given a, When b, Then c"] },
    ]
    const features = generateFeatures(reqs, ["기획자"], [])

    expect(features.length).toBeGreaterThan(0)
    for (const f of features) {
      expect(f.id).toMatch(/^F-[A-Z0-9]{6}$/)
      expect(["R-AAA234", "R-BBB234"]).toContain(f.parent)
    }
  })

  it("기본 generateSpecs의 S.parent는 부모 F-ID다", () => {
    const features: FeatureItem[] = [
      { id: "F-AAA234", title: "기능1", parent: "R-AAA234" },
    ]
    const specs = generateSpecs(features, [])

    expect(specs.length).toBeGreaterThan(0)
    for (const s of specs) {
      expect(s.id).toMatch(/^S-[A-Z0-9]{6}$/)
      expect(s.parent).toBe("F-AAA234")
    }
  })
})

// ============================================================
// 6·7. 병합 모드: codex / force / approve (D-14)
// ============================================================

describe("applyFeaturesMergePolicy — 병합모드 (D-14)", () => {
  const current: Features = {
    schemaVersion: "1.0",
    items: [
      { id: "R-OLD234", title: "사용자가 다듬은 기존 요구", acceptanceCriteria: ["Given x, When y, Then z"] },
      { id: "F-OLD234", title: "기존 기능", parent: "R-OLD234" },
    ],
  }

  const proposed: Features = {
    schemaVersion: "1.0",
    items: [
      { id: "R-OLD234", title: "AI가 새로 쓴 요구" },
      { id: "R-NEW234", title: "신규 요구", acceptanceCriteria: ["Given a, When b, Then c"] },
    ],
  }

  it("codex 모드: 기존 항목은 그대로 보존하고 신규 항목만 추가한다", () => {
    const result = applyFeaturesMergePolicy(current, proposed, "codex")

    const oldR = result.items?.find((i) => i.id === "R-OLD234")
    expect(oldR?.title).toBe("사용자가 다듬은 기존 요구")

    const oldF = result.items?.find((i) => i.id === "F-OLD234")
    expect(oldF?.title).toBe("기존 기능")

    const newR = result.items?.find((i) => i.id === "R-NEW234")
    expect(newR?.title).toBe("신규 요구")
  })

  it("force 모드: items 전체를 proposed로 덮어쓴다", () => {
    const result = applyFeaturesMergePolicy(current, proposed, "force")

    const ids = (result.items ?? []).map((i) => i.id).sort()
    expect(ids).toEqual(["R-NEW234", "R-OLD234"])

    const oldR = result.items?.find((i) => i.id === "R-OLD234")
    expect(oldR?.title).toBe("AI가 새로 쓴 요구")
    expect(result.items?.find((i) => i.id === "F-OLD234")).toBeUndefined()
  })

  it("approve 모드: 승인된 ID만 적용한다", () => {
    const result = applyFeaturesMergePolicy(current, proposed, "approve", ["R-NEW234"])

    // 승인 안 된 기존 항목 변경은 무시
    const oldR = result.items?.find((i) => i.id === "R-OLD234")
    expect(oldR?.title).toBe("사용자가 다듬은 기존 요구")

    // 승인된 신규 항목은 추가
    expect(result.items?.find((i) => i.id === "R-NEW234")?.title).toBe("신규 요구")
  })

  it("approve 모드: approvedIds가 비어 있으면 아무것도 변경하지 않는다", () => {
    const result = applyFeaturesMergePolicy(current, proposed, "approve", [])
    expect(result.items).toEqual(current.items)
  })

  it("결과 객체는 불변 — 원본 current를 변경하지 않는다", () => {
    const snapshot = JSON.parse(JSON.stringify(current)) as Features
    applyFeaturesMergePolicy(current, proposed, "force")
    expect(current).toEqual(snapshot)
  })
})

// ============================================================
// 8·9. 재생성 ID 고정 + 신규만 새 ID (D-13, FEAT-02/09)
// ============================================================

describe("generateFeatureSpec — 재생성 ID 고정 (D-13)", () => {
  it("같은 입력으로 두 번 실행해도 기존 R-/F-/S- ID가 변하지 않는다", async () => {
    const projectDir = await makeProjectWithPrd()

    const first = await generateFeatureSpec(projectDir, "codex")
    const second = await generateFeatureSpec(projectDir, "codex")

    const idsOf = (f: Features): string[] => (f.items ?? []).map((i) => i.id).sort()
    expect(idsOf(second)).toEqual(idsOf(first))
  })

  it("기존 항목 ID는 유지되고 신규 항목만 새 ID를 발급받는다", async () => {
    const projectDir = await makeProjectWithPrd()

    const first = await generateFeatureSpec(projectDir, "codex")
    const firstIds = new Set((first.items ?? []).map((i) => i.id))

    // PRD에 신규 기능 추가 (재생성 시 신규 R 파생)
    const prdPath = path.join(projectDir, "graph", "prd.json")
    const prd = JSON.parse(await fs.readFile(prdPath, "utf8")) as Record<string, unknown>
    const pas = prd.problemAndSolution as Record<string, unknown>
    await fs.writeFile(
      prdPath,
      JSON.stringify(
        {
          ...prd,
          problemAndSolution: {
            ...pas,
            features: [...(pas.features as string[]), "유저플로우 다이어그램"],
          },
        },
        null,
        2
      ) + "\n",
      "utf8"
    )

    const second = await generateFeatureSpec(projectDir, "codex")
    const secondItems = second.items ?? []

    // 기존 ID 전부 보존
    for (const id of firstIds) {
      expect(secondItems.some((i) => i.id === id), `기존 ID ${id} 소실`).toBe(true)
    }
    // 신규 항목 존재 (기존에 없던 ID)
    const newOnes = secondItems.filter((i) => !firstIds.has(i.id))
    expect(newOnes.length).toBeGreaterThan(0)
    for (const item of newOnes) {
      expect(item.id).toMatch(/^[RFS]-[A-Z0-9]{6}$/)
    }
  })
})

// ============================================================
// Task 2: aipm-features.md 커맨드 형상 스모크 (01-05 패턴)
// ============================================================

const FEATURES_CMD = path.join(process.cwd(), ".claude", "commands", "aipm-features.md")

function hasExplicitSkillCall(content: string, skill: string): boolean {
  const verb = /(호출|적용)/
  return content
    .split("\n")
    .some((line) => line.includes(skill) && verb.test(line))
}

describe("aipm-features.md — 커맨드 형상", () => {
  it("파일이 존재하고 frontmatter에 description·allowed-tools를 포함한다", async () => {
    const c = await fs.readFile(FEATURES_CMD, "utf8")
    expect(c).toMatch(/^---/)
    expect(c).toMatch(/description:/)
    expect(c).toContain("allowed-tools: [Read, Write, Bash, Skill]")
  })

  it("TTY 감지(test -t 0)와 noninteractive 분기를 명시한다", async () => {
    const c = await fs.readFile(FEATURES_CMD, "utf8")
    expect(c).toContain("test -t 0")
    expect(c).toContain("noninteractive")
  })

  it("의존성 게이트 — prd.json overview와 roles를 검사한다 (D-05)", async () => {
    const c = await fs.readFile(FEATURES_CMD, "utf8")
    expect(c).toContain("overview")
    expect(c).toContain("roles")
    expect(c).toContain("/aipm prd")
  })

  it("scripts/feature-generator.ts를 npx tsx로 호출한다", async () => {
    const c = await fs.readFile(FEATURES_CMD, "utf8")
    expect(c).toContain("npx tsx scripts/feature-generator.ts")
  })

  it("3모드(approve/force/codex)를 분기로 명시한다", async () => {
    const c = await fs.readFile(FEATURES_CMD, "utf8")
    expect(c).toContain("approve")
    expect(c).toContain("force")
    expect(c).toContain("codex")
  })

  it("document-writing 스킬에 명시적 Skill-도구 호출 지시문이 있다", async () => {
    const c = await fs.readFile(FEATURES_CMD, "utf8")
    expect(hasExplicitSkillCall(c, "document-writing")).toBe(true)
  })

  it("git add -A 문자열이 없다 (명시적 경로 스테이징)", async () => {
    const c = await fs.readFile(FEATURES_CMD, "utf8")
    expect(c).not.toContain("git add -A")
  })

  it("em-dash 문자가 없다", async () => {
    const c = await fs.readFile(FEATURES_CMD, "utf8")
    expect(c).not.toContain("—")
  })
})
