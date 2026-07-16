// ============================================================
// subtree 콘텐츠 해시 유틸 (04B-01 Task 3)
// ============================================================
// 목적: 그래프 노드 subtree의 의미론적 해시를 계산한다.
//       apply-runner가 baseVersion과 현재 노드를 비교해 충돌을 감지하는 데 사용.
//
// 설계:
// - D-06: 파일 전체가 아닌 subtree(노드 단위) 해시 — 무관한 노드 변경으로 인한
//         false positive 충돌을 방지한다.
// - EXCLUDED_FIELDS: positionX·positionY만 제외.
//   이 두 필드는 React Flow 레이아웃 캐시 필드로, 실제 schema 정의 필드다.
//   (x·y·width·height는 PATTERNS.md에 언급되나, 실제 스키마에 없는 필드이므로
//    제외 대상에 포함하지 않는다. 스키마 필드 이름이 변경되면 이 Set도 갱신한다.)
// - normalize: 키를 정렬하고 재귀적으로 정규화 → 키 순서에 무관한 해시 보장
// - node:crypto built-in 사용 — 추가 npm 패키지 불필요
// - 불변성 원칙: Object.fromEntries + filter + sort — 원본 객체 미변형
// ============================================================

import { createHash } from "node:crypto"

/** 해시 계산에서 제외할 레이아웃 캐시 필드 */
const EXCLUDED_FIELDS = new Set(["positionX", "positionY"])

/**
 * 값을 키-정렬된 형태로 정규화한다.
 * - 기본값(null·undefined·number·string·boolean): 그대로 반환
 * - 배열: 각 요소를 재귀 정규화 (순서는 보존 — 배열 순서는 의미 있음)
 * - 객체: EXCLUDED_FIELDS를 제거하고 키를 오름차순 정렬 후 재귀 정규화
 */
function normalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(normalize)

  const obj = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(obj)
      .filter((k) => !EXCLUDED_FIELDS.has(k))
      .sort()
      .map((k) => [k, normalize(obj[k])])
  )
}

/**
 * subtree의 SHA-256 콘텐츠 해시를 반환한다.
 *
 * @param subtree - 해시할 그래프 노드 또는 임의 객체
 * @returns 64자 소문자 hex 문자열 (SHA-256)
 *
 * @example
 * const hash = computeContentHash(featureNode)
 * // "a3f1c9..."
 */
export function computeContentHash(subtree: unknown): string {
  const normalized = normalize(subtree)
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}
