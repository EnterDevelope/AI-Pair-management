/**
 * tokens.test.ts — _tokens.css 슬롭 텔테일 자동 가드
 *
 * 목적: 미래 회귀를 방지한다. 누군가 _tokens.css를 수정해 금지 문자열을 삽입하거나
 * 필수 토큰을 삭제하면 이 테스트가 즉시 실패한다.
 *
 * 커버리지:
 *   (a) @theme 블록 존재
 *   (b) 필수 색 토큰 정확 문자열 존재 (oklch 소수 표기)
 *   (c) Geist 폰트 선언 존재
 *   (d) 금지 문자열 부재: #000000 / #ffffff / Inter / tailwind.config / 네온 보라 (C≥0.3)
 */

import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it, expect } from "vitest"

const __dirname = dirname(fileURLToPath(import.meta.url))
const tokensPath = resolve(__dirname, "../_tokens.css")
const css = readFileSync(tokensPath, "utf8")

describe("_tokens.css — @theme 블록 구조", () => {
  it("단일 @theme 블록이 존재한다", () => {
    expect(css).toContain("@theme")
    expect(css).toContain("@theme {")
  })

  it("5개 토큰 네임스페이스가 각 1개 이상 존재한다", () => {
    // color
    expect(css).toContain("--color-bg:")
    // font (typography)
    expect(css).toContain("--font-sans:")
    // spacing
    expect(css).toContain("--spacing-4:")
    // radius
    expect(css).toContain("--radius-md:")
    // shadow
    expect(css).toContain("--shadow-md:")
  })
})

describe("_tokens.css — 필수 색 토큰 (D-08 calibrated oklch)", () => {
  it("오프블랙 배경 토큰이 정확한 oklch 소수 값을 갖는다", () => {
    // D-08: off-black bg = oklch(0.10 0.01 280), 순수 #000 금지
    expect(css).toContain("--color-bg: oklch(0.10 0.01 280)")
  })

  it("초록 액센트 토큰이 정확한 oklch 소수 값을 갖는다", () => {
    // D-08 개정(2026-06-10): green accent = oklch(0.58 0.18 150), 네온 C>0.3 금지
    expect(css).toContain("--color-accent: oklch(0.58 0.18 150)")
  })

  it("destructive 토큰이 단일 출처(_tokens.css)에 존재한다 (WR-04)", () => {
    // globals.css는 var(--color-destructive) 참조만 — 매직값 금지
    expect(css).toContain("--color-destructive: oklch(0.55 0.20 25)")
  })
})

describe("_tokens.css — Geist 폰트 선언 (D-08)", () => {
  it("--font-sans에 Geist가 선언되어 있다", () => {
    expect(css).toContain("Geist")
    expect(css).toContain("--font-sans:")
  })
})

describe("_tokens.css — 슬롭 텔테일 부재 (금지 문자열)", () => {
  it("순수 흑색 hex(#000000)가 없다", () => {
    expect(css).not.toContain("#000000")
  })

  it("순수 백색 hex(#ffffff)가 없다", () => {
    expect(css).not.toContain("#ffffff")
  })

  it("Inter 폰트가 없다 (슬롭 텔테일 #1)", () => {
    // "Inter" 문자열 전체 체크 — Geist 값 안에는 Inter가 들어갈 수 없음
    expect(css).not.toContain("Inter")
  })

  it("tailwind.config 참조가 없다 (v3 패턴)", () => {
    expect(css).not.toContain("tailwind.config")
  })

  it("네온 보라 (oklch C≥0.3) 값이 없다", () => {
    // oklch(L C H) 에서 C가 0.3 이상인 경우를 정규식으로 탐지
    // 패턴: oklch(소수 0.3이상 숫자)
    // 예: oklch(0.5 0.30 295) 또는 oklch(0.5 0.35 300) 등
    const neonPurplePattern = /oklch\(\s*[\d.]+\s+(?:0?\.[3-9]\d*|[1-9]\d*(?:\.\d+)?)\s/
    expect(css).not.toMatch(neonPurplePattern)
  })
})
