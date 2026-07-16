---
description: "기능명세 생성. R→F→S 3단계 생성 후 업데이트(기본), 또는 --force 전체 덮어쓰기. 사용법: /aipm features [--force]"
allowed-tools: [Read, Write, Bash, Skill]
---

## Context

실행 환경(대화형 여부): !`test -t 0 && echo "interactive" || echo "noninteractive"`!
현재 features.json 미리보기: !`cat graph/features.json 2>/dev/null | head -40 || echo "NO_FEATURES"`!
현재 prd.json 의존성 확인: !`cat graph/prd.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('overview') else 'NO_OVERVIEW')" 2>/dev/null || echo "NO_PRD"`!
project.json roles 확인: !`cat project.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('roles'); print('OK' if isinstance(r, list) and len(r)>0 else 'NO_ROLES')" 2>/dev/null || echo "NO_PROJECT"`!

## Arguments

$ARGUMENTS

`--force`가 포함되면 전체 덮어쓰기 모드, 없으면 단계 확인 승인 모드다.

## Task

PRD를 입력으로 요구사항(R), 기능(F), 상세기능(S) 3단 위계의 기능명세를 생성한다. 핵심은 두 가지다. 첫째, 한 번에 전부 만들지 않고 단계를 나눠 생성하면서 각 단계를 검증한다. 둘째, 재생성할 때 기존 항목의 ID를 절대 바꾸지 않아 하류 산출물의 링크가 깨지지 않게 한다.

### 1단계: 의존성 게이트

`graph/prd.json`을 읽는다. 파일이 없거나 `overview` 필드가 비어 있으면 "먼저 /aipm prd를 실행해 PRD overview를 작성하세요"를 안내하고 종료한다.

`project.json`에 `roles[]` 배열이 있는지 확인한다. 없거나 비어 있으면 "project.json에 roles 배열을 추가하세요"를 안내하고 종료한다. 역할 배정(F 단위)이 이 배열을 단일 출처로 쓰기 때문에 반드시 먼저 채워져 있어야 한다.

### 2단계: 모드 결정

세 가지 모드로 분기한다.

- approve (기본): R 목록을 먼저 생성해 "이 요구사항들 맞나요?" 1회 확인을 받고(수정·추가·삭제 허용), 기존 항목과의 차이는 R 가지별로 그룹핑해 보여준 뒤 가지 단위로 승인받아 적용한다.
- force (`--force` 인자): 기존 features.json 전체를 새로 생성한 내용으로 덮어쓴다. 명시적 인자가 있을 때만 동작한다.
- codex (비대화형 환경): 기존 항목은 그대로 보존하고 신규 항목만 추가한다. 입력 대기로 멈추지 않는다.

### 3단계: 생성 스크립트 호출

```bash
npx tsx scripts/feature-generator.ts "<projectDir>" <mode>
```

스크립트는 R 목록 생성, R별 F 확장, F별 S 확장의 3단계로 나눠 생성하며 각 단계 출력을 Zod 스키마로 검증한다(실패 시 최대 3회 재시도). 각 R 항목에는 Given/When/Then 구조의 수용기준이 채워진다. F의 역할 배정은 project.json roles 배열의 부분집합만 허용되며, 벗어나면 검증 실패로 재시도된다. 재생성 시 기존 features.json의 ID는 고정 제약으로 주입되어 변하지 않고, 신규 항목만 새 ID를 발급받는다. 저장 후 docs/FEATURES.md가 자동으로 단방향 파생된다.

### 4단계: 산문 품질

생성이 끝나면 Skill 도구로 `document-writing` 스킬을 호출하라. FEATURES.md의 평문 한국어와 anti-slop 규칙을 적용하라. 글로벌 스킬은 파일을 직접 읽거나 import 하지 않고 Skill 도구 호출로만 합성한다.

### 5단계: git 커밋

변경된 파일을 명시적 경로로 스테이징해 커밋한다. 모든 변경을 한 번에 올리는 전체 일괄 스테이징은 쓰지 않는다(명시적 경로만). 커밋 메시지는 고정된 한국어 메시지를 쓴다.

```bash
git add "<projectDir>/graph/features.json" "<projectDir>/docs/FEATURES.md"
git commit -m "feat: 기능명세 생성 및 FEATURES.md 파생"
```

`feature-generator.ts`는 기존 R-/F-/S- ID를 유지하므로, 같은 PRD로 재생성해도 features.json의 기존 ID는 변하지 않는다(ID 안정성).

## 완료 보고

적용한 모드, 생성·추가된 항목 수(R/F/S 각각), 파생된 문서 경로를 사용자에게 보고한다.
