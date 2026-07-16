// ============================================================
// flow-generator Wave 0 테스트 스텁 (04A-01-PLAN.md Task 3)
// GREEN 담당: 04A-02 (P02 — generateUserflow 구현)
// ============================================================
// 검증 대상: generateUserflow(projectDir, mode)
//   - userflow.json 생성 + UserflowSchema 통과
//   - 모든 노드 versionId 보유
//   - page/section 노드 P-ID 형식 보유
//   - featureId 태깅 (features.json에서 도출 가능한 경우)
//   - prd.json overview 없으면 한국어 에러 throw
// ============================================================

import { describe, it, expect, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

import { generateUserflow } from "../scripts/flow-generator.js"
import { scaffold } from "../scripts/scaffold.js"
import { UserflowSchema } from "../src/schemas/graph/userflow.js"

// ============================================================
// 테스트 픽스처 헬퍼
// ============================================================

let tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aipm-flow-gen-test-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

// 테스트용 최소 유효 prd.json (overview 있음 — 의존성 게이트 통과)
// 실제 PRD overview는 {summary: string} 객체 형태(D-06 구조). 픽스처도 동일하게 맞춘다.
const samplePrd = {
  schemaVersion: "1.0" as const,
  id: "R-ABCDEF",
  title: "테스트 제품",
  overview: { summary: "사용자가 PRD를 입력하면 유저플로우가 생성되는 제품" },
  problemAndSolution: "문제와 해결방안",
  targetAndScenario: "PM·기획자",
  successAndRisk: "성공 기준",
}

// 테스트용 features.json (featureId 태깅 검증용)
const sampleFeatures = {
  schemaVersion: "1.0" as const,
  items: [
    {
      id: "F-FEAT01",
      title: "로그인 기능",
      description: "이메일·비밀번호 로그인",
    },
    {
      id: "F-FEAT02",
      title: "대시보드",
      description: "메인 화면",
    },
  ],
}

// ============================================================
// FLOW-01: generateUserflow 통합 테스트
// ============================================================

describe("generateUserflow — userflow.json 생성 (FLOW-01)", () => {
  it("generateUserflow(projectDir) 실행 시 userflow.json이 생성된다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-flow-create", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )

    await generateUserflow(projectDir, "codex")

    const userflowPath = path.join(projectDir, "graph", "userflow.json")
    await expect(fs.access(userflowPath)).resolves.not.toThrow()
  })

  it("생성된 userflow.json이 UserflowSchema(schemaVersion:'1.0') 검증을 통과한다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-flow-schema", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )

    await generateUserflow(projectDir, "codex")

    const raw = await fs.readFile(
      path.join(projectDir, "graph", "userflow.json"),
      "utf8"
    )
    const parsed = JSON.parse(raw) as unknown
    const result = UserflowSchema.safeParse(parsed)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.schemaVersion).toBe("1.0")
    }
  })

  it("모든 노드에 versionId 필드가 존재한다 (D-07 버전 태깅)", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-flow-versionid", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )

    await generateUserflow(projectDir, "codex")

    const raw = await fs.readFile(
      path.join(projectDir, "graph", "userflow.json"),
      "utf8"
    )
    const parsed = JSON.parse(raw) as { nodes?: Array<{ versionId?: string; type?: string }> }
    const nodes = parsed.nodes ?? []
    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) {
      expect(
        node.versionId,
        `노드 타입 '${node.type}'에 versionId가 없음 (Pitfall 5)`
      ).toBeTruthy()
    }
  })

  it("start 노드에 첫 섹션 sectionId가 부여된다 (스윔레인 배치 + 렌더 조건)", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-flow-start", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )

    await generateUserflow(projectDir, "codex")

    const raw = await fs.readFile(
      path.join(projectDir, "graph", "userflow.json"),
      "utf8"
    )
    const parsed = JSON.parse(raw) as {
      nodes?: Array<{ id?: string; type?: string; sectionId?: string }>
    }
    const nodes = parsed.nodes ?? []
    const start = nodes.find((n) => n.type === "start")
    const sectionIds = new Set(
      nodes.filter((n) => n.type === "section").map((n) => n.id)
    )
    expect(start, "start 노드가 존재해야 함").toBeDefined()
    // sectionId 없으면 스윔레인 레이아웃이 드롭 → start 노드·엣지 미렌더
    expect(
      start?.sectionId,
      "start 노드에 sectionId가 부여되어야 함"
    ).toBeTruthy()
    expect(
      sectionIds.has(start?.sectionId ?? ""),
      "start의 sectionId가 실제 섹션 노드 id와 일치해야 함"
    ).toBe(true)
  })

  it("생성된 userflow.json에 versions가 1개 이상 저장된다 (FLOW-04 단일 파일 버전 공존)", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-flow-versions", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )

    await generateUserflow(projectDir, "codex")

    const raw = await fs.readFile(
      path.join(projectDir, "graph", "userflow.json"),
      "utf8"
    )
    const parsed = JSON.parse(raw) as { versions?: unknown[] }
    // 병합 정책이 proposed.versions를 누락하면 VersionPanel 드롭다운이 안 뜨고
    // 기존 버전 '수정본 만들기'가 비활성된다.
    expect(
      (parsed.versions ?? []).length,
      "생성 시 versions 배열이 비면 안 됨 (병합 정책 누락)"
    ).toBeGreaterThan(0)
  })

  it("page·section 노드 id가 P-XXXXXX 형식이다", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-flow-pid", baseDir)

    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(samplePrd, null, 2) + "\n",
      "utf8"
    )

    await generateUserflow(projectDir, "codex")

    const raw = await fs.readFile(
      path.join(projectDir, "graph", "userflow.json"),
      "utf8"
    )
    const parsed = JSON.parse(raw) as {
      nodes?: Array<{ id?: string; type?: string }>
    }
    const nodes = parsed.nodes ?? []
    const pidNodes = nodes.filter(
      (n) => n.type === "page" || n.type === "section"
    )
    expect(pidNodes.length).toBeGreaterThan(0)
    for (const node of pidNodes) {
      expect(
        node.id,
        `${node.type} 노드에 id가 없음`
      ).toBeTruthy()
      expect(
        /^P-[A-Z0-9]{6}$/.test(node.id ?? ""),
        `${node.type} 노드 id '${node.id}'가 P-XXXXXX 형식이 아님`
      ).toBe(true)
    }
  })

  it("features.json 존재 시 page 노드에 featureId가 태깅된다 (D-04 추적성)", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-flow-featureid", baseDir)

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

    await generateUserflow(projectDir, "codex")

    const raw = await fs.readFile(
      path.join(projectDir, "graph", "userflow.json"),
      "utf8"
    )
    const parsed = JSON.parse(raw) as {
      nodes?: Array<{ type?: string; featureId?: string }>
    }
    const nodes = parsed.nodes ?? []
    const pageNodes = nodes.filter((n) => n.type === "page")
    expect(pageNodes.length).toBeGreaterThan(0)
    // 최소 1개 이상의 page 노드에 featureId 태깅 (features.json에서 도출 가능한 경우)
    const taggedPages = pageNodes.filter((n) => n.featureId)
    expect(
      taggedPages.length,
      "features.json 존재 시 최소 1개 page 노드에 featureId가 태깅되어야 함 (D-04)"
    ).toBeGreaterThan(0)
  })

  it("prd.json overview 없으면 한국어 에러를 throw한다 (의존성 게이트)", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-flow-gate", baseDir)

    // overview가 없는 prd.json
    const prdWithoutOverview = {
      schemaVersion: "1.0",
      id: "R-ABCDEF",
    }
    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(prdWithoutOverview, null, 2) + "\n",
      "utf8"
    )

    await expect(generateUserflow(projectDir, "codex")).rejects.toThrow(
      /aipm prd/
    )
  })

  it("overview가 문자열(레거시 형태)이어도 생성에 성공한다 (하위호환)", async () => {
    const baseDir = await makeTempDir()
    const projectDir = await scaffold("test-flow-legacy-overview", baseDir)

    // 레거시 PRD: overview가 객체가 아닌 순수 문자열
    const legacyPrd = {
      schemaVersion: "1.0",
      id: "R-ABCDEF",
      title: "레거시 제품",
      overview: "문자열 형태 overview 입니다",
    }
    await fs.writeFile(
      path.join(projectDir, "graph", "prd.json"),
      JSON.stringify(legacyPrd, null, 2) + "\n",
      "utf8"
    )

    const result = await generateUserflow(projectDir, "codex")
    expect(
      (result.nodes ?? []).length,
      "문자열 overview에서도 노드가 생성되어야 함"
    ).toBeGreaterThan(0)
  })
})
