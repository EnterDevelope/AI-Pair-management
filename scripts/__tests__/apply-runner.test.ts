// ============================================================
// apply-runner 테스트 (04B-03 Task 1 — GREEN 구현)
// ============================================================
// 검증 핵심: 충돌 판정·history 이관·배치 지속
// generator 자체는 기존 테스트가 커버 → 여기서는 DI로 AI 호출 없이 검증
//
// 테스트 케이스:
// 1. 빈 큐 → 빈 배열 반환
// 2. 무충돌 요청 → applied + graph 수정 + history 이관 + 큐 파일 제거
// 3. 충돌 요청 → conflict + history 기록 + 큐 파일 제거
// 4. 복수 요청(1 무충돌 + 1 충돌) → 배치 안 멈추고 둘 다 처리
// 5. 비대화형 1회 완결 → processQueue가 Promise 반환 + 정상 resolve
// ============================================================

import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

import { processQueue } from '../apply-runner.js'
import type { Features } from '../../src/schemas/graph/features.js'
import type { Userflow } from '../../src/schemas/graph/userflow.js'
import { computeContentHash } from '../../src/lib/content-hash.js'

// ============================================================
// 헬퍼: 임시 projectDir 생성
// ============================================================

let tmpDirs: string[] = []

async function createProjectDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aipm-test-'))
  tmpDirs.push(dir)
  // 필요한 디렉토리 사전 생성
  await fs.mkdir(path.join(dir, '.aipm', 'queue'), { recursive: true })
  await fs.mkdir(path.join(dir, '.aipm', 'history'), { recursive: true })
  await fs.mkdir(path.join(dir, 'graph'), { recursive: true })
  return dir
}

afterEach(async () => {
  // 임시 디렉토리 일괄 정리
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  tmpDirs = []
})

// ============================================================
// 테스트 픽스처 빌더
// ============================================================

const FEATURE_ITEM = {
  id: 'F-000001',
  title: '테스트 기능',
  description: '테스트용 기능 항목',
}

function buildFeaturesGraph(): Features {
  return {
    schemaVersion: '1.0' as const,
    items: [{ ...FEATURE_ITEM }],
  }
}

async function writeGraphFile(dir: string, graph: Features): Promise<void> {
  const filePath = path.join(dir, 'graph', 'features.json')
  await fs.writeFile(filePath, JSON.stringify(graph, null, 2), 'utf8')
}

/** 큐 파일을 만든다. baseVersion = computeContentHash(항목 서브트리) → 무충돌 */
async function writeQueueFile(
  dir: string,
  filename: string,
  overrides: Partial<{
    baseVersion: string
    targetId: string
    instruction: string
  }> = {}
): Promise<void> {
  const queuePath = path.join(dir, '.aipm', 'queue', filename)
  const record = {
    schemaVersion: '1.0',
    requestId: filename.replace('.json', ''),
    targetArtifact: 'features',
    targetId: overrides.targetId ?? FEATURE_ITEM.id,
    instruction: overrides.instruction ?? '기능 설명을 보강해주세요.',
    baseVersion: overrides.baseVersion ?? computeContentHash(FEATURE_ITEM),
    createdAt: new Date().toISOString(),
  }
  await fs.writeFile(queuePath, JSON.stringify(record, null, 2), 'utf8')
}

/** mock generator: AI 호출 없이 최소한의 유효 Features 반환 */
function mockFeaturesGenerator(projectDir: string): Promise<Features> {
  return Promise.resolve({
    schemaVersion: '1.0' as const,
    items: [{ id: FEATURE_ITEM.id, title: '업데이트된 기능', description: '업데이트된 설명' }],
  })
}

/**
 * no-op deriveDocs: graph/prd.json 등 없는 테스트 픽스처 환경에서
 * MD 파생 단계를 건너뛴다. 실제 deriveDocs는 prd.json 필수.
 */
function noopDeriveDocs(_projectDir: string): Promise<void> {
  return Promise.resolve()
}

// ============================================================
// 1. 빈 큐 테스트
// ============================================================

describe('apply-runner: 큐에 요청이 없으면 즉시 종료하고 요약을 출력한다', () => {
  it('빈 큐 → 빈 배열 반환', async () => {
    const dir = await createProjectDir()
    // queue 디렉토리는 비어있음

    const results = await processQueue(dir)

    expect(results).toEqual([])
  })

  it('queue 디렉토리 자체 없어도 빈 배열 반환', async () => {
    const dir = await createProjectDir()
    // queue 디렉토리 제거
    await fs.rmdir(path.join(dir, '.aipm', 'queue'))

    const results = await processQueue(dir)

    expect(results).toEqual([])
  })
})

// ============================================================
// 2. 무충돌 요청 → graph 수정 + history 이관
// ============================================================

describe('apply-runner: 무충돌 요청을 처리하면 graph를 수정하고 history로 이관한다', () => {
  it('outcome:"applied" + 큐 파일 제거 + history 파일 생성', async () => {
    const dir = await createProjectDir()
    const graph = buildFeaturesGraph()
    await writeGraphFile(dir, graph)

    const filename = '20260101T000000Z-req-001.json'
    // baseVersion = 현재 항목 해시 → 충돌 없음
    await writeQueueFile(dir, filename)

    const results = await processQueue(dir, {
      _featuresGenerator: mockFeaturesGenerator,
      _deriveDocs: noopDeriveDocs,
    })

    // outcome:"applied" 확인
    expect(results).toHaveLength(1)
    expect(results[0].outcome).toBe('applied')
    expect(results[0].targetId).toBe(FEATURE_ITEM.id)

    // 큐 파일 제거 확인
    const queuePath = path.join(dir, '.aipm', 'queue', filename)
    await expect(fs.access(queuePath)).rejects.toThrow()

    // history 파일 존재 확인
    const historyPath = path.join(dir, '.aipm', 'history', filename)
    const historyContent = await fs.readFile(historyPath, 'utf8')
    const historyRecord = JSON.parse(historyContent)
    expect(historyRecord.outcome).toBe('applied')
    expect(historyRecord.appliedAt).toBeDefined()
    expect(historyRecord.requestId).toBe(filename.replace('.json', ''))
  })
})

// ============================================================
// 3. 충돌 요청 → history conflict 기록 + 큐에서 제거
// ============================================================

describe('apply-runner: 충돌 요청을 건너뛰고 outcome:"conflict"로 history에 기록한다', () => {
  it('stale baseVersion → outcome:"conflict" + 큐 파일 제거 + conflict history', async () => {
    const dir = await createProjectDir()
    const graph = buildFeaturesGraph()
    await writeGraphFile(dir, graph)

    const filename = '20260101T000000Z-req-002.json'
    // baseVersion = 'stale-hash' → 현재 해시와 불일치 → 충돌
    await writeQueueFile(dir, filename, { baseVersion: 'stale-hash-not-matching' })

    const results = await processQueue(dir)

    // conflict 반환
    expect(results).toHaveLength(1)
    expect(results[0].outcome).toBe('conflict')
    expect(results[0].targetId).toBe(FEATURE_ITEM.id)

    // 큐 파일 제거 확인 (무한 재충돌 방지 — D-05)
    const queuePath = path.join(dir, '.aipm', 'queue', filename)
    await expect(fs.access(queuePath)).rejects.toThrow()

    // history conflict 레코드 확인
    const historyPath = path.join(dir, '.aipm', 'history', filename)
    const historyContent = await fs.readFile(historyPath, 'utf8')
    const historyRecord = JSON.parse(historyContent)
    expect(historyRecord.outcome).toBe('conflict')
    expect(historyRecord.appliedAt).toBeDefined()
  })
})

// ============================================================
// 4. 복수 요청: 1 무충돌 + 1 충돌 → 배치 안 멈추고 둘 다 처리
// ============================================================

describe('apply-runner: 복수 요청 처리 시 적용/건너뜀 건수를 요약에 표시한다', () => {
  it('applied 1 + conflict 1 → results 길이 2, 배치 중단 없음', async () => {
    const dir = await createProjectDir()
    const graph = buildFeaturesGraph()
    await writeGraphFile(dir, graph)

    const file1 = '20260101T000000Z-req-applied.json'  // 무충돌 (먼저 처리)
    const file2 = '20260101T000001Z-req-conflict.json' // 충돌 (나중 처리)

    await writeQueueFile(dir, file1) // baseVersion 올바름
    await writeQueueFile(dir, file2, { baseVersion: 'stale-hash' }) // 충돌

    const results = await processQueue(dir, {
      _featuresGenerator: mockFeaturesGenerator,
      _deriveDocs: noopDeriveDocs,
    })

    // 두 요청 모두 처리됨 (배치 중단 없음)
    expect(results).toHaveLength(2)

    const applied = results.filter((r) => r.outcome === 'applied')
    const conflict = results.filter((r) => r.outcome === 'conflict')
    expect(applied).toHaveLength(1)
    expect(conflict).toHaveLength(1)

    // 두 큐 파일 모두 제거 확인
    await expect(fs.access(path.join(dir, '.aipm', 'queue', file1))).rejects.toThrow()
    await expect(fs.access(path.join(dir, '.aipm', 'queue', file2))).rejects.toThrow()

    // 두 history 파일 모두 생성 확인
    const h1 = JSON.parse(await fs.readFile(path.join(dir, '.aipm', 'history', file1), 'utf8'))
    const h2 = JSON.parse(await fs.readFile(path.join(dir, '.aipm', 'history', file2), 'utf8'))
    expect(h1.outcome).toBe('applied')
    expect(h2.outcome).toBe('conflict')
  })
})

// ============================================================
// 5. 비대화형 1회 완결 후 종료
// ============================================================

describe('apply-runner가 비대화형 1회 완결 후 종료한다', () => {
  it('processQueue가 Promise를 반환하고 정상 resolve 한다', async () => {
    const dir = await createProjectDir()
    // 빈 큐로도 충분 — 핵심은 Promise가 settle되고 재진입/루프가 없다는 것
    const promise = processQueue(dir)
    expect(promise).toBeInstanceOf(Promise)

    const results = await promise
    // resolve 완료 (reject 없음)
    expect(Array.isArray(results)).toBe(true)
  })

  it('처리 완료 후 추가 대기 없이 결과 반환 (1회 완결)', async () => {
    const dir = await createProjectDir()
    const graph = buildFeaturesGraph()
    await writeGraphFile(dir, graph)

    const file = '20260101T000000Z-req-once.json'
    await writeQueueFile(dir, file)

    const start = Date.now()
    const results = await processQueue(dir, {
      _featuresGenerator: mockFeaturesGenerator,
      _deriveDocs: noopDeriveDocs,
    })
    const elapsed = Date.now() - start

    // 정상 종료 (timeout/hang 없음 — 5초 이내)
    expect(elapsed).toBeLessThan(5000)
    expect(results).toHaveLength(1)
    expect(results[0].outcome).toBe('applied')
  })
})

describe('apply-runner: 서버가 계산한 flow baseVersion을 같은 subtree 규칙으로 검증한다', () => {
  it('UI projection에 없던 sectionId/versionId가 있어도 false conflict 없이 applied 처리한다', async () => {
    const dir = await createProjectDir()
    const node = {
      id: 'P-FLOW01',
      type: 'page' as const,
      label: '결제 화면',
      description: '결제 정보를 입력해요.',
      featureId: 'F-000001',
      sectionId: 'checkout',
      versionId: 'P-VER001',
      positionX: 120,
      positionY: 240,
    }
    const graph: Userflow = {
      schemaVersion: '1.0',
      nodes: [node],
      edges: [],
      versions: [{ id: 'P-VER001', label: '기본' }],
    }
    await fs.writeFile(path.join(dir, 'graph', 'userflow.json'), JSON.stringify(graph), 'utf8')

    const filename = '20260101T000000Z-flow-server-hash.json'
    await fs.writeFile(path.join(dir, '.aipm', 'queue', filename), JSON.stringify({
      schemaVersion: '1.0',
      requestId: 'flow-server-hash',
      targetArtifact: 'flow',
      targetId: node.id,
      instruction: '설명을 더 명확하게 바꿔줘',
      baseVersion: computeContentHash(node),
      createdAt: '2026-06-21T12:00:00.000Z',
    }), 'utf8')

    const results = await processQueue(dir, {
      _flowGenerator: async () => ({
        ...graph,
        nodes: [{ ...node, label: '결제 정보 입력' }],
      }),
      _deriveDocs: noopDeriveDocs,
    })

    expect(results).toHaveLength(1)
    expect(results[0].outcome).toBe('applied')
    const history = JSON.parse(await fs.readFile(path.join(dir, '.aipm', 'history', filename), 'utf8'))
    expect(history.outcome).toBe('applied')
  })
})

describe('apply-runner: history 기록 실패 시 큐 원본을 보존한다', () => {
  it('history 목적지가 디렉토리면 error를 반환하고 큐 파일을 삭제하지 않는다', async () => {
    const dir = await createProjectDir()
    await writeGraphFile(dir, buildFeaturesGraph())
    const filename = '20260101T000000Z-history-failure.json'
    await writeQueueFile(dir, filename)
    await fs.mkdir(path.join(dir, '.aipm', 'history', filename))

    const results = await processQueue(dir, {
      _featuresGenerator: mockFeaturesGenerator,
      _deriveDocs: noopDeriveDocs,
    })

    expect(results[0].outcome).toBe('error')
    await expect(fs.access(path.join(dir, '.aipm', 'queue', filename))).resolves.toBeUndefined()
  })
})
