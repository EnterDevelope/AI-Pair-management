// ============================================================
// doc-deriver.test.ts — TDD: JSON->MD 단방향 파생 + 센티넬 주입 테스트
// (01-04-PLAN.md Task 1 + Task 2)
// ============================================================

import { describe, it, expect, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

import {
  SENTINEL,
  derivePrdMarkdown,
  writeMd,
  deriveDocs,
  deriveFeaturesMarkdown,
  deriveUserflowMarkdown,
} from "../doc-deriver.js"

import { scaffold } from "../scaffold.js"

// ============================================================
// 테스트 픽스처 헬퍼
// ============================================================

let tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aipm-doc-deriver-test-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

// 테스트용 최소 유효 prd.json 데이터
const samplePrd = {
  schemaVersion: "1.0" as const,
  id: "R-ABCDEF",
  title: "테스트 제품",
  description: "테스트 제품 설명",
  overview: "제품 개요 텍스트입니다.",
  problemAndSolution: "문제와 해결방안 텍스트입니다.",
  targetAndScenario: "타겟 사용자와 시나리오입니다.",
  successAndRisk: "성공 기준과 위험 요소입니다.",
  attributes: "속성 정보입니다.",
  northStar: { metric: "DAU 1000명", inputs: ["회원가입 전환율", "7일 유지율"] },
  milestones: [
    { name: "MVP", dueDate: "2026-09-01", deliverables: "핵심 기능 출시" },
    { name: "v1.0", dueDate: "2026-12-01", deliverables: "전체 기능 출시" },
  ],
  roles: ["PM", "개발자"],
  devices: ["웹", "모바일"],
}

// ============================================================
// Task 1: SENTINEL 상수
// ============================================================

describe("SENTINEL 상수", () => {
  it("센티넬이 정확한 문자열이다", () => {
    expect(SENTINEL).toBe("<!-- AIPM_GENERATED -->")
  })
})

// ============================================================
// Task 1: derivePrdMarkdown -- PRD.md 파생 + 센티넬 주입
// ============================================================

describe("derivePrdMarkdown -- 본문만 반환 (센티넬은 writeMd 책임)", () => {
  it("반환 본문은 SENTINEL을 직접 접두하지 않는다 (이중 센티넬 방지, CR-01)", () => {
    const out = derivePrdMarkdown(samplePrd, "ko")
    expect(out.startsWith(SENTINEL)).toBe(false)
    // 본문 전체에 센티넬 문자열이 등장하지 않는다 (writeMd가 단독 주입)
    expect(out.includes(SENTINEL)).toBe(false)
  })

  it("출력에 em-dash가 없다 (D-09 anti-slop)", () => {
    const out = derivePrdMarkdown(samplePrd, "ko")
    expect(/—/.test(out)).toBe(false)
  })
})

describe("derivePrdMarkdown -- 5섹션 단방향 동일성", () => {
  it("prd.json의 title 값이 출력에 포함된다", () => {
    const out = derivePrdMarkdown(samplePrd, "ko")
    expect(out).toContain("테스트 제품")
  })

  it("prd.json의 overview 값이 출력에 포함된다", () => {
    const out = derivePrdMarkdown(samplePrd, "ko")
    expect(out).toContain("제품 개요 텍스트입니다.")
  })

  it("prd.json의 problemAndSolution 값이 출력에 포함된다", () => {
    const out = derivePrdMarkdown(samplePrd, "ko")
    expect(out).toContain("문제와 해결방안 텍스트입니다.")
  })

  it("prd.json의 targetAndScenario 값이 출력에 포함된다", () => {
    const out = derivePrdMarkdown(samplePrd, "ko")
    expect(out).toContain("타겟 사용자와 시나리오입니다.")
  })

  it("prd.json의 successAndRisk 값이 출력에 포함된다", () => {
    const out = derivePrdMarkdown(samplePrd, "ko")
    expect(out).toContain("성공 기준과 위험 요소입니다.")
  })

  it("prd.json의 attributes 값이 출력에 포함된다", () => {
    const out = derivePrdMarkdown(samplePrd, "ko")
    expect(out).toContain("속성 정보입니다.")
  })
})

describe("derivePrdMarkdown -- 언어 설정", () => {
  it("lang=ko면 한국어 섹션 제목이 들어간다", () => {
    const out = derivePrdMarkdown(samplePrd, "ko")
    const hasKoreanSection =
      out.includes("개요") ||
      out.includes("문제") ||
      out.includes("타겟") ||
      out.includes("성공")
    expect(hasKoreanSection).toBe(true)
  })
})

describe("derivePrdMarkdown -- sectionMeta 비표시 (D-14)", () => {
  it("sectionMeta는 출력 본문에 포함되지 않는다", () => {
    const prdWithMeta = {
      ...samplePrd,
      sectionMeta: { overview: { sourceQ: "Q1", rationale: "내부 근거" } },
    }
    const out = derivePrdMarkdown(prdWithMeta, "ko")
    expect(out).not.toContain("sectionMeta")
    expect(out).not.toContain("내부 근거")
  })
})

// ============================================================
// Task 1: writeMd -- 파일 쓰기 + 센티넬 + 안내 주석
// ============================================================

describe("writeMd -- 파일 쓰기", () => {
  it("파일 첫 줄이 센티넬이다", async () => {
    const dir = await makeTempDir()
    const filePath = path.join(dir, "TEST.md")
    const content = "## 테스트 내용\n\n본문입니다."
    await writeMd(filePath, content)

    const raw = await fs.readFile(filePath, "utf8")
    const firstLine = raw.split("\n")[0]
    expect(firstLine).toBe("<!-- AIPM_GENERATED -->")
  })

  it("파일 둘째 줄이 직접편집 금지 안내 주석이다", async () => {
    const dir = await makeTempDir()
    const filePath = path.join(dir, "TEST.md")
    await writeMd(filePath, "## 본문")

    const raw = await fs.readFile(filePath, "utf8")
    const secondLine = raw.split("\n")[1]
    expect(secondLine).toContain("자동 생성")
  })

  it("본문 내용이 파일에 포함된다", async () => {
    const dir = await makeTempDir()
    const filePath = path.join(dir, "TEST.md")
    const content = "## 섹션 제목\n\n내용 텍스트"
    await writeMd(filePath, content)

    const raw = await fs.readFile(filePath, "utf8")
    expect(raw).toContain("## 섹션 제목")
    expect(raw).toContain("내용 텍스트")
  })
})

// ============================================================
// Task 2: deriveDocs -- 5종 MD 파생 + 오케스트레이션
// ============================================================

describe("deriveDocs -- 5종 MD 파일 생성", () => {
  it("docs/에 PRD.md, 1-pager.md, north-star.md, milestones.md, dev-brief.md 5개가 생성된다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-derive", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )

    await deriveDocs(projectDir)

    const expectedFiles = [
      "docs/PRD.md",
      "docs/1-pager.md",
      "docs/north-star.md",
      "docs/milestones.md",
      "docs/dev-brief.md",
    ]

    for (const relPath of expectedFiles) {
      const filePath = path.join(projectDir, relPath)
      await expect(fs.access(filePath)).resolves.not.toThrow()
    }
  })

  it("5개 파일 모두 첫 줄이 센티넬이다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-sentinel", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )

    await deriveDocs(projectDir)

    const files = [
      "docs/PRD.md",
      "docs/1-pager.md",
      "docs/north-star.md",
      "docs/milestones.md",
      "docs/dev-brief.md",
    ]

    for (const relPath of files) {
      const raw = await fs.readFile(path.join(projectDir, relPath), "utf8")
      const firstLine = raw.split("\n")[0]
      expect(firstLine, `${relPath} 첫 줄이 센티넬이어야 함`).toBe(
        "<!-- AIPM_GENERATED -->"
      )
    }
  })

  it("milestones.md가 prd.json.milestones 항목을 순서대로 반영한다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-milestones", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )

    await deriveDocs(projectDir)

    const raw = await fs.readFile(
      path.join(projectDir, "docs", "milestones.md"),
      "utf8"
    )
    expect(raw).toContain("MVP")
    expect(raw).toContain("v1.0")
    expect(raw.indexOf("MVP")).toBeLessThan(raw.indexOf("v1.0"))
  })

  it("north-star.md가 prd.json.northStar 데이터를 반영한다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-northstar", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )

    await deriveDocs(projectDir)

    const raw = await fs.readFile(
      path.join(projectDir, "docs", "north-star.md"),
      "utf8"
    )
    expect(raw).toContain("DAU 1000명")
  })

  it("northStar가 비어있어도 센티넬 유지 + 미정 플레이스홀더 (빈 파일 금지)", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-empty-ns", baseDir)

    const emptyPrd = {
      schemaVersion: "1.0",
      id: "R-ABCDEF",
    }

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(emptyPrd, null, 2) + "\n",
      "utf8"
    )

    await deriveDocs(projectDir)

    const raw = await fs.readFile(
      path.join(projectDir, "docs", "north-star.md"),
      "utf8"
    )
    expect(raw.split("\n")[0]).toBe("<!-- AIPM_GENERATED -->")
    expect(raw.length).toBeGreaterThan("<!-- AIPM_GENERATED -->".length + 10)
    expect(raw).toMatch(/미정|지표 미정|아직 정의되지/)
  })

  it("5개 파일 모두 em-dash가 없다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-no-emdash", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )

    await deriveDocs(projectDir)

    const files = [
      "docs/PRD.md",
      "docs/1-pager.md",
      "docs/north-star.md",
      "docs/milestones.md",
      "docs/dev-brief.md",
    ]

    for (const relPath of files) {
      const raw = await fs.readFile(path.join(projectDir, relPath), "utf8")
      expect(/—/.test(raw), `${relPath}에 em-dash가 없어야 함`).toBe(false)
    }
  })
})

describe("deriveDocs -- 스키마 검증 실패 시 throw", () => {
  it("prd.json이 스키마 위반이면 오류로 throw한다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-invalid", baseDir)

    // schemaVersion이 없는 유효하지 않은 데이터
    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify({ id: "R-ABCDEF" }, null, 2) + "\n",
      "utf8"
    )

    await expect(deriveDocs(projectDir)).rejects.toThrow()
  })
})

// ============================================================
// 03-01-PLAN.md Task 2: deriveFeaturesMarkdown + FEATURES.md 단방향 파생
// ============================================================

// 테스트용 features.json 샘플 (R->F->S 계층)
const sampleFeatures = {
  schemaVersion: "1.0" as const,
  items: [
    {
      id: "R-A1B2C3",
      title: "요구사항1",
      description: "요구사항 설명입니다.",
      acceptanceCriteria: ["Given 사용자가 로그인할 때 When 버튼을 누르면 Then 홈으로 이동"],
    },
    {
      id: "F-CHILD1",
      title: "기능1",
      description: "기능 설명",
      parent: "R-A1B2C3",
    },
    {
      id: "S-SPEC01",
      title: "상세기능1",
      parent: "F-CHILD1",
    },
    {
      id: "R-B2C3D4",
      title: "요구사항2",
    },
  ],
}

describe("deriveFeaturesMarkdown -- R/F/S 계층 마크다운 생성", () => {
  it("SENTINEL을 포함하지 않는다 (writeMd가 단독 주입)", () => {
    const out = deriveFeaturesMarkdown(sampleFeatures)
    expect(out.startsWith(SENTINEL)).toBe(false)
    expect(out.includes(SENTINEL)).toBe(false)
  })

  it("R 항목의 제목, 설명, acceptanceCriteria가 렌더된다 (FEAT-03)", () => {
    const out = deriveFeaturesMarkdown(sampleFeatures)
    expect(out).toContain("요구사항1")
    expect(out).toContain("요구사항 설명입니다.")
    expect(out).toContain("Given 사용자가 로그인할 때 When 버튼을 누르면 Then 홈으로 이동")
  })

  it("F 항목은 부모 R 아래에 렌더된다 (parent 필드 기준)", () => {
    const out = deriveFeaturesMarkdown(sampleFeatures)
    const rPos = out.indexOf("요구사항1")
    const fPos = out.indexOf("기능1")
    expect(rPos).toBeGreaterThanOrEqual(0)
    expect(fPos).toBeGreaterThan(rPos)
  })

  it("S 항목은 부모 F 아래에 렌더된다 (parent 필드 기준)", () => {
    const out = deriveFeaturesMarkdown(sampleFeatures)
    const fPos = out.indexOf("기능1")
    const sPos = out.indexOf("상세기능1")
    expect(fPos).toBeGreaterThanOrEqual(0)
    expect(sPos).toBeGreaterThan(fPos)
  })

  it("em-dash가 없다 (D-09 anti-slop)", () => {
    const out = deriveFeaturesMarkdown(sampleFeatures)
    expect(/—/.test(out)).toBe(false)
  })
})

// 테스트용 최소 유효 userflow.json 데이터
const sampleUserflow = {
  schemaVersion: "1.0" as const,
  nodes: [
    {
      type: "start" as const,
      id: "P-START1",
      label: "시작",
      versionId: "v-test",
    },
    {
      type: "section" as const,
      id: "P-SECT01",
      label: "진입",
      versionId: "v-test",
    },
    {
      type: "page" as const,
      id: "P-PAGE01",
      label: "로그인 화면",
      sectionId: "P-SECT01",
      versionId: "v-test",
    },
    {
      type: "page" as const,
      id: "P-PAGE02",
      label: "회원가입 화면",
      sectionId: "P-SECT01",
      versionId: "v-test",
    },
    {
      type: "section" as const,
      id: "P-SECT02",
      label: "핵심 플로우",
      versionId: "v-test",
    },
    {
      type: "page" as const,
      id: "P-PAGE03",
      label: "대시보드",
      sectionId: "P-SECT02",
      versionId: "v-test",
    },
    {
      type: "action" as const,
      id: "P-ACT001",
      label: "로그인 버튼 클릭",
      pageId: "P-PAGE01",
      versionId: "v-test",
    },
  ],
  edges: [
    { id: "P-EDGE01", source: "P-START1", target: "P-PAGE01", versionId: "v-test" },
    { id: "P-EDGE02", source: "P-PAGE01", target: "P-PAGE02", versionId: "v-test" },
  ],
}

// ============================================================
// Task 2 RED: deriveUserflowMarkdown + deriveDocs USERFLOW.md (04A-02)
// ============================================================

describe("deriveUserflowMarkdown -- USERFLOW.md 본문 파생 (FLOW-02)", () => {
  it("섹션은 H2(##), 페이지는 H3(###), 액션은 목록 항목으로 렌더된다", () => {
    const out = deriveUserflowMarkdown(sampleUserflow)
    // 섹션 H2 확인
    expect(out).toContain("## 진입")
    expect(out).toContain("## 핵심 플로우")
    // 페이지 H3 확인
    expect(out).toContain("### 로그인 화면")
    expect(out).toContain("### 대시보드")
    // 액션 목록 항목 확인
    expect(out).toMatch(/[-*]\s*로그인 버튼 클릭/)
  })

  it("반환값에 SENTINEL 문자열이 없다 (이중 주입 방지, CR-01)", () => {
    const out = deriveUserflowMarkdown(sampleUserflow)
    expect(out.includes(SENTINEL)).toBe(false)
  })

  it("em-dash가 없다 (D-09 anti-slop)", () => {
    const out = deriveUserflowMarkdown(sampleUserflow)
    expect(/—/.test(out)).toBe(false)
  })
})

describe("deriveDocs -- USERFLOW.md 단방향 파생 (D-17)", () => {
  it("graph/userflow.json 존재 시 docs/USERFLOW.md를 SENTINEL 헤더와 함께 작성한다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-userflow-derive", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )
    await fs.writeFile(
      path.join(projectDir, "graph", "userflow.json"),
      JSON.stringify(sampleUserflow, null, 2) + "\n",
      "utf8"
    )

    await deriveDocs(projectDir)

    const userflowMd = path.join(projectDir, "docs", "USERFLOW.md")
    await expect(fs.access(userflowMd)).resolves.not.toThrow()

    const raw = await fs.readFile(userflowMd, "utf8")
    expect(raw.split("\n")[0]).toBe("<!-- AIPM_GENERATED -->")
  })

  it("userflow.json 없거나 유효하지 않은 JSON이면 USERFLOW.md 미생성, throw 없음", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-no-userflow", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )
    // scaffold은 항상 userflow.json을 생성하므로 테스트 조건을 만들기 위해 삭제
    await fs.unlink(path.join(projectDir, "graph", "userflow.json"))

    // throw 안 하고 조용히 건너뜀
    await expect(deriveDocs(projectDir)).resolves.not.toThrow()

    const userflowMd = path.join(projectDir, "docs", "USERFLOW.md")
    await expect(fs.access(userflowMd)).rejects.toThrow()
  })
})

describe("deriveDocs -- FEATURES.md 단방향 파생 (D-16)", () => {
  it("graph/features.json 존재 시 docs/FEATURES.md를 SENTINEL 헤더와 함께 작성한다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-features-derive", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )
    await fs.writeFile(
      path.join(projectDir, "graph", "features.json"),
      JSON.stringify(sampleFeatures, null, 2) + "\n",
      "utf8"
    )

    await deriveDocs(projectDir)

    const featMd = path.join(projectDir, "docs", "FEATURES.md")
    await expect(fs.access(featMd)).resolves.not.toThrow()

    const raw = await fs.readFile(featMd, "utf8")
    expect(raw.split("\n")[0]).toBe("<!-- AIPM_GENERATED -->")
  })

  it("graph/features.json 없으면 FEATURES.md를 만들지 않는다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-no-features", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )
    // scaffold은 항상 features.json을 생성하므로 테스트 조건을 만들기 위해 삭제
    await fs.unlink(path.join(projectDir, "graph", "features.json"))

    await deriveDocs(projectDir)

    const featMd = path.join(projectDir, "docs", "FEATURES.md")
    await expect(fs.access(featMd)).rejects.toThrow()
  })

  it("features.json 파싱 실패 시 FEATURES.md 미생성, throw 없음", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-features-invalid", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )
    await fs.writeFile(
      path.join(projectDir, "graph", "features.json"),
      "{ 유효하지 않은 JSON",
      "utf8"
    )

    // throw 안 하고 조용히 건너뜀
    await expect(deriveDocs(projectDir)).resolves.not.toThrow()

    const featMd = path.join(projectDir, "docs", "FEATURES.md")
    await expect(fs.access(featMd)).rejects.toThrow()
  })
})
