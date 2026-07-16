// ============================================================
// Dagre 좌→우 트리 레이아웃 유틸 (03-04-PLAN.md Task 1)
// ============================================================
// 책임:
//   - R/F/S 위계 노드를 Dagre에 넘겨 LR 자동 배치 좌표 계산
//   - node.measured?.width/height 사용 (React Flow v12 breaking — node.width 금지)
//   - fallback: width=172, height=36
// ============================================================

import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'

// 노드 기본 크기 fallback (Pitfall 1: node.measured 없을 때)
const DEFAULT_NODE_WIDTH = 172
const DEFAULT_NODE_HEIGHT = 36

export interface DagreLayoutResult {
  nodes: Node[]
  edges: Edge[]
}

/**
 * runDagreLayout — Dagre LR 레이아웃을 실행해 노드에 position {x, y}를 부여한다.
 *
 * - rankdir: 'LR' (좌→우, D-06)
 * - ranksep: 80 (레이어 간격)
 * - nodesep: 40 (같은 레이어 내 노드 간격)
 * - node.measured?.width/height 우선, 없으면 fallback 172/36 사용 (Pitfall 1)
 * - edges는 변경 없이 그대로 반환
 */
export function runDagreLayout(nodes: Node[], edges: Edge[]): DagreLayoutResult {
  const g = new dagre.graphlib.Graph()

  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40 })
  g.setDefaultEdgeLabel(() => ({}))

  // 노드 등록 (measured 우선, 없으면 fallback)
  for (const node of nodes) {
    const w = node.measured?.width ?? DEFAULT_NODE_WIDTH
    const h = node.measured?.height ?? DEFAULT_NODE_HEIGHT
    g.setNode(node.id, { width: w, height: h })
  }

  // 엣지 등록
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  // Dagre 레이아웃 실행
  dagre.layout(g)

  // Dagre center → React Flow top-left 보정
  const layoutedNodes = nodes.map((node) => {
    const { x, y } = g.node(node.id)
    const w = node.measured?.width ?? DEFAULT_NODE_WIDTH
    const h = node.measured?.height ?? DEFAULT_NODE_HEIGHT
    return {
      ...node,
      position: {
        x: x - w / 2,
        y: y - h / 2,
      },
    }
  })

  return {
    nodes: layoutedNodes,
    edges,
  }
}

// ============================================================
// runSwimlaneDagreLayout — 섹션별 y-밴드 스윔레인 레이아웃 (04A-01)
// ============================================================
// 책임:
//   - node.data.sectionId로 노드를 섹션별 분류
//   - 섹션별 독립 mini-dagre(rankdir:'LR') 실행
//   - cross-section 엣지: hasNode 가드로 mini-dagre 제외(Pitfall 1), React Flow에는 전달
//   - 섹션을 수직 적층(yOffset 누적 + SECTION_GAP)
//   - SectionBand[] 반환 (yTop·height 포함)
// ============================================================

const SECTION_GAP = 60

export interface SectionBand {
  sectionId: string
  label: string
  yTop: number
  height: number
}

export interface SwimlaneLayoutResult {
  nodes: Node[]
  edges: Edge[]
  sectionBands: SectionBand[]
}

/**
 * runSwimlaneDagreLayout — 섹션별 독립 mini-dagre를 실행하고 섹션을 수직으로 적층한다.
 *
 * - 섹션별 독립 mini-dagre: rankdir:'LR', ranksep:60, nodesep:30
 * - cross-section 엣지는 mini-dagre에서 제외(g.hasNode 가드) — React Flow edges에는 전달
 * - node.measured?.width/height 우선, 없으면 fallback 172/36 (node.width 금지 — React Flow v12)
 * - 불변 spread: { ...node, position: { x, y } }
 * - sectionOrder 미포함 섹션 노드는 레이아웃 결과에 포함되지 않음
 */
export function runSwimlaneDagreLayout(
  nodes: Node[],
  edges: Edge[],
  sectionOrder: string[]
): SwimlaneLayoutResult {
  // 섹션별 노드 분류
  const sectionNodeMap = new Map<string, Node[]>()
  for (const sectionId of sectionOrder) {
    sectionNodeMap.set(sectionId, [])
  }
  for (const node of nodes) {
    const sectionId = (node.data as { sectionId?: string }).sectionId
    if (sectionId && sectionNodeMap.has(sectionId)) {
      sectionNodeMap.get(sectionId)!.push(node)
    }
  }

  const layoutedNodes: Node[] = []
  const sectionBands: SectionBand[] = []
  let yOffset = 0

  for (const sectionId of sectionOrder) {
    const sectionNodes = sectionNodeMap.get(sectionId) ?? []

    // 섹션별 독립 mini-dagre
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'LR', ranksep: 60, nodesep: 30 })
    g.setDefaultEdgeLabel(() => ({}))

    // 노드 등록
    for (const node of sectionNodes) {
      const w = node.measured?.width ?? DEFAULT_NODE_WIDTH
      const h = node.measured?.height ?? DEFAULT_NODE_HEIGHT
      g.setNode(node.id, { width: w, height: h })
    }

    // 엣지 등록: hasNode 가드로 cross-section 엣지 제외 (Pitfall 1)
    for (const edge of edges) {
      if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
        g.setEdge(edge.source, edge.target)
      }
    }

    // mini-dagre 실행
    dagre.layout(g)

    // 섹션 높이 계산: 모든 노드 center y + h/2의 max
    let sectionHeight = DEFAULT_NODE_HEIGHT
    for (const node of sectionNodes) {
      const pos = g.node(node.id)
      if (pos) {
        const h = node.measured?.height ?? DEFAULT_NODE_HEIGHT
        const bottomY = pos.y + h / 2
        if (bottomY > sectionHeight) sectionHeight = bottomY
      }
    }

    // center → top-left 보정 + yOffset 적층
    for (const node of sectionNodes) {
      const pos = g.node(node.id)
      const w = node.measured?.width ?? DEFAULT_NODE_WIDTH
      const h = node.measured?.height ?? DEFAULT_NODE_HEIGHT
      const x = pos ? pos.x - w / 2 : 0
      const y = pos ? yOffset + pos.y - h / 2 : yOffset

      layoutedNodes.push({ ...node, position: { x, y } })
    }

    sectionBands.push({
      sectionId,
      label: sectionId,
      yTop: yOffset,
      height: sectionHeight,
    })

    yOffset += sectionHeight + SECTION_GAP
  }

  return {
    nodes: layoutedNodes,
    edges,
    sectionBands,
  }
}
