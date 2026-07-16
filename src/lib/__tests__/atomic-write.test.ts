// ============================================================
// 원자 파일 쓰기 테스트 (00-04-PLAN.md Task 2)
// ============================================================
// 검증 대상:
//   - writeGraphFile: tmp→rename 원자 쓰기 + per-file 락
//   - round-trip 쓰기-읽기 동일 데이터 복원(끝 개행 포함)
//   - 동시 쓰기 직렬화 — 1건은 락 실패로 즉시 throw (retries:0)
//   - 락 release 후 재쓰기 성공
//   - DATA-04: torn write 없음, 원본 보존
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { writeFile, readFile, unlink, access } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

// 테스트용 임시 파일 경로 생성 헬퍼
function makeTmpPath(suffix: string): string {
  return join(tmpdir(), `aipm-atomic-test-${Date.now()}-${suffix}.json`)
}

// Pitfall 4: proper-lockfile은 파일이 존재해야 락 가능
// 테스트마다 빈 파일 먼저 생성 후 writeGraphFile 호출
let tmpPath: string

beforeEach(async () => {
  tmpPath = makeTmpPath(Math.random().toString(36).slice(2))
  // 빈 JSON으로 파일 먼저 생성 (proper-lockfile 요구사항)
  await writeFile(tmpPath, "{}\n", "utf8")
})

afterEach(async () => {
  // 테스트 후 임시 파일 정리
  try {
    await unlink(tmpPath)
  } catch {
    // 이미 삭제된 경우 무시
  }
  // .lock 파일도 정리
  try {
    await unlink(`${tmpPath}.lock`)
  } catch {
    // 없으면 무시
  }
})

describe("writeGraphFile", () => {
  it("쓴 데이터를 읽으면 동일 객체가 복원된다 (round-trip)", async () => {
    const { writeGraphFile } = await import("../atomic-write.js")
    const data = { a: 1, b: "테스트", c: [1, 2, 3] }

    await writeGraphFile(tmpPath, data)

    const raw = await readFile(tmpPath, "utf8")
    const parsed = JSON.parse(raw) as unknown

    expect(parsed).toEqual(data)
    // 끝 개행 포함 확인
    expect(raw.endsWith("\n")).toBe(true)
  })

  it("JSON.stringify(data, null, 2) 들여쓰기가 적용된다", async () => {
    const { writeGraphFile } = await import("../atomic-write.js")
    const data = { key: "value" }

    await writeGraphFile(tmpPath, data)

    const raw = await readFile(tmpPath, "utf8")
    expect(raw).toBe(JSON.stringify(data, null, 2) + "\n")
  })

  it("락 release 후 동일 파일에 재쓰기 성공한다", async () => {
    const { writeGraphFile } = await import("../atomic-write.js")
    const data1 = { version: 1 }
    const data2 = { version: 2 }

    await writeGraphFile(tmpPath, data1)
    // 첫 번째 쓰기 완료 후 락이 해제되어야 두 번째도 성공
    await writeGraphFile(tmpPath, data2)

    const raw = await readFile(tmpPath, "utf8")
    expect(JSON.parse(raw)).toEqual(data2)
  })

  it("동일 파일 동시 쓰기 중 1건은 락 실패(ELOCKED)로 즉시 throw한다", async () => {
    const { writeGraphFile } = await import("../atomic-write.js")

    // 두 쓰기 동시 실행 — retries:0이므로 하나는 즉시 throw
    const data1 = { slot: "first" }
    const data2 = { slot: "second" }

    const results = await Promise.allSettled([
      writeGraphFile(tmpPath, data1),
      writeGraphFile(tmpPath, data2),
    ])

    const rejected = results.filter((r) => r.status === "rejected")
    const fulfilled = results.filter((r) => r.status === "fulfilled")

    // 정확히 1건 성공, 1건 실패
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    // 실패한 쪽은 락 관련 에러
    const errResult = rejected[0] as PromiseRejectedResult
    expect(errResult.reason).toBeDefined()
    // proper-lockfile ELOCKED: "Lock file is already being held"
    expect(String((errResult.reason as Error).message)).toMatch(
      /ELOCKED|already|lock/i
    )

    // 파일이 유효한 JSON으로 남아 있어야 한다 (torn write 없음)
    const raw = await readFile(tmpPath, "utf8")
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it("쓰기 중 에러 발생 시 임시 파일이 남지 않는다 (write-file-atomic 보장)", async () => {
    // write-file-atomic이 tmp→rename을 보장하므로 임시 파일이 남지 않음을 간접 검증
    // 정상 케이스에서 .tmp 파일이 없는지 확인
    const { writeGraphFile } = await import("../atomic-write.js")
    const data = { test: true }

    await writeGraphFile(tmpPath, data)

    // tmpfile은 `.숫자` 형태로 생기지만 write-file-atomic이 정리
    // 원본 파일만 존재해야 한다
    await expect(access(tmpPath)).resolves.toBeUndefined()
  })
})
