---
description: "유저플로우 생성. PRD·기능명세 기반 섹션→페이지→엣지 생성 후 업데이트(기본), 또는 --force 전체 덮어쓰기. 사용법: /aipm flow [--force]"
allowed-tools: [Read, Write, Bash, Skill]
---

## Context

실행 환경(대화형 여부): !`test -t 0 && echo "interactive" || echo "noninteractive"`!
현재 userflow.json 미리보기: !`cat graph/userflow.json 2>/dev/null | head -40 || echo "NO_USERFLOW"`!
prd.json 의존성 확인: !`cat graph/prd.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('overview') else 'NO_OVERVIEW')" 2>/dev/null || echo "NO_PRD"`!
features.json 의존성 확인: !`cat graph/features.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('items'); print('OK' if isinstance(items, list) and len(items)>0 else 'NO_ITEMS')" 2>/dev/null || echo "NO_FEATURES"`!

## Arguments

$ARGUMENTS

`--force`가 포함되면 전체 덮어쓰기 모드, 없으면 기존 노드 ID·위치를 보존하며 신규만 추가하는 업데이트 모드다.

## Task

PRD와 기능명세를 입력으로 유저플로우(섹션 레인 + 노드 4유형 + 버전 태그)를 생성한다. 핵심은 세 가지다. 첫째, 한 번에 전부 만들지 않고 섹션→페이지→엣지 단계를 나눠 생성하면서 각 단계를 Zod로 검증한다. 둘째, 재생성할 때 기존 노드의 ID와 캐시된 위치(positionX/positionY)를 절대 바꾸지 않아 하류 렌더의 링크와 레이아웃이 깨지지 않게 한다. 셋째, userflow.json에서 docs/USERFLOW.md를 단방향 파생한다.

### 1단계: 의존성 게이트

`graph/prd.json`을 읽는다. 파일이 없거나(`NO_PRD`) `overview` 필드가 비어 있으면(`NO_OVERVIEW`) "먼저 /aipm prd를 실행해 PRD overview를 작성하세요"를 안내하고 종료한다.

`graph/features.json`을 읽는다. 파일이 없거나(`NO_FEATURES`) `items` 배열이 비어 있으면(`NO_ITEMS`) "먼저 /aipm features를 실행해 기능명세를 작성하세요"를 안내하고 종료한다. 노드의 featureId 태깅이 이 배열을 출처로 쓰기 때문에 반드시 먼저 채워져 있어야 한다(HARNESS-02).

### 2단계: 모드 결정

세 가지 모드로 분기한다. 기능명세는 이미 확정된 입력이므로 생성 도중 "이 섹션들 맞나요?" 같은 중간 확인 게이트는 두지 않는다(한 번에 완결한다).

- approve (기본): 기존 노드 ID·위치를 보존하고 신규 노드만 추가한다. 결과를 한 번에 생성·보고한다.
- force (`--force` 인자): 기존 userflow.json 전체를 새로 생성한 내용으로 덮어쓴다. 명시적 인자가 있을 때만 동작한다.
- codex (비대화형 환경): approve와 동일하게 기존 항목 보존 + 신규 추가로 동작하며, 입력 대기로 멈추지 않는다.

섹션·노드 매핑에 더 정교한 흐름 도출이 필요하면 `aipm-flow-mapper` 에이전트를 합성해 워크플로우 트리(해피패스·분기·실패경로)를 먼저 만들고, 그 결과를 D-02 섹션·D-04 노드로 매핑한다. 그렇지 않으면 생성 스크립트의 결정론적 도출을 그대로 쓴다.

### 3단계: 생성 스크립트 호출

```bash
npx tsx scripts/flow-generator.ts "<projectDir>" <mode>
```

스크립트는 섹션 레인 생성, 섹션별 페이지·액션 노드 확장, 노드 간 엣지 연결의 단계로 나눠 생성하며 각 단계 출력을 Zod 스키마로 검증한다(실패 시 최대 3회 재시도). page·section 노드에는 P-XXXXXX 형식 ID가 부여되고, 모든 노드·엣지에는 이번 실행의 versionId가 태깅된다. features.json에서 도출 가능한 노드에는 featureId가 태깅된다. 재생성 시 기존 노드의 ID와 positionX/positionY는 고정 제약으로 주입되어 변하지 않고, 신규 노드만 새 ID를 발급받는다. 저장 후 docs/USERFLOW.md가 자동으로 단방향 파생된다.

### 4단계: 산문 품질

생성이 끝나면 Skill 도구로 `document-writing` 스킬을 호출하라. USERFLOW.md의 평문 한국어와 anti-slop 규칙(em-dash 금지, 순수 흑백 금지)을 적용하라. 글로벌 스킬은 파일을 직접 읽거나 import 하지 않고 Skill 도구 호출로만 합성한다.

### 5단계: git 커밋

변경된 파일을 명시적 경로로 스테이징해 커밋한다. 모든 변경을 한 번에 올리는 전체 일괄 스테이징은 쓰지 않는다(명시적 경로만). 커밋 메시지는 고정된 한국어 메시지를 쓴다.

```bash
git add "<projectDir>/graph/userflow.json" "<projectDir>/docs/USERFLOW.md"
git commit -m "feat: 유저플로우 생성 및 USERFLOW.md 파생"
```

`flow-generator.ts`는 기존 노드의 P- ID와 캐시된 위치를 유지하므로, 같은 입력으로 재생성해도 userflow.json의 기존 노드 ID·레이아웃은 변하지 않는다(ID·위치 안정성).

## 완료 보고

적용한 모드, 생성·추가된 노드 수(섹션/페이지/액션 각각)와 엣지 수, 파생된 문서 경로를 사용자에게 보고한다.
