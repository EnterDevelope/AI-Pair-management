// ============================================================
// 큐 요청/이력 Zod 스키마 (04B-01 Task 2)
// ============================================================
// 목적: 웹 "AI 수정요청" 버튼 → .aipm/queue/ 파일 → /aipm apply 파이프라인에서
//       공유하는 큐 요청·이력 스키마를 정의한다.
//
// 설계:
// - looseObject: 최상위에 알 수 없는 필드가 있어도 통과 (passthrough)
//   → 하네스 버전 업그레이드 시 신규 필드를 파괴적 변경 없이 수용
// - QueueHistorySchema: QueueRequestSchema.extend()로 outcome·appliedAt 추가
//   → 큐 파일과 이력 파일이 동일한 베이스 필드를 공유함을 타입으로 표현
// - z.toJSONSchema: Zod v4 내장 — 별도 패키지 불필요
// ============================================================

import { z } from "zod"

export const QueueTargetArtifactSchema = z.enum(["prd", "features", "flow"])
export type QueueTargetArtifact = z.infer<typeof QueueTargetArtifactSchema>

const queueCreateShape = {
  schemaVersion: z.literal("1.0"),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  targetArtifact: QueueTargetArtifactSchema,
  targetId: z.string().trim().min(1).max(256),
  instruction: z.string().trim().min(1).max(10_000),
  createdAt: z.string().datetime(),
}

/** 브라우저 → 서버 POST 계약. baseVersion은 서버가 디스크 정본에서 계산한다. */
export const QueueCreateRequestSchema = z.looseObject(queueCreateShape)
export type QueueCreateRequest = z.infer<typeof QueueCreateRequestSchema>

/**
 * 큐 요청 스키마 — .aipm/queue/<requestId>.json 파일 형식
 *
 * targetArtifact: 수정 대상 산출물 종류 ("prd" | "features" | "flow")
 * baseVersion: 요청 당시 graph.json 커밋 해시 (충돌 감지용)
 */
export const QueueRequestSchema = z.looseObject({
  ...queueCreateShape,
  baseVersion: z.string().min(1),
})

export type QueueRequest = z.infer<typeof QueueRequestSchema>

/**
 * 큐 이력 스키마 — .aipm/queue/history/<requestId>.json 파일 형식
 *
 * QueueRequestSchema를 확장하여 처리 결과(outcome)와 처리 시각(appliedAt)을 추가한다.
 * D-05: 충돌 시 건너뜀 + outcome:"conflict" 기록으로 무한 재충돌을 방지한다.
 */
export const QueueHistorySchema = QueueRequestSchema.extend({
  outcome: z.enum(["applied", "conflict", "error"]),
  appliedAt: z.string().datetime(),
  summary: z.string().optional(),
})

export type QueueHistory = z.infer<typeof QueueHistorySchema>

/** JSON Schema export (draft-07) — AJV 파일 I/O 검증 및 IDE 툴링용 */
export const QueueRequestJsonSchema = z.toJSONSchema(QueueRequestSchema, {
  target: "draft-07",
})
