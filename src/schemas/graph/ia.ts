import { z } from "zod"

// D-01: 페이지 ID — P-[A-Z0-9]{6}
const PageIdSchema = z.string().regex(/^P-[A-Z0-9]{6}$/, "Invalid page ID format (expected P-XXXXXX)")

// ia.json: 페이지 부모-자식 + Spec 교차링크 (SPEC §2)
const IaPageSchema = z.looseObject({
  id: PageIdSchema,
  label: z.string().optional(),
  parentId: z.string().optional(),
  specLinks: z.array(z.string()).optional(),
})

// D-04/D-06: 최상위는 z.looseObject()
export const IaSchema = z.looseObject({
  schemaVersion: z.literal("1.0"),
  pages: z.array(IaPageSchema).optional(),
})

export type Ia = z.infer<typeof IaSchema>

// Pitfall 1: 반드시 { target: "draft-07" } 명시
export const IaJsonSchema = z.toJSONSchema(IaSchema, { target: "draft-07" })
