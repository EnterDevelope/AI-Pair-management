import { z } from "zod"

// D-01: 요구사항 ID — R-[A-Z0-9]{6} (FEAT-02, D-13 재생성 ID 고정의 전제)
export const ReqIdSchema = z.string().regex(/^R-[A-Z0-9]{6}$/, "Invalid requirement ID format (expected R-XXXXXX)")

// D-01: 기능 ID — F-[A-Z0-9]{6}
const FeatIdSchema = z.string().regex(/^F-[A-Z0-9]{6}$/, "Invalid feature ID format (expected F-XXXXXX)")

// 상세기능 ID — S-[A-Z0-9]{6}
const SpecIdSchema = z.string().regex(/^S-[A-Z0-9]{6}$/, "Invalid spec ID format (expected S-XXXXXX)")

// features.json items 내 단일 항목 스키마
// 중첩 구조는 z.object() 사용 가능 — 구조가 확정된 스키마 안쪽은 strict 허용(D-06)
const FeatureItemSchema = z.looseObject({
  id: z.union([ReqIdSchema, FeatIdSchema, SpecIdSchema]),
  title: z.string().optional(),
  description: z.string().optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  roleAssignments: z.array(z.string()).optional(),
  // D-04: 영문 식별자 저장, UI lang 추종. z.string()에서 enum으로 강화
  status: z.enum(["todo", "in-progress", "done"]).optional(),
  importance: z.enum(["high", "medium", "low"]).optional(),
  // D-12 Unlinked 감지의 전제, D-15 손실 0 원칙의 데이터 표현
  // R은 루트(parent 없음), F의 부모=R-xxx, S의 부모=F-xxx
  parent: z.string().optional(),
  links: z.array(z.string()).optional(),
})

// D-04/D-06: 최상위는 z.looseObject() — 미지 필드 보존
export const FeaturesSchema = z.looseObject({
  schemaVersion: z.literal("1.0"),
  items: z.array(FeatureItemSchema).optional(),
})

export type Features = z.infer<typeof FeaturesSchema>

// Pitfall 1: 반드시 { target: "draft-07" } 명시
export const FeaturesJsonSchema = z.toJSONSchema(FeaturesSchema, { target: "draft-07" })
