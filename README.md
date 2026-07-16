# AIPM

AIPM은 아이디어를 PRD, 기능명세, 유저플로우, 와이어프레임으로 연결하는 로컬 AI 기획 하네스와 Next.js 뷰어입니다. 산출물의 JSON 그래프를 정본으로 두고 Markdown 문서는 단방향으로 파생합니다.

## 요구사항

- Node.js 20.19 이상
- npm
- 로컬에서 사용할 Codex 또는 Claude Code 세션

## 시작하기

```bash
npm ci
npx next dev
```

기획 프로젝트가 저장된 상위 디렉토리를 지정하려면 로컬 환경에서 `AIPM_PROJECT_DIR`을 설정하세요. 실제 환경 파일은 커밋하지 말고 필요한 경우 `.env.example`에 값 없는 예시만 기록합니다.

제품 명령은 `.claude/commands/aipm-*.md`에 있습니다. 대표 흐름은 `aipm-new` → `aipm-prd` → `aipm-features` → `aipm-flow`이며, 웹의 AI 수정요청은 로컬 큐에 적재한 뒤 `aipm-apply`로 처리합니다.

## 검증

```bash
npm test
npx tsc --noEmit
npm run build
node scripts/check-public-boundary.mjs
```

## 데이터와 보안

- `.planning`, `test-project`, `.aipm`, 로컬 에이전트 설정과 환경 파일은 공개 저장소에서 제외합니다.
- pre-commit 훅과 CI가 금지 경로, 개인키 헤더, 알려진 토큰 형식을 staged/tracked blob 기준으로 검사합니다.
- JSON 그래프가 정본이며 자동 생성 Markdown은 직접 수정하지 않습니다.
