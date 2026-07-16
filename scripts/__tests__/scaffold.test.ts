// ============================================================
// scaffold.test.ts — TDD RED: scaffold.js 실패 테스트 (00-06-PLAN.md)
// ============================================================

import { describe, it, expect, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

// Task 1에서 구현할 scaffold 함수 (아직 존재하지 않음 — RED)
import { scaffold } from "../scaffold.js"

// ============================================================
// 테스트 픽스처 헬퍼
// ============================================================

let tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aipm-scaffold-test-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

// ============================================================
// Task 1: 폴더 트리 생성 + 5개 graph 파일 + .gitkeep
// ============================================================

describe("scaffold — 폴더 트리 생성", () => {
  it("프로젝트 폴더 트리를 생성한다 (graph/ docs/ wireframes/ .aipm/queue/ .aipm/history/)", async () => {
    const baseDir = await makeTempDir()
    await scaffold("demo", baseDir)

    const dirs = [
      "demo/graph",
      "demo/docs",
      "demo/wireframes",
      "demo/.aipm/queue",
      "demo/.aipm/history",
    ]

    for (const dir of dirs) {
      const stat = await fs.stat(path.join(baseDir, dir))
      expect(stat.isDirectory(), `${dir} should be a directory`).toBe(true)
    }
  })

  it("5개 graph 파일과 project.json을 생성한다", async () => {
    const baseDir = await makeTempDir()
    await scaffold("myproject", baseDir)

    const files = [
      "myproject/project.json",
      "myproject/graph/prd.json",
      "myproject/graph/features.json",
      "myproject/graph/userflow.json",
      "myproject/graph/ia.json",
    ]

    for (const file of files) {
      const stat = await fs.stat(path.join(baseDir, file))
      expect(stat.isFile(), `${file} should be a file`).toBe(true)
    }
  })

  it("빈 디렉토리에 .gitkeep 파일을 생성한다", async () => {
    const baseDir = await makeTempDir()
    await scaffold("demo", baseDir)

    const gitkeeps = [
      "demo/docs/.gitkeep",
      "demo/wireframes/.gitkeep",
      "demo/.aipm/queue/.gitkeep",
      "demo/.aipm/history/.gitkeep",
    ]

    for (const gk of gitkeeps) {
      const stat = await fs.stat(path.join(baseDir, gk))
      expect(stat.isFile(), `${gk} should exist`).toBe(true)
    }
  })

  it("생성된 5개 JSON 파일이 schemaVersion '1.0'을 갖는다 (Pitfall 4)", async () => {
    const baseDir = await makeTempDir()
    await scaffold("demo", baseDir)

    const files = [
      { file: "myproject/project.json" },
      { file: "myproject/graph/prd.json" },
      { file: "myproject/graph/features.json" },
      { file: "myproject/graph/userflow.json" },
      { file: "myproject/graph/ia.json" },
    ]

    // demo로 재실행
    const jsonFiles = [
      "demo/project.json",
      "demo/graph/prd.json",
      "demo/graph/features.json",
      "demo/graph/userflow.json",
      "demo/graph/ia.json",
    ]

    for (const f of jsonFiles) {
      const raw = await fs.readFile(path.join(baseDir, f), "utf8")
      const parsed = JSON.parse(raw) as Record<string, unknown>
      expect(parsed.schemaVersion, `${f} should have schemaVersion`).toBe("1.0")
    }
  })

  it("이미 존재하는 프로젝트 폴더는 덮어쓰지 않고 에러를 던진다", async () => {
    const baseDir = await makeTempDir()
    await scaffold("demo", baseDir)
    await expect(scaffold("demo", baseDir)).rejects.toThrow()
  })
})

// ============================================================
// Task 1: path traversal 보안 방어 테스트
// ============================================================

describe("scaffold — path traversal 방어 (T-00-06a)", () => {
  it("../escape 형태 이름을 거부한다", async () => {
    const baseDir = await makeTempDir()
    await expect(scaffold("../escape", baseDir)).rejects.toThrow()
  })

  it("절대경로 이름을 거부한다", async () => {
    const baseDir = await makeTempDir()
    await expect(scaffold("/tmp/evil", baseDir)).rejects.toThrow()
  })

  it("이름에 슬래시가 포함된 경우 거부한다", async () => {
    const baseDir = await makeTempDir()
    await expect(scaffold("a/b", baseDir)).rejects.toThrow()
  })

  it("영숫자·하이픈만 허용한다 (특수문자 거부)", async () => {
    const baseDir = await makeTempDir()
    await expect(scaffold("bad name!", baseDir)).rejects.toThrow()
    await expect(scaffold("bad_name", baseDir)).rejects.toThrow()
  })
})

// ============================================================
// Task 2: 통합 검증 — 생성물이 스키마를 통과한다 (plan 03 연결)
// ============================================================

describe("scaffold 통합 — 생성물이 validateGraphFile을 통과한다 (T-00-06c)", () => {
  it("생성된 project.json이 validateGraphFile('project', ...) 통과한다", async () => {
    const baseDir = await makeTempDir()
    await scaffold("demo", baseDir)
    const { validateGraphFile } = await import("../../src/lib/validate.js")
    const raw = await fs.readFile(path.join(baseDir, "demo/project.json"), "utf8")
    expect(() => validateGraphFile("project", JSON.parse(raw))).not.toThrow()
  })

  it("생성된 prd.json이 validateGraphFile('prd', ...) 통과한다", async () => {
    const baseDir = await makeTempDir()
    await scaffold("demo", baseDir)
    const { validateGraphFile } = await import("../../src/lib/validate.js")
    const raw = await fs.readFile(path.join(baseDir, "demo/graph/prd.json"), "utf8")
    expect(() => validateGraphFile("prd", JSON.parse(raw))).not.toThrow()
  })

  it("생성된 features.json이 validateGraphFile('features', ...) 통과한다", async () => {
    const baseDir = await makeTempDir()
    await scaffold("demo", baseDir)
    const { validateGraphFile } = await import("../../src/lib/validate.js")
    const raw = await fs.readFile(path.join(baseDir, "demo/graph/features.json"), "utf8")
    expect(() => validateGraphFile("features", JSON.parse(raw))).not.toThrow()
  })

  it("생성된 userflow.json이 validateGraphFile('userflow', ...) 통과한다", async () => {
    const baseDir = await makeTempDir()
    await scaffold("demo", baseDir)
    const { validateGraphFile } = await import("../../src/lib/validate.js")
    const raw = await fs.readFile(path.join(baseDir, "demo/graph/userflow.json"), "utf8")
    expect(() => validateGraphFile("userflow", JSON.parse(raw))).not.toThrow()
  })

  it("생성된 ia.json이 validateGraphFile('ia', ...) 통과한다", async () => {
    const baseDir = await makeTempDir()
    await scaffold("demo", baseDir)
    const { validateGraphFile } = await import("../../src/lib/validate.js")
    const raw = await fs.readFile(path.join(baseDir, "demo/graph/ia.json"), "utf8")
    expect(() => validateGraphFile("ia", JSON.parse(raw))).not.toThrow()
  })

  it("schemaVersion 누락 파일은 validateGraphFile에서 거부된다 (음성 케이스)", async () => {
    const baseDir = await makeTempDir()
    await scaffold("demo", baseDir)
    const { validateGraphFile } = await import("../../src/lib/validate.js")
    const broken = { id: "R-AAAAAA" } // schemaVersion 없음
    expect(() => validateGraphFile("prd", broken)).toThrow()
  })
})
