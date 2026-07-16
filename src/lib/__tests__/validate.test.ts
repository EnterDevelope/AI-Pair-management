import { describe, it, expect } from "vitest"
import { validateGraphFile } from "../validate.js"

// ============================================================
// TDD RED: AJV 8 디스크 검증 테스트 (00-03-PLAN.md Task 2)
// validate.js 가 존재하지 않으므로 전부 실패해야 한다
// ============================================================

describe("validateGraphFile — prd", () => {
  it("유효한 prd 객체를 그대로 반환한다", () => {
    const valid = { schemaVersion: "1.0", id: "R-ABC234" }
    const result = validateGraphFile("prd", valid)
    expect(result).toEqual(valid)
  })

  it("id 누락 prd 객체에서 throw 한다", () => {
    const noId = { schemaVersion: "1.0" }
    expect(() => validateGraphFile("prd", noId)).toThrow()
  })

  it("schemaVersion 누락 prd 객체에서 throw 한다", () => {
    const noSv = { id: "R-ABC234" }
    expect(() => validateGraphFile("prd", noSv)).toThrow()
  })

  it("미지 필드를 제거하지 않고 보존한다(removeAdditional:false)", () => {
    const withFuture = { schemaVersion: "1.0", id: "R-ABC234", futureField: "keep-me" }
    const result = validateGraphFile("prd", withFuture) as Record<string, unknown>
    expect(result).toHaveProperty("futureField", "keep-me")
  })
})

describe("validateGraphFile — project", () => {
  it("유효한 project 객체를 통과시킨다", () => {
    const valid = {
      schemaVersion: "1.0",
      id: "P-PROJ01",
      name: "테스트 프로젝트",
      roles: ["PM"],
      devices: ["mobile"],
    }
    const result = validateGraphFile("project", valid)
    expect(result).toEqual(valid)
  })

  it("project id가 없으면 throw 한다", () => {
    const noId = { schemaVersion: "1.0", name: "이름만" }
    expect(() => validateGraphFile("project", noId)).toThrow()
  })

  it("project id 접두사가 R-이면 throw 한다(P- 필요)", () => {
    const wrongPrefix = { schemaVersion: "1.0", id: "R-ABC234" }
    expect(() => validateGraphFile("project", wrongPrefix)).toThrow()
  })
})

describe("validateGraphFile — features", () => {
  it("유효한 features 객체를 통과시킨다(items 없어도 됨)", () => {
    const valid = { schemaVersion: "1.0" }
    const result = validateGraphFile("features", valid)
    expect(result).toEqual(valid)
  })

  it("items 내 잘못된 id 형식에서 throw 한다", () => {
    const badItemId = {
      schemaVersion: "1.0",
      items: [{ id: "X-INVALID" }],
    }
    expect(() => validateGraphFile("features", badItemId)).toThrow()
  })
})

describe("validateGraphFile — userflow", () => {
  it("유효한 userflow 객체를 통과시킨다", () => {
    const valid = {
      schemaVersion: "1.0",
      nodes: [{ type: "start" }],
    }
    const result = validateGraphFile("userflow", valid)
    expect(result).toEqual(valid)
  })

  it("nodes type이 허용 외 값이면 throw 한다", () => {
    const badType = {
      schemaVersion: "1.0",
      nodes: [{ type: "unknownNodeType" }],
    }
    expect(() => validateGraphFile("userflow", badType)).toThrow()
  })
})

describe("validateGraphFile — ia", () => {
  it("유효한 ia 객체를 통과시킨다", () => {
    const valid = {
      schemaVersion: "1.0",
      pages: [{ id: "P-PAGE01" }],
    }
    const result = validateGraphFile("ia", valid)
    expect(result).toEqual(valid)
  })

  it("pages 내 잘못된 id 형식에서 throw 한다", () => {
    const badPageId = {
      schemaVersion: "1.0",
      pages: [{ id: "X-PAGE01" }],
    }
    expect(() => validateGraphFile("ia", badPageId)).toThrow()
  })
})

describe("validateGraphFile — 알 수 없는 kind", () => {
  it("알 수 없는 kind에서 명시적 에러를 던진다", () => {
    // 의도적으로 잘못된 kind 테스트 (as never 캐스트로 타입 경계 우회)
    expect(() => validateGraphFile("unknown-kind" as never, {})).toThrow(/알 수 없는|unknown|kind/i)
  })
})
