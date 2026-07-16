// 기능명세 3뷰 공유 Zustand 스토어 (03-03-PLAN.md Task 2)
//
// 불변 업데이트 원칙: 모든 setter는 set({ ... }) (CLAUDE.md immutability rule)
// nodeTypes/edgeTypes는 이 파일에 두지 않음 (트리 컴포넌트 모듈 스코프 — D-09)

import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { Node, Edge, OnNodesChange, OnEdgesChange } from '@xyflow/react'

import type { Features } from '@/schemas/graph/features'

// features.json items 배열 요소 타입을 Features에서 추출
type FeatureItem = NonNullable<Features['items']>[number]

// D-09 기본 진입 뷰: 트리
export type ViewTab = 'tree' | 'directory' | 'document'

interface FeaturesState {
  items: FeatureItem[]
  selectedId: string | null
  view: ViewTab
  nodes: Node[]
  edges: Edge[]
}

interface FeaturesActions {
  setItems: (items: FeatureItem[]) => void
  setSelectedId: (id: string | null) => void
  setView: (view: ViewTab) => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  // React Flow controlled 모드 필수 핸들러 — dimension 변경이 이 경로로 사용자 노드에
  // 반영되어야 useNodesInitialized()가 true가 된다 (없으면 영원히 false)
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
}

export const useFeaturesStore = create<FeaturesState & FeaturesActions>((set, get) => ({
  // 초기 상태
  items: [],
  selectedId: null,
  view: 'tree', // D-09: 기본 진입 뷰
  nodes: [],
  edges: [],

  // 불변 setter (CLAUDE.md: never mutate)
  setItems: (items) => set({ items }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setView: (view) => set({ view }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
}))
