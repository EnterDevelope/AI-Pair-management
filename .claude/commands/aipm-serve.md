---
description: "AIPM 로컬 웹앱을 띄운다. 사용법: /aipm serve"
allowed-tools: [Bash, Read]
---

## Context

현재 디렉토리: !`pwd`!
포트 3000 점유 여부: !`lsof -ti:3000 2>/dev/null && echo "RUNNING" || echo "FREE"`!

## Task

로컬 웹 뷰어(Next.js)를 띄운다. 핵심 원칙은 두 가지다. 첫째, 이미 떠 있으면 다시 띄우지 않는다. 둘째, 백그라운드로 기동해서 같은 세션에서 다른 `/aipm` 커맨드를 계속 쓸 수 있게 한다. 절대로 포그라운드로 멈춰 세우지 않는다.

### 1단계: 이미 떠 있는지 확인

위 Context의 "포트 3000 점유 여부"를 본다. `RUNNING`이면 이미 웹앱이 떠 있는 것이므로 다시 기동하지 않는다. 다음을 안내하고 끝낸다.

> 이미 localhost:3000이 떠 있어요. 브라우저에서 http://localhost:3000 을 여세요.

### 2단계: 백그라운드 기동 (포트가 비어 있을 때)

`FREE`이면 현재 디렉토리를 프로젝트 루트로 주입하면서 백그라운드로 기동한다. 로그는 `.aipm/serve.log`에 남긴다. Turbopack은 Next.js 16 기본값이라 별도 플래그를 붙이지 않는다.

```bash
mkdir -p .aipm
AIPM_PROJECT_DIR="$(pwd)" npx next dev > .aipm/serve.log 2>&1 &
```

`AIPM_PROJECT_DIR`은 현재 디렉토리(`$(pwd)`)를 그대로 주입한다. 웹앱의 서버측 코드(대시보드, PRD 읽기/쓰기 API, 라이브 리로드)는 모두 이 값으로 어떤 기획 프로젝트를 보여줄지 결정한다. 별도 설정 파일은 필요 없다.

이 명령은 끝에 `&`를 붙여 백그라운드로 돌린다. 포그라운드로 띄워 세션을 붙잡으면 같은 자리에서 다른 `/aipm` 커맨드를 못 쓰게 되므로 금지한다.

### 3단계: 준비될 때까지 짧게 기다리기

기동 직후에는 아직 응답하지 못한다. 포트가 응답할 때까지 최대 20초가량 짧게 폴링한다.

```bash
for i in $(seq 1 20); do
  if curl -s -o /dev/null http://localhost:3000; then
    echo "READY"
    break
  fi
  sleep 1
done
```

`READY`가 나오면 다음을 안내한다.

> localhost:3000이 준비됐어요. 브라우저에서 http://localhost:3000 을 여세요.

20초 안에 응답이 없으면 아직 빌드 중이거나 문제가 있는 것이다. 다음을 안내한다.

> 아직 준비되지 않았어요. 잠시 후 다시 열어 보거나 `.aipm/serve.log`에서 오류를 확인해 주세요.

## 완료 보고

기동 여부(새로 띄움 / 이미 떠 있었음)와 접속 주소(http://localhost:3000)를 사용자에게 보고한다.
