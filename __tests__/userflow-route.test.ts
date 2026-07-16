// ============================================================
// userflow-route 테스트 (04A-04-PLAN.md Task 1 TDD)
// RED: 04A-04 test 커밋 — route 파일 없음 → 전부 실패해야 한다
// GREEN: 04A-04 feat 커밋 — route 구현 후 통과
// ============================================================
// 검증 대상: GET/POST/PATCH /api/projects/[id]/userflow
//   - GET: 파일 있음 → 200, 없음 → 404
//   - POST/PATCH: Zod(UserflowSchema) 검증 → atomic-write → deriveDocs → 200
//   - PATCH: 개별 노드/엣지 부분 업데이트 지원
//   - ELOCKED 시 423, 그 외 에러 → throw(500), path traversal → 400
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

// Next.js Route Handler를 직접 임포트해 테스트한다
// (route 파일이 없으면 import 실패 → RED 단계에서 전부 실패)
// 주의: vitest @= src/ 이므로 app/ 라우트는 상대 경로 사용
import { GET, POST, PATCH } from "../app/api/projects/[id]/userflow/route"

// ============================================================
// 공통 픽스처
// ============================================================
const VALID_USERFLOW = {
  schemaVersion: "1.0" as const,
  nodes: [
    { type: "start" as const, id: "n1", label: "시작" },
    { type: "page" as const, id: "n2", label: "홈" },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
}

let tmpDir: string

// deriveDocs는 파일시스템 부작용이 있으므로 모킹
// vi.mock 경로는 route가 사용하는 실제 모듈 ID와 일치해야 함
// route.ts에서 '../../../scripts/doc-deriver' → 절대경로로 해석됨
// vitest는 moduleId를 resolve된 절대경로로 비교하므로, 여기서도 같은 모듈을 가리키면 됨
vi.mock("../scripts/doc-deriver", () => ({
  deriveDocs: vi.fn().mockResolvedValue(undefined),
}))

// writeGraphFile도 모킹 — 실제 atomic write 없이 동작 검증
vi.mock("@/lib/atomic-write", () => ({
  writeGraphFile: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aipm-userflow-test-"))
  await fs.mkdir(path.join(tmpDir, "graph"), { recursive: true })
  process.env.AIPM_PROJECT_DIR = path.dirname(tmpDir)
  vi.clearAllMocks()
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  delete process.env.AIPM_PROJECT_DIR
})

// 테스트용 params Promise 팩토리
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

// ============================================================
// GET /api/projects/[id]/userflow
// ============================================================
describe("userflow-route — GET /api/projects/[id]/userflow", () => {
  it("userflow.json 존재 시 파일 내용을 200으로 반환한다", async () => {
    const projectName = path.basename(tmpDir)
    const userflowPath = path.join(tmpDir, "graph", "userflow.json")
    await fs.writeFile(userflowPath, JSON.stringify(VALID_USERFLOW), "utf8")

    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow")
    const res = await GET(req, makeParams(projectName))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.schemaVersion).toBe("1.0")
    expect(body.nodes).toHaveLength(2)
  })

  it("userflow.json 없으면 404를 반환한다", async () => {
    const projectName = path.basename(tmpDir)

    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow")
    const res = await GET(req, makeParams(projectName))

    expect(res.status).toBe(404)
  })

  it("path traversal id('../etc') 는 400을 반환한다", async () => {
    const req = new Request("http://localhost/api/projects/../etc/userflow")
    const res = await GET(req, makeParams("../etc"))

    expect(res.status).toBe(400)
  })
})

// ============================================================
// POST /api/projects/[id]/userflow
// ============================================================
describe("userflow-route — POST /api/projects/[id]/userflow", () => {
  it("유효한 userflow 페이로드 POST 시 userflow.json에 저장되고 200을 반환한다", async () => {
    const { writeGraphFile } = await import("@/lib/atomic-write")
    const { deriveDocs } = await import("../scripts/doc-deriver")

    const projectName = path.basename(tmpDir)
    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userflow: VALID_USERFLOW }),
    })

    const res = await POST(req, makeParams(projectName))

    expect(res.status).toBe(200)
    expect(writeGraphFile).toHaveBeenCalledOnce()
    expect(deriveDocs).toHaveBeenCalledOnce()
  })

  it("UserflowSchema 검증 실패 시 400 또는 422를 반환한다", async () => {
    const projectName = path.basename(tmpDir)
    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userflow: { schemaVersion: "9.9", nodes: "not-array" } }),
    })

    const res = await POST(req, makeParams(projectName))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })

  it("ELOCKED(파일 잠금) 상태 시 423을 반환한다", async () => {
    const { writeGraphFile } = await import("@/lib/atomic-write")
    vi.mocked(writeGraphFile).mockRejectedValueOnce(
      Object.assign(new Error("file locked"), { code: "ELOCKED" })
    )

    const projectName = path.basename(tmpDir)
    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userflow: VALID_USERFLOW }),
    })

    const res = await POST(req, makeParams(projectName))

    expect(res.status).toBe(423)
  })

  it("ELOCKED 외 에러는 500으로 throw된다", async () => {
    const { writeGraphFile } = await import("@/lib/atomic-write")
    vi.mocked(writeGraphFile).mockRejectedValueOnce(new Error("disk full"))

    const projectName = path.basename(tmpDir)
    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userflow: VALID_USERFLOW }),
    })

    await expect(POST(req, makeParams(projectName))).rejects.toThrow("disk full")
  })
})

// ============================================================
// PATCH /api/projects/[id]/userflow
// ============================================================
describe("userflow-route — PATCH /api/projects/[id]/userflow", () => {
  it("노드 label PATCH 시 파일에 반영되고 200을 반환한다", async () => {
    const { writeGraphFile } = await import("@/lib/atomic-write")
    const { deriveDocs } = await import("../scripts/doc-deriver")

    const projectName = path.basename(tmpDir)
    const userflowPath = path.join(tmpDir, "graph", "userflow.json")
    await fs.writeFile(userflowPath, JSON.stringify(VALID_USERFLOW), "utf8")

    const patch = {
      nodes: [{ id: "n2", label: "홈 (수정)" }],
    }

    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })

    const res = await PATCH(req, makeParams(projectName))

    expect(res.status).toBe(200)
    expect(writeGraphFile).toHaveBeenCalledOnce()
    expect(deriveDocs).toHaveBeenCalledOnce()
  })

  it("엣지 추가 PATCH 시 기존 엣지 보존되고 새 엣지 추가된다", async () => {
    const { writeGraphFile } = await import("@/lib/atomic-write")

    const projectName = path.basename(tmpDir)
    const userflowPath = path.join(tmpDir, "graph", "userflow.json")
    await fs.writeFile(userflowPath, JSON.stringify(VALID_USERFLOW), "utf8")

    const patch = {
      edges: [{ id: "e2", source: "n2", target: "n1" }],
    }

    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })

    const res = await PATCH(req, makeParams(projectName))

    expect(res.status).toBe(200)
    // writeGraphFile에 전달된 데이터에 기존 엣지 + 새 엣지가 모두 있는지 확인
    const writtenData = vi.mocked(writeGraphFile).mock.calls[0][1] as { edges?: unknown[] }
    expect(writtenData.edges).toHaveLength(2)
  })

  it("deletedNodeIds/deletedEdgeIds PATCH 시 지정 항목만 실제 파일에서 제거한다", async () => {
    const { writeGraphFile } = await import("@/lib/atomic-write")
    const projectName = path.basename(tmpDir)
    await fs.writeFile(
      path.join(tmpDir, "graph", "userflow.json"),
      JSON.stringify(VALID_USERFLOW),
      "utf8"
    )
    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deletedNodeIds: ["n2"], deletedEdgeIds: ["e1"] }),
    })

    const res = await PATCH(req, makeParams(projectName))
    const written = vi.mocked(writeGraphFile).mock.calls[0][1] as {
      nodes: Array<{ id?: string }>
      edges: Array<{ id?: string }>
    }
    expect(res.status).toBe(200)
    expect(written.nodes.map((node) => node.id)).toEqual(["n1"])
    expect(written.edges).toEqual([])
  })

  it("PATCH body 타입이 잘못되면 422를 반환한다", async () => {
    const projectName = path.basename(tmpDir)
    await fs.writeFile(
      path.join(tmpDir, "graph", "userflow.json"),
      JSON.stringify(VALID_USERFLOW),
      "utf8"
    )
    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: "not-an-array" }),
    })

    const res = await PATCH(req, makeParams(projectName))
    expect(res.status).toBe(422)
  })

  it("PATCH — userflow.json 없으면 404를 반환한다", async () => {
    const projectName = path.basename(tmpDir)
    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: [] }),
    })

    const res = await PATCH(req, makeParams(projectName))

    expect(res.status).toBe(404)
  })

  it("PATCH — ELOCKED 시 423을 반환한다", async () => {
    const { writeGraphFile } = await import("@/lib/atomic-write")
    vi.mocked(writeGraphFile).mockRejectedValueOnce(
      Object.assign(new Error("file locked"), { code: "ELOCKED" })
    )

    const projectName = path.basename(tmpDir)
    const userflowPath = path.join(tmpDir, "graph", "userflow.json")
    await fs.writeFile(userflowPath, JSON.stringify(VALID_USERFLOW), "utf8")

    const req = new Request("http://localhost/api/projects/" + projectName + "/userflow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: [{ id: "n1", label: "수정" }] }),
    })

    const res = await PATCH(req, makeParams(projectName))

    expect(res.status).toBe(423)
  })
})
