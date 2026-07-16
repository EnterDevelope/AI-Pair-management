/**
 * merge-driver.test.ts — 단위 + E2E 테스트
 * TDD RED: merge-driver.js, setup-git.js, .gitattributes 아직 없으므로 실패해야 함
 */

import { describe, it, expect, afterEach } from "vitest"
import { execSync, spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

// 프로젝트 루트 — 절대 경로로 merge-driver.js 참조
const PROJECT_ROOT = resolve(import.meta.url.replace("file://", ""), "../../..")

/** 임시 JSON 파일 3개를 만들고 merge-driver.js 실행, {exitCode, result} 반환 */
function runMergeDriver(
  ancestor: unknown,
  current: unknown,
  other: unknown,
): { exitCode: number; result: unknown; raw: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), "aipm-merge-"))
  const ancestorPath = join(tmpDir, "ancestor.json")
  const currentPath = join(tmpDir, "current.json")
  const otherPath = join(tmpDir, "other.json")

  writeFileSync(ancestorPath, JSON.stringify(ancestor, null, 2))
  writeFileSync(currentPath, JSON.stringify(current, null, 2))
  writeFileSync(otherPath, JSON.stringify(other, null, 2))

  const driverPath = join(PROJECT_ROOT, "scripts", "merge-driver.js")
  const result = spawnSync("node", [driverPath, ancestorPath, currentPath, otherPath], {
    encoding: "utf8",
  })

  const raw = readFileSync(currentPath, "utf8")
  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    // 충돌 마커가 있으면 JSON.parse 실패 — raw 문자열로 단언
    parsed = null
  }

  // 임시 파일 정리
  rmSync(tmpDir, { recursive: true, force: true })

  return { exitCode: result.status ?? 1, result: parsed, raw }
}

describe("merge-driver.js — ID 배열 시맨틱 3-way 병합", () => {
  it("서로 다른 id 항목 추가 → 자동 병합, exit 0, 모든 항목 보존", () => {
    const ancestor = { schemaVersion: "1.0", items: [{ id: "R-AAAAAA", title: "base" }] }
    const current = {
      schemaVersion: "1.0",
      items: [
        { id: "R-AAAAAA", title: "base" },
        { id: "R-BBBBBB", title: "current item" },
      ],
    }
    const other = {
      schemaVersion: "1.0",
      items: [
        { id: "R-AAAAAA", title: "base" },
        { id: "R-CCCCCC", title: "other item" },
      ],
    }

    const { exitCode, result } = runMergeDriver(ancestor, current, other)

    expect(exitCode).toBe(0)
    const items = (result as { items: Array<{ id: string }> }).items
    const ids = items.map((i) => i.id)
    expect(ids).toContain("R-AAAAAA")
    expect(ids).toContain("R-BBBBBB")
    expect(ids).toContain("R-CCCCCC")
    expect(ids).toHaveLength(3)
  })

  it("한쪽만 필드 변경 → 그 값 채택, exit 0", () => {
    const ancestor = {
      schemaVersion: "1.0",
      items: [{ id: "R-AAAAAA", title: "old title" }],
    }
    const current = {
      schemaVersion: "1.0",
      items: [{ id: "R-AAAAAA", title: "updated title" }],
    }
    const other = {
      schemaVersion: "1.0",
      items: [{ id: "R-AAAAAA", title: "old title" }], // other 미변경
    }

    const { exitCode, result } = runMergeDriver(ancestor, current, other)

    expect(exitCode).toBe(0)
    const items = (result as { items: Array<{ id: string; title: string }> }).items
    expect(items[0]?.title).toBe("updated title")
  })

  it("양쪽이 같은 id 같은 필드를 다르게 변경 → 충돌 마커, exit 1", () => {
    const ancestor = {
      schemaVersion: "1.0",
      items: [{ id: "R-AAAAAA", title: "original" }],
    }
    const current = {
      schemaVersion: "1.0",
      items: [{ id: "R-AAAAAA", title: "current version" }],
    }
    const other = {
      schemaVersion: "1.0",
      items: [{ id: "R-AAAAAA", title: "other version" }],
    }

    const { exitCode, raw } = runMergeDriver(ancestor, current, other)

    expect(exitCode).toBe(1)
    expect(raw).toContain("<<<<<<<")
    expect(raw).toContain("=======")
    expect(raw).toContain(">>>>>>>")
  })

  it("한쪽이 항목 삭제, 다른쪽 미변경 → 삭제 반영, exit 0", () => {
    const ancestor = {
      schemaVersion: "1.0",
      items: [
        { id: "R-AAAAAA", title: "keep" },
        { id: "R-BBBBBB", title: "to delete" },
      ],
    }
    const current = {
      schemaVersion: "1.0",
      items: [{ id: "R-AAAAAA", title: "keep" }], // R-BBBBBB 삭제
    }
    const other = {
      schemaVersion: "1.0",
      items: [
        { id: "R-AAAAAA", title: "keep" },
        { id: "R-BBBBBB", title: "to delete" }, // other 미변경
      ],
    }

    const { exitCode, result } = runMergeDriver(ancestor, current, other)

    expect(exitCode).toBe(0)
    const items = (result as { items: Array<{ id: string }> }).items
    // current가 삭제했으므로 R-BBBBBB는 없어야 함
    const ids = items.map((i) => i.id)
    expect(ids).not.toContain("R-BBBBBB")
    expect(ids).toContain("R-AAAAAA")
  })

  it("items 키가 없는 스키마 → 방어 처리, exit 0", () => {
    const ancestor = { schemaVersion: "1.0", title: "PRD" }
    const current = { schemaVersion: "1.0", title: "PRD current" }
    const other = { schemaVersion: "1.0", title: "PRD" }

    const { exitCode } = runMergeDriver(ancestor, current, other)

    // items가 없어도 크래시하지 않아야 함
    expect(exitCode).toBe(0)
  })
})

describe("setup-git.js — git 저장소 밖 skip 테스트", () => {
  it("git 저장소 밖 실행 시 throw하지 않고 종료", () => {
    // git 저장소가 아닌 임시 디렉토리에서 실행
    const tmpDir = mkdtempSync(join(tmpdir(), "aipm-nogit-"))
    const setupPath = join(PROJECT_ROOT, "scripts", "setup-git.js")

    const result = spawnSync("node", [setupPath], {
      cwd: tmpDir,
      encoding: "utf8",
    })

    rmSync(tmpDir, { recursive: true, force: true })

    // exit 1이 아니어야 함 (throw 없이 skip)
    expect(result.status).toBe(0)
  })
})

describe("E2E: 실제 git merge — 서로 다른 id 자동 병합", () => {
  let e2eDir: string

  afterEach(() => {
    if (e2eDir && existsSync(e2eDir)) {
      rmSync(e2eDir, { recursive: true, force: true })
    }
  })

  it("두 브랜치가 다른 id 항목 추가하면 git merge가 자동 병합", () => {
    e2eDir = mkdtempSync(join(tmpdir(), "aipm-e2e-"))

    // git 레포 초기화
    execSync("git init", { cwd: e2eDir })
    execSync('git config user.email "test@aipm.test"', { cwd: e2eDir })
    execSync('git config user.name "AIPM Test"', { cwd: e2eDir })

    // .gitattributes 복사 (프로젝트 루트 기준)
    const gitattributesPath = join(PROJECT_ROOT, ".gitattributes")
    const gitattributesDst = join(e2eDir, ".gitattributes")
    // .gitattributes에서 graph/*.json 라인 추출하여 임시 레포에 씀
    const gitattributes = readFileSync(gitattributesPath, "utf8")
    writeFileSync(gitattributesDst, gitattributes)

    // 임시 레포에 드라이버 등록 (호스트 .git/config 오염 방지)
    const driverPath = join(PROJECT_ROOT, "scripts", "merge-driver.js")
    execSync(
      `git config merge.aipm-json-merge.name "AIPM JSON semantic merge"`,
      { cwd: e2eDir },
    )
    // driverPath를 보간하지 않고 spawnSync로 인자 배열 전달 (보안: 셸 주입 방지)
    spawnSync(
      "git",
      ["config", "merge.aipm-json-merge.driver", `node ${driverPath} %O %A %B`],
      { cwd: e2eDir },
    )
    execSync(`git config merge.aipm-json-merge.recursive binary`, { cwd: e2eDir })

    // graph 디렉토리 생성
    mkdirSync(join(e2eDir, "graph"))

    // main 브랜치에 초기 커밋
    const initialJson = { schemaVersion: "1.0", items: [{ id: "R-AAAAAA", title: "base" }] }
    writeFileSync(join(e2eDir, "graph", "features.json"), JSON.stringify(initialJson, null, 2))
    execSync("git add .", { cwd: e2eDir })
    execSync('git commit -m "init"', { cwd: e2eDir })

    // feature-a 브랜치: item B 추가
    execSync("git checkout -b feature-a", { cwd: e2eDir })
    const branchAJson = {
      schemaVersion: "1.0",
      items: [
        { id: "R-AAAAAA", title: "base" },
        { id: "R-BBBBBB", title: "branch A item" },
      ],
    }
    writeFileSync(join(e2eDir, "graph", "features.json"), JSON.stringify(branchAJson, null, 2))
    execSync("git add graph/features.json", { cwd: e2eDir })
    execSync('git commit -m "add item B"', { cwd: e2eDir })

    // main으로 돌아가 feature-b 브랜치: item C 추가
    execSync("git checkout -", { cwd: e2eDir })
    execSync("git checkout -b feature-b", { cwd: e2eDir })
    const branchBJson = {
      schemaVersion: "1.0",
      items: [
        { id: "R-AAAAAA", title: "base" },
        { id: "R-CCCCCC", title: "branch B item" },
      ],
    }
    writeFileSync(join(e2eDir, "graph", "features.json"), JSON.stringify(branchBJson, null, 2))
    execSync("git add graph/features.json", { cwd: e2eDir })
    execSync('git commit -m "add item C"', { cwd: e2eDir })

    // feature-b에 feature-a를 머지 — 충돌 없어야 함
    const mergeResult = spawnSync(
      "git",
      ["merge", "feature-a", "--no-edit", "-m", "merge feature-a into feature-b"],
      { cwd: e2eDir, encoding: "utf8" },
    )

    const mergedRaw = readFileSync(join(e2eDir, "graph", "features.json"), "utf8")
    const merged = JSON.parse(mergedRaw) as { items: Array<{ id: string }> }
    const ids = merged.items.map((i) => i.id)

    // 충돌 마커 없이 세 항목 모두 보존
    expect(mergedRaw).not.toContain("<<<<<<<")
    expect(ids).toContain("R-AAAAAA")
    expect(ids).toContain("R-BBBBBB")
    expect(ids).toContain("R-CCCCCC")
    expect(mergeResult.status).toBe(0)
  })
})
