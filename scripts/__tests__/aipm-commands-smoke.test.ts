// ============================================================
// aipm-commands-smoke.test.ts — 커맨드 파일 결정론적 형상 검증 (01-05-PLAN.md Task 3)
// ============================================================
// CC 세션 실행 없이 검증 가능한 계약만 단언한다:
//   1. 커맨드 파일 형상(frontmatter / TTY 분기 / 직접입력 폴백 / 스크립트 참조)
//   2. 안전 규칙(전체 일괄 스테이징 부재 / em-dash 부재 / 스킬 파일 Read 부재)
//   3. 명시적 Skill-도구 호출 지시문(스킬 이름 + 호출 동사 동시 등장)
//   4. 의존성 게이트(overview) + 3모드
//   5. 결정론적 E2E 형상: scaffold → generatePrd → deriveDocs → 5종 센티넬 + R-ID 불변
// CC 세션 의존 동작(양 경로 안 멈춤 등)은 사람-검증 게이트로 분리한다.
// ============================================================

import { describe, it, expect, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

import { scaffold } from "../scaffold.js"
import { generatePrd } from "../prd-generator.js"
import { deriveDocs, SENTINEL } from "../doc-deriver.js"
import type { Intake } from "../../src/lib/intake.js"

// ============================================================
// 커맨드 파일 경로 (vitest는 리포 루트에서 실행)
// ============================================================

const COMMANDS_DIR = path.join(process.cwd(), ".claude", "commands")
const NEW_CMD = path.join(COMMANDS_DIR, "aipm-new.md")
const PRD_CMD = path.join(COMMANDS_DIR, "aipm-prd.md")

async function readCmd(p: string): Promise<string> {
  return fs.readFile(p, "utf8")
}

/**
 * 한 파일 안에 "스킬 이름"과 "호출 동사"가 같은 줄에 동시 등장하는지 검사.
 * (명시적 Skill-도구 호출 지시문 — RESEARCH Q1 RESOLVED)
 */
function hasExplicitSkillCall(content: string, skill: string): boolean {
  const verb = /(호출|적용)/
  return content
    .split("\n")
    .some((line) => line.includes(skill) && verb.test(line))
}

// ============================================================
// 1. aipm-new.md 형상
// ============================================================

describe("aipm-new.md — 커맨드 형상", () => {
  it("파일이 존재하고 frontmatter에 description·allowed-tools·$ARGUMENTS를 포함한다", async () => {
    const c = await readCmd(NEW_CMD)
    expect(c).toMatch(/^---/)
    expect(c).toMatch(/description:/)
    expect(c).toMatch(/allowed-tools:/)
    expect(c).toContain("$ARGUMENTS")
  })

  it("TTY 감지(test -t 0) 분기와 '직접입력' 폴백을 명시한다", async () => {
    const c = await readCmd(NEW_CMD)
    expect(c).toContain("test -t 0")
    expect(c).toContain("직접입력")
  })

  it("scaffold → prd-generator → doc-deriver를 순서대로 참조한다", async () => {
    const c = await readCmd(NEW_CMD)
    const iScaffold = c.indexOf("scaffold.ts")
    const iGen = c.indexOf("prd-generator.ts")
    const iDeriver = c.indexOf("doc-deriver.ts")
    expect(iScaffold).toBeGreaterThanOrEqual(0)
    expect(iGen).toBeGreaterThan(iScaffold)
    expect(iDeriver).toBeGreaterThan(iGen)
  })

  it("합성하는 글로벌 스킬 각각에 명시적 Skill-도구 호출 지시문이 있다", async () => {
    const c = await readCmd(NEW_CMD)
    const required = [
      "pm-interview",
      "socratic-interviewer",
      "brainstorming",
      "create-prd",
      "document-writing",
      "north-star-metric",
      "backlog-items",
    ]
    for (const skill of required) {
      expect(hasExplicitSkillCall(c, skill), `${skill} 명시적 호출 지시문 누락`).toBe(true)
    }
    // 마일스톤 스킬은 outcome-roadmap 또는 sprint-plan 중 하나 이상
    expect(
      hasExplicitSkillCall(c, "outcome-roadmap") || hasExplicitSkillCall(c, "sprint-plan"),
      "outcome-roadmap/sprint-plan 호출 지시문 누락"
    ).toBe(true)
  })
})

// ============================================================
// 2. aipm-prd.md 형상
// ============================================================

describe("aipm-prd.md — 커맨드 형상", () => {
  it("파일이 존재하고 frontmatter에 description·allowed-tools를 포함한다", async () => {
    const c = await readCmd(PRD_CMD)
    expect(c).toMatch(/^---/)
    expect(c).toMatch(/description:/)
    expect(c).toMatch(/allowed-tools:/)
  })

  it("scripts/prd-generator를 참조한다", async () => {
    const c = await readCmd(PRD_CMD)
    expect(c).toContain("scripts/prd-generator")
  })

  it("3모드(approve/force/codex)를 분기로 명시한다", async () => {
    const c = await readCmd(PRD_CMD)
    expect(c).toContain("approve")
    expect(c).toContain("force")
    expect(c).toContain("codex")
  })

  it("overview 의존성 게이트(features/flow 차단 안내)를 명시한다", async () => {
    const c = await readCmd(PRD_CMD)
    expect(c).toContain("overview")
    expect(c).toMatch(/features|flow/)
  })

  it("prd.json 부재 시 '/aipm new' 먼저 실행 안내가 있다", async () => {
    const c = await readCmd(PRD_CMD)
    expect(c).toContain("/aipm new")
  })

  it("재생성 스킬(document-writing)에 명시적 Skill-도구 호출 지시문이 있다", async () => {
    const c = await readCmd(PRD_CMD)
    expect(hasExplicitSkillCall(c, "document-writing")).toBe(true)
  })
})

// ============================================================
// 3. 두 파일 공통 안전 규칙
// ============================================================

describe("커맨드 파일 — 안전 규칙", () => {
  it("두 파일 모두 전체 일괄 스테이징(git add 와 -A 조합) 문자열이 없다", async () => {
    for (const p of [NEW_CMD, PRD_CMD]) {
      const c = await readCmd(p)
      expect(c).not.toContain("git add -A")
    }
  })

  it("두 파일 모두 em-dash(—) 문자가 없다", async () => {
    for (const p of [NEW_CMD, PRD_CMD]) {
      const c = await readCmd(p)
      expect(c).not.toContain("—")
    }
  })

  it("두 파일 모두 스킬 파일 Read/source 패턴이 없다(Pitfall 1)", async () => {
    for (const p of [NEW_CMD, PRD_CMD]) {
      const c = await readCmd(p)
      expect(c).not.toMatch(/Read\s+[^\n]*\.claude\/skills/)
      expect(c).not.toMatch(/source\s+[^\n]*\.claude\/skills/)
    }
  })
})

// ============================================================
// 4. 결정론적 E2E 형상: scaffold → generatePrd → deriveDocs
// ============================================================

let tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aipm-smoke-test-"))
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
    targetAndScenario: "IT PM이 로컬에서 기획 산출물을 만든다",
    problemStatement: "클라우드 의존 없는 AI 기획 도구가 필요하다",
    coreFeatures: ["PRD 자동 생성", "기능명세 트리"],
    scopeAndPriority: "Phase 1: PRD",
    platformDevice: ["macOS", "Desktop"],
    successCriteria: "1회 입력으로 산출물 생성",
    rawIdea: "로컬 AI 기획 하네스",
    detectedLang: "ko",
    ...overrides,
  }
}

describe("E2E 형상 — scaffold → generatePrd → deriveDocs", () => {
  it("docs/ 5종 MD가 생성되고 각 파일 첫 줄이 센티넬이다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("smoke-project", baseDir)
    await generatePrd(projectDir, makeMockIntake())
    await deriveDocs(projectDir)

    const docNames = ["PRD.md", "1-pager.md", "north-star.md", "milestones.md", "dev-brief.md"]
    for (const name of docNames) {
      const filePath = path.join(projectDir, "docs", name)
      const raw = await fs.readFile(filePath, "utf8")
      const firstLine = raw.split("\n")[0]
      expect(firstLine, `${name} 첫 줄 센티넬 누락`).toBe(SENTINEL)
    }
  })

  it("동일 intake로 generatePrd를 두 번 실행해도 prd.json R-ID가 불변이다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("smoke-id-project", baseDir)
    const intake = makeMockIntake()

    const prd1 = await generatePrd(projectDir, intake)
    const prd2 = await generatePrd(projectDir, intake)

    const ids = (prd: unknown): string[] => {
      const json = JSON.stringify(prd)
      return (json.match(/R-[A-Za-z0-9]+/g) ?? []).sort()
    }
    expect(ids(prd1)).toEqual(ids(prd2))
  })
})
