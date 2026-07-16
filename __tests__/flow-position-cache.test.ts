// ============================================================
// flow-position-cache 테스트 (04A-05-PLAN.md Task 3 TDD)
//
// 검증 대상: positionX/positionY 캐시 동작
//   - positionX/positionY 있는 노드 → 캐시 좌표 사용, dagre 재배치 없음
//   - positionX/positionY 없는 노드만 → dagre 배치 대상
//   - 드래그 후 positionX/positionY 저장 헬퍼 동작
// ============================================================

import { describe, it, expect } from "vitest"
import type { Node } from "@xyflow/react"
import {
  splitByPositionCache,
  applyPositionCache,
  extractPositionPatch,
} from "@/lib/position-cache"

// 테스트용 userflow.json 노드 형태 (positionX/Y 필드 포함)
interface RawNode {
  id: string
  type?: string
  label?: string
  positionX?: number
  positionY?: number
  versionId?: string
  sectionId?: string
}

// 캐시 있는 raw 노드 픽스처
function makeRawNode(id: string, positionX?: number, positionY?: number): RawNode {
  return { id, type: "page", label: id, positionX, positionY }
}

// React Flow 노드 픽스처 (드래그 후 position이 업데이트된 상태)
function makeRfNode(id: string, x: number, y: number): Node {
  return {
    id,
    type: "page",
    position: { x, y },
    data: { id, label: id },
  }
}

describe("flow-position-cache — 위치 캐시 유지 (FLOW-05)", () => {
  it("positionX/positionY 있는 노드는 splitByPositionCache에서 cached 배열에 분류된다", () => {
    const nodes: RawNode[] = [
      makeRawNode("P-001", 120, 80),  // 캐시 있음
      makeRawNode("P-002"),            // 캐시 없음
      makeRawNode("P-003", 0, 0),     // 0,0도 캐시로 취급 (null/undefined가 아닌 숫자)
    ]
    const { cached, uncached } = splitByPositionCache(nodes)
    expect(cached.map((n) => n.id)).toContain("P-001")
    expect(cached.map((n) => n.id)).toContain("P-003")
    expect(uncached.map((n) => n.id)).toContain("P-002")
  })

  it("positionX/positionY 없는 노드는 splitByPositionCache에서 uncached 배열에 분류된다", () => {
    const nodes: RawNode[] = [
      makeRawNode("P-001"),
      makeRawNode("P-002"),
    ]
    const { cached, uncached } = splitByPositionCache(nodes)
    expect(cached).toHaveLength(0)
    expect(uncached).toHaveLength(2)
  })

  it("applyPositionCache가 cached 노드에 positionX/Y를 그대로 position에 반영한다", () => {
    const cachedRaw: RawNode[] = [
      makeRawNode("P-001", 120, 80),
      makeRawNode("P-002", 300, 150),
    ]
    const rfNodes = applyPositionCache(cachedRaw)
    const n1 = rfNodes.find((n) => n.id === "P-001")
    const n2 = rfNodes.find((n) => n.id === "P-002")
    expect(n1?.position).toEqual({ x: 120, y: 80 })
    expect(n2?.position).toEqual({ x: 300, y: 150 })
  })

  it("applyPositionCache 결과 노드의 opacity는 1이다 (dagre 건너뜀)", () => {
    const cachedRaw: RawNode[] = [makeRawNode("P-001", 100, 50)]
    const rfNodes = applyPositionCache(cachedRaw)
    expect((rfNodes[0].style as { opacity?: number })?.opacity).toBe(1)
  })

  it("extractPositionPatch가 RF 노드에서 positionX/positionY 패치 객체 배열을 반환한다", () => {
    const rfNodes: Node[] = [
      makeRfNode("P-001", 120, 80),
      makeRfNode("P-002", 300, 150),
    ]
    const patches = extractPositionPatch(rfNodes)
    expect(patches).toHaveLength(2)
    const p1 = patches.find((p) => p.id === "P-001")
    expect(p1).toMatchObject({ id: "P-001", positionX: 120, positionY: 80 })
  })

  it("splitByPositionCache는 positionX만 있고 positionY가 없는 노드를 uncached로 분류한다", () => {
    // 두 필드 모두 있어야 캐시 유효 (부분 캐시는 신뢰 불가)
    const nodes: RawNode[] = [
      { id: "P-001", type: "page", positionX: 100 },  // positionY 없음
      { id: "P-002", type: "page", positionY: 100 },  // positionX 없음
    ]
    const { cached, uncached } = splitByPositionCache(nodes)
    expect(cached).toHaveLength(0)
    expect(uncached).toHaveLength(2)
  })
})
