// ============================================================
// ID 생성 유틸 (00-04-PLAN.md Task 1)
// ============================================================
// 목적: R-/F-/S-/P-XXXXXX 형식의 고유 ID를 암호학적으로 안전하게 생성한다.
//
// 설계:
// - ALPHABET: 32자 (모호 문자 0/O/1/I 제외) → 256 % 32 = 0 (모듈로 바이어스 0)
// - crypto.getRandomValues(6): 브라우저와 Node.js 20+에서 동일하게 동작
// - D-01 정합: 남은 문자가 전부 대문자·숫자이므로 [A-Z0-9]{6} 만족
// - D-02: crypto.randomBytes만 사용 (Math.random 금지)
// - D-03: 충돌 시 최대 3회 재시도, 3회 모두 실패 시 throw
// ============================================================

/** ID 생성에 사용하는 32자 알파벳 (0/O/1/I 모호 문자 제외) */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" as const

/** 지원하는 ID 접두사 타입 */
export type IdPrefix = "R" | "F" | "S" | "P"

/**
 * 테스트 가능한 내부 구현 — RNG 함수를 주입 받아 ID를 생성한다.
 * 프로덕션 코드에서는 사용하지 않는다. (@internal)
 */
export function _generateIdWithRng(
  prefix: IdPrefix,
  existingIds: ReadonlySet<string>,
  rng: () => Uint8Array
): string {
  for (let attempt = 0; attempt < 3; attempt++) {
    const bytes = rng()
    let chars = ""
    for (let i = 0; i < 6; i++) {
      // 256 % 32 = 0 → 모듈로 바이어스 없음
      chars += ALPHABET[(bytes[i] ?? 0) % 32]
    }
    const id = `${prefix}-${chars}`
    if (!existingIds.has(id)) {
      return id
    }
  }
  throw new Error(
    `ID generation failed after 3 attempts (prefix: ${prefix})`
  )
}

/**
 * 암호학적으로 안전한 랜덤 ID를 생성한다.
 *
 * @param prefix - ID 타입 접두사 ("R" | "F" | "S" | "P")
 * @param existingIds - 충돌 검사용 기존 ID 집합 (ReadonlySet)
 * @returns `${prefix}-[A-Z0-9]{6}` 형식의 새 ID
 * @throws 3회 시도 모두 충돌 시 Error
 */
export function generateId(
  prefix: IdPrefix,
  existingIds: ReadonlySet<string>
): string {
  return _generateIdWithRng(prefix, existingIds, () =>
    globalThis.crypto.getRandomValues(new Uint8Array(6))
  )
}

/**
 * 항목 배열에서 ID 문자열 Set을 추출한다.
 *
 * @param items - `id` 속성을 가진 객체 배열
 * @returns ID 문자열의 Set
 */
export function extractIds(items: ReadonlyArray<{ id: string }>): Set<string> {
  return new Set(items.map((i) => i.id))
}
