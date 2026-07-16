# AIPM anti-slop 계약 — 와이어프레임 생성 정본

<!-- 출처: Phase 0 _tokens.css 파생 + ui-anti-patterns.md AP-01 큐레이션 (와이어프레임 관련 항목만) -->
<!-- 수정 시 _tokens.css와 동기화 필수 — anti-slop-doc.test.ts가 글자 단위 일치를 검증한다 -->
<!-- 이 문서가 repo 내 정본(vendor 사본)이다. 개인 경로 참조 금지 (D-03 이식성) -->

**소비처:** `.claude/commands/aipm-wireframe-generator.md` 에이전트 stub / Phase 5 WIRE-06 저장 차단 스캐너(`slop-scanner.ts`) / Phase 5 프롬프트 주입

---

## 1. Forbidden patterns — AP-01 금지 규칙 (verbatim)

### AP-01. 장식 컬러카드 (Decorative color-coded cards)

색상을 정보가 아닌 장식으로 쓰는 카드 패턴. 와이어프레임에서 기본적으로 금지.

**텔테일 (2개 이상이면 의심):**
- `bg-{hue}-50/100` + `text-{hue}-700/900` + `border-l-4 border-{hue}-500` 삼중 조합
- 의미 매핑 없이 4개 이상 색상이 번갈아 나오는 카드 목록
- 카테고리 라벨용 헤더 이모지·컬러 원형 아이콘 (💡 ⚠️ ✅ 🔍)
- 모든 카드가 같은 시각적 무게를 갖는 등높이 그리드
- "Insight / Pattern / Issue / Improvement" 식 4색 병렬 섹션

**대체:** 단색 표면(`--color-surface`) + 타이포 계층(크기·굵기) + 1px 보더. 색은 상태 pill·수치 델타 안에서만, 면 채움으로 쓰지 않는다.

### 기타 금지 텔테일

- **미수정 shadcn 기본 shape** — radius·spacing·accent 토큰 최소 한 벌은 오버라이드할 것
- **저데이터잉크(low data-ink)** — 장식 배경·바가 실제 데이터보다 넓은 면적을 차지하는 레이아웃 금지
- **div 기반 가짜 제품 UI** — `<div>` 사각형으로 흉내 낸 가짜 대시보드/터미널 금지, 라벨 붙은 목업으로 대체
- **의미 없는 장식 상태 점(dot)** — 실제 상태를 인코딩할 때만 허용

## 2. 토큰 블록 (와이어프레임 HTML `<head>` 붙여넣기용)

<!-- _tokens.css에서 파생 — anti-slop-doc.test.ts가 일치 검증 -->

```html
<style>
  :root {
    --color-bg: oklch(0.10 0.01 280);
    --color-surface: oklch(0.14 0.01 280);
    --color-border: oklch(0.22 0.02 280);
    --color-text: oklch(0.92 0.01 280);
    --color-text-muted: oklch(0.55 0.02 280);
    --color-accent: oklch(0.58 0.18 150);
    --color-accent-hover: oklch(0.62 0.18 150);
    --color-accent-dim: oklch(0.58 0.08 150);
    --font-sans: "Geist", system-ui, sans-serif;
    --font-mono: "Geist Mono", ui-monospace, monospace;
  }
</style>
```

## 3. Forbidden color values — 금지 색·폰트 값

| 금지 값 | 이유 | 대체 |
|---------|------|------|
| `Inter` 폰트 | AI 슬롭 텔테일 #1 (LLM 기본 폰트) | `"Geist", system-ui, sans-serif` |
| 순수 흑색 `#000000` / `oklch(0 0 0)` | depth-unaware 기본값 | `oklch(0.10 0.01 280)` (off-black) |
| 순수 백색 `#ffffff` / `oklch(1 0 0)` | depth-unaware 기본값 | `oklch(0.92 0.01 280)` (off-white) |
| 네온 보라 oklch C ≥ 0.3 | AI 기본 보라 텔테일 (max-saturation) | C = 0.18 (`oklch(0.58 0.18 150)`) |
| AP-01 컬러카드 (`bg-blue-50` + `text-blue-900` 등) | 색을 장식으로 사용 | 단색 표면 + 텍스트 계층 |

> **예외:** 그림자의 alpha 합성 표기(`oklch(0 0 0 / 0.4)` 등)는 순수 흑면이 아니라 깊이 표현이므로 허용한다. `_tokens.css`의 `--shadow-*` 토큰이 이 표기를 쓴다. 스캐너(`slop-scanner.ts`)도 alpha 합성 표기는 차단하지 않는다.

## 4. Required copy rules — 카피 규칙

- **em-dash(`—`) 금지** — LLM 텍스트 서명 최고빈도 항목. 쉼표·마침표로 문장을 나눈다.
- **라운드넘버 placeholder 금지** — 99.99%, 50 users, 5.8mm 같은 가짜-정밀/가짜-완벽 수치 금지. 현실적인 더미 데이터를 쓴다.
- **startup-slop 이름 금지** — Acme / Nexus / SmartFlow류 금지. 도메인에 맞는 현실적 이름을 쓴다.
- **마케팅 필러 동사 금지** — Elevate / Seamless / Unleash / Next-Gen 금지.
- **generic placeholder 인명 금지** — "John Doe" 대신 현실적인 한국어 이름.
