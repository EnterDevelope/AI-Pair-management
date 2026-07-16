/**
 * slop-scanner.ts — 공용 AI slop 텔테일 스캐너 (D-05)
 *
 * Source: tokens.test.ts 정규식 가드 패턴의 모듈화 (Phase 0 선례).
 * 금지 규칙 정본: src/design/anti-slop-contract.md (AP-01 큐레이션).
 *
 * 소비처 3곳 — 시그니처 변경 금지 (UI-SPEC §Slop Scanner Module Contract):
 *   1. Phase 2B 테스트 게이트 (slop-scanner.test.ts)
 *   2. Phase 5 WIRE-06: 생성된 와이어프레임 HTML 저장 차단
 *   3. Phase 5 프롬프트 주입: rules.map(r => r.description).join("\n")
 */

export interface SlopRule {
  id: string // "AP-01-inter", "AP-01-pure-black" 등
  description: string // 프롬프트 주입·사람 읽기용 설명
  pattern: RegExp // 텔테일 감지 패턴
  severity: "error" | "warn"
}

export interface SlopViolation {
  ruleId: string
  match: string
  position?: { line: number; col: number }
}

/** match.index(0-based offset)를 1-based line/col로 변환한다. */
function offsetToPosition(
  content: string,
  offset: number,
): { line: number; col: number } {
  const before = content.slice(0, offset)
  const lines = before.split("\n")
  return { line: lines.length, col: lines[lines.length - 1].length + 1 }
}

/**
 * content를 규칙셋으로 스캔해 위반 목록을 반환한다.
 * 규칙당 다중 매치를 모두 수집한다 (matchAll — global 플래그 자동 보정).
 */
export function scanForSlop(
  content: string,
  rules: SlopRule[],
): SlopViolation[] {
  const violations: SlopViolation[] = []
  for (const rule of rules) {
    const flags = rule.pattern.flags.includes("g")
      ? rule.pattern.flags
      : rule.pattern.flags + "g"
    const pattern = new RegExp(rule.pattern.source, flags)
    for (const match of content.matchAll(pattern)) {
      violations.push({
        ruleId: rule.id,
        match: match[0],
        position:
          match.index !== undefined
            ? offsetToPosition(content, match.index)
            : undefined,
      })
    }
  }
  return violations
}

/* ── 공유 규칙 (WIRE + CSS 공통) ─────────────────────────────── */

const RULE_INTER: SlopRule = {
  id: "AP-01-inter",
  description:
    "Inter 폰트 금지 (AI 슬롭 텔테일 #1). 대체: Geist 또는 system-ui.",
  // \b 경계로 "Interface" 등 정상 단어 오탐 방지 (WR-01)
  pattern: /font-family\s*:[^;]*\bInter\b|font-face[^}]*\bInter\b/i,
  severity: "error",
}

const RULE_PURE_BLACK: SlopRule = {
  id: "AP-01-pure-black",
  description:
    "순수 흑색 금지 (depth-unaware): #000000 및 oklch(0 0 0). 단, 그림자 alpha 합성(oklch(0 0 0 / a))은 예외. 대체: oklch(0.10 0.01 280).",
  // hex + oklch(L=0 C=0) 표기 모두 차단 (WR-02). 닫는 괄호 직전까지 매치해
  // alpha 합성 표기 oklch(0 0 0 / 0.4)는 통과시킨다 (그림자 토큰 예외).
  pattern:
    /#000000|color:\s*#000\b|background.*#000\b|oklch\(\s*0(?:\.0+)?%?\s+0(?:\.0+)?\s+[\d.]+\s*\)/i,
  severity: "error",
}

const RULE_PURE_WHITE: SlopRule = {
  id: "AP-01-pure-white",
  description:
    "순수 백색 금지 (depth-unaware): #ffffff 및 oklch(1 0 0). 대체: oklch(0.92 0.01 280).",
  // hex + oklch(L=1/100% C=0) 표기 모두 차단, alpha 합성은 제외 (WR-02)
  pattern:
    /#ffffff|#fff\b|oklch\(\s*(?:1(?:\.0+)?|100%)\s+0(?:\.0+)?\s+[\d.]+\s*\)/i,
  severity: "error",
}

const RULE_NEON_PURPLE: SlopRule = {
  id: "AP-01-neon-purple",
  description:
    "네온 색 oklch C≥0.3 금지 (AI 기본 보라 등 max-saturation 텔테일). 대체: C=0.18 (oklch(0.58 0.18 150)).",
  // C가 0.3 이상인 모든 표기 차단: 0.3~/.3~(선행 0 생략)/1 이상 정수·소수 (CR-01)
  // C=0.18/0.08/0.02/0.01 정상값은 통과
  pattern: /oklch\(\s*[\d.]+\s+(?:0?\.[3-9]\d*|[1-9]\d*(?:\.\d+)?)/i,
  severity: "error",
}

/* ── WIRE_SLOP_RULES — 와이어프레임 HTML 스캔 규칙 ───────────── */

export const WIRE_SLOP_RULES: SlopRule[] = [
  {
    id: "AP-01-color-cards",
    description:
      "장식 컬러카드 패턴 금지 (bg-{hue}-50/100 + text-{hue}-700/900 색상코딩 카드). 대체: 단색 표면(--color-surface) + 타이포 계층.",
    pattern:
      /bg-(?:blue|red|green|yellow|orange|pink|purple|indigo)-(?:50|100)\b.*text-(?:blue|red|green|yellow|orange|pink|purple|indigo)-(?:700|800|900)/,
    severity: "error",
  },
  RULE_PURE_BLACK,
  RULE_PURE_WHITE,
  RULE_NEON_PURPLE,
  RULE_INTER,
  {
    id: "AP-01-em-dash",
    description:
      "em-dash(—) UI 카피 내 사용 금지 (LLM 텍스트 서명). 대체: 쉼표·마침표로 문장 분리.",
    pattern: /—/,
    severity: "warn",
  },
]

/* ── CSS_SLOP_RULES — CSS/컴포넌트 파일 스캔 규칙 ────────────── */

export const CSS_SLOP_RULES: SlopRule[] = [
  {
    id: "CSS-dark-prefix",
    description:
      "dark: prefix 클래스 금지 (단일 다크모드 앱 — 라이트 모드 분기 잔재). 대체: 토큰 직접 참조.",
    pattern: /\bdark:/,
    severity: "error",
  },
  RULE_INTER,
  RULE_PURE_BLACK,
  RULE_PURE_WHITE,
  RULE_NEON_PURPLE,
]
