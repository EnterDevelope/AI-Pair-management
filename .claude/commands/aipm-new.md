---
description: "아이디어 한 줄로 새 기획 프로젝트를 만든다. 사용법: /aipm new \"<아이디어>\" (예: /aipm new \"헬스장 예약 앱\")"
allowed-tools: [Read, Write, Bash, Task, Skill, AskUserQuestion]
---

## Context

실행 환경(대화형 여부): !`test -t 0 && echo "interactive" || echo "noninteractive"`!
현재 디렉토리: !`pwd`!
기존 intake(있으면): !`cat .aipm/intake.json 2>/dev/null || echo "{}"`!

## Arguments

$ARGUMENTS

위 인자의 전체 문자열이 만들 제품의 아이디어 텍스트다. 첫 단어(공백 전)는 프로젝트 폴더 이름으로 쓴다. 인자에 기존 문서 경로가 포함되어 있으면 brownfield 입력으로 본다.

## Task

아이디어 한 줄을 "완성된 기획 묶음"으로 만드는 파이프라인을 끝까지 실행한다. Claude Code 세션 자체가 엔진이며, 각 단계의 결정론적 작업은 `scripts/` 스크립트가, 산문 품질과 질문 설계는 글로벌 스킬이 담당한다.

이 커맨드는 이후 모든 `/aipm *` 커맨드가 복사할 하네스 템플릿이다. 핵심 원칙: 환경 분기로 대화형과 비대화형(Codex)을 모두 지원하고, 글로벌 스킬은 코드 복사 없이 Skill 도구 호출로만 합성하며, 구조화 검증은 Zod 3회 재시도 후 명시적으로 실패시킨다.

### 1단계: 스캐폴드

`$ARGUMENTS`의 첫 단어를 프로젝트 이름으로 삼아 다음을 Bash로 실행한다.

```bash
npx tsx scripts/scaffold.ts "<프로젝트이름>"
```

`scaffold.ts`가 폴더와 graph 파일을 선생성한다. 프로젝트 이름은 `scaffold.ts` 내부의 `validateProjectName`이 영숫자와 하이픈 화이트리스트로 검증하므로, 경로 탈출 입력은 여기서 차단된다. 반환된 projectDir를 이후 단계에서 그대로 쓴다.

### 2단계: brownfield 선추출 (선택)

인자에 기존 문서 경로가 있으면, 그 문서를 읽어 아래 6축 답변 중 채울 수 있는 항목을 먼저 추출하고, 빈 항목만 다음 단계에서 질문한다. 문서가 없으면 6축 전부를 질문한다.

### 3단계: 6축 질문지 생성

질문지는 자동 발동에 의존하지 말고 Skill 도구로 명시적으로 호출해 합성한다.

- Skill 도구로 `pm-interview` 스킬을 호출하라. The Mom Test 원칙(과거 행동 중심, 비유도 질문)으로 6축 질문 문구를 다듬는다.
- Skill 도구로 `socratic-interviewer` 스킬을 호출하라. 모호한 답변을 좁히는 후속 질문 구조를 적용하라.
- Skill 도구로 `brainstorming` 스킬을 호출하라. 각 문항의 선택지를 다각도로 생성하는 데 적용하라.

질문은 고정 6축이다.

1. Q1 타겟 사용자와 시나리오 (누가, 어떤 상황에서)
2. Q2 해결하려는 문제
3. Q3 핵심 기능
4. Q4 범위와 우선순위
5. Q5 플랫폼과 기기
6. Q6 성공 기준

각 문항은 AI가 생성한 선택지를 제시하되, 반드시 "직접입력" 폴백을 함께 둔다. 선택지에 없으면 사용자가 자유 텍스트로 답할 수 있어야 한다.

### 4단계: 환경 분기 (대화형 / 비대화형)

위 Context의 실행 환경 값으로 분기한다.

- interactive: AskUserQuestion 도구로 6문항을 순서대로 묻는다.
- noninteractive: 6문항과 각 선택지(그리고 "직접입력" 안내)를 텍스트로 한 번에 모두 출력한 뒤, 단일 답변블록을 받아 파싱한다. 입력 대기로 멈추지 않는다. 비대화형 환경에서 AskUserQuestion으로 멈추는 일이 없어야 한다.

### 5단계: 언어 감지

`detectLang(rawIdea)`를 1회 호출해 입력 언어(ko, en, ja, zh)를 확정하고 project.json의 lang 필드에 기록한다. 이후 파생 문서의 언어가 이 값을 따른다.

### 6단계: intake 저장

6축 답변과 감지 언어를 `writeIntake`로 `.aipm/intake.json`에 저장한다. 이 파일이 대화형 답변과 brownfield 문서 수용을 잇는 공통 입력 지점이다.

### 7단계: 역할 확인

Q1 타겟과 Q5 기기에서 roles와 devices를 추출한 뒤, 사용자에게 "이 역할들이 맞나요?"를 1회 확인하고 project.json의 roles와 devices에 잠근다.

### 8단계: prd.json 생성 (Zod 3회 재시도)

다음을 Bash로 실행한다.

```bash
npx tsx scripts/prd-generator.ts "<projectDir>"
```

`prd-generator.ts`가 intake.json 6축 답변을 prd.json 5섹션으로 결정론적 매핑하고, PrdSchema 검증을 내부에서 최대 3회 재시도한다. 검증 실패 메시지를 받으면 prd.json을 재작성한 뒤 다시 호출한다. 3회까지 실패하면 조용히 넘기지 말고 명시적으로 실패를 보고하고 중단한다.

### 9단계: 문서 파생 + 산문 품질

먼저 다음을 Bash로 실행해 정본(prd.json)에서 문서 5종을 단방향 파생한다.

```bash
npx tsx scripts/doc-deriver.ts "<projectDir>"
```

`doc-deriver.ts`가 docs/PRD.md와 PM 문서 4종(1-pager.md, north-star.md, milestones.md, dev-brief.md)을 만들고 각 파일 1행에 `<!-- AIPM_GENERATED -->` 센티넬을 주입한다. 그다음 생성된 문서에 산문 품질을 입힌다. 모두 Skill 도구로 명시적으로 호출한다.

- Skill 도구로 `create-prd` 스킬을 호출하라. PRD 8섹션 구조 기준으로 본문을 보강하라.
- Skill 도구로 `document-writing` 스킬을 호출하라(필수 통과). Pyramid 구조와 평문 한국어, anti-slop 규칙을 적용하라.
- Skill 도구로 `north-star-metric` 스킬을 호출하라. north-star.md의 지표 정의에 적용하라.
- Skill 도구로 `outcome-roadmap` 스킬을 호출하라(또는 상황에 맞으면 `sprint-plan` 스킬을 Skill 도구로 호출하라). milestones.md의 마일스톤 서술에 적용하라.
- Skill 도구로 `backlog-items` 스킬을 호출하라. dev-brief.md의 작업 단위 정리에 적용하라.

산문에는 em-dash 기호를 쓰지 않는다. 영어 약어는 처음 등장할 때 괄호로 풀어 쓴다.

글로벌 스킬은 파일을 직접 읽거나 import 하지 않는다. 오직 Skill 도구 호출로만 합성한다. CC 자동 발동 동작 여부와 무관하게, 위에 나열한 모든 스킬은 Skill 도구로 명시적으로 호출되어야 한다.

### 10단계: git 커밋

graph 파일과 docs 파일을 명시적 경로로 스테이징해 커밋한다. 모든 변경을 한 번에 올리는 전체 일괄 스테이징은 쓰지 않는다(변경 폭 최소화, 명시적 경로만). 커밋 메시지에 아이디어 텍스트를 직접 끼워 넣지 말고 고정된 한국어 메시지를 쓴다(주입 방어).

```bash
git add "<projectDir>/graph" "<projectDir>/docs" "<projectDir>/.aipm"
git commit -m "feat: 새 기획 프로젝트 생성 및 PRD 산출물 파생"
```

## 완료 보고

생성된 프로젝트 경로, prd.json 섹션 수, 파생된 문서 5종 목록을 사용자에게 보고한다. 다음 단계로 `/aipm prd`(재생성) 안내를 덧붙인다.
