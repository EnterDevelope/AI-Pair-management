// ============================================================
// userflow 스키마 확장 테스트 (04A-01-PLAN.md Task 1)
// ============================================================
// 검증 대상:
//   - NodeSchema: positionX·positionY·featureId·versionId·sectionId·description 확장
//   - EdgeSchema: versionId 확장
//   - 기존 최소 노드 { type:"start" } 호환성
//   - UserflowJsonSchema draft-07 정상 생성
// ============================================================

import { describe, it, expect } from "vitest"
import { UserflowSchema, UserflowJsonSchema } from "../userflow.js"

describe("NodeSchema — 확장 필드", () => {
  it("확장 NodeSchema가 position·featureId·versionId·sectionId·description 포함 노드를 통과시킨다", () => {
    const result = UserflowSchema.safeParse({
      schemaVersion: "1.0",
      nodes: [
        {
          type: "page",
          id: "P-AAAAAA",
          positionX: 120,
          positionY: 40,
          featureId: "F-X",
          versionId: "V-1",
          sectionId: "sec-auth",
          description: "설명",
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("기존 최소 노드 { type:'start' }도 통과한다 (모든 신규 필드 optional)", () => {
    const result = UserflowSchema.safeParse({
      schemaVersion: "1.0",
      nodes: [{ type: "start" }],
    })
    expect(result.success).toBe(true)
  })
})

describe("EdgeSchema — versionId 확장", () => {
  it("확장 EdgeSchema가 versionId 포함 엣지를 통과시킨다", () => {
    const result = UserflowSchema.safeParse({
      schemaVersion: "1.0",
      edges: [
        {
          source: "P-A",
          target: "P-B",
          versionId: "V-1",
        },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe("UserflowJsonSchema — draft-07 생성", () => {
  it("UserflowJsonSchema가 신규 필드 포함해 정상 생성된다 (z.toJSONSchema 예외 없음)", () => {
    expect(UserflowJsonSchema).toBeDefined()
    expect(typeof UserflowJsonSchema).toBe("object")
  })
})
