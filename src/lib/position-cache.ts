// position-cache.ts — 위치 캐시 헬퍼 (04A-05-PLAN.md Task 3)
//
// D-01/FLOW-05: positionX+Y 필드가 모두 있는 노드는 dagre 재배치를 건너뛰고
//               캐시 좌표를 그대로 사용한다.
//
// 순수 함수(부수효과 없음) — 테스트와 UserflowCanvas 양쪽에서 재사용.
// Leaf import 전용 (배럴 금지 — Turbopack 런타임 충돌 방지)

import type { Node } from "@xyflow/react"

/**
 * userflow.json에서 읽은 raw 노드 타입.
 * Zod 스키마(UserflowSchema)의 nodes 항목과 일치.
 */
export interface RawNode {
  id: string
  type?: string
  label?: string
  positionX?: number
  positionY?: number
  versionId?: string
  sectionId?: string
  pageId?: string
  featureId?: string
  description?: string
  [key: string]: unknown
}

/**
 * splitByPositionCache
 *
 * raw 노드 배열을 캐시 유무로 분류한다.
 * positionX AND positionY 둘 다 숫자(number)여야 cached.
 * 한 축만 있거나 둘 다 없으면 uncached (부분 캐시는 신뢰 불가).
 */
export function splitByPositionCache(nodes: RawNode[]): {
  cached: RawNode[]
  uncached: RawNode[]
} {
  const cached: RawNode[] = []
  const uncached: RawNode[] = []

  for (const node of nodes) {
    const hasX = typeof node.positionX === "number"
    const hasY = typeof node.positionY === "number"
    if (hasX && hasY) {
      cached.push(node)
    } else {
      uncached.push(node)
    }
  }

  return { cached, uncached }
}

/**
 * applyPositionCache
 *
 * 캐시 있는 raw 노드를 React Flow Node 형식으로 변환한다.
 * position = { x: positionX, y: positionY }
 * style.opacity = 1 (dagre 건너뜀 — 투명도 0에서 페이드인 불필요)
 *
 * positionX/positionY가 없는 노드가 전달되면 position = { x: 0, y: 0 } 방어 처리.
 */
export function applyPositionCache(cachedRaw: RawNode[]): Node[] {
  return cachedRaw.map((raw) => {
    const x = typeof raw.positionX === "number" ? raw.positionX : 0
    const y = typeof raw.positionY === "number" ? raw.positionY : 0

    return {
      id: raw.id,
      type: raw.type ?? "page",
      position: { x, y },
      data: {
        id: raw.id,
        label: raw.label,
        sectionId: raw.sectionId,
        pageId: raw.pageId,
        featureId: raw.featureId,
        description: raw.description,
        versionId: raw.versionId,
      },
      style: { opacity: 1 },
    } satisfies Node
  })
}

/**
 * extractPositionPatch
 *
 * 드래그 후 React Flow 노드 배열에서 PATCH payload를 추출한다.
 * 반환값: { id, positionX, positionY }[] — PATCH /api/projects/[id]/userflow 노드 머지 형식
 *
 * position.x/y가 0인 노드도 포함 (0,0 좌표도 유효한 캐시).
 */
export function extractPositionPatch(
  rfNodes: Node[]
): Array<{ id: string; positionX: number; positionY: number }> {
  return rfNodes.map((n) => ({
    id: n.id,
    positionX: n.position.x,
    positionY: n.position.y,
  }))
}
