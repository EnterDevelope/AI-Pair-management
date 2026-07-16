// ============================================================
// AIPM Schema Barrel — 하류 단일 계약 표면 (00-03-PLAN.md)
// ============================================================
// 이 파일을 import하는 모든 하류 코드는 스키마·타입·JsonSchema를
// 여기서만 가져온다. 5종 스키마 전부(project + prd/features/userflow/ia).
// ============================================================

// Project schema (project.json)
export {
  ProjectSchema,
  ProjectJsonSchema,
  type Project,
} from "./project.js"

// Graph schemas (graph/*.json)
export {
  PrdSchema,
  PrdJsonSchema,
  type Prd,
} from "./graph/prd.js"

export {
  FeaturesSchema,
  FeaturesJsonSchema,
  type Features,
} from "./graph/features.js"

export {
  UserflowSchema,
  UserflowJsonSchema,
  type Userflow,
} from "./graph/userflow.js"

export {
  IaSchema,
  IaJsonSchema,
  type Ia,
} from "./graph/ia.js"
