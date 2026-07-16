// ============================================================
// 원자 파일 쓰기 유틸 (00-04-PLAN.md Task 2)
// ============================================================
// 목적: graph JSON 파일을 per-file 락 + tmp→rename으로 원자적으로 쓴다.
//
// 설계:
// - proper-lockfile: mkdir 전략, stale:5000(5초 크래시 복구), retries:0(즉시 실패)
// - write-file-atomic: tmp 파일에 쓴 뒤 rename — SIGINT/에러 시 원본 보존
// - retries:0 정합: 락 실패 시 즉시 throw → 호출자(Phase 2A)가 423 반환 결정
// - DATA-04: 부분 쓰기 0, torn write 방지
//
// 주의(Pitfall 4): proper-lockfile은 대상 파일이 존재해야 락 가능.
//   스캐폴드가 graph 파일을 먼저 생성해야 이 함수를 사용할 수 있다.
// ============================================================

import writeFileAtomic from "write-file-atomic"
import * as lockfile from "proper-lockfile"

export interface WriteGraphFileOptions {
  /** 락 stale 타임아웃 (ms). 기본값 5000 */
  staleMs?: number
}

/**
 * graph JSON 파일을 per-file 락 + tmp→rename으로 원자적으로 쓴다.
 *
 * @param filePath - 쓸 파일 경로 (호출자가 path.resolve + prefix로 검증 후 전달)
 * @param data - JSON으로 직렬화할 데이터
 * @param options - 옵션 (staleMs 등)
 * @throws 락 획득 실패 시 즉시 throw (ELOCKED — 호출자가 423 처리)
 * @throws 쓰기 실패 시 throw (원본 파일 보존됨)
 */
export async function writeGraphFile(
  filePath: string,
  data: unknown,
  options?: WriteGraphFileOptions
): Promise<void> {
  const stale = options?.staleMs ?? 5000

  // retries:0 — 이미 락이 걸려 있으면 즉시 throw (대기 금지)
  const release = await lockfile.lock(filePath, {
    stale,
    retries: { retries: 0 },
  })

  try {
    // tmp→rename으로 원자 쓰기 — 에러 시 원본 보존
    await writeFileAtomic(
      filePath,
      JSON.stringify(data, null, 2) + "\n",
      { encoding: "utf8" }
    )
  } finally {
    // 쓰기 성공·실패 관계없이 락 해제
    await release()
  }
}
