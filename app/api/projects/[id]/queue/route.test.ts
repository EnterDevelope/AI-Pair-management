import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

import { POST, GET } from './route'
import { computeContentHash } from '@/lib/content-hash'

const FEATURE_ITEM = {
  id: 'F-AAAAAA',
  title: '결제',
  description: '결제 기능',
  parent: 'R-AAAAAA',
}

const FLOW_NODE = {
  id: 'P-FLOW01',
  type: 'page',
  label: '결제 화면',
  description: '결제 정보를 입력해요.',
  featureId: 'F-AAAAAA',
  sectionId: 'checkout',
  versionId: 'P-VER001',
  positionX: 120,
  positionY: 240,
}

const PRD = {
  schemaVersion: '1.0',
  id: 'R-AAAAAA',
  title: 'AIPM 테스트',
  overview: '로컬 기획 도구',
}

const VALID_PAYLOAD = {
  schemaVersion: '1.0' as const,
  requestId: 'abc12345',
  targetArtifact: 'features' as const,
  targetId: FEATURE_ITEM.id,
  instruction: '결제 기능을 결제와 환불로 나눠줘',
  createdAt: '2026-06-21T12:00:00.000Z',
}

let tempDir: string

function makeRequest(body?: unknown): Request {
  return new Request('http://localhost/api/projects/test/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function readCreatedRequest(res: Response): Promise<Record<string, unknown>> {
  const { filename } = await res.json() as { filename: string }
  const raw = await fs.readFile(path.join(tempDir, '.aipm', 'queue', filename), 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aipm-queue-test-'))
  process.env.AIPM_PROJECT_DIR = path.dirname(tempDir)
  const graphDir = path.join(tempDir, 'graph')
  await fs.mkdir(graphDir, { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(graphDir, 'features.json'), JSON.stringify({ schemaVersion: '1.0', items: [FEATURE_ITEM] })),
    fs.writeFile(path.join(graphDir, 'userflow.json'), JSON.stringify({ schemaVersion: '1.0', nodes: [FLOW_NODE], edges: [] })),
    fs.writeFile(path.join(graphDir, 'prd.json'), JSON.stringify(PRD)),
  ])
})

afterEach(async () => {
  delete process.env.AIPM_PROJECT_DIR
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('POST /api/projects/[id]/queue', () => {
  it('features 대상의 baseVersion을 서버에서 계산해 저장한다', async () => {
    const id = path.basename(tempDir)
    const res = await POST(makeRequest(VALID_PAYLOAD), { params: Promise.resolve({ id }) })

    expect(res.status).toBe(201)
    const stored = await readCreatedRequest(res)
    expect(stored.baseVersion).toBe(computeContentHash(FEATURE_ITEM))
  })

  it('flow 전체 디스크 노드로 baseVersion을 계산해 UI projection 오탐을 막는다', async () => {
    const id = path.basename(tempDir)
    const res = await POST(makeRequest({
      ...VALID_PAYLOAD,
      requestId: 'flow12345',
      targetArtifact: 'flow',
      targetId: FLOW_NODE.id,
    }), { params: Promise.resolve({ id }) })

    expect(res.status).toBe(201)
    const stored = await readCreatedRequest(res)
    expect(stored.baseVersion).toBe(computeContentHash(FLOW_NODE))
    expect(stored.baseVersion).not.toBe(computeContentHash({
      id: FLOW_NODE.id,
      type: FLOW_NODE.type,
      label: FLOW_NODE.label,
      description: FLOW_NODE.description,
      featureId: FLOW_NODE.featureId,
    }))
  })

  it('prd 전체 그래프로 baseVersion을 계산한다', async () => {
    const id = path.basename(tempDir)
    const res = await POST(makeRequest({
      ...VALID_PAYLOAD,
      requestId: 'prd12345',
      targetArtifact: 'prd',
      targetId: 'overview',
    }), { params: Promise.resolve({ id }) })

    expect(res.status).toBe(201)
    const stored = await readCreatedRequest(res)
    expect(stored.baseVersion).toBe(computeContentHash(PRD))
  })

  it('클라이언트가 보낸 baseVersion은 서버 계산값으로 덮어쓴다', async () => {
    const id = path.basename(tempDir)
    const res = await POST(makeRequest({ ...VALID_PAYLOAD, baseVersion: 'client-controlled' }), {
      params: Promise.resolve({ id }),
    })

    expect(res.status).toBe(201)
    const stored = await readCreatedRequest(res)
    expect(stored.baseVersion).toBe(computeContentHash(FEATURE_ITEM))
    expect(stored.baseVersion).not.toBe('client-controlled')
  })

  it('빈 지시문이나 안전하지 않은 requestId는 422를 반환한다', async () => {
    const id = path.basename(tempDir)
    const empty = await POST(makeRequest({ ...VALID_PAYLOAD, instruction: '   ' }), {
      params: Promise.resolve({ id }),
    })
    const unsafeId = await POST(makeRequest({ ...VALID_PAYLOAD, requestId: '../escape' }), {
      params: Promise.resolve({ id }),
    })

    expect(empty.status).toBe(422)
    expect(unsafeId.status).toBe(422)
  })

  it('그래프나 대상 항목이 없으면 404를 반환한다', async () => {
    const id = path.basename(tempDir)
    const missingTarget = await POST(makeRequest({ ...VALID_PAYLOAD, targetId: 'F-ZZZZZZ' }), {
      params: Promise.resolve({ id }),
    })
    await fs.unlink(path.join(tempDir, 'graph', 'features.json'))
    const missingGraph = await POST(makeRequest(VALID_PAYLOAD), { params: Promise.resolve({ id }) })

    expect(missingTarget.status).toBe(404)
    expect(missingGraph.status).toBe(404)
  })

  it('큐 디렉토리 생성 또는 쓰기 실패는 일반화된 500을 반환한다', async () => {
    const id = path.basename(tempDir)
    await fs.writeFile(path.join(tempDir, '.aipm'), 'not-a-directory')
    const res = await POST(makeRequest(VALID_PAYLOAD), { params: Promise.resolve({ id }) })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: '수정요청을 저장하지 못했어요.' })
  })

  it('프로젝트 path traversal은 400을 반환한다', async () => {
    const res = await POST(makeRequest(VALID_PAYLOAD), {
      params: Promise.resolve({ id: '../../etc' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/projects/[id]/queue', () => {
  const makeGetRequest = () => new Request('http://localhost/api/projects/test/queue')

  it('큐 디렉토리가 없으면 count 0을 반환한다', async () => {
    const id = path.basename(tempDir)
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 0 })
  })

  it('서버가 적재한 큐 JSON 개수를 반환한다', async () => {
    const id = path.basename(tempDir)
    await POST(makeRequest(VALID_PAYLOAD), { params: Promise.resolve({ id }) })
    await POST(makeRequest({ ...VALID_PAYLOAD, requestId: 'def67890', createdAt: '2026-06-21T12:01:00.000Z' }), {
      params: Promise.resolve({ id }),
    })

    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id }) })
    expect(await res.json()).toEqual({ count: 2 })
  })

  it('프로젝트 path traversal은 400을 반환한다', async () => {
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: '../../etc' }) })
    expect(res.status).toBe(400)
  })
})
