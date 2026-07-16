# AIPM — 로컬 AI 기획 하네스 (아키텍처·스코프 스펙)

> **작업명**: AIPM (AI Product Manager, 로컬판)
> **한 줄**: manyfast.io를 "Claude Code/Codex 위 기능 하네스 + 로컬 웹 뷰어"로 재구성. 클라우드·과금·계정 없이 로컬에서 `/aipm` 커맨드로 아이디어→PRD→기능명세→유저플로우→와이어프레임.
> **상태**: 설계 승인됨 (2026-06-07). 다음 단계 = 구현 계획(writing-plans).
> **레퍼런스**: 원본 제품 해부 `research/OVERVIEW.md`, 실측 UX `research/screenshots/UX-FLOW.md`.

---

## 0. 확정된 핵심 결정 (브레인스토밍 결과)

| 결정 | 선택 |
|------|------|
| AI 엔진 | **Claude Code/Codex 세션 자체** — `/aipm` 커맨드로 invoke되는 하네스(skill·agent·rule). 별도 API 키·크레딧 0. 자동발동 X, 커맨드 발동 O (GSD 방식). |
| v1 범위 | **전체 4단계** (PRD → 기능명세서 → 유저플로우 → 와이어프레임) + 기존 글로벌 하네스 요소 재활용 |
| 앱 형태 | **로컬 웹앱** (Next.js localhost) |
| 데이터 저장 | **파일(JSON 그래프 정본 + 마크다운 자동생성) + git** |
| 생성 구조 | **하네스 주도** / 웹은 뷰어·편집기. AI 수정요청 = 파일 큐 브릿지 |
| 하네스 위치 | **프로젝트 로컬 개발 + 글로벌(~/.claude) 설치 스크립트 동봉** |

원본 대비 **제거**: 크레딧·과금 / 계정·인증 / Group·RBAC·멀티테넌시 / 클라우드 실시간 협업 / 별도 MCP 서버. **대체**: 클라우드 LLM→로컬 CC 세션, 버전 히스토리→git, 승인/거절 스테이징→git diff + CC 편집 승인.

---

## 1. 시스템 구조 (3 레이어)

```
① 하네스 레이어 (Claude Code/Codex 세션 = AI 엔진)
   /aipm 커맨드 → skill·agent·rule 발동 → 파일 생성/수정
        │  쓰기/읽기
        ▼
② 데이터 레이어 (프로젝트 폴더, git)
   graph/*.json(정본 구조데이터) + docs/*.md(읽기·내보내기용 자동생성)
        │  읽기                      ▲ 쓰기
        ▼                            │
③ 뷰 레이어 (Next.js localhost 웹앱)
   PRD·기능명세(3뷰)·유저플로우·와이어프레임 렌더/편집 + 라이브 리로드
   "AI 수정요청" → .aipm/queue/ 적재 → /aipm apply 로 반영(브릿지)
```

- AI 엔진 = 현재 도는 Claude Code 세션. 웹앱은 AI를 직접 호출하지 않음 — 파일 표시 + 편집 결과 되쓰기만.
- 데이터 흐름:
  ```
  /aipm new "<아이디어>" → 질문지 6문항(AskUserQuestion)
    → aipm-prd-writer → graph/prd.json + docs/PRD.md
    → /aipm features → aipm-feature-architect → graph/features.json
    → /aipm flow → aipm-flow-mapper → graph/userflow.json
    → /aipm wireframe → aipm-wireframe-generator → wireframes/*.html
  /aipm serve → 웹앱(localhost) 파일감시 라이브 렌더
  웹 편집 → API route → graph JSON 갱신 + 마크다운 재생성
  웹 "AI 수정요청" → .aipm/queue/req.json → /aipm apply → 해당 agent 재호출
  ```

## 2. 데이터 모델 (정본 = JSON 그래프, 마크다운은 자동 생성본)

프로젝트 = 폴더 1개.

```
my-project/
├─ project.json        # 메타: id, 이름, 사용자역할[], 기기[], 생성일, 파이프라인 진행상태
├─ graph/
│  ├─ prd.json         # 5섹션: 개요 / 문제·해결 / 타겟·시나리오 / 성공·위험 / 속성설정
│  ├─ features.json    # 요구사항→기능→상세기능 위계. 항목: id, title, description,
│  │                   #   acceptanceCriteria[], roleAssignments[], status, importance, links[]
│  ├─ userflow.json    # versionGroups[], versions[], nodes(type: start|section|page|action), edges
│  └─ ia.json          # (선택) 페이지 부모-자식 + Spec 교차링크
├─ docs/               # graph 기반 자동 생성 (사람 읽기·내보내기·CC 친화)
│  ├─ PRD.md  ├─ FEATURES.md  └─ USERFLOW.md
├─ wireframes/
│  ├─ _meta.json       # 페이지목록·디바이스·유저플로우 연결
│  └─ <page-id>.html   # self-contained HTML(Tailwind, 현실적 더미데이터)
└─ .aipm/              # 하네스 상태: config.json, queue/(편집·AI요청), history/
```

- **ID 규칙**: 요구사항 `R-XXXXXX`, 기능 `F-XXXXXX`, 상세 `S-XXXXXX`, 페이지 `P-XXXXXX` (원본 `R-YCRMRH` 방식).
- **단일 출처**: `project.json`의 역할·기기가 하류(기능 역할배정·플로우 분기·WF 디바이스)로 전파.
- **마크다운 ↔ JSON**: JSON이 정본. JSON 변경 시 마크다운 재생성(편집은 JSON 또는 웹에서, 마크다운 직접 편집은 비권장 — 단방향).
- **git**: graph·docs·wireframes 전부 추적 → "버전 히스토리" 대체. 스냅샷=커밋.

### 데이터 모델 ↔ 원본 매핑
| 원본 개념 | AIPM 표현 |
|-----------|-----------|
| Project(단일 파일) | 프로젝트 폴더 |
| Item 4유형(Req/Feature/Spec/PageMenu) | features.json 노드 type + ia.json |
| Req→Feat→Spec 3단 위계 | features.json 중첩 구조 + links |
| 캔버스(그래프) | graph JSON + 웹 React Flow |
| 속성설정(역할·기기) | project.json |

## 3. 하네스 구성 + 기존 글로벌 요소 재활용

### 커맨드 (사용자 API)
| 커맨드 | 동작 |
|--------|------|
| `/aipm new "<아이디어>"` | 프로젝트 시작: 질문지 6문항 → PRD 생성 |
| `/aipm prd` | PRD (재)생성·정제 |
| `/aipm features` | PRD 기반 기능명세 생성 |
| `/aipm flow` | PRD+기능명세 기반 유저플로우 생성 |
| `/aipm wireframe [pages]` | 유저플로우 기반 와이어프레임 생성 |
| `/aipm apply` | 웹 편집·AI요청 큐 처리(브릿지) |
| `/aipm serve` | Next.js 웹앱 기동 |
| `/aipm status` | 파이프라인 진행률 |

### 단계 ↔ skill/agent (기존 글로벌 재활용 굵게)
| 단계 | 발동 skill | 실행 agent(sonnet) | 산출 |
|------|-----------|--------------------|------|
| 온보딩 질문지 | `brainstorming` 변형 + 신규 `aipm-questionnaire` | 메인 세션(AskUserQuestion 6문항) | project.json |
| PRD | **`create-prd`** + **`document-writing`**(정제) | aipm-prd-writer | prd.json, PRD.md |
| 기능명세 | **`backlog-items`**(WWA·수용기준) | aipm-feature-architect | features.json |
| 유저플로우 | **`workflow-tree-mapper`** | aipm-flow-mapper | userflow.json |
| 와이어프레임 | **`frontend-design`** / `ui-ux-pro-max` | aipm-wireframe-generator | wireframes/*.html |

### rule
1. **의존성 게이트**: PRD 개요 없으면 flow 금지, 유저플로우 버전 없으면 wireframe 금지 (GSD phase 게이팅 차용).
2. **ID 생성·스키마 검증**: 모든 항목 ID 규칙 + JSON 스키마 검증.
3. **파일쓰기 규약**: JSON 정본 → 마크다운 재생성, surgical scope(불필요 변경 금지).

## 4. 웹앱 (뷰 레이어)

- **스택**: Next.js(App Router) + Tailwind + React Flow(그래프/플로우) + Mermaid(내보내기). 다크+보라 톤(원본 매칭). `/aipm serve`로 localhost 기동.
- **화면**:
  - `/` 파이프라인 대시보드(상단탭: PRD ··· 기능명세 ··· 유저플로우 ··· 와이어프레임)
  - `/prd` 5섹션 편집(텍스트 블록)
  - `/features` 3뷰 — 트리(그래프 캔버스)/디렉토리(3컬럼+수용기준)/도큐먼트(문서형)
  - `/flow` 섹션 레인 다이어그램(노드 4유형, 자동 정렬)
  - `/wireframe` iframe 렌더 + 페이지네비(플로우 엣지따라) + 페이지 수정 팝업
- **서버↔파일**: API route가 graph JSON 읽기/쓰기, **chokidar 파일감시 → SSE 라이브 리로드**. 편집 저장 시 JSON 갱신 + 마크다운 재생성.
- **브릿지**: "AI 수정요청"/"페이지 수정" → `.aipm/queue/`에 적재 + "Claude Code에서 `/aipm apply` 실행" 토스트. 인에디터 실시간 챗은 v2.

## 5. 와이어프레임 렌더 전략 (최고 난도)

- `aipm-wireframe-generator`(frontend-design 스킬)가 **페이지당 self-contained HTML(Tailwind + 현실적 더미데이터)** 생성 → `wireframes/<page-id>.html`.
- 웹앱: iframe 렌더 + 페이지 목록 + 유저플로우 엣지따라 페이지 이동(클릭형 프로토타입) + "페이지 수정"(큐).
- 디바이스 토글 = iframe 폭(데스크톱/모바일) + 생성 프롬프트 레이아웃 힌트(상/측 메뉴 vs 하단 탭).

## 6. 빌드 순서 (writing-plans에서 상세화)

| Phase | 내용 | 산출 검증 |
|-------|------|-----------|
| 0 | 데이터모델 스키마(JSON Schema) 확정 + 프로젝트 스캐폴드 + git init | 스키마 + 빈 프로젝트 생성 |
| 1 | 하네스 코어: `/aipm new`·`/aipm prd` → PRD 파일 (E2E 1줄기) | 아이디어→PRD.md 생성됨 |
| 2 | 웹앱 셸 + PRD 뷰 (읽기·렌더·편집·라이브리로드) | 웹에서 PRD 보고 편집→파일 반영 |
| 3 | 기능명세서 (agent + 3뷰) | features.json + 3뷰 렌더 |
| 4 | 유저플로우 (agent + 다이어그램) | userflow.json + 다이어그램 |
| 5 | 와이어프레임 (agent + iframe 렌더) | 페이지 HTML 생성 + 네비 |
| 6 | 브릿지(queue/apply) + 내보내기(Mermaid/Excel/MD) + 글로벌 설치 스크립트 | 큐 왕복 + export + 설치 |

## 7. 스코프 아웃 (YAGNI — v1 제외)

크레딧·과금 / 계정·인증 / Group·RBAC·멀티테넌시 / 클라우드 실시간 협업 / 인에디터 실시간 AI 챗(→v2) / 별도 MCP 서버(로컬은 파일이라 IDE가 직접 읽음 → 불필요).

## 8. 디렉토리 구조 (이 레포)

```
AI-Pair-management/
├─ SPEC.md             # 이 문서 (아키텍처·스코프)
├─ DESIGN.md           # (예약) UI 디자인 언어 — 와이어프레임/웹앱 단계에서 작성
├─ research/           # 원본 제품 리서치 (docs 33p + features 5p + 스샷 13 + 분석)
├─ harness/            # CC 하네스 구현 (commands/ skills/ agents/ rules/) + install 스크립트
└─ app/               # Next.js 로컬 웹앱 (뷰 레이어)
```

## 9. 미해결/주의 (구현 계획에서 다룰 것)

- 와이어프레임 HTML 생성 품질·일관성(프롬프트 설계) — 가장 큰 리스크.
- Codex 경로에서 AskUserQuestion 등가물(질문지 UX) 처리 방식.
- 웹 편집과 하네스 재생성 충돌 방지(파일 잠금/큐 순서).
- 마크다운 단방향(JSON→MD) 원칙의 사용자 혼동 방지(웹/JSON에서만 편집).
