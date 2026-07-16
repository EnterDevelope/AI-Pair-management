import { describe, it } from 'vitest'

// Wave 0 스텁 — 02A-02에서 구현
describe('GET /api/projects/[id]/prd', () => {
  it.todo('graph/prd.json가 존재하면 200과 PRD 데이터를 반환한다')
  it.todo('graph/prd.json가 없으면 404를 반환한다')
  it.todo('잘못된 JSON이면 500을 반환한다')
})

describe('POST /api/projects/[id]/prd', () => {
  it.todo('유효한 PRD 페이로드를 받으면 graph/prd.json에 원자적으로 기록하고 docs를 재생성한다')
  it.todo('Zod 검증 실패 시 400을 반환한다')
  it.todo('파일이 잠겨 있으면 423을 반환한다')
})
