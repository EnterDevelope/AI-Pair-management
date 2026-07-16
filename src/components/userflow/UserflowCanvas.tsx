'use client'
// UserflowCanvas - React Flow 유저플로우 캔버스 (04A-03-PLAN.md Task 2)
// 04A-04: 엣지 편집(onConnect/delete/reconnect) + PATCH + FlowDetailPanel + SSE 배너 추가
//
// 핵심 규칙:
//   1. nodeTypes 반드시 모듈 스코프 (Pitfall 2 - 컴포넌트 내부 정의 시 리렌더마다 재마운트)
//   2. node.measured?.width/height 사용 (React Flow v12 - node.width 금지)
//   3. useNodesInitialized 게이트 → runSwimlaneDagreLayout → opacity-1 (no-flicker)
//   4. filteredNodes = Pitfall 5 versionId undefined 포함
//   5. SectionBandOverlay: useViewport() 좌표 변환, pointer-events-none
//   6. savingRef 가드 → PATCH → SSE → rerender → PATCH 무한 루프 방지 (Pitfall 4)

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesInitialized,
  useReactFlow,
  ReactFlowProvider,
  addEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { Node, Edge, Connection, EdgeChange } from '@xyflow/react'

import { FlowDetailPanel } from '@/components/userflow/FlowDetailPanel'
import type { FlowDetailPanelItem } from '@/components/userflow/FlowDetailPanel'
import { SseBanner } from '@/components/prd/SseBanner'
import { useSseWatcher } from '@/components/prd/useSseWatcher'

import { useUserflowStore } from '@/stores/userflowStore'
import { runSwimlaneDagreLayout } from '@/lib/dagre-layout'
import { splitByPositionCache, extractPositionPatch } from '@/lib/position-cache'
import type { Userflow } from '@/schemas/graph/userflow'
import { StartNode } from '@/components/userflow/nodes/StartNode'
import { SectionNode } from '@/components/userflow/nodes/SectionNode'
import { PageNode } from '@/components/userflow/nodes/PageNode'
import { ActionNode } from '@/components/userflow/nodes/ActionNode'
import { SectionBandOverlay } from '@/components/userflow/SectionBand'
import { VersionPanel } from '@/components/userflow/panels/VersionPanel'

// ============================================================
// nodeTypes: 반드시 모듈 스코프 (Pitfall 2 - 내부 정의 절대 금지)
// ============================================================
const nodeTypes = {
  start: StartNode,
  section: SectionNode,
  page: PageNode,
  action: ActionNode,
}

// 서버에서 받는 userflow.json 노드/엣지 형태 (스키마 shape)
type UserflowNodeData = NonNullable<Userflow['nodes']>[number]
type UserflowEdgeData = NonNullable<Userflow['edges']>[number]
type UserflowVersionData = NonNullable<Userflow['versions']>[number]
type UserflowVersionGroupData = NonNullable<Userflow['versionGroups']>[number]

// userflow.json 노드 -> React Flow 노드 변환.
// positionX+Y 모두 있으면 캐시 좌표 사용 + opacity:1 (dagre 건너뜀).
// 없으면 0,0 시드 + opacity:0 -> nodesInitialized 게이트가 측정 후 dagre 배치 -> opacity:1.
// 모든 스키마 필드를 data로 옮겨 노드 컴포넌트(IdChip·label·sectionId 등)가 읽게 한다.
function toRfNodes(nodes: UserflowNodeData[]): Node[] {
  return nodes
    .filter((n) => Boolean(n.id))
    .map((n) => {
      const hasCachedPos =
        typeof n.positionX === 'number' && typeof n.positionY === 'number'
      return {
        id: n.id as string,
        type: n.type,
        position: {
          x: hasCachedPos ? (n.positionX as number) : 0,
          y: hasCachedPos ? (n.positionY as number) : 0,
        },
        data: {
          id: n.id,
          label: n.label,
          pageId: n.pageId,
          sectionId: n.sectionId,
          versionId: n.versionId,
          featureId: n.featureId,
          description: n.description,
        },
        // 캐시 있으면 즉시 보이게, 없으면 dagre 후 opacity-1 (no-flicker)
        style: { opacity: hasCachedPos ? 1 : 0 },
      }
    })
}

// userflow.json 엣지 -> React Flow 엣지. 다크 배경 가시성 위해 text-muted stroke (FeatureTree 학습).
function toRfEdges(edges: UserflowEdgeData[]): Edge[] {
  return edges
    .filter((e) => Boolean(e.source && e.target))
    .map((e) => ({
      id: e.id ?? `${e.source}->${e.target}`,
      source: e.source as string,
      target: e.target as string,
      label: e.label,
      data: e.versionId == null ? undefined : { versionId: e.versionId },
      style: { stroke: 'var(--color-text-muted)', strokeWidth: 1.5, opacity: 0.6 },
    }))
}

function mergeNodesById(current: Node[], updated: Node[]): Node[] {
  const updatedById = new Map(updated.map((node) => [node.id, node]))
  const currentIds = new Set(current.map((node) => node.id))
  return [
    ...current.map((node) => updatedById.get(node.id) ?? node),
    ...updated.filter((node) => !currentIds.has(node.id)),
  ]
}

function mergeEdgesById(current: Edge[], updated: Edge[]): Edge[] {
  const updatedById = new Map(updated.map((edge) => [edge.id, edge]))
  const currentIds = new Set(current.map((edge) => edge.id))
  return [
    ...current.map((edge) => updatedById.get(edge.id) ?? edge),
    ...updated.filter((edge) => !currentIds.has(edge.id)),
  ]
}

function toPersistedEdge(edge: Edge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: typeof edge.label === 'string' ? edge.label : undefined,
    versionId: (edge.data as { versionId?: string } | undefined)?.versionId,
  }
}

// ============================================================
// 내부 캔버스 (ReactFlowProvider 안에서 useReactFlow 사용)
// ============================================================
function UserflowCanvas({
  initialNodes,
  initialEdges,
  initialVersions,
  initialVersionGroups,
  projectId,
  selfWriteRef,
}: {
  initialNodes: UserflowNodeData[]
  initialEdges: UserflowEdgeData[]
  initialVersions: UserflowVersionData[]
  initialVersionGroups: UserflowVersionGroupData[]
  projectId: string
  selfWriteRef: React.MutableRefObject<boolean>
}) {
  const { fitView, getNodes } = useReactFlow()

  const {
    nodes: allNodes,
    edges: allEdges,
    filteredNodes,
    filteredEdges,
    sectionBands,
    selectedId,
    activeVersionId,
    setNodes,
    setEdges,
    setSectionBands,
    setSelectedId,
    setVersions,
    setVersionGroups,
    onNodesChange,
    onEdgesChange,
  } = useUserflowStore()

  const [layoutDone, setLayoutDone] = useState(false)
  const nodesInitialized = useNodesInitialized()

  // savingRef: PATCH 진행 중 플래그 — SSE→rerender→PATCH 무한루프 방지 (Pitfall 4)
  const savingRef = useRef(false)
  // positionsSavedRef: nodesInitialized 후 위치 캐시 자동 저장을 정확히 1회만 (재호출 차단)
  const positionsSavedRef = useRef(false)
  // selfWriteRef: 앱 자신의 PATCH가 유발한 SSE 변경 이벤트는 자동 리로드하지 않도록 표시
  // (자기 쓰기 → 파일 변경 → SSE → onCleanChange 리로드 자기 트리거 방지)
  // isDirtyRef: SSE 배너가 확인하는 "미저장 변경 존재" 플래그
  const isDirtyRef = useRef(false)
  // SSE 배너 표시 상태
  const [sseBannerVisible, setSseBannerVisible] = useState(false)

  // AI 수정 대기 큐 카운트 (04B-04 Task 3) — .aipm/queue/ 파일 add/unlink 추적
  const [queueCount, setQueueCount] = useState(0)
  const queueRefreshSequenceRef = useRef(0)

  const refreshQueueCount = useCallback(async () => {
    const sequence = ++queueRefreshSequenceRef.current
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/queue`)
    if (!res.ok) return
    const data = (await res.json()) as { count?: number }
    if (sequence === queueRefreshSequenceRef.current && typeof data.count === 'number') {
      setQueueCount(data.count)
    }
  }, [projectId])

  // mount/네비게이션/새로고침 시 기존 큐 카운트 재수화 — watch는 ignoreInitial이라 초기 통보 없음
  useEffect(() => {
    void refreshQueueCount().catch(() => undefined)
    return () => { queueRefreshSequenceRef.current += 1 }
  }, [refreshQueueCount])

  // 인라인 토스트 (04B-04 Task 2)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  // ============================================================
  // SSE 감시: userflow.json 외부 변경 감지 (02A 패턴 재사용)
  // ============================================================
  useSseWatcher({
    projectId,
    isDirtyRef,
    onExternalChange: () => {
      // 자기 PATCH의 SSE가 dirty 윈도우 중 도착하면 false 배너가 뜬다 — 1회 소비해 억제.
      if (selfWriteRef.current) {
        selfWriteRef.current = false
        return
      }
      // 진짜 외부 변경 + 편집 중 — 덮어쓰기 방지 배너로 사용자에게 결정 위임(D-03)
      setSseBannerVisible(true)
    },
    onCleanChange: () => {
      // 앱 자신의 PATCH(편집·위치 캐시 저장)가 유발한 변경이면 리로드하지 않는다 — 1회 소비.
      if (selfWriteRef.current) {
        selfWriteRef.current = false
        return
      }
      // 진짜 외부 변경(다른 터미널 등) — 편집 없는 상태이므로 최신본으로 조용히 갱신
      window.location.reload()
    },
    // 큐 파일 add/unlink 이벤트로 대기 카운트 갱신 (04B-04 Task 3)
    onQueueEvent: () => {
      void refreshQueueCount().catch(() => undefined)
    },
  })

  // ============================================================
  // PATCH 공통 함수: savingRef 가드로 중복 호출 차단
  // ============================================================
  const patchUserflow = useCallback(
    async (patch: {
      nodes?: unknown[]
      edges?: unknown[]
      deletedNodeIds?: string[]
      deletedEdgeIds?: string[]
    }) => {
      if (savingRef.current) return
      savingRef.current = true
      isDirtyRef.current = true
      // 이 쓰기로 발생할 SSE 변경 이벤트는 자기 트리거 — onCleanChange가 1회 무시.
      selfWriteRef.current = true
      try {
        await fetch(`/api/projects/${projectId}/userflow`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        isDirtyRef.current = false
      } catch (err) {
        console.error('[UserflowCanvas] PATCH 실패:', err)
      } finally {
        savingRef.current = false
      }
    },
    [projectId]
  )

  // 서버에서 받은 userflow.json 데이터를 RF 노드/엣지로 변환해 스토어에 주입.
  // FeaturesShell -> FeatureTree 하이드레이션 패턴과 동형. 이게 없으면 빈 상태만 렌더된다.
  useEffect(() => {
    setNodes(toRfNodes(initialNodes))
    setEdges(toRfEdges(initialEdges))
    // 파일의 버전/버전그룹도 스토어에 주입 — 없으면 VersionPanel 드롭다운이 안 뜨고
    // 기존 버전의 '수정본 만들기'가 비활성된다 (FLOW-04).
    setVersions(initialVersions)
    setVersionGroups(initialVersionGroups)
    setLayoutDone(false)
  }, [
    initialNodes,
    initialEdges,
    initialVersions,
    initialVersionGroups,
    setNodes,
    setEdges,
    setVersions,
    setVersionGroups,
  ])

  // nodes 변경 시 opacity-0으로 초기화 → nodesInitialized 게이트 대기
  // (스토어에서 setNodes 호출 시 이미 filteredNodes로 동기화되므로
  //  이 effect는 외부에서 setNodes를 호출한 뒤의 레이아웃 트리거 역할)
  useEffect(() => {
    setLayoutDone(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNodes.length])

  // nodesInitialized 게이트 → 위치 캐시 분기 → dagre (캐시 없는 노드만) → opacity-1 (no-flicker)
  // FLOW-05: positionX/Y 있는 노드는 dagre 재배치 없이 캐시 좌표 그대로 사용.
  const runLayout = useCallback(() => {
    if (!nodesInitialized || layoutDone) return

    const rfNodes = getNodes()
    if (rfNodes.length === 0) return

    const sectionLabelById = new Map(
      initialNodes
        .filter((n) => n.type === 'section' && n.id)
        .map((n) => [n.id as string, n.label ?? (n.id as string)])
    )

    // 위치 캐시 분기: positionX+Y 둘 다 있는 노드는 dagre 건너뜀
    const rawForSplit = rfNodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: (n.data as { label?: string }).label,
      sectionId: (n.data as { sectionId?: string }).sectionId,
      // position이 이미 세팅되어 있으면 캐시로 취급 (opacity:1인 노드 = 캐시 존재)
      positionX: (n.style as { opacity?: number })?.opacity === 1 ? n.position.x : undefined,
      positionY: (n.style as { opacity?: number })?.opacity === 1 ? n.position.y : undefined,
    }))
    const { cached } = splitByPositionCache(rawForSplit)

    // dagre는 항상 실행한다(섹션 밴드 생성 + 미캐시 노드 좌표 계산). 캐시 노드는 아래에서
    // 캐시 좌표로 복원하므로 전체 캐시 히트여도 위치 점프가 없다. (전체 캐시 시 조기 반환하면
    // sectionBands가 비어 레인 배경이 사라지므로 반환하지 않는다.)
    // sectionOrder: 노드 data.sectionId 순서대로 추출 (등장 순 유지)
    const sectionOrder = Array.from(
      new Set(
        rfNodes
          .map((n) => {
            const d = n.data as { sectionId?: unknown }
            return typeof d.sectionId === 'string' ? d.sectionId : undefined
          })
          .filter((s): s is string => s != null)
      )
    )

    const result = runSwimlaneDagreLayout(rfNodes, filteredEdges, sectionOrder)

    // 캐시 있는 노드는 dagre 결과 대신 원래 캐시 좌표 복원
    const cachedIdSet = new Set(cached.map((c) => c.id))
    const cachedById = new Map(rfNodes.filter((n) => cachedIdSet.has(n.id)).map((n) => [n.id, n]))

    const layoutedNodes = result.nodes.map((n) => {
      const cachedNode = cachedById.get(n.id)
      if (cachedNode) {
        return { ...n, position: cachedNode.position, style: { ...n.style, opacity: 1 } }
      }
      return {
        ...n,
        style: { ...n.style, opacity: 1, transition: 'opacity 200ms ease' },
      }
    })

    const currentState = useUserflowStore.getState()
    setNodes(mergeNodesById(currentState.nodes, layoutedNodes))
    setEdges(mergeEdgesById(currentState.edges, result.edges))
    setSectionBands(
      result.sectionBands.map((b) => ({
        ...b,
        label: sectionLabelById.get(b.sectionId) ?? b.label,
      }))
    )
    setLayoutDone(true)

    // FLOW-05 자동 위치 캐시: 새로 dagre 계산된(미캐시) 노드가 있으면 계산된 좌표를
    // positionX/Y로 1회 PATCH 저장 → 다음 로드는 캐시 히트로 즉시 표시(재배치 점프 제거).
    // positionsSavedRef로 재호출 차단, patchUserflow가 selfWriteRef를 세팅해 자기 SSE 리로드 억제.
    // 섹션 노드는 스윔레인에서 밴드로 표현돼 layoutedNodes에 없으므로(항상 미캐시여도)
    // 여기 freshlyPositioned에 포함되지 않는다 → 매 로드 재저장을 막는다.
    const freshlyPositioned = layoutedNodes.filter((n) => !cachedIdSet.has(n.id))
    if (freshlyPositioned.length > 0 && !positionsSavedRef.current) {
      positionsSavedRef.current = true
      void patchUserflow({ nodes: extractPositionPatch(layoutedNodes) })
    }

    requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 200 })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesInitialized, layoutDone])

  useEffect(() => {
    runLayout()
  }, [runLayout])

  // ============================================================
  // 엣지 편집 핸들러 (04A-04)
  // ============================================================
  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        id: `${connection.source}->${connection.target}-${Date.now()}`,
        source: connection.source ?? '',
        target: connection.target ?? '',
        data: activeVersionId == null ? undefined : { versionId: activeVersionId },
        style: { stroke: 'var(--color-text-muted)', strokeWidth: 1.5, opacity: 0.6 },
      }
      const updatedEdges = addEdge(newEdge, allEdges)
      setEdges(updatedEdges)
      void patchUserflow({ edges: [toPersistedEdge(newEdge)] })
    },
    [activeVersionId, allEdges, setEdges, patchUserflow]
  )

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      const deletedIds = new Set(deletedEdges.map((e) => e.id))
      const updatedEdges = allEdges.filter((e) => !deletedIds.has(e.id))
      setEdges(updatedEdges)
      void patchUserflow({ deletedEdgeIds: [...deletedIds] })
    },
    [allEdges, setEdges, patchUserflow]
  )

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      const updatedEdges = allEdges.map((e) =>
        e.id === oldEdge.id
          ? {
              ...e,
              source: newConnection.source ?? e.source,
              target: newConnection.target ?? e.target,
            }
          : e
      )
      setEdges(updatedEdges)
      const updatedEdge = updatedEdges.find((edge) => edge.id === oldEdge.id)
      if (updatedEdge) void patchUserflow({ edges: [toPersistedEdge(updatedEdge)] })
    },
    [allEdges, setEdges, patchUserflow]
  )

  // ============================================================
  // FlowDetailPanel 핸들러
  // ============================================================
  const selectedNode = selectedId
    ? filteredNodes.find((n) => n.id === selectedId)
    : null

  const selectedPanelItem: FlowDetailPanelItem | null = selectedNode
    ? {
        id: selectedNode.id,
        type: (selectedNode.data as { type?: 'start' | 'section' | 'page' | 'action' }).type,
        label: (selectedNode.data as { label?: string }).label,
        description: (selectedNode.data as { description?: string }).description,
        featureId: (selectedNode.data as { featureId?: string }).featureId,
      }
    : null

  const handlePanelSave = useCallback(
    async (updated: FlowDetailPanelItem) => {
      // 스토어 노드 data 갱신
      const updatedNodes = allNodes.map((n) =>
        n.id === updated.id
          ? { ...n, data: { ...n.data, label: updated.label, description: updated.description } }
          : n
      )
      setNodes(updatedNodes)
      await patchUserflow({
        nodes: [{ id: updated.id, label: updated.label, description: updated.description }],
      })
    },
    [allNodes, setNodes, patchUserflow]
  )

  const handlePanelDelete = useCallback(
    (id: string) => {
      const deletedEdgeIds = allEdges
        .filter((edge) => edge.source === id || edge.target === id)
        .map((edge) => edge.id)
      const updatedNodes = allNodes.filter((n) => n.id !== id)
      const updatedEdges = allEdges.filter((e) => !deletedEdgeIds.includes(e.id))
      setNodes(updatedNodes)
      setEdges(updatedEdges)
      setSelectedId(null)
      void patchUserflow({
        deletedNodeIds: [id],
        deletedEdgeIds,
      })
    },
    [allNodes, allEdges, setNodes, setEdges, setSelectedId, patchUserflow]
  )

  // AI 수정요청 큐 등록 (04B-04 Task 2)
  const handleAiRequest = useCallback(
    async (item: FlowDetailPanelItem, instruction: string) => {
      const requestId = crypto.randomUUID()
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/queue`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schemaVersion: '1.0',
            requestId,
            targetArtifact: 'flow',
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

  if (filteredNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          유저플로우가 아직 없어요. 터미널에서 /aipm flow를 실행하세요.
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {/* SSE 외부 변경 배너 (02A 패턴 재사용) */}
      <SseBanner
        visible={sseBannerVisible}
        onReload={() => window.location.reload()}
        onKeepEditing={() => setSseBannerVisible(false)}
      />

      {/* AI 수정 대기 배지 (04B-04 Task 3) */}
      {queueCount > 0 && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-md px-3 py-1 text-xs font-medium"
          style={{
            background: 'oklch(0.14 0.01 280)',
            color: 'oklch(0.58 0.18 150)',
            border: '1px solid oklch(0.58 0.18 150 / 0.4)',
          }}
        >
          AI 수정 대기 중 {queueCount}건
        </div>
      )}

      {/* SectionBandOverlay: useViewport() 사용 → ReactFlow 내부에 렌더해야 context 있음 */}
      <ReactFlow
        nodes={filteredNodes}
        edges={filteredEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={(changes: EdgeChange[]) => {
          // remove type 변경은 onEdgesDelete에서 처리 (PATCH 포함)
          // 여기서는 선택 상태 등 non-remove 변경만 적용
          const nonRemove = changes.filter((c) => c.type !== 'remove')
          if (nonRemove.length > 0) onEdgesChange(nonRemove)
        }}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onReconnect={onReconnect}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={true}
        colorMode="dark"
        fitView
        style={{ background: 'var(--color-background)' }}
        onNodeClick={(_evt, node) => setSelectedId(node.id)}
        onPaneClick={() => setSelectedId(null)}
      >
        {/* SectionBandOverlay는 ReactFlow 내부 - useViewport() context 접근 필요 */}
        <SectionBandOverlay bands={sectionBands} />

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

      {/* FlowDetailPanel: 선택된 노드 상세 편집 (04A-04) */}
      <FlowDetailPanel
        item={selectedPanelItem}
        onClose={() => setSelectedId(null)}
        onSave={handlePanelSave}
        onDelete={handlePanelDelete}
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
// 공개 export - ReactFlowProvider 필수 (useReactFlow + useViewport 사용)
// ============================================================
export function UserflowDiagram({
  initialNodes = [],
  initialEdges = [],
  initialVersions = [],
  initialVersionGroups = [],
  projectId,
}: {
  initialNodes?: UserflowNodeData[]
  initialEdges?: UserflowEdgeData[]
  initialVersions?: UserflowVersionData[]
  initialVersionGroups?: UserflowVersionGroupData[]
  projectId: string
}) {
  // Canvas 편집과 VersionPanel의 버전 저장은 같은 파일을 쓴다. 두 경로가 동일한
  // self-write 표식을 공유해야 SSE가 앱 자신의 PATCH를 외부 변경으로 오인하지 않는다.
  const selfWriteRef = useRef(false)

  return (
    <div className="flex h-full w-full flex-col">
      {/* VersionPanel: ReactFlowProvider 바깥 — ReactFlow context 불필요 */}
      <VersionPanel projectId={projectId} selfWriteRef={selfWriteRef} />
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <UserflowCanvas
            initialNodes={initialNodes}
            initialEdges={initialEdges}
            initialVersions={initialVersions}
            initialVersionGroups={initialVersionGroups}
            projectId={projectId}
            selfWriteRef={selfWriteRef}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
