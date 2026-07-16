---
description: "웹에서 적재된 AI 수정요청 큐를 일괄 처리합니다 — baseVersion 충돌 검사 후 기존 생성 경로 재호출·ID 고정 병합·history 이관. 사용법: /aipm apply"
allowed-tools: [Read, Write, Bash, Skill]
---

## Context

실행 환경(대화형 여부): !`test -t 0 && echo "interactive" || echo "noninteractive"`!
현재 프로젝트: !`cat project.json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('name','(이름 없음)'))" 2>/dev/null || echo "NO_PROJECT"`!
큐 대기 건수: !`ls .aipm/queue/*.json 2>/dev/null | wc -l | tr -d ' '`!
대기 요청 미리보기: !`ls .aipm/queue/*.json 2>/dev/null | head -20 || echo "(없음)"`!

## Arguments

$ARGUMENTS

인자 없이 동작한다. 큐에 쌓인 모든 요청을 적재 타임스탬프 순으로 한 번에 처리한다.

## Task

웹에서 "AI 수정요청" 버튼으로 적재된 `.aipm/queue/`의 요청들을 일괄 적용한다. 핵심은 두 가지다. 첫째, 적재 이후 대상 항목이 바뀌었는지(baseVersion 충돌) 항목별로 검사해 안전한 것만 적용한다. 둘째, AI를 직접 부르지 않고 기존 generator 파이프라인(Zod 3회 재시도·ID 고정 병합)을 재사용해 그래프를 수정하고 문서를 재파생한다.

### 1단계: 큐 게이트

위 Context의 "큐 대기 건수"가 0이면 "처리할 요청이 없어요. 웹에서 'AI 수정요청'을 먼저 보내세요."를 출력하고 종료한다. 큐가 비었으면 아무것도 하지 않는다.

### 2단계: 큐 일괄 처리

```bash
npx tsx scripts/apply-runner.ts "$(pwd)"
```

스크립트는 `.aipm/queue/*.json`을 파일명(=적재 타임스탬프) 순으로 전부 처리한다. 항목마다 현재 항목 서브트리의 콘텐츠 해시를 요청의 baseVersion과 비교해, 같으면(무충돌) 기존 generator를 대상 항목+지시문으로 재호출해 ID 고정 병합으로 그래프를 되쓰고 docs를 재파생한다. 다르면(충돌) 건너뛴다. 처리·충돌·오류 요청 모두 `.aipm/history/`로 이관돼 다음 실행에서 재충돌하지 않는다.

**중간 확인·승인 입력을 절대 받지 않는다.** 비대화형 환경에서도 한 번에 끝까지 처리한다(중단 게이트 금지).

### 3단계: 충돌 경고

스크립트 출력에 충돌로 건너뛴 요청이 있으면 항목별로 "⚠ 충돌: {targetId} — 적재 후 항목이 바뀌어 건너뜀"을 사용자에게 알린다. 충돌 요청은 history에 conflict로 남으므로, 사용자는 웹에서 최신 상태를 보고 다시 요청하면 된다.

### 4단계: 종료 요약

스크립트가 출력한 요약 테이블(적용됨/충돌(건너뜀)/오류 건수)을 그대로 사용자에게 전달한다.

### 5단계: git 커밋

적용된 변경이 있을 때만, 그래프와 문서를 명시적 경로로 스테이징해 커밋한다. `.aipm/queue/`·`.aipm/history/`는 gitignore 대상이라 스테이징되지 않는다(git이 진짜 버전 스토리, history는 로컬 감사 흔적).

```bash
git add graph/ docs/
git commit -m "feat: AI 수정요청 큐 적용 및 문서 재파생"
```

**AI를 커맨드에서 직접 호출하지 않는다** — AI 엔진은 지금 도는 CC 세션이며, apply-runner.ts가 기존 generator 파이프라인을 재호출한다.

## 완료 보고

적용/충돌(건너뜀)/오류 건수와 수정된 산출물(PRD·기능명세·유저플로우 중 무엇), 재파생된 문서 경로를 사용자에게 보고한다.
