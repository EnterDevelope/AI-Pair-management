import { describe, it, expect } from "vitest"
import {
  PrdSchema,
  PrdJsonSchema,
  FeaturesSchema,
  FeaturesJsonSchema,
  UserflowSchema,
  UserflowJsonSchema,
  IaSchema,
  IaJsonSchema,
} from "../index.js"

// ===========================================================
// PrdSchema
// ===========================================================
describe("PrdSchema", () => {
  it("유효한 PRD 객체를 통과시킨다", () => {
    const valid = { schemaVersion: "1.0", id: "R-ABC234" }
    const result = PrdSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("id 누락 객체를 거부한다", () => {
    const invalid = { schemaVersion: "1.0" }
    const result = PrdSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("schemaVersion 누락 객체를 거부한다", () => {
    const invalid = { id: "R-ABC234" }
    const result = PrdSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("잘못된 id 형식(소문자)을 거부한다", () => {
    const invalid = { schemaVersion: "1.0", id: "R-abc234" }
    const result = PrdSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("잘못된 id 형식(5자)을 거부한다", () => {
    const invalid = { schemaVersion: "1.0", id: "R-ABCDE" }
    const result = PrdSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("잘못된 id 형식(7자)을 거부한다", () => {
    const invalid = { schemaVersion: "1.0", id: "R-ABCDEFG" }
    const result = PrdSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("미지 필드를 보존·통과시킨다 (forward-compat)", () => {
    const withExtra = { schemaVersion: "1.0", id: "R-ABC234", futureField: "x", nested: { key: 1 } }
    const result = PrdSchema.safeParse(withExtra)
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).futureField).toBe("x")
    }
  })

  it("선택 필드(title, description)는 없어도 통과한다", () => {
    const minimal = { schemaVersion: "1.0", id: "R-XYZ789" }
    const result = PrdSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  // ---- 01-01-PLAN.md Task 3: 신규 필드 테스트 ----
  it("northStar 필드가 없어도 통과한다 (optional)", () => {
    const result = PrdSchema.safeParse({ schemaVersion: "1.0", id: "R-ABC234" })
    expect(result.success).toBe(true)
  })

  it("northStar 필드를 포함한 객체를 통과시킨다", () => {
    const result = PrdSchema.safeParse({
      schemaVersion: "1.0",
      id: "R-ABC234",
      northStar: { metric: "DAU 100", timeframe: "6개월" },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).northStar).toEqual({ metric: "DAU 100", timeframe: "6개월" })
    }
  })

  it("milestones 필드 (배열)를 포함한 객체를 통과시킨다", () => {
    const result = PrdSchema.safeParse({
      schemaVersion: "1.0",
      id: "R-ABC234",
      milestones: [{ name: "M1", dueDate: "2026-09-01" }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Array.isArray((result.data as Record<string, unknown>).milestones)).toBe(true)
    }
  })

  it("roles 필드 (string[])를 포함한 객체를 통과시킨다", () => {
    const result = PrdSchema.safeParse({
      schemaVersion: "1.0",
      id: "R-ABC234",
      roles: ["PM", "개발자"],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).roles).toEqual(["PM", "개발자"])
    }
  })

  it("devices 필드 (string[])를 포함한 객체를 통과시킨다", () => {
    const result = PrdSchema.safeParse({
      schemaVersion: "1.0",
      id: "R-ABC234",
      devices: ["mobile", "desktop"],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).devices).toEqual(["mobile", "desktop"])
    }
  })

  it("sectionMeta 필드 (record)를 포함한 객체를 통과시킨다", () => {
    const result = PrdSchema.safeParse({
      schemaVersion: "1.0",
      id: "R-ABC234",
      sectionMeta: { overview: { locked: true }, problemAndSolution: { version: 2 } },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const data = result.data as Record<string, unknown>
      expect((data.sectionMeta as Record<string, unknown>).overview).toEqual({ locked: true })
    }
  })
})

// ===========================================================
// PrdJsonSchema — draft-07 확인
// ===========================================================
describe("PrdJsonSchema", () => {
  it("$schema가 draft-07을 가리킨다", () => {
    expect(PrdJsonSchema.$schema).toBeDefined()
    expect(PrdJsonSchema.$schema).toContain("draft-07")
  })

  it("$schema가 2020-12를 포함하지 않는다", () => {
    expect(String(PrdJsonSchema.$schema)).not.toContain("2020-12")
  })
})

// ===========================================================
// FeaturesSchema
// ===========================================================
describe("FeaturesSchema", () => {
  it("유효한 features 객체를 통과시킨다", () => {
    const valid = {
      schemaVersion: "1.0",
      items: [
        {
          id: "F-ABC123",
          title: "기능1",
          acceptanceCriteria: ["조건1"],
          roleAssignments: [],
          links: [],
        },
      ],
    }
    const result = FeaturesSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("schemaVersion 누락을 거부한다", () => {
    const invalid = { items: [] }
    const result = FeaturesSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("items 내 id는 F- / S- / R- 중 하나를 요구한다 (R- 추가 허용, FEAT-02)", () => {
    // R-ABC123는 이제 유효한 ID (03-01 스키마 확장)
    const validR = { schemaVersion: "1.0", items: [{ id: "R-ABC123", title: "기능1" }] }
    expect(FeaturesSchema.safeParse(validR).success).toBe(true)
    // 접두사가 없는 ID는 여전히 거부된다
    const invalid = { schemaVersion: "1.0", items: [{ id: "X-ABC123", title: "기능1" }] }
    expect(FeaturesSchema.safeParse(invalid).success).toBe(false)
  })

  it("미지 필드를 보존한다 (forward-compat)", () => {
    const withExtra = { schemaVersion: "1.0", items: [], futureField: "v2" }
    const result = FeaturesSchema.safeParse(withExtra)
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).futureField).toBe("v2")
    }
  })

  it("FeaturesJsonSchema $schema가 draft-07이다", () => {
    expect(String(FeaturesJsonSchema.$schema)).toContain("draft-07")
    expect(String(FeaturesJsonSchema.$schema)).not.toContain("2020-12")
  })

  // ---- 03-01-PLAN.md Task 1: R- ID + parent + enum 확장 테스트 ----

  it("R-A1B2C3 형식 id 항목이 FeaturesSchema.safeParse를 통과한다 (FEAT-02)", () => {
    const result = FeaturesSchema.safeParse({
      schemaVersion: "1.0",
      items: [{ id: "R-A1B2C3", title: "요구사항1" }],
    })
    expect(result.success).toBe(true)
  })

  it("parent: R-A1B2C3 필드가 보존된다 (D-12)", () => {
    const result = FeaturesSchema.safeParse({
      schemaVersion: "1.0",
      items: [{ id: "F-ABC123", title: "기능1", parent: "R-A1B2C3" }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const item = result.data.items?.[0] as Record<string, unknown>
      expect(item.parent).toBe("R-A1B2C3")
    }
  })

  it("parent 없는 항목도 통과한다 (R은 루트, parent optional)", () => {
    const result = FeaturesSchema.safeParse({
      schemaVersion: "1.0",
      items: [{ id: "R-A1B2C3", title: "요구사항1" }],
    })
    expect(result.success).toBe(true)
  })

  it("status: todo/in-progress/done은 통과한다 (D-04)", () => {
    for (const status of ["todo", "in-progress", "done"]) {
      const result = FeaturesSchema.safeParse({
        schemaVersion: "1.0",
        items: [{ id: "F-ABC123", status }],
      })
      expect(result.success, `status: ${status}`).toBe(true)
    }
  })

  it("status: 임의문자열은 실패한다 (D-04)", () => {
    const result = FeaturesSchema.safeParse({
      schemaVersion: "1.0",
      items: [{ id: "F-ABC123", status: "임의문자열" }],
    })
    expect(result.success).toBe(false)
  })

  it("importance: high/medium/low는 통과한다 (D-04)", () => {
    for (const importance of ["high", "medium", "low"]) {
      const result = FeaturesSchema.safeParse({
        schemaVersion: "1.0",
        items: [{ id: "F-ABC123", importance }],
      })
      expect(result.success, `importance: ${importance}`).toBe(true)
    }
  })

  it("importance: urgent는 실패한다 (D-04)", () => {
    const result = FeaturesSchema.safeParse({
      schemaVersion: "1.0",
      items: [{ id: "F-ABC123", importance: "urgent" }],
    })
    expect(result.success).toBe(false)
  })

  it("acceptanceCriteria: GWT 배열이 통과한다 (FEAT-03)", () => {
    const result = FeaturesSchema.safeParse({
      schemaVersion: "1.0",
      items: [{ id: "R-A1B2C3", acceptanceCriteria: ["Given X When Y Then Z"] }],
    })
    expect(result.success).toBe(true)
  })
})

// ===========================================================
// UserflowSchema
// ===========================================================
describe("UserflowSchema", () => {
  it("유효한 userflow 객체를 통과시킨다", () => {
    const valid = {
      schemaVersion: "1.0",
      versionGroups: [],
      versions: [],
      nodes: [{ type: "start" }],
      edges: [],
    }
    const result = UserflowSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("schemaVersion 누락을 거부한다", () => {
    const invalid = { nodes: [], edges: [] }
    const result = UserflowSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("node type이 허용된 값 외의 것을 거부한다", () => {
    const invalid = {
      schemaVersion: "1.0",
      nodes: [{ type: "invalid-type" }],
      edges: [],
    }
    const result = UserflowSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("미지 필드를 보존한다 (forward-compat)", () => {
    const withExtra = { schemaVersion: "1.0", nodes: [], edges: [], futureField: "v2" }
    const result = UserflowSchema.safeParse(withExtra)
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).futureField).toBe("v2")
    }
  })

  it("UserflowJsonSchema $schema가 draft-07이다", () => {
    expect(String(UserflowJsonSchema.$schema)).toContain("draft-07")
    expect(String(UserflowJsonSchema.$schema)).not.toContain("2020-12")
  })
})

// ===========================================================
// IaSchema
// ===========================================================
describe("IaSchema", () => {
  it("유효한 ia 객체를 통과시킨다", () => {
    const valid = { schemaVersion: "1.0", pages: [] }
    const result = IaSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("schemaVersion 누락을 거부한다", () => {
    const invalid = { pages: [] }
    const result = IaSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("미지 필드를 보존한다 (forward-compat)", () => {
    const withExtra = { schemaVersion: "1.0", pages: [], futureField: "v2" }
    const result = IaSchema.safeParse(withExtra)
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).futureField).toBe("v2")
    }
  })

  it("IaJsonSchema $schema가 draft-07이다", () => {
    expect(String(IaJsonSchema.$schema)).toContain("draft-07")
    expect(String(IaJsonSchema.$schema)).not.toContain("2020-12")
  })
})
