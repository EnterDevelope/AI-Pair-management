#!/usr/bin/env bash
# pre-commit-sentinel.sh — AIPM 자동 생성 파일 직접 커밋 차단
#
# Exit 0 = 커밋 허용, Exit 1 = 커밋 차단
# 보안: git diff --cached 로만 staged 목록 조회 — 셸 주입 없음 (T-02-02)
# 우회: --no-verify 는 잔여위험으로 수용 (CLAUDE.md --no-verify 금지 규칙으로 운영 차단)

set -uo pipefail

SENTINEL="<!-- AIPM_GENERATED -->"

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 1
node "$REPO_ROOT/scripts/check-public-boundary.mjs" --cached || exit 1

# staged 중 .md 파일 목록 수집 (추가/수정/복사만, 삭제 제외)
# grep no-match는 정상(차단 대상 없음)이므로 pipefail 하에서 || true 로 흡수
STAGED_MD=$(git diff --cached --name-only --diff-filter=ACM | grep '\.md$' || true)

# staged MD 파일이 없으면 허용
if [ -z "$STAGED_MD" ]; then
  exit 0
fi

BLOCKED=0
# 파일명 공백/특수문자 안전: while IFS= read -r (단어분리 방지, WR-01)
while IFS= read -r file; do
  [ -z "$file" ] && continue
  # 스테이지된(인덱스 stage 0) 버전의 첫 줄을 검사한다.
  # 워킹트리(head -1 "$file")가 아니라 git show ":0:$file" 로 읽어야
  # "stage 시 센티넬 포함 후 디스크에서 센티넬 제거하고 commit" 우회를 막는다 (CR-04).
  # 고정 문자열 매칭(-F)으로 정규식 오탐 없음.
  if git show ":0:$file" 2>/dev/null | head -1 | grep -qF "$SENTINEL"; then
    echo "오류: 자동 생성 파일 직접 커밋 불가: $file" >&2
    echo "  /aipm prd 명령으로 재생성하세요." >&2
    BLOCKED=1
  fi
done <<< "$STAGED_MD"

exit $BLOCKED
