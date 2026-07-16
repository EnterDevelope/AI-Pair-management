import { describe, it, expect } from 'vitest'
import { QueueCreateRequestSchema, QueueRequestSchema, QueueHistorySchema } from '../queue'

// ============================================================
// QueueRequestSchema 단위 테스트 (04B-01 Task 1 — RED)
// ============================================================
// 이 파일은 Task 1에서 생성되었다. src/schemas/queue.ts가 없으므로
// 실행하면 import 오류로 RED 상태다. Task 2가 GREEN으로 만든다.
// ============================================================

const VALID_REQUEST = {
  schemaVersion: '1.0' as const,
  requestId: 'req-001',
  targetArtifact: 'features' as const,
  targetId: 'F-AAAAAA',
  instruction: '버튼 텍스트를 "시작하기"로 변경해주세요',
  baseVersion: 'abc123def456',
  createdAt: '2026-06-21T12:00:00.000Z',
}

describe('QueueCreateRequestSchema', () => {
  it('브라우저 요청은 baseVersion 없이 파싱한다', () => {
    const { baseVersion: _baseVersion, ...createRequest } = VALID_REQUEST
    expect(QueueCreateRequestSchema.safeParse(createRequest).success).toBe(true)
  })

  it('클라이언트 baseVersion을 호환 필드로 보존하더라도 서버가 덮어쓸 수 있다', () => {
    const result = QueueCreateRequestSchema.safeParse(VALID_REQUEST)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.baseVersion).toBe(VALID_REQUEST.baseVersion)
  })

  it('path separator가 포함된 requestId는 거부한다', () => {
    expect(QueueCreateRequestSchema.safeParse({ ...VALID_REQUEST, requestId: '../escape' }).success)
      .toBe(false)
  })
})

describe('QueueRequestSchema', () => {
  it('유효한 큐 요청 페이로드를 파싱한다', () => {
    const result = QueueRequestSchema.safeParse(VALID_REQUEST)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.schemaVersion).toBe('1.0')
      expect(result.data.requestId).toBe('req-001')
      expect(result.data.targetArtifact).toBe('features')
      expect(result.data.targetId).toBe('F-AAAAAA')
    }
  })

  it('지시문(instruction)이 빈 문자열이면 파싱에 실패한다', () => {
    const bad = { ...VALID_REQUEST, instruction: '' }
    const result = QueueRequestSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('targetArtifact가 허용 범위 외 값이면 파싱에 실패한다', () => {
    const bad = { ...VALID_REQUEST, targetArtifact: 'wireframes' }
    const result = QueueRequestSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('schemaVersion이 "1.0"이 아니면 파싱에 실패한다', () => {
    const bad = { ...VALID_REQUEST, schemaVersion: '2.0' }
    const result = QueueRequestSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('looseObject 정책: 알 수 없는 필드가 있어도 파싱을 통과한다', () => {
    const withExtra = { ...VALID_REQUEST, unknownField: 'ignored' }
    const result = QueueRequestSchema.safeParse(withExtra)
    expect(result.success).toBe(true)
  })

  it('targetArtifact로 "prd"와 "flow"도 허용한다', () => {
    const prd = { ...VALID_REQUEST, targetArtifact: 'prd' as const }
    const flow = { ...VALID_REQUEST, targetArtifact: 'flow' as const }
    expect(QueueRequestSchema.safeParse(prd).success).toBe(true)
    expect(QueueRequestSchema.safeParse(flow).success).toBe(true)
  })
})

describe('QueueHistorySchema', () => {
  it('QueueRequest 필드 + outcome + appliedAt이 있으면 파싱한다', () => {
    const historyPayload = {
      ...VALID_REQUEST,
      outcome: 'applied' as const,
      appliedAt: '2026-06-21T12:05:00.000Z',
    }
    const result = QueueHistorySchema.safeParse(historyPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.outcome).toBe('applied')
    }
  })

  it('outcome이 "conflict"이고 summary가 없어도 파싱한다', () => {
    const historyPayload = {
      ...VALID_REQUEST,
      outcome: 'conflict' as const,
      appliedAt: '2026-06-21T12:05:00.000Z',
    }
    const result = QueueHistorySchema.safeParse(historyPayload)
    expect(result.success).toBe(true)
  })

  it('outcome이 허용 범위 외 값이면 파싱에 실패한다', () => {
    const bad = {
      ...VALID_REQUEST,
      outcome: 'skipped',
      appliedAt: '2026-06-21T12:05:00.000Z',
    }
    const result = QueueHistorySchema.safeParse(bad)
    expect(result.success).toBe(false)
  })
})
