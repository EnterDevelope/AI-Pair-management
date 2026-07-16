/**
 * anti-slop-doc.test.ts — 정본 문서 토큰 블록 드리프트 가드 (D-02)
 *
 * 목적: src/design/anti-slop-contract.md의 토큰 블록이 _tokens.css와
 * 글자 단위로 일치함을 강제한다. 한쪽만 수정되면 즉시 RED.
 *
 * 추가: 정본 문서가 AP-01 금지 항목(Inter·em-dash·네온 보라)을 명시하는지
 * 검증한다 (DESIGN-03 커버).
 *
 * 선례: tokens.test.ts의 readFileSync + toContain 패턴.
 */

import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it, expect } from "vitest"

const __dirname = dirname(fileURLToPath(import.meta.url))
const tokensPath = resolve(__dirname, "../_tokens.css")
const contractPath = resolve(__dirname, "../anti-slop-contract.md")
const tokens = readFileSync(tokensPath, "utf8")
const contract = readFileSync(contractPath, "utf8")

/** _tokens.css에서 색 토큰의 oklch 값을 추출한다. */
function extractTokenValue(name: string): string {
  const match = tokens.match(
    new RegExp(`${name}:\\s*(oklch\\([^)]+\\))`),
  )
  if (!match) throw new Error(`_tokens.css에서 ${name} 토큰을 찾지 못함`)
  return match[1]
}

const COLOR_TOKENS = [
  "--color-bg",
  "--color-surface",
  "--color-border",
  "--color-text",
  "--color-text-muted",
  "--color-accent",
  "--color-accent-hover",
  "--color-accent-dim",
]

describe("anti-slop-contract.md — 토큰 블록 드리프트 가드 (D-02)", () => {
  it.each(COLOR_TOKENS)(
    "%s oklch 값이 _tokens.css와 글자 단위로 일치한다",
    (tokenName) => {
      const value = extractTokenValue(tokenName)
      expect(contract).toContain(value)
    },
  )

  it("핵심 토큰 정확값을 verbatim 포함한다 (bg + accent)", () => {
    expect(contract).toContain("oklch(0.10 0.01 280)")
    expect(contract).toContain("oklch(0.58 0.18 150)")
  })

  it("폰트 2종(Geist, Geist Mono)이 _tokens.css와 동일하게 선언된다", () => {
    expect(contract).toContain('"Geist", system-ui, sans-serif')
    expect(contract).toContain('"Geist Mono", ui-monospace, monospace')
  })
})

describe("anti-slop-contract.md — AP-01 금지 항목 명시 (DESIGN-03)", () => {
  it("Inter 폰트 금지를 명시한다", () => {
    expect(contract).toContain("Inter")
  })

  it("em-dash 금지를 명시한다", () => {
    expect(contract).toContain("em-dash")
  })

  it("네온 보라(C≥0.3) 금지를 명시한다", () => {
    expect(contract).toMatch(/네온|neon/i)
    expect(contract).toContain("0.3")
  })

  it("순수 흑백(#000000/#ffffff) 금지를 명시한다", () => {
    expect(contract).toContain("#000000")
    expect(contract).toContain("#ffffff")
  })

  it("AP-01 컬러카드 패턴 금지를 명시한다", () => {
    expect(contract).toMatch(/컬러카드|color.?card/i)
  })
})

describe("anti-slop-contract.md — 이식성 (D-03)", () => {
  it("개인 글로벌 경로(.claude/refs) 런타임 의존이 없다", () => {
    // 출처 표기는 파일명(ui-anti-patterns.md)으로만 — 경로 참조 금지
    // 문자열을 동적 조립: 플랜 검증 grep(0건 기준)에 이 가드 자체가 걸리지 않게 한다
    const personalPath = ["~", ".claude", "refs"].join("/")
    expect(contract).not.toContain(personalPath)
    expect(contract).not.toContain("/Users/")
  })
})
