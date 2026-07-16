---
description: "PRD 재생성. 섹션 diff 확인 후 업데이트(기본), 또는 --force 전체 덮어쓰기. 사용법: /aipm prd [--force]"
allowed-tools: [Read, Write, Bash, Skill]
---

## Context

실행 환경(대화형 여부): !`test -t 0 && echo "interactive" || echo "noninteractive"`!
현재 prd.json 미리보기: !`cat graph/prd.json 2>/dev/null | head -40 || echo "NO_PRD"`!

## Arguments

$ARGUMENTS

`--force`가 포함되면 전체 덮어쓰기 모드, 없으면 섹션 diff 승인 모드다.

## Task

기존 PRD를 안전하게 재생성한다. 핵심은 사용자가 손으로 다듬은 내용을 함부로 잃지 않는 것이다. 모드별 병합 정책으로 데이터 손실을 막는다.

### 1단계: 정본 존재 확인 (의존성 게이트)

`graph/prd.json`을 읽는다. 파일이 없으면 재생성할 정본이 없는 것이므로, "먼저 /aipm new를 실행하세요"를 안내하고 종료한다.

또한 prd.json은 있지만 `overview` 필드가 비어 있거나 없으면, PRD 개요가 확정되지 않은 상태다. 이때는 하류 커맨드(`/aipm features`, `/aipm flow`)를 실행하지 말라고 안내하는 의존성 게이트 문구를 출력한다. 개요(overview)가 채워질 때까지 하류 단계는 막힌다.

### 2단계: 모드 결정

세 가지 모드로 분기한다.

- approve (기본): 섹션 단위 diff를 보여주고 사용자 승인을 받은 섹션만 적용한다.
- force (`--force` 인자): 전체를 새로 생성한 내용으로 덮어쓴다.
- codex (비대화형 환경): 빈 필드나 null 섹션만 채우고, 기존에 채워진 내용은 보존한다. 입력 대기로 멈추지 않는다.

### 3단계: approve 모드 (기본)

`scripts/prd-generator.ts`로 proposed PRD를 만든 뒤, `diffPrdSections`로 변경된 섹션만 골라 보여준다. 사용자에게 어떤 섹션을 적용할지 승인을 받고, `applyMergePolicy`를 approve 모드로 적용한다.

```bash
npx tsx scripts/prd-generator.ts "<projectDir>"
```

### 4단계: force 모드

`--force`가 있으면 generatePrd 결과로 prd.json 전체를 덮어쓴다(applyMergePolicy force 모드). 이 경로만 전체 덮어쓰기를 허용하며, 명시적 인자가 있어야만 동작한다.

### 5단계: codex 모드 (비대화형)

비대화형 환경에서는 빈 필드와 null 섹션만 채우는 codex 모드로 병합한다. 사용자가 이전에 편집한 섹션은 그대로 둔다. 데이터 손실이 0이 되도록 한다.

### 6단계: 문서 재파생 + 산문 품질

재생성된 prd.json에서 다음을 Bash로 실행해 docs 5종을 다시 파생한다.

```bash
npx tsx scripts/doc-deriver.ts "<projectDir>"
```

그다음 산문 품질을 다시 입힌다. 모두 Skill 도구로 명시적으로 호출한다.

- Skill 도구로 `document-writing` 스킬을 호출하라. 모든 파생 문서의 평문 한국어와 anti-slop 규칙을 적용하라.
- North Star 섹션을 재생성했으면 Skill 도구로 `north-star-metric` 스킬을 호출해 지표 정의에 적용하라.
- 마일스톤 섹션을 재생성했으면 Skill 도구로 `outcome-roadmap` 스킬을 호출하라(또는 상황에 맞으면 `sprint-plan` 스킬을 Skill 도구로 호출하라).

산문에는 em-dash 기호를 쓰지 않는다. 영어 약어는 처음 등장할 때 괄호로 풀어 쓴다. 글로벌 스킬은 파일을 직접 읽거나 import 하지 않고 Skill 도구 호출로만 합성한다.

### 7단계: git 커밋

변경된 graph 파일과 docs 파일을 명시적 경로로 스테이징해 커밋한다. 모든 변경을 한 번에 올리는 전체 일괄 스테이징은 쓰지 않는다(명시적 경로만). 커밋 메시지는 고정된 한국어 메시지를 쓴다.

```bash
git add "<projectDir>/graph/prd.json" "<projectDir>/docs"
git commit -m "feat: PRD 재생성 및 산출물 갱신"
```

`prd-generator.ts`는 기존 R-ID를 유지하므로, 같은 intake로 재생성해도 prd.json의 R-ID는 변하지 않는다(ID 안정성).

## 완료 보고

적용한 모드, 변경된 섹션, 재파생된 문서 목록을 사용자에게 보고한다.
