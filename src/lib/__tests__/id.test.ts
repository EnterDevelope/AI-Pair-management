// ============================================================
// ID 생성 유틸 테스트 (00-04-PLAN.md Task 1)
// ============================================================
// 검증 대상:
//   - D-01: R-/F-/S-/P-XXXXXX 형식 (6자리 [A-Z0-9])
//   - D-02: randomBytes 기반 (Math.random 금지)
//   - D-03: 충돌 검사 1회 + 재시도 상한 3회 후 throw
//   - 모호 문자(0/O/1/I) 제외
// ============================================================

import { describe, it, expect, vi } from "vitest"

const VALID_PATTERN = /^[RFSP]-[A-Z0-9]{6}$/
const AMBIGUOUS_CHARS = new Set(["0", "O", "1", "I"])

// ESM에서 node:crypto named export spy 불가 → vi.mock 호이스팅 사용.
// 충돌 강제 테스트만 mock 적용, 나머지는 실제 randomBytes 사용.

describe("generateId (실제 randomBytes 사용)", () => {
  it("R 접두사 ID가 /^R-[A-Z0-9]{6}$/ 형식과 매칭된다", async () => {
    const { generateId } = await import("../id.js")
    const id = generateId("R", new Set())
    expect(id).toMatch(/^R-[A-Z0-9]{6}$/)
  })

  it("F 접두사 ID가 F-로 시작한다", async () => {
    const { generateId } = await import("../id.js")
    const id = generateId("F", new Set())
    expect(id).toMatch(/^F-[A-Z0-9]{6}$/)
  })

  it("S 접두사 ID가 S-로 시작한다", async () => {
    const { generateId } = await import("../id.js")
    const id = generateId("S", new Set())
    expect(id).toMatch(/^S-[A-Z0-9]{6}$/)
  })

  it("P 접두사 ID가 P-로 시작한다", async () => {
    const { generateId } = await import("../id.js")
    const id = generateId("P", new Set())
    expect(id).toMatch(/^P-[A-Z0-9]{6}$/)
  })

  it("1만 회 샘플에서 모든 ID가 유효한 형식이다", async () => {
    const { generateId } = await import("../id.js")
    for (let i = 0; i < 10_000; i++) {
      const id = generateId("R", new Set())
      expect(id).toMatch(VALID_PATTERN)
    }
  })

  it("1만 회 샘플에서 모호 문자(0/O/1/I)가 절대 포함되지 않는다", async () => {
    const { generateId } = await import("../id.js")
    for (let i = 0; i < 10_000; i++) {
      const id = generateId("R", new Set())
      const chars = id.slice(2) // 접두사 "R-" 제거
      for (const ch of chars) {
        expect(AMBIGUOUS_CHARS.has(ch)).toBe(false)
      }
    }
  })

  it("existingIds에 있는 ID는 반환하지 않는다 (충돌 시 재시도)", async () => {
    const { generateId } = await import("../id.js")
    const firstId = generateId("R", new Set())
    const existing = new Set([firstId])
    const newId = generateId("R", existing)
    expect(existing.has(newId)).toBe(false)
    expect(newId).toMatch(/^R-[A-Z0-9]{6}$/)
  })
})

describe("generateId (mock randomBytes — 충돌 강제)", () => {
  it("항상 충돌하면 3회 시도 후 throw한다", async () => {
    // ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    // bytes [0,2,3,4,5,6] → 인덱스 0='A', 2='C', 3='D', 4='E', 5='F', 6='G'
    // → 항상 "R-ACDEFG" 생성
    const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    const bytes = [0, 2, 3, 4, 5, 6]
    const chars = bytes.map((b) => ALPHABET[b % 32]!).join("")
    const forcedId = `R-${chars}` // "R-ACDEFG"

    // vi.mock은 호이스팅 필요 → 대신 테스트 내 DI 파라미터 방식 사용
    // id.ts는 _generateIdWithRng 내부 함수를 export (테스트 전용)
    const { _generateIdWithRng } = await import("../id.js")

    const mockRng = () => Buffer.from(bytes)
    const existing = new Set([forcedId])

    expect(() => _generateIdWithRng("R", existing, mockRng)).toThrow(
      /ID generation failed after 3 attempts/
    )
  })
})

describe("extractIds", () => {
  it("항목 배열에서 ID Set을 추출한다", async () => {
    const { extractIds } = await import("../id.js")
    const items = [
      { id: "R-ABC123", name: "요구사항 1" },
      { id: "F-DEF456", name: "기능 1" },
    ]
    const ids = extractIds(items)
    expect(ids).toBeInstanceOf(Set)
    expect(ids.has("R-ABC123")).toBe(true)
    expect(ids.has("F-DEF456")).toBe(true)
    expect(ids.size).toBe(2)
  })

  it("빈 배열이면 빈 Set을 반환한다", async () => {
    const { extractIds } = await import("../id.js")
    const ids = extractIds([])
    expect(ids.size).toBe(0)
  })
})
