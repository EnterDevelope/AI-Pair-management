/**
 * slop-scanner.test.ts — 공용 slop 스캐너 모듈 유닛 테스트 (D-05)
 *
 * 목적: scanForSlop + WIRE_SLOP_RULES + CSS_SLOP_RULES가 AP-01 텔테일을
 * 정확히 탐지하고, 정상 토큰 값(C=0.18 등)에 false-positive가 없음을 고정한다.
 *
 * 소비처 계약: Phase 2B 테스트 게이트 / Phase 5 WIRE-06 저장 차단 / Phase 5 프롬프트 주입.
 * 인메모리 유닛 테스트 — 파일 읽기 불필요.
 */

import { describe, it, expect } from "vitest"
import { scanForSlop, WIRE_SLOP_RULES, CSS_SLOP_RULES } from "../slop-scanner.js"

describe("scanForSlop — CSS_SLOP_RULES 텔테일 탐지", () => {
  it("Inter 폰트 선언을 탐지한다 (AP-01-inter)", () => {
    const violations = scanForSlop("font-family: Inter;", CSS_SLOP_RULES)
    expect(violations.length).toBeGreaterThanOrEqual(1)
    expect(violations.map((v) => v.ruleId)).toContain("AP-01-inter")
  })

  it("순수 흑색 #000000을 탐지한다 (AP-01-pure-black)", () => {
    const violations = scanForSlop("color: #000000;", CSS_SLOP_RULES)
    expect(violations.length).toBeGreaterThanOrEqual(1)
    expect(violations.map((v) => v.ruleId)).toContain("AP-01-pure-black")
  })

  it("네온 보라(C≥0.3)를 탐지한다 (AP-01-neon-purple)", () => {
    const violations = scanForSlop("oklch(0.58 0.35 295)", CSS_SLOP_RULES)
    expect(violations.length).toBeGreaterThanOrEqual(1)
    expect(violations.map((v) => v.ruleId)).toContain("AP-01-neon-purple")
  })

  it("정상 액센트 값(C=0.18)은 통과한다 — false-positive 없음", () => {
    const violations = scanForSlop("oklch(0.58 0.18 150)", CSS_SLOP_RULES)
    expect(violations).toEqual([])
  })

  it("선행 0 생략 네온(.3)과 정수 채도(1)도 탐지한다 (CR-01 우회 차단)", () => {
    const dotForm = scanForSlop("oklch(0.58 .3 150)", CSS_SLOP_RULES)
    expect(dotForm.map((v) => v.ruleId)).toContain("AP-01-neon-purple")
    const intForm = scanForSlop("oklch(0.58 1 150)", CSS_SLOP_RULES)
    expect(intForm.map((v) => v.ruleId)).toContain("AP-01-neon-purple")
  })

  it("oklch 표기 순수 흑백을 탐지하되 그림자 alpha 합성은 통과한다 (WR-02)", () => {
    const black = scanForSlop("background: oklch(0 0 0);", CSS_SLOP_RULES)
    expect(black.map((v) => v.ruleId)).toContain("AP-01-pure-black")
    const white = scanForSlop("color: oklch(1 0 0);", CSS_SLOP_RULES)
    expect(white.map((v) => v.ruleId)).toContain("AP-01-pure-white")
    // 그림자 alpha 합성은 예외 (anti-slop-contract.md §3)
    const shadow = scanForSlop(
      "box-shadow: 0 1px 2px oklch(0 0 0 / 0.4);",
      CSS_SLOP_RULES,
    )
    expect(shadow).toEqual([])
  })

  it("Interface 등 Inter 포함 단어는 오탐하지 않는다 (WR-01)", () => {
    const violations = scanForSlop(
      "font-family: Interface, sans-serif;",
      CSS_SLOP_RULES,
    )
    expect(violations.map((v) => v.ruleId)).not.toContain("AP-01-inter")
  })

  it("dark: prefix 클래스 잔재를 탐지한다", () => {
    const violations = scanForSlop(
      "<div class='dark:bg-input/30'>",
      CSS_SLOP_RULES,
    )
    expect(violations.length).toBeGreaterThanOrEqual(1)
    expect(violations.map((v) => v.ruleId)).toContain("CSS-dark-prefix")
  })
})

describe("scanForSlop — WIRE_SLOP_RULES 텔테일 탐지", () => {
  it("AP-01 장식 컬러카드 패턴을 탐지한다 (AP-01-color-cards)", () => {
    const violations = scanForSlop(
      "<div class='bg-blue-50 text-blue-900'>",
      WIRE_SLOP_RULES,
    )
    expect(violations.length).toBeGreaterThanOrEqual(1)
    expect(violations.map((v) => v.ruleId)).toContain("AP-01-color-cards")
  })

  it("em-dash를 severity warn으로 탐지한다 (AP-01-em-dash)", () => {
    const violations = scanForSlop("저장됨—완료", WIRE_SLOP_RULES)
    expect(violations.length).toBeGreaterThanOrEqual(1)
    const emDash = violations.find((v) => v.ruleId === "AP-01-em-dash")
    expect(emDash).toBeDefined()
    const rule = WIRE_SLOP_RULES.find((r) => r.id === "AP-01-em-dash")
    expect(rule?.severity).toBe("warn")
  })

  it("정상 텍스트는 빈 배열을 반환한다", () => {
    const violations = scanForSlop("normal text", WIRE_SLOP_RULES)
    expect(violations).toEqual([])
  })
})

describe("규칙셋 계약 — 필수 규칙 수 (UI-SPEC §Slop Scanner Module Contract)", () => {
  it("WIRE_SLOP_RULES는 5종 이상이다", () => {
    expect(WIRE_SLOP_RULES.length).toBeGreaterThanOrEqual(5)
  })

  it("CSS_SLOP_RULES는 4종 이상이다", () => {
    expect(CSS_SLOP_RULES.length).toBeGreaterThanOrEqual(4)
  })

  it("모든 규칙이 id/description/pattern/severity를 갖는다", () => {
    for (const rule of [...WIRE_SLOP_RULES, ...CSS_SLOP_RULES]) {
      expect(rule.id).toBeTruthy()
      expect(rule.description).toBeTruthy()
      expect(rule.pattern).toBeInstanceOf(RegExp)
      expect(["error", "warn"]).toContain(rule.severity)
    }
  })
})

describe("scanForSlop — 위반 메타데이터", () => {
  it("다중 위반과 position(line/col)을 산출한다", () => {
    const content = "color: #000000;\nfont-family: Inter;"
    const violations = scanForSlop(content, CSS_SLOP_RULES)
    expect(violations.length).toBeGreaterThanOrEqual(2)
    const inter = violations.find((v) => v.ruleId === "AP-01-inter")
    expect(inter?.position?.line).toBe(2)
  })
})
