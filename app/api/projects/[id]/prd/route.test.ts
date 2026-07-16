import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

// route 핸들러를 직접 import해 테스트 (Next.js request/response 모킹)
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

const VALID_PRD = {
  schemaVersion: '1.0' as const,
  id: 'R-AAAAAA',
  title: '테스트 제품',
  description: '테스트 설명',
}

let tempDir: string

function makeRequest(method: string, body?: unknown): Request {
  if (method === 'GET') {
    return new Request('http://localhost/api/projects/test/prd')
  }
  return new Request('http://localhost/api/projects/test/prd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aipm-test-'))
  await fs.mkdir(path.join(tempDir, 'graph'), { recursive: true })
  await fs.writeFile(
    path.join(tempDir, 'graph', 'prd.json'),
    JSON.stringify(VALID_PRD, null, 2) + '\n',
    'utf8'
  )
  // 환경변수로 프로젝트 디렉토리를 tempDir로 설정
  process.env.AIPM_PROJECT_DIR = path.dirname(tempDir)
  vi.clearAllMocks()
})

afterEach(async () => {
  delete process.env.AIPM_PROJECT_DIR
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('GET /api/projects/[id]/prd', () => {
  it('graph/prd.json이 존재하면 200과 PrdSchema 형태 JSON을 반환한다', async () => {
    const projectId = path.basename(tempDir)
    const req = makeRequest('GET')
    const res = await GET(req, { params: Promise.resolve({ id: projectId }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.schemaVersion).toBe('1.0')
    expect(data.id).toBe('R-AAAAAA')
  })

  it('graph/prd.json이 없으면 404를 반환한다', async () => {
    const projectId = path.basename(tempDir)
    await fs.rm(path.join(tempDir, 'graph', 'prd.json'))
    const req = makeRequest('GET')
    const res = await GET(req, { params: Promise.resolve({ id: projectId }) })

    expect(res.status).toBe(404)
  })
})

describe('POST /api/projects/[id]/prd', () => {
  it('유효한 PRD 페이로드를 받으면 200 + writeGraphFile + deriveDocs 호출한다', async () => {
    const projectId = path.basename(tempDir)
    const req = makeRequest('POST', { prd: VALID_PRD })
    const res = await POST(req, { params: Promise.resolve({ id: projectId }) })

    expect(res.status).toBe(200)
    expect(writeGraphFile).toHaveBeenCalledOnce()
    expect(deriveDocs).toHaveBeenCalledOnce()
  })

  it('writeGraphFile이 ELOCKED를 throw하면 423을 반환한다', async () => {
    const projectId = path.basename(tempDir)
    const elockedErr = Object.assign(new Error('locked'), { code: 'ELOCKED' })
    vi.mocked(writeGraphFile).mockRejectedValueOnce(elockedErr)

    const req = makeRequest('POST', { prd: VALID_PRD })
    const res = await POST(req, { params: Promise.resolve({ id: projectId }) })

    expect(res.status).toBe(423)
  })

  it('Zod 검증 실패(id 형식 오류) 시 400 + fieldErrors를 반환한다', async () => {
    const projectId = path.basename(tempDir)
    const badPrd = { ...VALID_PRD, id: 'invalid-id' }
    const req = makeRequest('POST', { prd: badPrd })
    const res = await POST(req, { params: Promise.resolve({ id: projectId }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.fieldErrors).toBeDefined()
  })

  it('id에 ../ path traversal이 있으면 거부한다', async () => {
    const req = makeRequest('POST', { prd: VALID_PRD })
    const res = await POST(req, { params: Promise.resolve({ id: '../../etc' }) })

    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
