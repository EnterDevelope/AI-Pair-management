// ============================================================
// AJV 8 디스크 검증기 (00-03-PLAN.md Task 2)
// ============================================================
// 목적: 디스크에서 읽은 graph JSON이 schema 계약(draft-07)을
//       준수하는지 검증한다. Zod는 사용자/웹 입력 경계용 —
//       여기서는 AJV 8 표준 import(draft-07)를 사용(RESEARCH Pattern 2).
//
// 설계:
// - ajv.compile은 모듈 로드 시 1회만 실행(매 호출 재컴파일 금지)
// - removeAdditional: false — 미지 필드 보존(D-04 forward-compat)
// - strict: false — draft-07 jsonSchema의 알 수 없는 키워드 허용
// ============================================================

import { Ajv } from "ajv"
import {
  ProjectJsonSchema,
  PrdJsonSchema,
  FeaturesJsonSchema,
  UserflowJsonSchema,
  IaJsonSchema,
} from "../schemas/index.js"

// AJV 인스턴스 — 모듈 초기화 시 1회 생성
const ajv = new Ajv({ removeAdditional: false, strict: false })

// ValidateFunction 매핑 — compile은 모듈 로드 시 1회만 (per-module singleton)
const VALIDATORS = {
  project: ajv.compile(ProjectJsonSchema),
  prd: ajv.compile(PrdJsonSchema),
  features: ajv.compile(FeaturesJsonSchema),
  userflow: ajv.compile(UserflowJsonSchema),
  ia: ajv.compile(IaJsonSchema),
} as const

export type GraphKind = keyof typeof VALIDATORS

/**
 * 디스크에서 읽은 graph JSON 객체를 draft-07 스키마로 검증한다.
 *
 * @param kind - graph 파일 종류 ("project" | "prd" | "features" | "userflow" | "ia")
 * @param data - 검증할 객체 (unknown — 디스크 신뢰 불가)
 * @returns 검증 통과 시 원본 data를 반환 (미지 필드 보존)
 * @throws 검증 실패 또는 알 수 없는 kind일 때 Error
 */
export function validateGraphFile(kind: GraphKind, data: unknown): unknown {
  const validator = VALIDATORS[kind]

  // 알 수 없는 kind 방어 (TypeScript 타입 외부에서 호출될 경우 대비)
  if (validator === undefined) {
    throw new Error(
      `알 수 없는 graph 종류: "${String(kind)}". 허용 값: ${Object.keys(VALIDATORS).join(", ")}`
    )
  }

  const valid = validator(data)

  if (!valid) {
    const errorText = ajv.errorsText(validator.errors, { separator: "; " })
    throw new Error(`Schema validation failed [${kind}]: ${errorText}`)
  }

  return data
}
