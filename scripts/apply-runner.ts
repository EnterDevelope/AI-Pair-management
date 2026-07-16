// ============================================================
// apply-runner: 큐 일괄 처리 (04B-03 Task 1)
// ============================================================
// 목적: .aipm/queue/*.json을 타임스탬프 순으로 처리한다.
//       baseVersion 충돌 감지(D-06 콘텐츠 해시) → 충돌 시 건너뜀 + history 이관.
//       무충돌 시 ID 고정 병합(codex mode, D-04) → deriveDocs → history 이관.
//       단일 실패가 배치를 멈추지 않는다(D-05, Pitfall 5).
//
// 설계:
// - processQueue: export — aipm-apply.md 커맨드·테스트 진입점
// - processSingleRequest: internal — 단일 파일 처리 (try-catch 전체 감싸기)
// - 모든 병합: spread 불변성(CLAUDE.md)
// - generator 주입(options._generators): 테스트에서 AI 호출 없이 검증 가능
//
// D-03: 파일명(타임스탬프 선두) 정렬 → 자연 시간순 처리
// D-04: applyFeaturesMergePolicy / applyUserflowMergePolicy / applyMergePolicy codex 모드
// D-05: applied/conflict/error 모두 history로 이관 → 무한 재충돌 방지
// D-06: computeContentHash(항목 서브트리) vs request.baseVersion
// ============================================================

import * as fs from "node:fs/promises"
import * as path from "node:path"
import writeFileAtomic from "write-file-atomic"

import { computeContentHash } from "../src/lib/content-hash.js"
import { extractTargetSubtree } from "../src/lib/extract-subtree.js"
import { QueueRequestSchema } from "../src/schemas/queue.js"
import type { QueueHistory } from "../src/schemas/queue.js"
import { FeaturesSchema } from "../src/schemas/graph/features.js"
import type { Features } from "../src/schemas/graph/features.js"
import { UserflowSchema } from "../src/schemas/graph/userflow.js"
import type { Userflow } from "../src/schemas/graph/userflow.js"
import { PrdSchema } from "../src/schemas/graph/prd.js"
import type { Prd } from "../src/schemas/graph/prd.js"
import {
  applyFeaturesMergePolicy,
  validateFeaturesWithRetry,
} from "./feature-generator.js"
import {
  applyUserflowMergePolicy,
  validateUserflowWithRetry,
} from "./flow-generator.js"
import {
  applyMergePolicy as applyPrdMergePolicy,
  validatePrdWithRetry,
} from "./prd-generator.js"
import { writeGraphFile } from "../src/lib/atomic-write.js"
import { deriveDocs } from "./doc-deriver.js"

/** 단일 큐 요청 처리 결과 */
export interface ApplyResult {
  requestId: string
  filename: string
  targetId: string
  outcome: "applied" | "conflict" | "error"
  summary?: string
  error?: string
}

/**
 * generator 주입 옵션 (테스트에서 AI 호출 없이 검증)
 * 실제 프로덕션에서는 생략 — 기존 generator 파이프라인 재사용
 */
export interface ApplyRunnerOptions {
  /** features 분기: generator() 주입으로 AI 호출 없이 테스트 가능 */
  _featuresGenerator?: (projectDir: string) => Promise<Features>
  /** flow 분기: generator() 주입 */
  _flowGenerator?: (projectDir: string) => Promise<Userflow>
  /** prd 분기: generator() 주입 */
  _prdGenerator?: (projectDir: string) => Promise<Prd>
  /** deriveDocs 주입 — 테스트에서 graph/prd.json 없이 검증할 때 no-op으로 대체 */
  _deriveDocs?: (projectDir: string) => Promise<void>
}

/**
 * .aipm/queue/*.json을 타임스탬프 순으로 전부 처리한다.
 *
 * - 빈 큐: 빈 배열 반환 (에러 아님)
 * - 단일 요청 실패: try-catch로 잡아 outcome:"error" 반환 후 루프 계속 (배치 멈추지 않음)
 *
 * @param projectDir - 프로젝트 루트 절대 경로
 * @param options - 테스트용 generator 주입 옵션
 */
export async function processQueue(
  projectDir: string,
  options?: ApplyRunnerOptions
): Promise<ApplyResult[]> {
  const queueDir = path.join(projectDir, ".aipm", "queue")
  const historyDir = path.join(projectDir, ".aipm", "history")

  // historyDir이 없으면 생성
  await fs.mkdir(historyDir, { recursive: true })

  let files: string[]
  try {
    files = (await fs.readdir(queueDir))
      .filter((f) => f.endsWith(".json"))
      .sort() // 파일명(타임스탬프 선두) 정렬 = D-03 처리 순
  } catch {
    // queueDir 자체가 없으면 빈 큐 취급
    return []
  }

  const results: ApplyResult[] = []
  for (const filename of files) {
    const result = await processSingleRequest(
      projectDir,
      queueDir,
      historyDir,
      filename,
      options
    )
    results.push(result)
  }
  return results
}

/**
 * 단일 큐 파일을 처리한다. 전체를 try-catch로 감싸 배치 지속 보장(Pitfall 5).
 *
 * 처리 순서:
 * 1. 큐 파일 읽기 + QueueRequestSchema.parse
 * 2. 대상 그래프 로드 + 항목 서브트리 추출
 * 3. computeContentHash(현재 서브트리)
 * 4. currentHash !== request.baseVersion → 충돌: history 이관(conflict), 반환
 * 5. 무충돌 → generator(codex mode) 재호출 → ID 고정 병합
 * 6. writeGraphFile(원자적 overwrite)
 * 7. deriveDocs(MD 단방향 재파생)
 * 8. 큐 파일 → history 이관(applied)
 * 9. ApplyResult applied 반환
 * catch → history 이관(error) + ApplyResult error 반환
 */
async function processSingleRequest(
  projectDir: string,
  queueDir: string,
  historyDir: string,
  filename: string,
  options?: ApplyRunnerOptions
): Promise<ApplyResult> {
  const queueFilePath = path.join(queueDir, filename)
  const historyPath = path.join(historyDir, filename)

  // 큐 파일 읽기 — 여기서 실패하면 catch로 떨어짐
  let rawContent: string
  try {
    rawContent = await fs.readFile(queueFilePath, "utf8")
  } catch (err) {
    // 파일 읽기 실패 — error 이관 불가(파일 없음), 에러만 반환
    return {
      requestId: filename,
      filename,
      targetId: "",
      outcome: "error",
      error: `큐 파일 읽기 실패: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawContent)
  } catch (err) {
    return await handleError(
      filename,
      queueFilePath,
      historyPath,
      rawContent,
      `JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const parseResult = QueueRequestSchema.safeParse(parsed)
  if (!parseResult.success) {
    return await handleError(
      filename,
      queueFilePath,
      historyPath,
      rawContent,
      `스키마 검증 실패: ${parseResult.error.message}`
    )
  }

  const request = parseResult.data

  try {
    // ② 대상 그래프 로드 + 서브트리 추출
    const { currentHash, graphFilePath, currentGraph } =
      await loadGraphAndComputeHash(projectDir, request.targetArtifact, request.targetId)

    // ③ 충돌 감지(D-06)
    if (currentHash !== request.baseVersion) {
      // ④ 충돌: history 이관 + conflict 반환
      const historyRecord: QueueHistory = {
        ...(parsed as Record<string, unknown>),
        schemaVersion: "1.0",
        requestId: request.requestId,
        targetArtifact: request.targetArtifact,
        targetId: request.targetId,
        instruction: request.instruction,
        baseVersion: request.baseVersion,
        createdAt: request.createdAt,
        outcome: "conflict",
        appliedAt: new Date().toISOString(),
        summary: `적재 후 항목이 변경됨 (currentHash: ${currentHash.slice(0, 8)}…, baseVersion: ${request.baseVersion.slice(0, 8)}…)`,
      }
      await migrateToHistory(queueFilePath, historyPath, historyRecord)
      return {
        requestId: request.requestId,
        filename,
        targetId: request.targetId,
        outcome: "conflict",
        summary: historyRecord.summary,
      }
    }

    // ⑤ 무충돌 → generator(codex mode) 재호출 + ID 고정 병합
    let summary: string
    switch (request.targetArtifact) {
      case "features": {
        const current = currentGraph as Features
        const featGen = options?._featuresGenerator
          ?? ((dir: string) => generateFeaturesWithInstruction(dir, request.instruction))
        const proposed = await validateFeaturesWithRetry(
          () => featGen(projectDir),
          undefined
        )
        const merged = applyFeaturesMergePolicy(current, proposed, "codex")
        // ⑥ 원자적 쓰기
        await writeGraphFile(graphFilePath, merged)
        summary = `features ${request.targetId} 수정 적용`
        break
      }
      case "flow": {
        const current = currentGraph as Userflow
        const flowGen = options?._flowGenerator
          ?? ((dir: string) => generateFlowWithInstruction(dir, request.instruction))
        const proposed = await validateUserflowWithRetry(
          () => flowGen(projectDir),
          undefined
        )
        const merged = applyUserflowMergePolicy(current, proposed, "codex")
        await writeGraphFile(graphFilePath, merged)
        summary = `flow ${request.targetId} 수정 적용`
        break
      }
      case "prd": {
        const current = currentGraph as Prd
        const prdGen = options?._prdGenerator
          ?? ((dir: string) => generatePrdWithInstruction(dir, request.instruction))
        const proposed = await validatePrdWithRetry(
          () => prdGen(projectDir)
        )
        const merged = applyPrdMergePolicy(current, proposed, "codex")
        await writeGraphFile(graphFilePath, merged)
        summary = `prd ${request.targetId} 수정 적용`
        break
      }
      default: {
        // exhaustive check
        const _never: never = request.targetArtifact
        throw new Error(`알 수 없는 targetArtifact: ${_never}`)
      }
    }

    // ⑦ deriveDocs(MD 단방향 재파생) — 주입 옵션으로 테스트에서 no-op 대체 가능
    const deriveDocsFn = options?._deriveDocs ?? deriveDocs
    await deriveDocsFn(projectDir)

    // ⑧ 큐 파일 → history 이관(applied)
    const historyRecord: QueueHistory = {
      ...(parsed as Record<string, unknown>),
      schemaVersion: "1.0",
      requestId: request.requestId,
      targetArtifact: request.targetArtifact,
      targetId: request.targetId,
      instruction: request.instruction,
      baseVersion: request.baseVersion,
      createdAt: request.createdAt,
      outcome: "applied",
      appliedAt: new Date().toISOString(),
      summary,
    }
    await migrateToHistory(queueFilePath, historyPath, historyRecord)

    // ⑨ ApplyResult applied 반환
    return {
      requestId: request.requestId,
      filename,
      targetId: request.targetId,
      outcome: "applied",
      summary,
    }
  } catch (err) {
    // catch → history 이관(error) + 배치 지속(Pitfall 5)
    const errMsg = err instanceof Error ? err.message : String(err)
    const historyRecord: QueueHistory = {
      ...(parsed as Record<string, unknown>),
      schemaVersion: "1.0",
      requestId: request.requestId,
      targetArtifact: request.targetArtifact,
      targetId: request.targetId,
      instruction: request.instruction,
      baseVersion: request.baseVersion,
      createdAt: request.createdAt,
      outcome: "error",
      appliedAt: new Date().toISOString(),
      summary: `오류: ${errMsg}`,
    }
    // 이관 실패 무시(history 쓰기 자체 실패해도 배치 지속)
    await migrateToHistory(queueFilePath, historyPath, historyRecord).catch(() => {})
    return {
      requestId: request.requestId,
      filename,
      targetId: request.targetId,
      outcome: "error",
      error: errMsg,
    }
  }
}

// ============================================================
// 내부 헬퍼
// ============================================================

/** 대상 그래프를 로드하고 targetId 항목 서브트리의 콘텐츠 해시를 계산한다 */
async function loadGraphAndComputeHash(
  projectDir: string,
  targetArtifact: "prd" | "features" | "flow",
  targetId: string
): Promise<{ currentHash: string; graphFilePath: string; currentGraph: Features | Userflow | Prd }> {
  switch (targetArtifact) {
    case "features": {
      const graphFilePath = path.join(projectDir, "graph", "features.json")
      const raw = await fs.readFile(graphFilePath, "utf8")
      const currentGraph = FeaturesSchema.parse(JSON.parse(raw))
      const subtree = extractTargetSubtree(targetArtifact, currentGraph, targetId)
      return { currentHash: computeContentHash(subtree), graphFilePath, currentGraph }
    }
    case "flow": {
      const graphFilePath = path.join(projectDir, "graph", "userflow.json")
      const raw = await fs.readFile(graphFilePath, "utf8")
      const currentGraph = UserflowSchema.parse(JSON.parse(raw))
      const subtree = extractTargetSubtree(targetArtifact, currentGraph, targetId)
      return { currentHash: computeContentHash(subtree), graphFilePath, currentGraph }
    }
    case "prd": {
      const graphFilePath = path.join(projectDir, "graph", "prd.json")
      const raw = await fs.readFile(graphFilePath, "utf8")
      const currentGraph = PrdSchema.parse(JSON.parse(raw))
      const subtree = extractTargetSubtree(targetArtifact, currentGraph, targetId)
      return { currentHash: computeContentHash(subtree), graphFilePath, currentGraph }
    }
    default: {
      const _never: never = targetArtifact
      throw new Error(`알 수 없는 targetArtifact: ${_never}`)
    }
  }
}

/**
 * 큐 파일을 history로 이관한다.
 * enriched record를 먼저 원자적으로 기록하고, 성공한 뒤에만 큐 파일을 삭제한다.
 */
async function migrateToHistory(
  queueFilePath: string,
  historyPath: string,
  record: QueueHistory
): Promise<void> {
  await writeFileAtomic(
    historyPath,
    JSON.stringify(record, null, 2) + "\n",
    { encoding: "utf8" }
  )
  await fs.unlink(queueFilePath)
}

/**
 * 파일 읽기 성공 후 오류 처리 — history 이관 후 error ApplyResult 반환
 * (QueueRequest 파싱 전 단계 오류용 — requestId를 filename으로 대체)
 */
async function handleError(
  filename: string,
  queueFilePath: string,
  historyPath: string,
  rawContent: string,
  errMsg: string
): Promise<ApplyResult> {
  // 파싱 전이므로 raw JSON을 최대한 보존하되 outcome 필드 주입
  let base: Record<string, unknown>
  try {
    base = JSON.parse(rawContent) as Record<string, unknown>
  } catch {
    base = {}
  }
  const record: QueueHistory = {
    schemaVersion: "1.0",
    requestId: (base["requestId"] as string | undefined) ?? filename,
    targetArtifact: (base["targetArtifact"] as "prd" | "features" | "flow") ?? "features",
    targetId: (base["targetId"] as string | undefined) ?? "",
    instruction: (base["instruction"] as string | undefined) ?? "",
    baseVersion: (base["baseVersion"] as string | undefined) ?? "",
    createdAt: (base["createdAt"] as string | undefined) ?? new Date().toISOString(),
    outcome: "error",
    appliedAt: new Date().toISOString(),
    summary: `오류: ${errMsg}`,
  }
  // history 기록이 성공했을 때만 큐를 삭제한다. 실패하면 다음 실행에서 재처리할 수 있다.
  await migrateToHistory(queueFilePath, historyPath, record).catch(() => {})
  return {
    requestId: record.requestId,
    filename,
    targetId: record.targetId,
    outcome: "error",
    error: errMsg,
  }
}

// ============================================================
// generator 래퍼 (Pitfall 7: generator 시그니처 미변경, apply-runner가 instruction 주입)
// 실제 프로덕션에서만 호출됨 — 테스트는 _featuresGenerator 주입으로 우회
// ============================================================

async function generateFeaturesWithInstruction(
  projectDir: string,
  _instruction: string
): Promise<Features> {
  // instruction은 CC 세션(AI 엔진)이 컨텍스트로 갖고 있음.
  // feature-generator의 generateFeatureSpec을 재사용.
  const { generateFeatureSpec } = await import("./feature-generator.js")
  return generateFeatureSpec(projectDir, "codex")
}

async function generateFlowWithInstruction(
  projectDir: string,
  _instruction: string
): Promise<Userflow> {
  const { generateUserflow } = await import("./flow-generator.js")
  return generateUserflow(projectDir, "codex")
}

async function generatePrdWithInstruction(
  projectDir: string,
  _instruction: string
): Promise<Prd> {
  // generatePrd는 intake 파라미터가 필요하지만 apply 컨텍스트에서는
  // 현재 prd.json을 그대로 regenerate하는 방식으로 호출한다.
  // intake 없이 재생성하는 경우 prd-generator의 generatePrd 대신
  // 현재 prd를 그대로 proposed로 쓴다 (applyMergePolicy codex mode가 빈 섹션만 채움).
  const graphFilePath = path.join(projectDir, "graph", "prd.json")
  const raw = await fs.readFile(graphFilePath, "utf8")
  return PrdSchema.parse(JSON.parse(raw))
}

// ============================================================
// CLI 진입점 (npx tsx scripts/apply-runner.ts <projectDir>)
// ============================================================

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace("file://", ""))

if (isMain) {
  const projectDir = process.argv[2] ?? process.cwd()
  processQueue(projectDir)
    .then((results) => {
      const applied = results.filter((r) => r.outcome === "applied").length
      const conflict = results.filter((r) => r.outcome === "conflict").length
      const error = results.filter((r) => r.outcome === "error").length
      console.log("\n큐 처리 완료")
      console.log(`| 상태 | 건수 |`)
      console.log(`|------|------|`)
      console.log(`| 적용됨 | ${applied} |`)
      console.log(`| 충돌(건너뜀) | ${conflict} |`)
      console.log(`| 오류 | ${error} |`)
    })
    .catch((err) => {
      console.error("apply-runner 오류:", err)
      process.exit(1)
    })
}
