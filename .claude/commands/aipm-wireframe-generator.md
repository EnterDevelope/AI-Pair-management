---
description: "와이어프레임 생성. 사용법: /aipm wireframe [projectId]"
allowed-tools: [Read, Write, Bash, Skill]
---

## Anti-slop 계약

<!-- src/design/anti-slop-contract.md verbatim — anti-slop-doc.test.ts가 일치 검증 -->

### Forbidden patterns — AP-01 금지 규칙

**AP-01. 장식 컬러카드 금지** — 색상을 정보가 아닌 장식으로 쓰는 카드 패턴.
- `bg-{hue}-50/100` + `text-{hue}-700/900` + `border-l-4 border-{hue}-500` 삼중 조합 금지
- 의미 매핑 없이 4개 이상 색상이 번갈아 나오는 카드 목록 금지
- 카테고리 라벨용 헤더 이모지·컬러 원형 아이콘 (💡 ⚠️ ✅ 🔍) 금지
- 대체: 단색 표면(`--color-surface`) + 타이포 계층 + 1px 보더. 색은 상태 pill·수치 델타 안에서만.

**기타 금지 텔테일**
- 미수정 shadcn 기본 shape 금지 — radius·spacing·accent 토큰 최소 한 벌 오버라이드
- div 기반 가짜 제품 UI 금지 — 라벨 붙은 목업으로 대체
- 의미 없는 장식 상태 점(dot) 금지

### Forbidden color values

| 금지 값 | 대체 |
|---------|------|
| `Inter` 폰트 (AI 슬롭 텔테일 #1) | `"Geist", system-ui, sans-serif` |
| 순수 흑색 `#000000` | `oklch(0.10 0.01 280)` |
| 순수 백색 `#ffffff` | `oklch(0.92 0.01 280)` |
| 네온 보라 oklch C ≥ 0.3 | C = 0.18 (`oklch(0.58 0.18 150)`) |
| AP-01 컬러카드 (`bg-blue-50` + `text-blue-900` 등) | 단색 표면 + 텍스트 계층 |

### Required copy rules

- em-dash(`—`) 금지 — 쉼표·마침표로 문장 분리
- 라운드넘버 placeholder 금지 (99.99%, 50 users 등) — 현실적 더미 데이터 사용
- startup-slop 이름 금지 (Acme / Nexus / SmartFlow) — 도메인에 맞는 현실적 이름
- 마케팅 필러 동사 금지 (Elevate / Seamless / Unleash / Next-Gen)
- generic placeholder 인명 금지 — "John Doe" 대신 현실적인 한국어 이름

## 토큰 블록

<!-- src/design/anti-slop-contract.md §2 verbatim — 와이어프레임 HTML <head>에 그대로 삽입 -->

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

## 생성 로직

<!-- Phase 5 소유: 생성 로직을 여기에 추가 -->
