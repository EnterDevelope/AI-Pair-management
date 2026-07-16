// ============================================================
// userflowStore 테스트 (04A-03-PLAN.md Task 1 TDD)
//
// RED 대상 (04A-03):
//   - filteredNodes: activeVersionId null → 전체 노드 반환
//   - filteredNodes: activeVersionId 설정 → 일치 + versionId 없는 노드 포함 (Pitfall 5)
//   - onNodesChange: applyNodeChanges 위임
// .todo() 대상 (04A-05 GREEN):
//   - createRevision, setActiveVersionId 버전 생성 관련
// ============================================================

import { describe, it, expect, beforeEach } from "vitest"
import type { Edge, Node, NodeChange } from "@xyflow/react"
import { useUserflowStore } from "@/stores/userflowStore"

// 테스트용 노드 픽스처
function makeNode(id: string, versionId?: string): Node {
  return {
    id,
    type: "page",
    position: { x: 0, y: 0 },
    data: versionId !== undefined ? { versionId } : {},
  }
}

function makeEdge(id: string, source: string, target: string, versionId?: string): Edge {
  return {
    id,
    source,
    target,
    data: versionId === undefined ? undefined : { versionId },
  }
}

describe("userflowStore — 필터 로직 (FLOW-03)", () => {
  beforeEach(() => {
    // 각 테스트 전 스토어 초기화
    useUserflowStore.setState({
      nodes: [],
      edges: [],
      selectedId: null,
      activeVersionId: null,
      versions: [],
      versionGroups: [],
      sectionBands: [],
      filteredNodes: [],
      filteredEdges: [],
    })
  })

  it("activeVersionId가 null이면 filteredNodes에 전체 노드가 포함된다", () => {
    const nodes = [
      makeNode("P-001", "v1"),
      makeNode("P-002", "v2"),
      makeNode("P-003"),
    ]
    useUserflowStore.getState().setNodes(nodes)
    // activeVersionId null → 전체 반환
    expect(useUserflowStore.getState().filteredNodes).toHaveLength(3)
  })

  it("setActiveVersionId로 버전 설정 시 일치하는 versionId 노드가 포함된다", () => {
    const nodes = [
      makeNode("P-001", "v1"),
      makeNode("P-002", "v2"),
    ]
    useUserflowStore.getState().setNodes(nodes)
    useUserflowStore.getState().setActiveVersionId("v1")

    const filtered = useUserflowStore.getState().filteredNodes
    const ids = filtered.map((n) => n.id)
    expect(ids).toContain("P-001")
    expect(ids).not.toContain("P-002")
  })

  it("versionId 없는 노드는 activeVersionId 설정 시에도 filteredNodes에 포함된다 (Pitfall 5)", () => {
    const nodes = [
      makeNode("P-001", "v1"),
      makeNode("S-001"),          // versionId 없음 — 항상 포함돼야 함
    ]
    useUserflowStore.getState().setNodes(nodes)
    useUserflowStore.getState().setActiveVersionId("v1")

    const filtered = useUserflowStore.getState().filteredNodes
    const ids = filtered.map((n) => n.id)
    expect(ids).toContain("P-001")
    expect(ids).toContain("S-001")
  })

  it("activeVersionId와 다른 versionId 노드는 필터에서 제외된다", () => {
    const nodes = [
      makeNode("P-001", "v1"),
      makeNode("P-002", "v2"),
      makeNode("S-001"),
    ]
    useUserflowStore.getState().setNodes(nodes)
    useUserflowStore.getState().setActiveVersionId("v1")

    const filtered = useUserflowStore.getState().filteredNodes
    expect(filtered.map((n) => n.id)).not.toContain("P-002")
  })

  it("activeVersionId와 다른 versionId 엣지는 필터에서 제외된다", () => {
    useUserflowStore.getState().setEdges([
      makeEdge("e-v1", "P-001", "P-002", "v1"),
      makeEdge("e-v2", "P-003", "P-004", "v2"),
      makeEdge("e-shared", "S-001", "P-001"),
    ])
    useUserflowStore.getState().setActiveVersionId("v1")

    expect(useUserflowStore.getState().filteredEdges.map((edge) => edge.id))
      .toEqual(["e-v1", "e-shared"])
  })

  it("onNodesChange가 applyNodeChanges를 통해 nodes를 업데이트한다", () => {
    const initialNodes = [makeNode("P-001", "v1")]
    useUserflowStore.getState().setNodes(initialNodes)

    // position 변경 이벤트
    const changes: NodeChange[] = [
      {
        type: "position",
        id: "P-001",
        position: { x: 100, y: 200 },
      },
    ]
    useUserflowStore.getState().onNodesChange(changes)

    const updated = useUserflowStore.getState().nodes.find((n) => n.id === "P-001")
    expect(updated?.position).toEqual({ x: 100, y: 200 })
  })
})

describe("userflowStore — 버전 리비전 생성 (FLOW-04)", () => {
  beforeEach(() => {
    useUserflowStore.setState({
      nodes: [],
      edges: [],
      selectedId: null,
      activeVersionId: null,
      versions: [],
      versionGroups: [],
      sectionBands: [],
      filteredNodes: [],
      filteredEdges: [],
    })
  })

  it("createRevision(baseVersionId)가 모든 노드를 새 versionId로 복제한다", () => {
    // baseVersionId 노드 2개 + versionId 없는 공용 노드 1개 세팅
    const baseId = "P-V0001"
    const nodes = [
      makeNode("P-001", baseId),
      makeNode("P-002", baseId),
      makeNode("S-001"),  // versionId 없는 공용 노드
    ]
    useUserflowStore.getState().setNodes(nodes)
    useUserflowStore.getState().setVersions([{ id: baseId, label: "기본" }])

    // createRevision은 baseVersionId 노드(P-001, P-002)를 새 versionId로 복제
    const newVersionId = useUserflowStore.getState().createRevision(baseId, "수정본 1")

    const allNodes = useUserflowStore.getState().nodes
    // 원본 2 + 복제 2 + 공용 1 = 5
    expect(allNodes).toHaveLength(5)
    // 새 versionId 노드가 2개 존재
    const clones = allNodes.filter(
      (n) => (n.data as { versionId?: string }).versionId === newVersionId
    )
    expect(clones).toHaveLength(2)
  })

  it("복제된 노드의 versionId는 baseVersionId와 다르다", () => {
    const baseId = "P-V0001"
    useUserflowStore.getState().setNodes([makeNode("P-001", baseId)])
    useUserflowStore.getState().setVersions([{ id: baseId, label: "기본" }])

    const newVersionId = useUserflowStore.getState().createRevision(baseId, "수정본 1")

    // 새 versionId는 baseId와 달라야 한다
    expect(newVersionId).not.toBe(baseId)

    // 원본 노드의 versionId는 그대로 baseId
    const original = useUserflowStore.getState().nodes.find((n) => n.id === "P-001")
    expect((original?.data as { versionId?: string }).versionId).toBe(baseId)
  })

  it("복제된 엣지는 복제 노드 ID를 가리키고 새 버전 그룹에 포함된다", () => {
    const baseId = "P-V0001"
    useUserflowStore.getState().setNodes([
      makeNode("P-001", baseId),
      makeNode("P-002", baseId),
    ])
    useUserflowStore.getState().setEdges([makeEdge("e1", "P-001", "P-002", baseId)])
    useUserflowStore.getState().setVersions([{ id: baseId, label: "기본" }])
    useUserflowStore.getState().setVersionGroups([
      { id: "P-GROUP1", label: "기본 그룹", versionIds: [baseId] },
    ])

    const newVersionId = useUserflowStore.getState().createRevision(baseId, "수정본")
    const state = useUserflowStore.getState()
    const clonedNodeIds = new Set(
      state.nodes
        .filter((node) => (node.data as { versionId?: string }).versionId === newVersionId)
        .map((node) => node.id)
    )
    const clonedEdge = state.edges.find(
      (edge) => (edge.data as { versionId?: string } | undefined)?.versionId === newVersionId
    )

    expect(clonedEdge).toBeDefined()
    expect(clonedNodeIds.has(clonedEdge?.source ?? '')).toBe(true)
    expect(clonedNodeIds.has(clonedEdge?.target ?? '')).toBe(true)
    for (const node of state.nodes.filter((item) => clonedNodeIds.has(item.id))) {
      expect(node.data.id).toBe(node.id)
    }
    expect(state.versionGroups[0].versionIds).toContain(newVersionId)
  })

  it("setActiveVersionId(versionId) 호출 시 다른 versionId 노드가 필터된다", () => {
    const baseId = "P-V0001"
    useUserflowStore.getState().setNodes([
      makeNode("P-001", baseId),
      makeNode("P-002", "P-OTHER"),
    ])
    useUserflowStore.getState().setActiveVersionId(baseId)

    const ids = useUserflowStore.getState().filteredNodes.map((n) => n.id)
    expect(ids).toContain("P-001")
    expect(ids).not.toContain("P-002")
  })

  it("activeVersion 노드만 React Flow nodes 배열에 포함된다", () => {
    const baseId = "P-V0001"
    useUserflowStore.getState().setNodes([makeNode("P-001", baseId)])
    useUserflowStore.getState().setVersions([{ id: baseId, label: "기본" }])

    const newVersionId = useUserflowStore.getState().createRevision(baseId, "수정본 1")
    // 새 버전으로 전환
    useUserflowStore.getState().setActiveVersionId(newVersionId)

    const filtered = useUserflowStore.getState().filteredNodes
    // 복제본만 포함 (원본 P-001은 baseId 소속이므로 제외)
    expect(filtered.every((n) => {
      const vId = (n.data as { versionId?: string }).versionId
      return vId == null || vId === newVersionId
    })).toBe(true)
    expect(filtered.some((n) => {
      const vId = (n.data as { versionId?: string }).versionId
      return vId === baseId
    })).toBe(false)
  })
})
