# DESIGN.md — AIPM 디자인 언어 계약

**디자인 톤:** 다크 + 보라. manyfast.io 원본의 다크+보라 톤을 충실히 따르되, 순수 흑백·네온 보라 같은 AI 슬롭 텔테일을 calibrated oklch 값으로 보정한다 (D-07). 이 파일의 모든 토큰은 `src/design/_tokens.css`의 단일 `@theme {}` 블록으로 구현된다.

> **CSS 표기 주의 (Pitfall 5):** DESIGN.md는 가독성을 위해 oklch를 퍼센트(`oklch(10% 0.01 280)`)로 표기하지만, CSS 파일(`_tokens.css`)은 반드시 소수(`oklch(0.10 0.01 280)`)를 사용해야 한다. 두 표기는 동일한 색이지만 퍼센트를 CSS에 쓰면 브라우저·Tailwind JIT가 잘못 처리할 수 있다.

---

## 1. 색상 토큰 (Color)

| 토큰 변수 | CSS 값 | 설명 |
|-----------|--------|------|
| `--color-bg` | `oklch(0.10 0.01 280)` | 배경 — 오프블랙 (D-08, 순수 #000 금지) |
| `--color-surface` | `oklch(0.14 0.01 280)` | 카드 / 패널 표면 |
| `--color-border` | `oklch(0.22 0.02 280)` | 미묘한 경계선 |
| `--color-text` | `oklch(0.92 0.01 280)` | 본문 텍스트 — 오프화이트 (순수 #fff 금지) |
| `--color-text-muted` | `oklch(0.55 0.02 280)` | 보조 / 플레이스홀더 텍스트 |
| `--color-accent` | `oklch(0.58 0.18 295)` | 보라 액센트 — C=0.18, 네온 아님 (D-08) |
| `--color-accent-hover` | `oklch(0.62 0.18 295)` | 액센트 호버 상태 |
| `--color-accent-dim` | `oklch(0.58 0.08 295)` | 배경용 흐린 액센트 |

**설계 근거:** 오프블랙 `oklch(10% 0.01 280)`은 순수 `#000000`보다 깊이감이 있고 눈의 피로를 줄인다. 보라 액센트 채도(C)를 0.18로 제한해 "AI 기본 보라(C>0.3)"와 명확히 구분한다.

---

## 2. 타이포그래피 토큰 (Typography)

| 토큰 변수 | 값 | 설명 |
|-----------|-----|------|
| `--font-sans` | `"Geist", system-ui, sans-serif` | 기본 폰트 — Geist (Inter 금지) |
| `--font-mono` | `"Geist Mono", ui-monospace, monospace` | 코드 / ID 표시용 |
| `--font-size-xs` | `0.75rem` | 12px |
| `--font-size-sm` | `0.875rem` | 14px |
| `--font-size-base` | `1rem` | 16px (기준) |
| `--font-size-lg` | `1.125rem` | 18px |
| `--font-size-xl` | `1.25rem` | 20px |
| `--font-size-2xl` | `1.5rem` | 24px |
| `--font-size-3xl` | `1.875rem` | 30px |

---

## 3. 간격 토큰 (Spacing)

4px 베이스 그리드. 모든 레이아웃 간격은 아래 토큰으로만 표현한다.

| 토큰 변수 | 값 | px |
|-----------|-----|-----|
| `--spacing-1` | `0.25rem` | 4px |
| `--spacing-2` | `0.5rem` | 8px |
| `--spacing-3` | `0.75rem` | 12px |
| `--spacing-4` | `1rem` | 16px |
| `--spacing-6` | `1.5rem` | 24px |
| `--spacing-8` | `2rem` | 32px |
| `--spacing-12` | `3rem` | 48px |
| `--spacing-16` | `4rem` | 64px |

---

## 4. 반경 토큰 (Border Radius)

| 토큰 변수 | 값 | 용도 |
|-----------|-----|------|
| `--radius-sm` | `0.25rem` | 인라인 요소 (배지 등) |
| `--radius-md` | `0.375rem` | 버튼, 입력 필드 |
| `--radius-lg` | `0.5rem` | 카드 |
| `--radius-xl` | `0.75rem` | 모달, 패널 |
| `--radius-full` | `9999px` | 알약형 (pill) |

---

## 5. 그림자 토큰 (Shadow)

oklch 기반 depth-aware 그림자. 순수 `rgba(0,0,0,*)` 대신 oklch 색공간으로 표현해 다크 테마에서 자연스럽다.

| 토큰 변수 | 값 | 용도 |
|-----------|-----|------|
| `--shadow-sm` | `0 1px 2px oklch(0 0 0 / 0.4)` | 미묘한 구분 |
| `--shadow-md` | `0 4px 12px oklch(0 0 0 / 0.5)` | 카드, 드롭다운 |
| `--shadow-lg` | `0 8px 24px oklch(0 0 0 / 0.6)` | 모달 |
| `--shadow-accent` | `0 0 16px oklch(0.58 0.18 295 / 0.3)` | 액센트 글로우 (CTA 등) |

---

## 6. Anti-Slop 규칙

이 섹션은 Phase 2B 디자인 시스템, Phase 5 와이어프레임 생성 에이전트가 verbatim으로 참조한다.

### 금지 목록

| 금지 항목 | 이유 | 대체 |
|-----------|------|------|
| `Inter` 폰트 | AI 슬롭 텔테일 #1 — LLM 기본값 (ui-anti-patterns AP-01) | `Geist` (Vercel) |
| 순수 흑색 `#000000` | depth-unaware 기본값 텔테일 | `oklch(0.10 0.01 280)` |
| 순수 백색 `#ffffff` | depth-unaware 기본값 텔테일 | `oklch(0.92 0.01 280)` |
| 네온 보라 (oklch C ≥ 0.3) | 맥스 채도 "AI 기본 보라" 텔테일 | `oklch(0.58 0.18 295)` (C=0.18) |
| AP-01 장식 컬러카드 | 색상 코딩으로 정보를 구분하는 패턴 — 시각적 노이즈, 접근성 문제 | 단색 표면 + 텍스트/아이콘으로 구분 |
| `tailwind.config.js` 토큰 | Tailwind v4는 `@theme` CSS 지시어 사용; config.js는 v3 패턴 | `src/design/_tokens.css` `@theme {}` |
| `shadcn/ui` 기본 토큰 미수정 | 미수정 shadcn 기본 상태 자체가 AI 슬롭 텔테일 | 반드시 `--color-bg/accent/surface`로 오버라이드 |

### AP-01 색상코딩 카드 금지

카드·목록 아이템을 색상으로 분류(파란 카드=Feature, 노란 카드=Warning 등)하는 패턴은 금지한다. 이는 ui-anti-patterns.md의 AP-01이 명시하는 대표적 AI 슬롭 텔테일이다. 대신: 단색 표면(`--color-surface`) + 텍스트 계층 + 아이콘으로 정보를 전달한다.

---

## 7. _tokens.css 참조 방법 (Phase 2A 가이드)

```css
/* app/globals.css */
@import "tailwindcss";
@import "../src/design/_tokens.css";
```

Tailwind v4는 `@theme {}` 블록의 CSS 커스텀 프로퍼티를 자동으로 유틸리티 클래스로 변환한다:
- `--color-bg` → `bg-bg`, `text-bg` 등
- `--font-sans` → `font-sans`
- `--spacing-4` → `p-4`, `m-4`, `gap-4` 등
- `--radius-md` → `rounded-md`
- `--shadow-md` → `shadow-md`

별도의 `tailwind.config.js` 수정이 필요 없다. Phase 2A는 이 import 패턴만으로 모든 토큰에 접근 가능하다.

---

*소스: CONTEXT D-07/D-08/D-09, RESEARCH Pattern 6, ui-anti-patterns.md AP-01*
*잠금일: 2026-06-07 (Phase 00 Foundation Lock)*
