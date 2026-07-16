import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import { readIntake, writeIntake, IntakeSchema } from "../intake.js"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aipm-intake-test-"))
  // Create .aipm directory
  await fs.mkdir(path.join(tmpDir, ".aipm"), { recursive: true })
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe("writeIntake / readIntake 라운드트립", () => {
  it("6축 답변 + detectedLang 보존", async () => {
    const intake = IntakeSchema.parse({
      schemaVersion: "1.0",
      targetAndScenario: "헬스장 회원",
      problemStatement: "예약이 불편하다",
      coreFeatures: ["예약", "알림"],
      scopeAndPriority: "MVP",
      platformDevice: ["mobile"],
      successCriteria: "DAU 100",
      detectedLang: "ko",
    })

    await writeIntake(tmpDir, intake)
    const result = await readIntake(tmpDir)

    expect(result).not.toBeNull()
    expect(result?.targetAndScenario).toBe("헬스장 회원")
    expect(result?.problemStatement).toBe("예약이 불편하다")
    expect(result?.coreFeatures).toEqual(["예약", "알림"])
    expect(result?.scopeAndPriority).toBe("MVP")
    expect(result?.platformDevice).toEqual(["mobile"])
    expect(result?.successCriteria).toBe("DAU 100")
    expect(result?.detectedLang).toBe("ko")
  })

  it("알 수 없는 미래 필드 포함 intake.json → strip 없이 보존 (looseObject)", async () => {
    const rawData = {
      schemaVersion: "1.0",
      rawIdea: "헬스장 예약 앱",
      detectedLang: "ko",
      futureField: "v2-experimental",
      nested: { key: "value" },
    }

    const intakePath = path.join(tmpDir, ".aipm", "intake.json")
    await fs.writeFile(intakePath, JSON.stringify(rawData, null, 2) + "\n", "utf8")

    const result = await readIntake(tmpDir)

    expect(result).not.toBeNull()
    expect((result as Record<string, unknown>).futureField).toBe("v2-experimental")
    expect((result as Record<string, unknown>).nested).toEqual({ key: "value" })
  })
})

describe("readIntake 오류 처리", () => {
  it("손상된 JSON (파싱 실패) → null 반환 (throw 아님)", async () => {
    const intakePath = path.join(tmpDir, ".aipm", "intake.json")
    await fs.writeFile(intakePath, "{ invalid json }", "utf8")

    const result = await readIntake(tmpDir)
    expect(result).toBeNull()
  })

  it("스키마 위반 (schemaVersion 누락) → null 반환", async () => {
    const intakePath = path.join(tmpDir, ".aipm", "intake.json")
    await fs.writeFile(
      intakePath,
      JSON.stringify({ rawIdea: "헬스장 예약" }),
      "utf8"
    )

    const result = await readIntake(tmpDir)
    expect(result).toBeNull()
  })

  it("파일이 없으면 null 반환 (throw 아님)", async () => {
    const result = await readIntake(tmpDir)
    expect(result).toBeNull()
  })
})

describe("IntakeSchema", () => {
  it("schemaVersion이 없으면 파싱 실패한다", () => {
    const result = IntakeSchema.safeParse({ rawIdea: "테스트" })
    expect(result.success).toBe(false)
  })

  it("detectedLang이 허용된 값만 수용한다", () => {
    const valid = IntakeSchema.safeParse({ schemaVersion: "1.0", detectedLang: "ko" })
    expect(valid.success).toBe(true)

    const invalid = IntakeSchema.safeParse({ schemaVersion: "1.0", detectedLang: "fr" })
    expect(invalid.success).toBe(false)
  })
})
