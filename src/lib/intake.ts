// ============================================================
// intake.json 읽기/쓰기 유틸 (01-01-PLAN.md Task 2)
// ============================================================
// 목적: .aipm/intake.json 파일을 읽고 쓴다.
//
// 설계:
// - looseObject: 미래 필드 보존 (forward-compat)
// - readIntake: JSON.parse 후 Zod safeParse — 실패 시 null 반환 (throw 없음)
// - writeIntake: fs.writeFile 직접 사용 (ephemeral 파일, 원자 락 불필요)
// - T-01-01 완화: JSON.parse + safeParse로 tampering 방어
// ============================================================

import { z } from "zod"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { detectLang } from "./lang-detect.js"

export const IntakeSchema = z.looseObject({
  schemaVersion: z.literal("1.0"),
  targetAndScenario: z.string().optional(),
  problemStatement: z.string().optional(),
  coreFeatures: z.array(z.string()).optional(),
  scopeAndPriority: z.string().optional(),
  platformDevice: z.array(z.string()).optional(),
  successCriteria: z.string().optional(),
  rawIdea: z.string().optional(),
  detectedLang: z.enum(["ko", "en", "ja", "zh"]).optional(),
  sourceDocs: z.array(z.string()).optional(),
  brownfield: z.boolean().optional(),
})

export type Intake = z.infer<typeof IntakeSchema>

/**
 * .aipm/intake.json을 읽어 Intake 객체를 반환한다.
 * 파일이 없거나, 파싱 실패, 스키마 위반 시 null 반환 (throw 없음).
 *
 * @param projectDir - 프로젝트 루트 디렉토리
 */
export async function readIntake(projectDir: string): Promise<Intake | null> {
  const intakePath = path.join(projectDir, ".aipm", "intake.json")
  try {
    const raw = await fs.readFile(intakePath, "utf8")
    const parsed = IntakeSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * .aipm/intake.json에 Intake 객체를 쓴다.
 * ephemeral 파일이므로 직접 fs.writeFile 사용 (원자 락 불필요).
 *
 * @param projectDir - 프로젝트 루트 디렉토리
 * @param data - 쓸 Intake 데이터
 */
export async function writeIntake(projectDir: string, data: Intake): Promise<void> {
  const intakePath = path.join(projectDir, ".aipm", "intake.json")
  await fs.writeFile(intakePath, JSON.stringify(data, null, 2) + "\n", "utf8")
}

/**
 * rawIdea 텍스트에서 언어를 감지하여 detectedLang 필드를 채운 Intake를 반환한다.
 *
 * @param partial - rawIdea를 포함한 부분 Intake
 */
export function fillDetectedLang(partial: Intake): Intake {
  const text = partial.rawIdea ?? ""
  const lang = detectLang(text)
  return { ...partial, detectedLang: lang }
}
