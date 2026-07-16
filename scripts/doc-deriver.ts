// ============================================================
// doc-deriver.ts — JSON→MD 단방향 파생 + 센티넬 주입 (01-04-PLAN.md)
//
// 핵심 원칙:
// - JSON→MD는 단방향. graph/prd.json이 유일한 진실 출처.
// - 모든 파생 MD 파일 첫 줄 = SENTINEL (<!-- AIPM_GENERATED -->)
// - sectionMeta는 내부 근거 필드 — 출력 본문에 절대 포함 안 함 (D-14)
// - em-dash(—) 사용 금지 (D-09 anti-slop)
// ============================================================

import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

// 리프 스키마를 직접 import — index 배럴의 NodeNext `.js` 체인은 Turbopack이 해석하지 못한다.
// route.ts가 deriveDocs를 직접 import해 이 파일이 Next 번들에 포함되므로 확장자 없는 리프 경로를 쓴다.
import { PrdSchema, type Prd } from "../src/schemas/graph/prd"
import { ProjectSchema } from "../src/schemas/project"
import { FeaturesSchema, type Features } from "../src/schemas/graph/features"
import { UserflowSchema, type Userflow } from "../src/schemas/graph/userflow"

const __filename = fileURLToPath(import.meta.url)
const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(__filename)

// ============================================================
// 공개 상수
// ============================================================

/** 자동 생성 파일 1번 줄에 주입하는 센티넬 마커 */
export const SENTINEL = "<!-- AIPM_GENERATED -->"

// ============================================================
// 한국어 섹션 제목 맵
// ============================================================

const KO_HEADERS: Record<string, string> = {
  overview: "제품 개요",
  problemAndSolution: "문제 및 해결방안",
  targetAndScenario: "타겟 사용자 및 시나리오",
  successAndRisk: "성공 기준 및 위험 요소",
  attributes: "제품 속성",
}

const EN_HEADERS: Record<string, string> = {
  overview: "Overview",
  problemAndSolution: "Problem and Solution",
  targetAndScenario: "Target and Scenario",
  successAndRisk: "Success Criteria and Risks",
  attributes: "Attributes",
}

function getHeader(key: string, lang: string): string {
  if (lang === "ko") return KO_HEADERS[key] ?? key
  return EN_HEADERS[key] ?? key
}

/**
 * unknown 타입 섹션 값을 안전하게 문자열로 변환한다 (CR-02).
 * String(객체) → "[object Object]" 무경고 출력을 막는다.
 * 객체/배열은 JSON 직렬화하고, 비정상 입력을 경고로 남긴다.
 */
function safeString(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  console.warn(
    `[doc-deriver] 비문자열 섹션 값을 JSON으로 직렬화합니다 (타입: ${typeof value})`
  )
  return JSON.stringify(value)
}

// ============================================================
// writeMd — 파일 쓰기 (센티넬 + 직접편집 안내)
// ============================================================

/**
 * content를 filePath에 씁니다.
 * 첫 줄 = SENTINEL, 둘째 줄 = 자동 생성 안내 주석.
 * docs/*.md는 센티넬로 보호되므로 atomic write 불필요.
 */
export async function writeMd(filePath: string, content: string): Promise<void> {
  const autoNotice = `<!-- 자동 생성 파일 - 직접 편집 금지. /aipm 명령으로 재생성하세요. -->`
  const fullContent = `${SENTINEL}\n${autoNotice}\n\n${content}\n`
  await fs.writeFile(filePath, fullContent, "utf8")
}

// ============================================================
// derivePrdMarkdown — PRD.md 본문 생성
// ============================================================

/**
 * prd 객체와 언어 코드를 받아 PRD.md 본문 문자열을 반환합니다.
 * SENTINEL은 붙이지 않습니다. 파일로 쓸 때 writeMd가 단독으로 주입합니다
 * (여기서 접두하면 deriveDocs 경유 시 이중 센티넬이 됩니다 — CR-01).
 * sectionMeta는 출력에 포함하지 않습니다. (D-14)
 */
export function derivePrdMarkdown(prd: Prd, lang: string): string {
  const titleLine = prd.title ? `# ${prd.title}` : "# (제목 미정)"
  const descLine = prd.description ? `\n> ${prd.description}\n` : ""

  const sections: string[] = []

  const sectionKeys = [
    "overview",
    "problemAndSolution",
    "targetAndScenario",
    "successAndRisk",
    "attributes",
  ] as const

  for (const key of sectionKeys) {
    const value = prd[key as keyof Prd]
    if (value != null && value !== "") {
      const header = getHeader(key, lang)
      sections.push(`## ${header}\n\n${safeString(value)}`)
    }
  }

  // SENTINEL은 writeMd가 단독 주입한다 (이중 센티넬 방지, CR-01). 본문만 반환.
  return [titleLine, descLine, ...sections].join("\n\n")
}

// ============================================================
// deriveFeaturesMarkdown — R/F/S 계층 마크다운 생성 (FEAT-03)
// ============================================================

/**
 * features 객체를 받아 FEATURES.md 본문 문자열을 반환합니다.
 * SENTINEL은 붙이지 않습니다. 파일로 쓸 때 writeMd가 단독으로 주입합니다 (CR-01).
 * em-dash(—) 사용 금지 (D-09 anti-slop)
 *
 * 구조: R 항목 최상위, F 항목 R 아래, S 항목 F 아래
 */
export function deriveFeaturesMarkdown(features: Features): string {
  const items = features.items ?? []

  // id -> 항목 인덱스 맵 (parent 탐색용)
  const byId = new Map<string, (typeof items)[number]>()
  for (const item of items) {
    byId.set(item.id, item)
  }

  // 타입 분류 (ID 접두사 기준)
  const rItems = items.filter((i) => i.id.startsWith("R-"))
  const fItems = items.filter((i) => i.id.startsWith("F-"))
  const sItems = items.filter((i) => i.id.startsWith("S-"))

  // parent 기준으로 자식 인덱싱
  const fByParent = new Map<string, (typeof fItems)[number][]>()
  for (const f of fItems) {
    const p = f.parent ?? "__unlinked__"
    const arr = fByParent.get(p) ?? []
    arr.push(f)
    fByParent.set(p, arr)
  }

  const sByParent = new Map<string, (typeof sItems)[number][]>()
  for (const s of sItems) {
    const p = s.parent ?? "__unlinked__"
    const arr = sByParent.get(p) ?? []
    arr.push(s)
    sByParent.set(p, arr)
  }

  const lines: string[] = []
  lines.push("# 기능 명세")

  function renderItem(
    item: (typeof items)[number],
    level: number
  ): void {
    const prefix = "#".repeat(level)
    const titleLine = item.title
      ? `${prefix} ${item.id}: ${item.title}`
      : `${prefix} ${item.id}`
    lines.push("")
    lines.push(titleLine)

    if (item.description) {
      lines.push("")
      lines.push(item.description)
    }

    if (item.acceptanceCriteria && item.acceptanceCriteria.length > 0) {
      lines.push("")
      lines.push("**인수 조건**")
      lines.push("")
      for (const ac of item.acceptanceCriteria) {
        lines.push(`- [ ] ${ac}`)
      }
    }
  }

  // R 항목 렌더 (레벨 2) + 자식 F (레벨 3) + 자식 S (레벨 4)
  for (const r of rItems) {
    renderItem(r, 2)

    const children = fByParent.get(r.id) ?? []
    for (const f of children) {
      renderItem(f, 3)

      const specs = sByParent.get(f.id) ?? []
      for (const s of specs) {
        renderItem(s, 4)
      }
    }
  }

  // parent 없는 F (unlinked) 렌더
  const unlinkedF = fByParent.get("__unlinked__") ?? []
  if (unlinkedF.length > 0) {
    lines.push("")
    lines.push("## (미연결 기능)")
    for (const f of unlinkedF) {
      renderItem(f, 3)
      const specs = sByParent.get(f.id) ?? []
      for (const s of specs) {
        renderItem(s, 4)
      }
    }
  }

  return lines.join("\n")
}

// ============================================================
// deriveUserflowMarkdown — 유저플로우 MD 본문 생성 (FLOW-02)
// ============================================================

/**
 * userflow 객체를 받아 USERFLOW.md 본문 문자열을 반환합니다.
 * SENTINEL은 붙이지 않습니다. 파일로 쓸 때 writeMd가 단독으로 주입합니다 (CR-01).
 * em-dash(—) 사용 금지 (D-09 anti-slop)
 *
 * 구조: 섹션 H2, 페이지 H3, 액션 목록 항목
 */
export function deriveUserflowMarkdown(userflow: Userflow): string {
  const nodes = userflow.nodes ?? []

  const sectionNodes = nodes.filter((n) => n.type === "section")
  const pageNodes = nodes.filter((n) => n.type === "page")
  const actionNodes = nodes.filter((n) => n.type === "action")

  const lines: string[] = []
  lines.push("# 유저플로우")

  if (sectionNodes.length === 0) {
    // 섹션 없으면 페이지를 최상위로 렌더
    for (const page of pageNodes) {
      lines.push("")
      lines.push(`## ${page.label ?? page.id ?? "(페이지)"}`)

      const actions = actionNodes.filter((a) => a.pageId === page.id)
      for (const action of actions) {
        lines.push(`- ${action.label ?? action.id ?? "(액션)"}`)
      }
    }
  } else {
    for (const section of sectionNodes) {
      lines.push("")
      lines.push(`## ${section.label ?? section.id ?? "(섹션)"}`)

      const pages = pageNodes.filter((p) => p.sectionId === section.id)
      for (const page of pages) {
        lines.push("")
        lines.push(`### ${page.label ?? page.id ?? "(페이지)"}`)

        const actions = actionNodes.filter((a) => a.pageId === page.id)
        for (const action of actions) {
          lines.push(`- ${action.label ?? action.id ?? "(액션)"}`)
        }
      }
    }

    // sectionId 없는 페이지 (미연결)
    const unlinkedPages = pageNodes.filter(
      (p) => !p.sectionId || !sectionNodes.some((s) => s.id === p.sectionId)
    )
    if (unlinkedPages.length > 0) {
      lines.push("")
      lines.push("## (미연결 페이지)")
      for (const page of unlinkedPages) {
        lines.push("")
        lines.push(`### ${page.label ?? page.id ?? "(페이지)"}`)

        const actions = actionNodes.filter((a) => a.pageId === page.id)
        for (const action of actions) {
          lines.push(`- ${action.label ?? action.id ?? "(액션)"}`)
        }
      }
    }
  }

  return lines.join("\n")
}

// ============================================================
// 보조 파생 함수 (4종 PM 문서)
// ============================================================

function deriveOnePager(prd: Prd, lang: string): string {
  const title = prd.title ?? "(제목 미정)"
  const desc = prd.description ?? ""
  const overview = safeString(prd.overview)
  const problemAndSolution = safeString(prd.problemAndSolution)

  const nsRaw = prd.northStar as
    | { metric?: string; inputs?: unknown[] }
    | undefined
  const nsMetric = nsRaw?.metric ?? "미정"

  const lines: string[] = []

  if (lang === "ko") {
    lines.push(`# ${title} -- 1-페이저`)
    if (desc) lines.push(`\n> ${desc}`)
    lines.push(`\n## 한 줄 요약\n\n${overview || "(미작성)"}`)
    lines.push(`\n## 문제와 해결\n\n${problemAndSolution || "(미작성)"}`)
    lines.push(`\n## 핵심 지표\n\n${nsMetric}`)
  } else {
    lines.push(`# ${title} -- 1-Pager`)
    if (desc) lines.push(`\n> ${desc}`)
    lines.push(`\n## Summary\n\n${overview || "(TBD)"}`)
    lines.push(`\n## Problem and Solution\n\n${problemAndSolution || "(TBD)"}`)
    lines.push(`\n## Key Metric\n\n${nsMetric}`)
  }

  return lines.join("\n")
}

function deriveNorthStar(prd: Prd, lang: string): string {
  const nsRaw = prd.northStar as
    | { metric?: string; inputs?: unknown[] }
    | undefined

  if (!nsRaw || (!nsRaw.metric && (!nsRaw.inputs || nsRaw.inputs.length === 0))) {
    if (lang === "ko") {
      return `# 북극성 지표\n\n지표 미정 -- /aipm prd 명령으로 설정하세요.`
    }
    return `# North Star Metric\n\nNot defined yet -- run /aipm prd to set.`
  }

  const metric = nsRaw.metric ?? "미정"
  const inputs = Array.isArray(nsRaw.inputs) ? nsRaw.inputs : []

  const lines: string[] = []

  if (lang === "ko") {
    lines.push(`# 북극성 지표\n\n**핵심 지표:** ${metric}`)
    if (inputs.length > 0) {
      lines.push(`\n## 입력 지표\n`)
      for (const inp of inputs) {
        lines.push(`- ${safeString(inp)}`)
      }
    }
  } else {
    lines.push(`# North Star Metric\n\n**Key Metric:** ${metric}`)
    if (inputs.length > 0) {
      lines.push(`\n## Input Metrics\n`)
      for (const inp of inputs) {
        lines.push(`- ${safeString(inp)}`)
      }
    }
  }

  return lines.join("\n")
}

function deriveMilestones(prd: Prd, lang: string): string {
  const milestones = prd.milestones ?? []

  const lines: string[] = []

  if (lang === "ko") {
    lines.push(`# 마일스톤`)
    if (milestones.length === 0) {
      lines.push(`\n마일스톤이 아직 정의되지 않았습니다. /aipm prd 명령으로 추가하세요.`)
    } else {
      for (const m of milestones) {
        const ms = m as { name?: string; dueDate?: string; deliverables?: string }
        const name = ms.name ?? "(미정)"
        const due = ms.dueDate ? ` (${ms.dueDate})` : ""
        const deliverables = ms.deliverables ? `\n  - 산출물: ${ms.deliverables}` : ""
        lines.push(`\n## ${name}${due}${deliverables}`)
      }
    }
  } else {
    lines.push(`# Milestones`)
    if (milestones.length === 0) {
      lines.push(`\nNo milestones defined yet. Run /aipm prd to add.`)
    } else {
      for (const m of milestones) {
        const ms = m as { name?: string; dueDate?: string; deliverables?: string }
        const name = ms.name ?? "(TBD)"
        const due = ms.dueDate ? ` (${ms.dueDate})` : ""
        const deliverables = ms.deliverables
          ? `\n  - Deliverables: ${ms.deliverables}`
          : ""
        lines.push(`\n## ${name}${due}${deliverables}`)
      }
    }
  }

  return lines.join("\n")
}

function deriveDevBrief(prd: Prd, lang: string): string {
  const title = prd.title ?? "(제목 미정)"
  const roles = prd.roles ?? []
  const devices = prd.devices ?? []
  const successAndRisk = safeString(prd.successAndRisk)

  const lines: string[] = []

  if (lang === "ko") {
    lines.push(`# ${title} -- 개발 브리프`)
    lines.push(`\n## 대상 기기\n`)
    if (devices.length > 0) {
      for (const d of devices) lines.push(`- ${d}`)
    } else {
      lines.push(`- (미정)`)
    }
    lines.push(`\n## 역할\n`)
    if (roles.length > 0) {
      for (const r of roles) lines.push(`- ${r}`)
    } else {
      lines.push(`- (미정)`)
    }
    lines.push(`\n## 성공 기준 및 위험 요소\n\n${successAndRisk || "(미작성)"}`)
  } else {
    lines.push(`# ${title} -- Dev Brief`)
    lines.push(`\n## Target Devices\n`)
    if (devices.length > 0) {
      for (const d of devices) lines.push(`- ${d}`)
    } else {
      lines.push(`- (TBD)`)
    }
    lines.push(`\n## Roles\n`)
    if (roles.length > 0) {
      for (const r of roles) lines.push(`- ${r}`)
    } else {
      lines.push(`- (TBD)`)
    }
    lines.push(`\n## Success Criteria and Risks\n\n${successAndRisk || "(TBD)"}`)
  }

  return lines.join("\n")
}

// ============================================================
// deriveDocs — 5종 PM 문서 오케스트레이션
// ============================================================

/**
 * projectDir 내 graph/prd.json을 읽어 docs/ 디렉터리에 5종 MD를 파생합니다.
 * - docs/PRD.md
 * - docs/1-pager.md
 * - docs/north-star.md
 * - docs/milestones.md
 * - docs/dev-brief.md
 *
 * T-04-01: 모든 파일 첫 줄 = SENTINEL
 * T-04-02: sectionMeta 비표시
 * T-04-03: PrdSchema.safeParse로 입력 검증
 * T-04-04: 정적 마크다운 생성 (주입 안전)
 */
export async function deriveDocs(projectDir: string): Promise<void> {
  // prd.json 읽기 및 검증 (T-04-03)
  const prdPath = path.join(projectDir, "graph", "prd.json")
  const raw = await fs.readFile(prdPath, "utf8")
  const parsed = JSON.parse(raw) as unknown
  const result = PrdSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `prd.json 스키마 검증 실패: ${result.error.issues.map((i) => i.message).join(", ")}`
    )
  }
  const prd = result.data

  // project.json에서 lang 읽기 (없으면 "ko" 기본값)
  let lang = "ko"
  try {
    // project.json은 프로젝트 ROOT에 위치(scaffold·dashboard·watch 전역 규칙). graph/ 하위 아님(WR-01)
    const projPath = path.join(projectDir, "project.json")
    const projRaw = await fs.readFile(projPath, "utf8")
    const projParsed = JSON.parse(projRaw) as unknown
    const projResult = ProjectSchema.safeParse(projParsed)
    if (projResult.success && projResult.data.lang) {
      lang = projResult.data.lang
    }
  } catch {
    // project.json 없으면 기본값 "ko" 사용
  }

  const docsDir = path.join(projectDir, "docs")
  await fs.mkdir(docsDir, { recursive: true })

  // 5종 문서 파생 및 쓰기
  await writeMd(path.join(docsDir, "PRD.md"), derivePrdMarkdown(prd, lang))
  await writeMd(path.join(docsDir, "1-pager.md"), deriveOnePager(prd, lang))
  await writeMd(path.join(docsDir, "north-star.md"), deriveNorthStar(prd, lang))
  await writeMd(path.join(docsDir, "milestones.md"), deriveMilestones(prd, lang))
  await writeMd(path.join(docsDir, "dev-brief.md"), deriveDevBrief(prd, lang))

  // FEATURES.md 파생 — D-16: features.json 없거나 파싱 실패 시 조용히 건너뜀 (throw 안 함)
  const featuresPath = path.join(projectDir, "graph", "features.json")
  try {
    const featuresRaw = await fs.readFile(featuresPath, "utf8")
    const featuresParsed = JSON.parse(featuresRaw) as unknown
    const featuresResult = FeaturesSchema.safeParse(featuresParsed)
    if (featuresResult.success) {
      await writeMd(
        path.join(docsDir, "FEATURES.md"),
        deriveFeaturesMarkdown(featuresResult.data)
      )
    }
    // safeParse 실패 시: 조용히 건너뜀 (D-16)
  } catch {
    // 파일 없음 또는 JSON 파싱 오류: 조용히 건너뜀 (D-16)
  }

  // USERFLOW.md 파생 — D-17: userflow.json 없거나 파싱 실패 시 조용히 건너뜀 (throw 안 함)
  const userflowPath = path.join(projectDir, "graph", "userflow.json")
  try {
    const userflowRaw = await fs.readFile(userflowPath, "utf8")
    const userflowParsed = JSON.parse(userflowRaw) as unknown
    const userflowResult = UserflowSchema.safeParse(userflowParsed)
    if (userflowResult.success) {
      await writeMd(
        path.join(docsDir, "USERFLOW.md"),
        deriveUserflowMarkdown(userflowResult.data)
      )
    }
    // safeParse 실패 시: 조용히 건너뜀 (D-17)
  } catch {
    // 파일 없음 또는 JSON 파싱 오류: 조용히 건너뜀 (D-17)
  }
}

// ============================================================
// CLI 진입점 (isMain guard)
// ============================================================

if (isMain) {
  const projectDir = process.argv[2]
  if (!projectDir) {
    console.error("사용법: npx ts-node scripts/doc-deriver.ts <프로젝트 디렉터리>")
    process.exit(1)
  }
  deriveDocs(path.resolve(projectDir))
    .then(() => console.log("완료: 5종 PM 문서가 docs/에 생성되었습니다."))
    .catch((err: unknown) => {
      console.error(`오류: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    })
}
