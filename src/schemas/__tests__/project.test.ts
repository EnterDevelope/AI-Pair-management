import { describe, it, expect } from "vitest"
import { ProjectSchema, ProjectJsonSchema } from "../index.js"

describe("ProjectSchema", () => {
  it("유효한 project 객체를 통과시킨다", () => {
    const valid = {
      schemaVersion: "1.0",
      id: "P-ABC123",
      name: "테스트 프로젝트",
      roles: ["PM", "개발자"],
      devices: ["mobile", "desktop"],
      createdAt: "2026-06-07T00:00:00Z",
    }
    const result = ProjectSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("id 누락 객체를 거부한다", () => {
    const invalid = { schemaVersion: "1.0", name: "테스트" }
    const result = ProjectSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("schemaVersion 누락 객체를 거부한다", () => {
    const invalid = { id: "P-ABC123", name: "테스트" }
    const result = ProjectSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("잘못된 id 형식(P- 외 접두사)을 거부한다", () => {
    const invalid = { schemaVersion: "1.0", id: "R-ABC123", name: "테스트" }
    const result = ProjectSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("잘못된 id 형식(소문자)을 거부한다", () => {
    const invalid = { schemaVersion: "1.0", id: "P-abc123", name: "테스트" }
    const result = ProjectSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("roles[]와 devices[]가 없어도 통과한다 (optional)", () => {
    const minimal = { schemaVersion: "1.0", id: "P-ABC123", name: "최소" }
    const result = ProjectSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it("미지 필드를 보존한다 (forward-compat)", () => {
    const withExtra = { schemaVersion: "1.0", id: "P-ABC123", name: "테스트", futureField: "x" }
    const result = ProjectSchema.safeParse(withExtra)
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).futureField).toBe("x")
    }
  })

  // ---- 01-01-PLAN.md Task 3: lang 필드 테스트 ----
  it("lang 필드가 없어도 통과한다 (optional)", () => {
    const result = ProjectSchema.safeParse({ schemaVersion: "1.0", id: "P-ABC123" })
    expect(result.success).toBe(true)
  })

  it("lang 필드 'ko'를 포함한 객체를 통과시킨다", () => {
    const result = ProjectSchema.safeParse({
      schemaVersion: "1.0",
      id: "P-ABC123",
      lang: "ko",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).lang).toBe("ko")
    }
  })

  it("lang 필드 허용값 목록 — en, ja, zh도 통과한다", () => {
    for (const lang of ["en", "ja", "zh"] as const) {
      const result = ProjectSchema.safeParse({ schemaVersion: "1.0", id: "P-ABC123", lang })
      expect(result.success).toBe(true)
    }
  })

  it("lang 필드에 허용되지 않은 값('fr')은 거부한다", () => {
    const result = ProjectSchema.safeParse({
      schemaVersion: "1.0",
      id: "P-ABC123",
      lang: "fr",
    })
    expect(result.success).toBe(false)
  })
})

describe("ProjectJsonSchema", () => {
  it("$schema가 draft-07을 가리킨다", () => {
    expect(String(ProjectJsonSchema.$schema)).toContain("draft-07")
  })

  it("$schema가 2020-12를 포함하지 않는다", () => {
    expect(String(ProjectJsonSchema.$schema)).not.toContain("2020-12")
  })
})
