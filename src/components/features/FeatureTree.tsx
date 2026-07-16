'use client'
// FeatureTree — React Flow 트리 캔버스 실구현 (03-04-PLAN.md Task 3)
//
// 핵심 규칙 (CLAUDE.md + RESEARCH.md):
//   1. nodeTypes는 이 컴포넌트 바깥 모듈 스코프에 정의 (Pitfall 2 — 내부 정의 시 리렌더마다 재생성 → 50+ 노드 폭주)
//   2. node.measured?.width/height 사용 — v12 breaking: measured 없이 직접 크기 접근 금지
//   3. useNodesInitialized 게이트 → runDagreLayout → opacity 1 (Pitfall 3 — layoutDone 가드 필수)
//
// 플로우: items → nodes(opacity-0) → nodesInitialized 트리거 → Dagre 실행 → opacity-1 (200ms)

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesInitialized,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useFeaturesStore } from '@/stores/featuresStore'
import { runDagreLayout } from '@/lib/dagre-layout'
import { FeatureNode } from '@/components/features/FeatureNode'
import { DetailPanel } from '@/components/features/DetailPanel'
import type { DetailPanelItem } from '@/components/features/DetailPanel'

// ============================================================
// nodeTypes: 반드시 모듈 스코프 (컴포넌트 내부 정의 금지 — Pitfall 2)
// ============================================================
const nodeTypes = {
  reqNode: FeatureNode,
  featNode: FeatureNode,
  specNode: FeatureNode,
}

// ID prefix → React Flow node type 매핑
function getNodeType(id: string): 'reqNode' | 'featNode' | 'specNode' {
  const prefix = id.charAt(0).toUpperCase()
  if (prefix === 'R') return 'reqNode'
  if (prefix === 'F') return 'featNode'
  return 'specNode'
}

// ID prefix → 레벨 레이블
function getLevel(id: string): 'R' | 'F' | 'S' {
  const prefix = id.charAt(0).toUpperCase()
  if (prefix === 'R') return 'R'
  if (prefix === 'F') return 'F'
  return 'S'
}

// ============================================================
// 내부 캔버스 컴포넌트 (ReactFlowProvider 내부에서 useReactFlow 사용)
// ============================================================
function FeatureTreeCanvas({ projectId }: { projectId: string }) {
  const { fitView, getNodes } = useReactFlow()
  const {
    items, nodes, edges, selectedId,
    setNodes, setEdges, setSelectedId, setItems,
    onNodesChange, onEdgesChange,
  } = useFeaturesStore()

  // 인라인 토스트 (04B-04 Task 2)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  const [layoutDone, setLayoutDone] = useState(false)
  const nodesInitialized = useNodesInitialized()

  // 저장 중 중복 방지 (FeatureDirectory와 동일 패턴)
  const savingRef = useRef(false)

  // 트리 뷰 편집·삭제·추가를 디스크에 영속화 — Zustand만 갱신하면
  // 리로드 시 전부 유실된다 (CR-01/CR-02). 성공 시에만 스토어 반영.
  const saveItems = useCallback(
    async (updatedItems: typeof items) => {
      if (savingRef.current) return
      savingRef.current = true
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/features`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              features: { schemaVersion: '1.0', items: updatedItems },
            }),
          }
        )
        if (!res.ok) {
          throw new Error(`저장 실패: ${res.status}`)
        }
        setItems(updatedItems)
      } catch (err) {
        console.error('[FeatureTree] features.json 저장 실패:', err)
        throw err
      } finally {
        savingRef.current = false
      }
    },
    [projectId, setItems]
  )

  // items 변경 시 nodes/edges 재생성 (opacity-0으로 시작)
  useEffect(() => {
    const newNodes: Node[] = items.map((item) => ({
      id: item.id,
      type: getNodeType(item.id),
      position: { x: 0, y: 0 },
      data: {
        id: item.id,
        title: item.title ?? '',
        level: getLevel(item.id),
        status: item.status ?? 'todo',
        selected: item.id === selectedId,
        onAddChild: (parentId: string) => handleAddChild(parentId),
        onDelete: (id: string) => handleDeleteNode(id),
      },
      style: { opacity: 0 },
    }))

    const newEdges: Edge[] = items
      .filter((item) => item.parent)
      .map((item) => ({
        id: `${item.parent}->${item.id}`,
        source: item.parent!,
        target: item.id,
        // --color-border(명도 ~9%)는 다크 배경에서 1px 선이 보이지 않는다 —
        // 위계 연결은 의미 전달 요소이므로 text-muted 명도로 렌더
        style: { stroke: 'var(--color-text-muted)', strokeWidth: 1.5, opacity: 0.6 },
      }))

    setNodes(newNodes)
    setEdges(newEdges)
    setLayoutDone(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  // nodesInitialized 게이트 → Dagre 실행 → opacity-1 (Pitfall 3: layoutDone 가드 필수)
  // getNodes()로 React Flow 내부 nodes(measured 포함) 사용 — Zustand nodes에는 measured 없음
  useEffect(() => {
    if (!nodesInitialized || layoutDone) return

    // React Flow 내부에서 measured가 채워진 최신 노드 목록을 가져온다
    const rfNodes = getNodes()
    if (rfNodes.length === 0) return

    const result = runDagreLayout(rfNodes, edges)
    const layoutedNodes = result.nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        opacity: 1,
        transition: 'opacity 200ms ease',
      },
    }))

    setNodes(layoutedNodes)
    setEdges(result.edges)
    setLayoutDone(true)

    // fitView는 레이아웃 완료 후
    requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 200 })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesInitialized, layoutDone])

  // 자식 추가: 신규 F or S 항목 생성
  const handleAddChild = useCallback(
    (parentId: string) => {
      const prefix = parentId.charAt(0).toUpperCase()
      const childPrefix = prefix === 'R' ? 'F' : 'S'
      const timestamp = Date.now().toString(36).toUpperCase().slice(-6).padStart(6, '0')
      const newId = `${childPrefix}-${timestamp}`
      const newItem = {
        id: newId,
        title: '',
        status: 'todo' as const,
        parent: parentId,
      }
      const updatedItems = [...items, newItem]
      void saveItems(updatedItems).catch(() => undefined) // 실패는 saveItems에서 로깅됨
      setSelectedId(newId)
    },
    [items, saveItems, setSelectedId]
  )

  // 삭제: 자식 항목 parent 필드를 null로 → Unlinked (D-15: 자동 삭제 금지)
  const handleDeleteNode = useCallback(
    (id: string) => {
      const updatedItems = items
        .filter((item) => item.id !== id)
        .map((item) =>
          item.parent === id ? { ...item, parent: undefined } : item
        )
      void saveItems(updatedItems).catch(() => undefined) // 실패는 saveItems에서 로깅됨
      if (selectedId === id) setSelectedId(null)
    },
    [items, saveItems, selectedId, setSelectedId]
  )

  // DetailPanel에 넘길 현재 선택 항목
  const selectedItem: DetailPanelItem | null =
    selectedId
      ? (items.find((i) => i.id === selectedId) as DetailPanelItem | undefined) ?? null
      : null

  // DetailPanel 저장
  const handlePanelSave = useCallback(
    async (updated: DetailPanelItem) => {
      const updatedItems = items.map((item) =>
        item.id === updated.id ? { ...item, ...updated } : item
      )
      await saveItems(updatedItems)
    },
    [items, saveItems]
  )

  // AI 수정요청 큐 등록 (04B-04 Task 2)
  const handleAiRequest = useCallback(
    async (item: DetailPanelItem, instruction: string) => {
      const requestId = crypto.randomUUID()
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/queue`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schemaVersion: '1.0',
            requestId,
            targetArtifact: 'features',
            targetId: item.id,
            instruction,
            createdAt: new Date().toISOString(),
          }),
        }
      )
      if (!res.ok) throw new Error(`큐 등록 실패: ${res.status}`)
      showToast('/aipm apply 로 수정사항을 적용할 수 있어요.')
    },
    [projectId]
  )

  // 노드 selected 상태 반영. 실제로 바뀐 노드만 교체해 measured/layout을 보존한다.
  useEffect(() => {
    setNodes(
      nodes.map((n) => {
        const nextSelected = n.id === selectedId
        if (n.data.selected === nextSelected) return n
        return { ...n, data: { ...n.data, selected: nextSelected } }
      })
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          기능 항목이 없습니다. /aipm features로 생성하세요.
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        colorMode="dark"
        fitView
        style={{ background: 'var(--color-background)' }}
        onNodeClick={(_evt, node) => setSelectedId(node.id)}
        onPaneClick={() => setSelectedId(null)}
      >
        <Background color="var(--color-border)" gap={20} size={1} />
        <Controls />
        <MiniMap
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
          nodeColor="var(--color-border)"
        />
      </ReactFlow>

      {/* DetailPanel — selectedId 있을 때만 */}
      <DetailPanel
        item={selectedItem}
        onClose={() => setSelectedId(null)}
        onSave={handlePanelSave}
        onDelete={handleDeleteNode}
        onAiRequest={handleAiRequest}
      />

      {/* 인라인 토스트 (04B-04 Task 2) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md px-4 py-2 text-sm shadow-lg"
          style={{
            background: 'oklch(0.18 0.01 280)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

// ============================================================
// 공개 export — ReactFlowProvider로 감싸기 필수 (useReactFlow 사용)
// ============================================================
export function FeatureTree({ projectId }: { projectId: string }) {
  return (
    <ReactFlowProvider>
      <FeatureTreeCanvas projectId={projectId} />
    </ReactFlowProvider>
  )
}
