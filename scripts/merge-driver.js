/**
 * scripts/merge-driver.js — AIPM ID 배열 시맨틱 3-way 머지 드라이버
 *
 * 호출 방식: node scripts/merge-driver.js %O %A %B
 *   %O = ancestor(공통조상) 임시 파일 경로
 *   %A = current 브랜치 파일 경로 (결과를 여기에 기록)
 *   %B = other 브랜치 파일 경로
 *
 * 종료 코드:
 *   0 = 성공 (자동 병합 또는 충돌 마커 기록 완료)
 *   1 = 충돌 발생 (git이 충돌 보고, 사람이 해소 필요)
 *
 * 보안: JSON.parse만 수행, eval/require 금지. 파싱 실패 시 exit 1 (텍스트 폴백).
 * 경로는 git이 생성한 임시 파일 경로 — 셸 보간 없음.
 */

import { readFileSync, writeFileSync } from "node:fs"

// process.argv: [node, script, ancestorPath, currentPath, otherPath]
const [, , ancestorPath, currentPath, otherPath] = process.argv

if (!ancestorPath || !currentPath || !otherPath) {
  process.stderr.write("merge-driver: 인자 부족 — %O %A %B 경로 필요\n")
  process.exit(1)
}

let ancestor, current, other

try {
  ancestor = JSON.parse(readFileSync(ancestorPath, "utf8"))
  current = JSON.parse(readFileSync(currentPath, "utf8"))
  other = JSON.parse(readFileSync(otherPath, "utf8"))
} catch {
  // JSON 파싱 실패 — 텍스트 폴백 유도
  process.stderr.write("merge-driver: JSON 파싱 실패, 텍스트 폴백\n")
  process.exit(1)
}

// items 배열을 id 키로 인덱싱 (items 키 없으면 빈 배열로 방어)
const ancestorById = Object.fromEntries((ancestor.items ?? []).map((i) => [i.id, i]))
const currentById = Object.fromEntries((current.items ?? []).map((i) => [i.id, i]))
const otherById = Object.fromEntries((other.items ?? []).map((i) => [i.id, i]))

// 전체 id union 순회
const allIds = new Set([...Object.keys(currentById), ...Object.keys(otherById)])

let hasConflict = false
const mergedItems = []

for (const id of allIds) {
  const a = ancestorById[id] ?? {}
  const c = currentById[id]
  const o = otherById[id]

  if (!c && o) {
    // current에 없음 — ancestor에 있었다면 current가 삭제한 것 → 삭제 반영
    // ancestor에 없었다면 other가 새로 추가한 것 → 유지
    if (ancestorById[id]) {
      // current가 삭제 → 삭제 반영 (other가 변경 없이 유지했을 뿐)
      continue
    } else {
      // other가 새로 추가
      mergedItems.push(o)
      continue
    }
  }

  if (c && !o) {
    // other에 없음 — ancestor에 있었다면 other가 삭제한 것 → 삭제 반영
    // ancestor에 없었다면 current가 새로 추가한 것 → 유지
    if (ancestorById[id]) {
      // other가 삭제 → 삭제 반영 (current가 변경 없이 유지했을 뿐)
      continue
    } else {
      // current가 새로 추가
      mergedItems.push(c)
      continue
    }
  }

  if (!c && !o) {
    // 양쪽 다 없음 (이론상 발생 안 함 — allIds가 union이므로)
    continue
  }

  // 양쪽 모두 존재 — 필드별 3-way 병합
  const merged = { ...a }
  const allKeys = new Set([...Object.keys(c), ...Object.keys(o)])

  for (const key of allKeys) {
    const aVal = JSON.stringify(a[key])
    const cVal = JSON.stringify(c[key])
    const oVal = JSON.stringify(o[key])

    if (cVal === oVal) {
      // 양쪽 동일 — 그대로
      merged[key] = c[key]
    } else if (cVal === aVal) {
      // current 미변경, other만 변경 → other 채택
      merged[key] = o[key]
    } else if (oVal === aVal) {
      // other 미변경, current만 변경 → current 채택
      merged[key] = c[key]
    } else {
      // 진짜 충돌: 양쪽이 ancestor와 다르게 변경
      // 표준 git 충돌 마커 형식으로 기록 (JSON 일시 무효화 — 사람이 해소 후 재포맷)
      merged[key] = `<<<<<<< current\n${c[key]}\n=======\n${o[key]}\n>>>>>>> other`
      hasConflict = true
    }
  }

  mergedItems.push(merged)
}

// 결과: current 구조 기반에 병합된 items 교체
const result = { ...current, items: mergedItems }
writeFileSync(currentPath, JSON.stringify(result, null, 2))

process.exit(hasConflict ? 1 : 0)
