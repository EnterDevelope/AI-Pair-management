// ============================================================
// scripts/scaffold.ts — AIPM 프로젝트 폴더 스캐폴드 (00-06-PLAN.md)
// ============================================================
// 목적: /aipm new 없이도 수동 실행으로 완전한 프로젝트 구조를 생성한다.
//
// 설계:
// - export async function scaffold(projectName, baseDir) — 라이브러리 API
// - CLI 진입점: node --import tsx scripts/scaffold.ts <name> (또는 컴파일 후)
// - 보안: path traversal 차단 (영숫자·하이픈 화이트리스트 + resolve prefix 검증)
// - 데이터 손실 0: 이미 존재하는 폴더에 throw (조용한 덮어쓰기 금지)
// - Pitfall 4: 5개 graph 파일을 최소 유효 내용으로 미리 생성 (빈 파일 금지)
//   → proper-lockfile이 대상 파일이 존재해야 락 가능
// - 최초 생성은 fs.writeFile로 직접 생성 (파일 없을 때 락 불가 — Pitfall 4)
// - ID: generateId (plan 04) 사용 — P-XXXXXX, R-XXXXXX
// ============================================================

import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { generateId } from "../src/lib/id.js"

// ESM __filename 재현 (isMain 비교용)
const __filename = fileURLToPath(import.meta.url)

/**
 * 프로젝트 이름 검증 — 영숫자·하이픈만 허용, 경로 구분자 금지
 * T-00-06a: path traversal 방어
 */
function validateProjectName(name: string): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("프로젝트 이름이 비어있습니다.")
  }
  // 절대경로 거부
  if (path.isAbsolute(name)) {
    throw new Error(
      `프로젝트 이름에 절대경로를 사용할 수 없습니다: "${name}"`
    )
  }
  // 영숫자·하이픈만 허용 (슬래시, 점, 특수문자, 공백, 언더스코어 전부 거부)
  if (!/^[A-Za-z0-9-]+$/.test(name)) {
    throw new Error(
      `프로젝트 이름은 영숫자와 하이픈만 사용 가능합니다: "${name}"`
    )
  }
}

/**
 * path traversal 검증 — resolve된 경로가 baseDir 내부인지 확인
 */
function assertInsideBaseDir(resolved: string, baseDir: string): void {
  const resolvedBase = path.resolve(baseDir)
  // 경계 안전: /base와 /base-other 혼동 방지용 path.sep 접미사
  if (
    resolved !== resolvedBase &&
    !resolved.startsWith(resolvedBase + path.sep)
  ) {
    throw new Error(
      `프로젝트 경로가 기준 디렉토리 밖을 벗어납니다: "${resolved}"`
    )
  }
}

/**
 * JSON 파일을 생성한다 (최초 생성용 — 파일이 없을 때 락 불가이므로 fs.writeFile 사용)
 */
async function writeNew(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8")
}

/**
 * 프로젝트 폴더 트리와 5개 graph 파일을 생성한다.
 *
 * @param projectName - 영숫자·하이픈만 허용
 * @param baseDir - 부모 디렉토리 (기본값: process.cwd())
 * @returns 생성된 프로젝트 폴더 절대경로
 * @throws 이름 검증 실패, 경로 탈출, 폴더 이미 존재 시 Error
 */
export async function scaffold(
  projectName: string,
  baseDir: string = process.cwd()
): Promise<string> {
  // 1. 이름 검증 (보안 화이트리스트)
  validateProjectName(projectName)

  // 2. path resolve + traversal 방어
  const projectDir = path.resolve(baseDir, projectName)
  assertInsideBaseDir(projectDir, baseDir)

  // 3. 이미 존재하는 폴더 거부 (데이터 손실 0, T-00-06b)
  let exists = false
  try {
    await fs.access(projectDir)
    exists = true
  } catch {
    // 존재하지 않음 — 정상 진행
  }
  if (exists) {
    throw new Error(
      `프로젝트 폴더가 이미 존재합니다. 덮어쓰기를 하지 않습니다: "${projectDir}"`
    )
  }

  // 4. 폴더 트리 생성 (SPEC §2)
  const dirs = [
    path.join(projectDir, "graph"),
    path.join(projectDir, "docs"),
    path.join(projectDir, "wireframes"),
    path.join(projectDir, ".aipm", "queue"),
    path.join(projectDir, ".aipm", "history"),
  ]
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true })
  }

  // 5. ID 생성
  const projectId = generateId("P", new Set())
  const prdId = generateId("R", new Set())

  // 6. 5개 graph 파일 + project.json 최소 유효 내용으로 생성 (Pitfall 4)

  // project.json — ProjectSchema: schemaVersion + id(P-...) 필수
  await writeNew(path.join(projectDir, "project.json"), {
    schemaVersion: "1.0",
    id: projectId,
    name: projectName,
    roles: [],
    devices: [],
    createdAt: new Date().toISOString(),
    pipelineStatus: "empty",
  })

  // graph/prd.json — PrdSchema: schemaVersion + id(R-...) 필수
  await writeNew(path.join(projectDir, "graph", "prd.json"), {
    schemaVersion: "1.0",
    id: prdId,
    sections: {},
  })

  // graph/features.json — FeaturesSchema: schemaVersion + items[] 선택
  await writeNew(path.join(projectDir, "graph", "features.json"), {
    schemaVersion: "1.0",
    items: [],
  })

  // graph/userflow.json — UserflowSchema: schemaVersion + 4개 배열 선택
  await writeNew(path.join(projectDir, "graph", "userflow.json"), {
    schemaVersion: "1.0",
    versionGroups: [],
    versions: [],
    nodes: [],
    edges: [],
  })

  // graph/ia.json — IaSchema: schemaVersion + pages[] 선택
  await writeNew(path.join(projectDir, "graph", "ia.json"), {
    schemaVersion: "1.0",
    pages: [],
  })

  // 7. 빈 디렉토리에 .gitkeep 생성 (git 추적 보장)
  const gitkeepDirs = [
    path.join(projectDir, "docs"),
    path.join(projectDir, "wireframes"),
    path.join(projectDir, ".aipm", "queue"),
    path.join(projectDir, ".aipm", "history"),
  ]
  for (const dir of gitkeepDirs) {
    await fs.writeFile(path.join(dir, ".gitkeep"), "", "utf8")
  }

  return projectDir
}

// ============================================================
// CLI 진입점: npx tsx scripts/scaffold.ts <name>
// (TS 라이브러리(스키마/atomic-write)를 직접 import하므로 .ts로 유지 — 표준 진입점은 Phase 1의 /aipm new 하네스가 scaffold() 함수를 import)
// ============================================================

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(__filename)

if (isMain) {
  const projectName = process.argv[2]
  if (!projectName) {
    console.error("사용법: npx tsx scripts/scaffold.ts <프로젝트이름>")
    console.error("예시: npx tsx scripts/scaffold.ts my-product")
    process.exit(1)
  }

  scaffold(projectName)
    .then((dir) => {
      console.log(`프로젝트 생성 완료: ${dir}`)
    })
    .catch((err: unknown) => {
      console.error(`오류: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    })
}
