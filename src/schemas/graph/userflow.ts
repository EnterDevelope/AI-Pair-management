import { z } from "zod"

// userflow nodes: type은 4종 enum — strict (D-06)
const NodeTypeEnum = z.enum(["start", "section", "page", "action"])

const NodeSchema = z.looseObject({
  type: NodeTypeEnum,
  id: z.string().optional(),
  label: z.string().optional(),
  pageId: z.string().optional(),
  // D-01 위치 캐시 (평탄 필드 — looseObject passthrough와 머지 드라이버 ID-배열 정책 충돌 없음)
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  // D-04 추적성
  featureId: z.string().optional(),
  // D-07 버전 태깅
  versionId: z.string().optional(),
  // 레인 그룹핑
  sectionId: z.string().optional(),
  // D-10 FlowDetailPanel 편집
  description: z.string().optional(),
})

const EdgeSchema = z.looseObject({
  id: z.string().optional(),
  source: z.string().optional(),
  target: z.string().optional(),
  label: z.string().optional(),
  // D-07 버전 태깅
  versionId: z.string().optional(),
})

const VersionSchema = z.looseObject({
  id: z.string().optional(),
  label: z.string().optional(),
})

const VersionGroupSchema = z.looseObject({
  id: z.string().optional(),
  label: z.string().optional(),
  versionIds: z.array(z.string()).optional(),
})

// D-04/D-06: 최상위는 z.looseObject()
export const UserflowSchema = z.looseObject({
  schemaVersion: z.literal("1.0"),
  versionGroups: z.array(VersionGroupSchema).optional(),
  versions: z.array(VersionSchema).optional(),
  nodes: z.array(NodeSchema).optional(),
  edges: z.array(EdgeSchema).optional(),
})

export type Userflow = z.infer<typeof UserflowSchema>

// Pitfall 1: 반드시 { target: "draft-07" } 명시
export const UserflowJsonSchema = z.toJSONSchema(UserflowSchema, { target: "draft-07" })
