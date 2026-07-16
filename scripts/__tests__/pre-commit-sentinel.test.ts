/**
 * pre-commit-sentinel.test.ts — pre-commit 훅 통합 테스트
 *
 * 임시 git 레포를 생성해 pre-commit-sentinel.sh 동작을 직접 검증한다.
 * DATA-03 / ROADMAP 성공기준 5: 자동 생성 MD 직접 커밋 시 훅이 BLOCK해야 함.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

// 프로젝트 루트 — pre-commit-sentinel.sh 절대 경로 참조
const __dirname = new URL(".", import.meta.url).pathname
const PROJECT_ROOT = resolve(__dirname, "../..")
const HOOK_PATH = join(PROJECT_ROOT, "scripts", "pre-commit-sentinel.sh")
const SENTINEL = "<!-- AIPM_GENERATED -->"

/** 임시 git repo 초기화 후 경로 반환 */
function createTmpRepo(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "aipm-sentinel-"))
  spawnSync("git", ["init"], { cwd: tmpDir })
  spawnSync("git", ["config", "user.email", "test@aipm.test"], { cwd: tmpDir })
  spawnSync("git", ["config", "user.name", "AIPM Test"], { cwd: tmpDir })
  mkdirSync(join(tmpDir, "docs"), { recursive: true })
  mkdirSync(join(tmpDir, "graph"), { recursive: true })
  mkdirSync(join(tmpDir, "scripts"), { recursive: true })
  copyFileSync(
    join(PROJECT_ROOT, "scripts", "check-public-boundary.mjs"),
    join(tmpDir, "scripts", "check-public-boundary.mjs"),
  )
  return tmpDir
}

/** 파일 작성 + git add 후 훅 실행, {status, stderr} 반환 */
function runHook(
  tmpDir: string,
  filePath: string,
  content: string,
): { status: number; stderr: string } {
  writeFileSync(filePath, content)
  spawnSync("git", ["add", filePath], { cwd: tmpDir })
  const result = spawnSync("bash", [HOOK_PATH], { cwd: tmpDir, encoding: "utf8" })
  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? "",
  }
}

describe("pre-commit-sentinel.sh — 센티넬 차단 훅", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTmpRepo()
  })

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("센티넬 있는 docs/PRD.md stage 후 훅 실행 → exit 1 + stderr에 /aipm prd", () => {
    const filePath = join(tmpDir, "docs", "PRD.md")
    const content = `${SENTINEL}\n\n# PRD 문서\n\n자동 생성된 내용.`

    const { status, stderr } = runHook(tmpDir, filePath, content)

    expect(status).toBe(1)
    expect(stderr).toContain("/aipm prd")
  })

  it("센티넬 없는 docs/notes.md stage 후 훅 실행 → exit 0", () => {
    const filePath = join(tmpDir, "docs", "notes.md")
    const content = `# 메모\n\n직접 작성한 메모입니다.`

    const { status } = runHook(tmpDir, filePath, content)

    expect(status).toBe(0)
  })

  it("graph/prd.json만 stage → exit 0 (MD 아님)", () => {
    const filePath = join(tmpDir, "graph", "prd.json")
    const content = JSON.stringify({ schemaVersion: "1.0", id: "R-AAAAAA" }, null, 2)

    const { status } = runHook(tmpDir, filePath, content)

    expect(status).toBe(0)
  })

  it("staged 파일 없음 → exit 0", () => {
    // 아무 파일도 stage하지 않고 훅 실행
    const result = spawnSync("bash", [HOOK_PATH], { cwd: tmpDir, encoding: "utf8" })

    expect(result.status ?? 1).toBe(0)
  })

  it("stage 후 워킹트리에서 센티넬 제거해도 차단된다 (인덱스 검사, 우회 방지 CR-04)", () => {
    const filePath = join(tmpDir, "docs", "PRD.md")
    // 1) 센티넬 포함 내용으로 stage
    writeFileSync(filePath, `${SENTINEL}\n\n# PRD\n\n자동 생성된 내용.`)
    spawnSync("git", ["add", filePath], { cwd: tmpDir })
    // 2) 워킹트리에서 센티넬 제거 (재-stage 안 함 → 인덱스 stage 0 에는 센티넬 유지)
    writeFileSync(filePath, `# PRD\n\n센티넬을 제거한 우회 시도.`)
    // 3) 훅 실행 → 워킹트리가 아니라 인덱스를 읽으므로 여전히 차단
    const result = spawnSync("bash", [HOOK_PATH], { cwd: tmpDir, encoding: "utf8" })

    expect(result.status ?? 1).toBe(1)
    expect(result.stderr ?? "").toContain("/aipm prd")
  })
})
