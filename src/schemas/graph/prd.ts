import { z } from "zod"

// D-01: 요구사항 ID — R-[A-Z0-9]{6}
const ReqIdSchema = z.string().regex(/^R-[A-Z0-9]{6}$/, "Invalid requirement ID format (expected R-XXXXXX)")

// D-04/D-06: 최상위는 z.looseObject() — 미지 필드 보존(forward-compat)
// z.object()는 additionalProperties: false를 내보내 D-04 위반(RESEARCH Pitfall 2)
export const PrdSchema = z.looseObject({
  schemaVersion: z.literal("1.0"),
  // 구조 필드 — strict(D-06)
  id: ReqIdSchema,
  links: z.array(z.string()).optional(),
  // 내용 필드 — passthrough(D-06)
  title: z.string().optional(),
  description: z.string().optional(),
  overview: z.unknown().optional(),
  problemAndSolution: z.unknown().optional(),
  targetAndScenario: z.unknown().optional(),
  successAndRisk: z.unknown().optional(),
  attributes: z.unknown().optional(),
  // 01-01-PLAN.md Task 3: 추가 필드
  northStar: z.unknown().optional(),
  milestones: z.array(z.unknown()).optional(),
  roles: z.array(z.string()).optional(),
  devices: z.array(z.string()).optional(),
  sectionMeta: z.record(z.string(), z.unknown()).optional(),
})

export type Prd = z.infer<typeof PrdSchema>

// Pitfall 1: Zod v4 기본값은 draft-2020-12; AJV 표준 import는 draft-07
// 반드시 { target: "draft-07" } 명시 필요
export const PrdJsonSchema = z.toJSONSchema(PrdSchema, { target: "draft-07" })
