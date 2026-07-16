// 유저플로우 다이어그램 공유 Zustand 스토어 (04A-03-PLAN.md Task 1)
//
// 불변 업데이트 원칙: 모든 setter는 set({ ... }) (CLAUDE.md immutability rule)
// nodeTypes/edgeTypes는 이 파일에 두지 않음 (캔버스 컴포넌트 모듈 스코프 — Pitfall 2)
//
// Pitfall 5: filteredNodes rederive 시 versionId 없는 노드는 activeVersionId 설정
//            여부와 무관하게 항상 포함 (섹션 노드 등)

import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { Node, Edge, OnNodesChange, OnEdgesChange } from '@xyflow/react'

import type { Userflow } from '@/schemas/graph/userflow'
import type { SectionBand } from '@/lib/dagre-layout'
import { generateId } from '@/lib/id'

// Userflow 스키마에서 타입 추출
type VersionItem = NonNullable<Userflow['versions']>[number]
type VersionGroupItem = NonNullable<Userflow['versionGroups']>[number]

// Pitfall 5: versionId 없거나 null인 노드는 항상 포함 (섹션·액션 노드 공용)
function rederive(nodes: Node[], activeVersionId: string | null): Node[] {
  if (activeVersionId == null) return nodes
  return nodes.filter((n) => {
    const vId = (n.data as { versionId?: string }).versionId
    return vId == null || vId === activeVersionId
  })
}

function rederiveEdges(edges: Edge[], activeVersionId: string | null): Edge[] {
  if (activeVersionId == null) return edges
  return edges.filter((edge) => {
    const versionId = (edge.data as { versionId?: string } | undefined)?.versionId
    return versionId == null || versionId === activeVersionId
  })
}

interface UserflowState {
  nodes: Node[]
  edges: Edge[]
  selectedId: string | null
  activeVersionId: string | null
  versions: VersionItem[]
  versionGroups: VersionGroupItem[]
  sectionBands: SectionBand[]
  // 파생 상태: activeVersionId 기반 필터 결과
  filteredNodes: Node[]
  filteredEdges: Edge[]
}

interface UserflowActions {
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  setSelectedId: (id: string | null) => void
  setActiveVersionId: (versionId: string | null) => void
  setVersions: (versions: VersionItem[]) => void
  setVersionGroups: (groups: VersionGroupItem[]) => void
  setSectionBands: (bands: SectionBand[]) => void
  // React Flow controlled 모드 필수 핸들러 — dimension 변경이 이 경로로 사용자 노드에
  // 반영되어야 useNodesInitialized()가 true가 된다 (없으면 영원히 false)
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  // 버전 관리 액션 (D-07, D-08, FLOW-04)
  // createVersionGroup: 새 버전 그룹과 첫 번째 버전을 생성하고 activeVersionId를 설정한다.
  // returns: 새 버전 그룹 ID
  createVersionGroup: (label: string) => string
  // createRevision: baseVersionId 노드·엣지를 새 versionId로 전체 복제(full clone, NOT diff).
  // 원본 노드 versionId 불변 (무손실). 새 version을 versions 배열에 추가하고 activeVersionId를 전환.
  // returns: 새 버전 ID
  createRevision: (baseVersionId: string, label: string) => string
}

export const useUserflowStore = create<UserflowState & UserflowActions>((set, get) => ({
  // 초기 상태
  nodes: [],
  edges: [],
  selectedId: null,
  activeVersionId: null,
  versions: [],
  versionGroups: [],
  sectionBands: [],
  filteredNodes: [],
  filteredEdges: [],

  // 불변 setter (CLAUDE.md: never mutate)
  // setNodes: nodes 교체 + filteredNodes 재계산
  setNodes: (nodes) => {
    const { activeVersionId, edges } = get()
    set({
      nodes,
      filteredNodes: rederive(nodes, activeVersionId),
      filteredEdges: rederiveEdges(edges, activeVersionId),
    })
  },

  setEdges: (edges) => {
    set({ edges, filteredEdges: rederiveEdges(edges, get().activeVersionId) })
  },

  setSelectedId: (selectedId) => set({ selectedId }),

  // setActiveVersionId: filteredNodes/filteredEdges 재계산
  setActiveVersionId: (activeVersionId) => {
    const { nodes, edges } = get()
    set({
      activeVersionId,
      filteredNodes: rederive(nodes, activeVersionId),
      filteredEdges: rederiveEdges(edges, activeVersionId),
    })
  },

  setVersions: (versions) => set({ versions }),

  setVersionGroups: (versionGroups) => set({ versionGroups }),

  setSectionBands: (sectionBands) => set({ sectionBands }),

  // React Flow controlled 모드 핸들러 — filteredNodes 재계산 포함
  onNodesChange: (changes) => {
    const updated = applyNodeChanges(changes, get().nodes)
    const { activeVersionId } = get()
    set({
      nodes: updated,
      filteredNodes: rederive(updated, activeVersionId),
    })
  },

  onEdgesChange: (changes) => {
    const updated = applyEdgeChanges(changes, get().edges)
    set({ edges: updated, filteredEdges: rederiveEdges(updated, get().activeVersionId) })
  },

  // createVersionGroup: 새 버전 그룹 + 첫 버전 생성. activeVersionId를 첫 버전으로 설정.
  // D-07: 단일 파일 내 versionId 태그 방식. D-08: 웹 버튼이 버전 생성 담당.
  createVersionGroup: (label: string) => {
    const { nodes, edges, versions, versionGroups } = get()
    // 기존 ID 집합으로 충돌 방지
    const existingIds = new Set([
      ...versions.map((v) => v.id ?? ''),
      ...versionGroups.map((g) => g.id ?? ''),
      ...nodes.map((n) => n.id),
    ])
    const versionId = generateId('P', existingIds)
    existingIds.add(versionId)
    const groupId = generateId('P', existingIds)

    const newVersion: VersionItem = { id: versionId, label }
    const newGroup: VersionGroupItem = { id: groupId, label, versionIds: [versionId] }

    // 기존 노드에 versionId 없으면 이 그룹의 첫 버전으로 태그 (초기 상태 대응)
    // 이미 versionId 있는 노드는 건드리지 않음 (immutability)
    const taggedNodes = nodes.map((n) => {
      const vId = (n.data as { versionId?: string }).versionId
      if (vId == null) {
        return { ...n, data: { ...n.data, versionId } }
      }
      return n
    })
    const taggedEdges = edges.map((e) => {
      const vId = (e.data as { versionId?: string } | undefined)?.versionId
      if (vId == null) {
        return { ...e, data: { ...(e.data ?? {}), versionId } }
      }
      return e
    })

    set({
      nodes: taggedNodes,
      edges: taggedEdges,
      versions: [...versions, newVersion],
      versionGroups: [...versionGroups, newGroup],
      activeVersionId: versionId,
      filteredNodes: rederive(taggedNodes, versionId),
      filteredEdges: rederiveEdges(taggedEdges, versionId),
    })

    return groupId
  },

  // createRevision: baseVersionId 노드를 새 versionId로 전체 복제 (full clone, NOT diff).
  // 원본 노드 versionId 절대 변경 금지 (무손실). 복제본은 새 id + 새 versionId.
  // D-07: 모든 버전이 단일 store nodes/edges에 공존.
  createRevision: (baseVersionId: string, label: string) => {
    const { nodes, edges, versions, versionGroups } = get()
    const existingIds = new Set([
      ...nodes.map((n) => n.id),
      ...versions.map((version) => version.id ?? ''),
      ...versionGroups.map((group) => group.id ?? ''),
    ])
    const newVersionId = generateId('P', existingIds)
    existingIds.add(newVersionId)
    const nodeIdMap = new Map<string, string>()

    // baseVersionId 노드만 복제 (versionId가 baseVersionId인 노드)
    const clonedNodes = nodes
      .filter((n) => (n.data as { versionId?: string }).versionId === baseVersionId)
      .map((n) => {
        const cloneId = generateId('P', existingIds)
        existingIds.add(cloneId)
        nodeIdMap.set(n.id, cloneId)
        return {
          ...n,
          id: cloneId,
          data: { ...n.data, id: cloneId, versionId: newVersionId },
        }
      })

    // baseVersionId 엣지 복제 (엣지 data에 versionId 있는 경우)
    const existingEdgeIds = new Set(edges.map((edge) => edge.id))
    const clonedEdges = edges
      .filter((e) => (e.data as { versionId?: string } | undefined)?.versionId === baseVersionId)
      .map((e) => {
        const edgeIdBase = `${e.id}-rev-${newVersionId.slice(-6)}`
        let cloneEdgeId = edgeIdBase
        let suffix = 2
        while (existingEdgeIds.has(cloneEdgeId)) cloneEdgeId = `${edgeIdBase}-${suffix++}`
        existingEdgeIds.add(cloneEdgeId)
        return {
          ...e,
          id: cloneEdgeId,
          source: nodeIdMap.get(e.source) ?? e.source,
          target: nodeIdMap.get(e.target) ?? e.target,
          data: { ...(e.data ?? {}), versionId: newVersionId },
        }
      })

    const newVersion: VersionItem = { id: newVersionId, label }

    // 현재 활성 버전 그룹에 새 버전 ID 추가 (없으면 그냥 versions에만 추가)
    const updatedGroups = versionGroups.map((g) => {
      const ids = g.versionIds ?? []
      if (ids.includes(baseVersionId)) {
        return { ...g, versionIds: [...ids, newVersionId] }
      }
      return g
    })

    const allNodes = [...nodes, ...clonedNodes]
    const allEdges = [...edges, ...clonedEdges]

    set({
      nodes: allNodes,
      edges: allEdges,
      versions: [...versions, newVersion],
      versionGroups: updatedGroups,
      activeVersionId: newVersionId,
      filteredNodes: rederive(allNodes, newVersionId),
      filteredEdges: rederiveEdges(allEdges, newVersionId),
    })

    return newVersionId
  },
}))
