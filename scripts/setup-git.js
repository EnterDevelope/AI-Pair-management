/**
 * scripts/setup-git.js — git 머지 드라이버 등록 (prepare 훅)
 *
 * npm install 후 자동 실행 (package.json "prepare" 스크립트).
 * .git/config는 추적되지 않으므로 fresh clone 이식성을 위해 이 스크립트가 필요.
 *
 * 보안: spawnSync 인자 배열 사용 — 셸을 거치지 않으므로 주입 불가 (T-00-05c).
 * git 저장소 밖에서 실행 시 조용히 skip (tarball install 안전).
 */

import { spawnSync } from "node:child_process"
import { copyFileSync, chmodSync, existsSync, mkdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** spawnSync 래퍼: 실패 시 오류 출력 후 exit 1 */
function gitConfig(args) {
  const result = spawnSync("git", args, { encoding: "utf8" })
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? `git config 실패: ${args.join(" ")}\n`)
    process.exit(1)
  }
}

// git 저장소 밖에서 실행되면 skip (npm pack/tarball install 환경)
const check = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" })
if (check.status !== 0) {
  // git 저장소 아님 — 조용히 종료 (install 실패 방지)
  process.exit(0)
}

// aipm-json-merge 드라이버 등록 (인자 배열 — 셸 주입 불가)
gitConfig(["config", "merge.aipm-json-merge.name", "AIPM JSON semantic merge"])
gitConfig(["config", "merge.aipm-json-merge.driver", "node scripts/merge-driver.js %O %A %B"])
gitConfig(["config", "merge.aipm-json-merge.recursive", "binary"])

console.log("Git merge driver registered.")

// pre-commit sentinel 훅 설치
// --git-common-dir: 워크트리 환경에서도 공통 .git 디렉토리를 가리킴 (일반 클론도 동일)
const hookSrc = resolve(__dirname, "pre-commit-sentinel.sh")
const gitDirResult = spawnSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf8" })
if (gitDirResult.status === 0) {
  const gitDir = gitDirResult.stdout.trim()
  const hookDst = resolve(gitDir, "hooks", "pre-commit")
  if (existsSync(hookSrc)) {
    const hooksDir = resolve(gitDir, "hooks")
    mkdirSync(hooksDir, { recursive: true })
    copyFileSync(hookSrc, hookDst)
    chmodSync(hookDst, 0o755)
    console.log("Pre-commit sentinel hook installed.")
  }
}
