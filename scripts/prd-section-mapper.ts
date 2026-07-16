// ============================================================
// scripts/prd-section-mapper.ts — 6축 intake → 5섹션 PRD 순수 매핑 함수
// ============================================================
// 목적: D-01/RESEARCH Pattern 5 매핑표에 따라 6축 intake를
//       5섹션 PRD 필드로 결정론적으로 변환한다.
//
// 분리 이유 (01-03 REFACTOR 단계):
// - 부수효과 없는 순수 함수 — 단독 테스트·재사용 가능
// - prd-generator.ts에서 파일 I/O 관심사를 분리
// - 향후 /aipm regen 파이프라인에서도 재사용 가능
//
// 매핑 규칙:
// - Q1 (targetAndScenario) → targetAndScenario 섹션
// - Q2 (problemStatement) → overview + problemAndSolution
// - Q3 (coreFeatures) → problemAndSolution + successAndRisk
// - Q4 (scopeAndPriority) → attributes + milestones
// - Q5 (platformDevice) → attributes.devices
// - Q6 (successCriteria) → successAndRisk + northStar
//
// 불변성:
// - 입력 intake 객체를 변경하지 않는다
// - 항상 새 객체를 반환한다
// ============================================================

import type { Prd } from "../src/schemas/index.js"
import type { Intake } from "../src/lib/intake.js"

/**
 * 6축 intake를 5섹션 PRD 필드로 결정론적으로 매핑한다.
 * D-01/RESEARCH Pattern 5 매핑표 기반.
 *
 * 순수 함수 — 부수효과 없음, 동일 입력에 대해 항상 동일 출력.
 *
 * @param intake - 6축 intake 데이터
 * @returns 5섹션 PRD 필드 + 부가 필드(northStar, milestones, roles, devices)
 */
export function mapIntakeToPrdSections(intake: Intake): Partial<Prd> {
  // Q1 (targetAndScenario) → targetAndScenario 섹션
  const targetAndScenario = intake.targetAndScenario != null
    ? { description: intake.targetAndScenario, roles: [] as string[] }
    : undefined

  // Q2 (problemStatement) → overview + problemAndSolution
  const overview = intake.problemStatement != null
    ? { summary: intake.problemStatement }
    : undefined

  // Q3 (coreFeatures) → problemAndSolution + successAndRisk
  const problemAndSolution = intake.problemStatement != null || intake.coreFeatures != null
    ? {
        problem: intake.problemStatement ?? "",
        features: intake.coreFeatures ?? [],
      }
    : undefined

  // Q4 (scopeAndPriority) → attributes + milestones
  const milestones: unknown[] = intake.scopeAndPriority != null
    ? [{ description: intake.scopeAndPriority }]
    : []

  // Q5 (platformDevice) → attributes.devices
  const devices: string[] = intake.platformDevice ?? []

  // Q6 (successCriteria) → successAndRisk + northStar
  const successAndRisk = intake.successCriteria != null || (intake.coreFeatures != null && intake.coreFeatures.length > 0)
    ? {
        successCriteria: intake.successCriteria ?? "",
        coreFeatures: intake.coreFeatures ?? [],
      }
    : undefined

  const northStar = intake.successCriteria != null
    ? { metric: intake.successCriteria }
    : undefined

  // Q4 + Q5 → attributes 섹션 조합
  const attributes = (intake.scopeAndPriority != null || devices.length > 0)
    ? {
        scope: intake.scopeAndPriority ?? "",
        devices,
      }
    : undefined

  return {
    overview,
    problemAndSolution,
    targetAndScenario,
    successAndRisk,
    attributes,
    northStar,
    milestones,
    roles: [] as string[],
    devices,
  }
}
