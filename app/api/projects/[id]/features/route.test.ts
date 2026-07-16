import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

// vi.mock은 hoisting되므로 import 전에 선언
vi.mock('@/lib/atomic-write', () => ({
  writeGraphFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../../scripts/doc-deriver', () => ({
  deriveDocs: vi.fn().mockResolvedValue(undefined),
}))

import { GET, POST } from './route'
import { writeGraphFile } from '@/lib/atomic-write'
import { deriveDocs } from '../../../../../scripts/doc-deriver'

const VALID_FEATURES = {
  schemaVersion: '1.0' as const,
  items: [
    {
      id: 'R-AAAAAA',
      title: '요구사항 1',
      description: '설명',
    },
  ],
}

let tempDir: string

function makeRequest(method: string, body?: unknown): Request {
  if (method === 'GET') {
    return new Request('http://localhost/api/projects/test/features')
  }
  return new Request('http://localhost/api/projects/test/features', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aipm-features-test-'))
  await fs.mkdir(path.join(tempDir, 'graph'), { recursive: true })
  await fs.writeFile(
    path.join(tempDir, 'graph', 'features.json'),
    JSON.stringify(VALID_FEATURES, null, 2) + '\n',
    'utf8'
  )
  // 환경변수로 프로젝트 디렉토리를 tempDir의 부모로 설정
  process.env.AIPM_PROJECT_DIR = path.dirname(tempDir)
  vi.clearAllMocks()
})

afterEach(async () => {
  delete process.env.AIPM_PROJECT_DIR
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('GET /api/projects/[id]/features', () => {
  it('graph/features.json이 존재하면 200과 FeaturesSchema 형태 JSON을 반환한다', async () => {
    const projectId = path.basename(tempDir)
    const req = makeRequest('GET')
    const res = await GET(req, { params: Promise.resolve({ id: projectId }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.schemaVersion).toBe('1.0')
    expect(data.items).toHaveLength(1)
    expect(data.items[0].id).toBe('R-AAAAAA')
  })

  it('graph/features.json이 없으면 404를 반환한다', async () => {
    const projectId = path.basename(tempDir)
    await fs.rm(path.join(tempDir, 'graph', 'features.json'))
    const req = makeRequest('GET')
    const res = await GET(req, { params: Promise.resolve({ id: projectId }) })

    expect(res.status).toBe(404)
  })

  it('features.json이 스키마 검증에 실패하면 422를 반환한다', async () => {
    const projectId = path.basename(tempDir)
    // schemaVersion 없는 무효 데이터
    await fs.writeFile(
      path.join(tempDir, 'graph', 'features.json'),
      JSON.stringify({ invalid: true }, null, 2),
      'utf8'
    )
    const req = makeRequest('GET')
    const res = await GET(req, { params: Promise.resolve({ id: projectId }) })

    expect(res.status).toBe(422)
  })

  it('id에 ../ path traversal이 있으면 400을 반환한다', async () => {
    const req = makeRequest('GET')
    const res = await GET(req, { params: Promise.resolve({ id: '../../etc' }) })

    expect(res.status).toBe(400)
  })
})

describe('POST /api/projects/[id]/features', () => {
  it('유효한 features 페이로드를 받으면 200 + writeGraphFile + deriveDocs 호출한다', async () => {
    const projectId = path.basename(tempDir)
    const req = makeRequest('POST', { features: VALID_FEATURES })
    const res = await POST(req, { params: Promise.resolve({ id: projectId }) })

    expect(res.status).toBe(200)
    expect(writeGraphFile).toHaveBeenCalledOnce()
    expect(deriveDocs).toHaveBeenCalledOnce()
  })

  it('features 스키마 검증 실패 시 422를 반환한다', async () => {
    const projectId = path.basename(tempDir)
    const badFeatures = { schemaVersion: '2.0' } // 잘못된 버전
    const req = makeRequest('POST', { features: badFeatures })
    const res = await POST(req, { params: Promise.resolve({ id: projectId }) })

    expect(res.status).toBe(422)
  })

  it('writeGraphFile이 ELOCKED를 throw하면 423을 반환한다', async () => {
    const projectId = path.basename(tempDir)
    const elockedErr = Object.assign(new Error('locked'), { code: 'ELOCKED' })
    vi.mocked(writeGraphFile).mockRejectedValueOnce(elockedErr)

    const req = makeRequest('POST', { features: VALID_FEATURES })
    const res = await POST(req, { params: Promise.resolve({ id: projectId }) })

    expect(res.status).toBe(423)
  })

  it('ELOCKED 아닌 에러는 throw되어 500으로 이어진다 (Pitfall 7)', async () => {
    const projectId = path.basename(tempDir)
    const otherErr = Object.assign(new Error('disk error'), { code: 'EIO' })
    vi.mocked(writeGraphFile).mockRejectedValueOnce(otherErr)

    const req = makeRequest('POST', { features: VALID_FEATURES })
    // 500은 Next.js가 catch하므로 여기서는 throw 여부만 확인
    await expect(POST(req, { params: Promise.resolve({ id: projectId }) })).rejects.toThrow('disk error')
  })

  it('POST id에 ../ path traversal이 있으면 400을 반환한다', async () => {
    const req = makeRequest('POST', { features: VALID_FEATURES })
    const res = await POST(req, { params: Promise.resolve({ id: '../../etc' }) })

    expect(res.status).toBe(400)
  })
})
