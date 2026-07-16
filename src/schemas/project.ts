import { z } from "zod"

// D-01: 프로젝트 ID — P-[A-Z0-9]{6}
const ProjectIdSchema = z.string().regex(/^P-[A-Z0-9]{6}$/, "Invalid project ID format (expected P-XXXXXX)")

// D-04/D-06: 최상위는 z.looseObject() — 미지 필드 보존
// SPEC §2: project.json = 메타(id, name, roles[], devices[], createdAt, pipelineStatus)
// roles[]/devices[] = 단일 출처로 하류 전파(DOCS-02 전제)
export const ProjectSchema = z.looseObject({
  schemaVersion: z.literal("1.0"),
  // 구조 필드 — strict(D-06)
  id: ProjectIdSchema,
  // 내용 필드 — passthrough(D-06)
  name: z.string().optional(),
  roles: z.array(z.string()).optional(),
  devices: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  pipelineStatus: z.string().optional(),
  // 01-01-PLAN.md Task 3: 언어 필드 (detectLang 결과 저장)
  lang: z.enum(["ko", "en", "ja", "zh"]).optional(),
})

export type Project = z.infer<typeof ProjectSchema>

// Pitfall 1: 반드시 { target: "draft-07" } 명시
export const ProjectJsonSchema = z.toJSONSchema(ProjectSchema, { target: "draft-07" })
