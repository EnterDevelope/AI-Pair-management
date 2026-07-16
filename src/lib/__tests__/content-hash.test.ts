import { describe, it, expect } from 'vitest'
import { computeContentHash } from '../content-hash'

// ============================================================
// computeContentHash 단위 테스트 (04B-01 Task 1 — RED)
// ============================================================
// 이 파일은 Task 1에서 생성되었다. src/lib/content-hash.ts가 없으므로
// 실행하면 import 오류로 RED 상태다. Task 3이 GREEN으로 만든다.
//
// D-06: subtree 수준 해시 — 파일 전체가 아닌 노드 단위로 해시.
// positionX/positionY는 레이아웃 캐시 필드이므로 해시에서 제외.
// ============================================================

const BASE_NODE = {
  id: 'F-AAAAAA',
  title: '사용자 로그인',
  description: '이메일과 비밀번호로 로그인한다',
  status: 'todo',
}

describe('computeContentHash', () => {
  it('키 순서가 달라도 동일한 해시를 반환한다', () => {
    const a = { id: 'F-AAAAAA', title: '로그인', status: 'todo' }
    const b = { status: 'todo', title: '로그인', id: 'F-AAAAAA' }
    expect(computeContentHash(a)).toBe(computeContentHash(b))
  })

  it('positionX/positionY 값이 달라도 동일한 해시를 반환한다', () => {
    const withPos = { ...BASE_NODE, positionX: 100, positionY: 200 }
    const withOtherPos = { ...BASE_NODE, positionX: 999, positionY: 888 }
    const withoutPos = { ...BASE_NODE }
    expect(computeContentHash(withPos)).toBe(computeContentHash(withOtherPos))
    expect(computeContentHash(withPos)).toBe(computeContentHash(withoutPos))
  })

  it('의미 있는 필드(title)가 변경되면 다른 해시를 반환한다', () => {
    const before = { ...BASE_NODE, title: '사용자 로그인' }
    const after = { ...BASE_NODE, title: '관리자 로그인' }
    expect(computeContentHash(before)).not.toBe(computeContentHash(after))
  })

  it('동일한 입력에 대해 항상 같은 해시를 반환한다 (결정론적)', () => {
    const hash1 = computeContentHash(BASE_NODE)
    const hash2 = computeContentHash(BASE_NODE)
    expect(hash1).toBe(hash2)
  })

  it('중첩 객체도 키 정렬 후 해시한다', () => {
    const a = { meta: { z: 1, a: 2 }, title: '테스트' }
    const b = { title: '테스트', meta: { a: 2, z: 1 } }
    expect(computeContentHash(a)).toBe(computeContentHash(b))
  })

  it('배열 요소 순서가 다르면 다른 해시를 반환한다 (배열 순서는 의미 있음)', () => {
    const a = { steps: [1, 2, 3] }
    const b = { steps: [3, 2, 1] }
    expect(computeContentHash(a)).not.toBe(computeContentHash(b))
  })

  it('null 값을 처리한다', () => {
    const withNull = { id: 'F-AAAAAA', description: null }
    expect(() => computeContentHash(withNull)).not.toThrow()
  })

  it('반환 타입이 64자 hex 문자열이다 (SHA-256)', () => {
    const hash = computeContentHash(BASE_NODE)
    expect(typeof hash).toBe('string')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
