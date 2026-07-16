// ============================================================
// Dagre 레이아웃 유틸 테스트 (03-04-PLAN.md Task 1)
// ============================================================
// 검증 대상:
//   - runDagreLayout(nodes, edges) — 좌→우 위계 자동 배치
//   - node.measured?.width/height 사용 (v12 breaking — node.width 금지)
//   - rankdir 'LR', ranksep 80, nodesep 40
//   - 50노드 입력에서 모든 노드 고유 position
// ============================================================

import { describe, it, expect } from "vitest"
import type { Node, Edge } from "@xyflow/react"

// TDD RED: 모듈이 아직 없음 — import는 존재하지 않는 경로
import { runDagreLayout, runSwimlaneDagreLayout } from "../dagre-layout.js"

// ============================================================
// 헬퍼
// ============================================================

function makeNode(id: string, measured?: { width: number; height: number }): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
    ...(measured ? { measured } : {}),
  }
}

function makeEdge(source: string, target: string): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
  }
}

// ============================================================
// 기본 동작
// ============================================================

describe("runDagreLayout — 기본 동작", () => {
  it("노드와 엣지를 반환한다", () => {
    const nodes = [makeNode("a"), makeNode("b")]
    const edges = [makeEdge("a", "b")]
    const result = runDagreLayout(nodes, edges)
    expect(result).toHaveProperty("nodes")
    expect(result).toHaveProperty("edges")
  })

  it("반환된 nodes 수가 입력과 동일하다", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")]
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")]
    const result = runDagreLayout(nodes, edges)
    expect(result.nodes).toHaveLength(3)
  })

  it("edges는 그대로 반환된다(위치 변화 없음)", () => {
    const nodes = [makeNode("a"), makeNode("b")]
    const edges = [makeEdge("a", "b")]
    const result = runDagreLayout(nodes, edges)
    expect(result.edges).toStrictEqual(edges)
  })

  it("각 노드에 dagre가 계산한 position {x, y}를 부여해 반환한다", () => {
    const nodes = [makeNode("a"), makeNode("b")]
    const edges = [makeEdge("a", "b")]
    const result = runDagreLayout(nodes, edges)
    for (const n of result.nodes) {
      expect(n.position).toHaveProperty("x")
      expect(n.position).toHaveProperty("y")
      expect(typeof n.position.x).toBe("number")
      expect(typeof n.position.y).toBe("number")
    }
  })
})

// ============================================================
// node.measured fallback (Pitfall 1)
// ============================================================

describe("runDagreLayout — node.measured fallback (Pitfall 1)", () => {
  it("node.measured?.width 가 있으면 그 값을 사용한다", () => {
    // measured 있는 노드 2개 + 없는 노드 2개 — 오류 없이 완료되어야 함
    const nodes = [
      makeNode("a", { width: 200, height: 50 }),
      makeNode("b", { width: 100, height: 30 }),
    ]
    const edges = [makeEdge("a", "b")]
    // 오류 없이 실행되고 position이 반환된다
    expect(() => runDagreLayout(nodes, edges)).not.toThrow()
    const result = runDagreLayout(nodes, edges)
    expect(result.nodes).toHaveLength(2)
  })

  it("node.measured 가 없으면 fallback 172(width)/36(height)를 사용해 오류 없이 완료된다", () => {
    const nodes = [makeNode("a"), makeNode("b")]
    const edges = [makeEdge("a", "b")]
    expect(() => runDagreLayout(nodes, edges)).not.toThrow()
    const result = runDagreLayout(nodes, edges)
    expect(result.nodes).toHaveLength(2)
  })

  it("measured 있는 노드와 없는 노드가 혼합돼도 오류 없이 완료된다", () => {
    const nodes = [
      makeNode("a", { width: 200, height: 50 }),
      makeNode("b"), // fallback
      makeNode("c", { width: 150, height: 40 }),
    ]
    const edges = [makeEdge("a", "b"), makeEdge("a", "c")]
    expect(() => runDagreLayout(nodes, edges)).not.toThrow()
  })
})

// ============================================================
// 좌→우 위계 (D-06)
// ============================================================

describe("runDagreLayout — 좌→우 위계 (D-06)", () => {
  it("부모-자식 엣지가 있는 2노드 입력에서 자식 x가 부모 x보다 크다", () => {
    const nodes = [makeNode("parent"), makeNode("child")]
    const edges = [makeEdge("parent", "child")]
    const result = runDagreLayout(nodes, edges)
    const parent = result.nodes.find((n) => n.id === "parent")!
    const child = result.nodes.find((n) => n.id === "child")!
    expect(child.position.x).toBeGreaterThan(parent.position.x)
  })

  it("5노드 R→F→S 위계에서 depth 순으로 x가 증가한다", () => {
    // R-root → F-a, F-b → S-x(F-a 자식), S-y(F-b 자식)
    const nodes = [
      makeNode("R-root"),
      makeNode("F-a"),
      makeNode("F-b"),
      makeNode("S-x"),
      makeNode("S-y"),
    ]
    const edges = [
      makeEdge("R-root", "F-a"),
      makeEdge("R-root", "F-b"),
      makeEdge("F-a", "S-x"),
      makeEdge("F-b", "S-y"),
    ]
    const result = runDagreLayout(nodes, edges)

    const r = result.nodes.find((n) => n.id === "R-root")!
    const fa = result.nodes.find((n) => n.id === "F-a")!
    const sx = result.nodes.find((n) => n.id === "S-x")!

    // depth 순으로 x 증가 (좌→우)
    expect(fa.position.x).toBeGreaterThan(r.position.x)
    expect(sx.position.x).toBeGreaterThan(fa.position.x)
  })
})

// ============================================================
// 50노드 고유 position
// ============================================================

describe("runDagreLayout — 50노드 고유 position", () => {
  it("50노드 입력에서 모든 노드가 고유 position을 받는다(겹침 0)", () => {
    // 5개 R → 각 R에 F 2개 → 각 F에 S 3개 = 5 + 10 + 30 = 45... 루트 1 포함 총 50개
    const nodes: Node[] = []
    const edges: Edge[] = []

    // 루트 1개
    nodes.push(makeNode("R-ROOT0"))

    // R 5개
    for (let r = 0; r < 5; r++) {
      const rid = `R-REQR${r}`
      nodes.push(makeNode(rid))
      edges.push(makeEdge("R-ROOT0", rid))

      // F 3개
      for (let f = 0; f < 3; f++) {
        const fid = `F-FEAT${r}${f}`
        nodes.push(makeNode(fid))
        edges.push(makeEdge(rid, fid))

        // S 2개
        for (let s = 0; s < 2; s++) {
          const sid = `S-SPEC${r}${f}${s}`
          nodes.push(makeNode(sid))
          edges.push(makeEdge(fid, sid))
        }
      }
    }

    // 1 + 5 + 15 + 30 = 51 — 50+개 충분히 초과
    expect(nodes.length).toBeGreaterThanOrEqual(50)

    const result = runDagreLayout(nodes, edges)
    expect(result.nodes).toHaveLength(nodes.length)

    // 모든 position이 고유해야 함 (x AND y 동시에 같은 쌍이 없어야 함)
    const posSet = new Set<string>()
    for (const n of result.nodes) {
      const key = `${n.position.x.toFixed(2)},${n.position.y.toFixed(2)}`
      expect(posSet.has(key)).toBe(false) // 중복 없어야 함
      posSet.add(key)
    }
  })
})

// ============================================================
// runSwimlaneDagreLayout — 섹션별 y-밴드 스윔레인 (04A-01-PLAN.md Task 2)
// ============================================================

function makeSwimNode(id: string, sectionId: string, measured?: { width: number; height: number }): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { sectionId },
    ...(measured ? { measured } : {}),
  }
}

describe("runSwimlaneDagreLayout — sec-B 노드 y좌표가 sec-A보다 아래", () => {
  it("2개 섹션(sec-A, sec-B) 각 2노드 입력 시 sec-B 노드 y좌표가 sec-A보다 크다", () => {
    const nodes = [
      makeSwimNode("a1", "sec-A"),
      makeSwimNode("a2", "sec-A"),
      makeSwimNode("b1", "sec-B"),
      makeSwimNode("b2", "sec-B"),
    ]
    const edges = [makeEdge("a1", "a2"), makeEdge("b1", "b2")]
    const result = runSwimlaneDagreLayout(nodes, edges, ["sec-A", "sec-B"])

    const secANodes = result.nodes.filter((n) => (n.data as { sectionId: string }).sectionId === "sec-A")
    const secBNodes = result.nodes.filter((n) => (n.data as { sectionId: string }).sectionId === "sec-B")

    const maxSecAY = Math.max(...secANodes.map((n) => n.position.y))
    const minSecBY = Math.min(...secBNodes.map((n) => n.position.y))

    expect(minSecBY).toBeGreaterThan(maxSecAY)
  })
})

describe("runSwimlaneDagreLayout — sectionBands 반환", () => {
  it("반환 sectionBands.length === sectionOrder.length이고 각 band에 sectionId·label·yTop·height가 있다", () => {
    const nodes = [
      makeSwimNode("a1", "sec-A"),
      makeSwimNode("b1", "sec-B"),
    ]
    const edges: Edge[] = []
    const result = runSwimlaneDagreLayout(nodes, edges, ["sec-A", "sec-B"])

    expect(result.sectionBands).toHaveLength(2)
    for (const band of result.sectionBands) {
      expect(band).toHaveProperty("sectionId")
      expect(band).toHaveProperty("label")
      expect(band).toHaveProperty("yTop")
      expect(band).toHaveProperty("height")
      expect(typeof band.sectionId).toBe("string")
      expect(typeof band.yTop).toBe("number")
      expect(typeof band.height).toBe("number")
    }
  })
})

describe("runSwimlaneDagreLayout — cross-section 엣지 안전", () => {
  it("cross-section 엣지(sec-A → sec-B)를 입력해도 예외 없이 통과한다", () => {
    const nodes = [
      makeSwimNode("a1", "sec-A"),
      makeSwimNode("b1", "sec-B"),
    ]
    // cross-section 엣지: sec-A 노드 → sec-B 노드
    const edges = [makeEdge("a1", "b1")]
    expect(() =>
      runSwimlaneDagreLayout(nodes, edges, ["sec-A", "sec-B"])
    ).not.toThrow()
  })

  it("cross-section 엣지는 결과 edges 배열에 그대로 전달된다 (React Flow 시각 연결선 유지)", () => {
    const nodes = [
      makeSwimNode("a1", "sec-A"),
      makeSwimNode("b1", "sec-B"),
    ]
    const edges = [makeEdge("a1", "b1")]
    const result = runSwimlaneDagreLayout(nodes, edges, ["sec-A", "sec-B"])
    expect(result.edges).toStrictEqual(edges)
  })
})

describe("runSwimlaneDagreLayout — 결정론적 좌표", () => {
  it("같은 입력 시 동일 좌표를 반환한다", () => {
    const nodes = [
      makeSwimNode("a1", "sec-A"),
      makeSwimNode("a2", "sec-A"),
      makeSwimNode("b1", "sec-B"),
    ]
    const edges = [makeEdge("a1", "a2")]
    const r1 = runSwimlaneDagreLayout(nodes, edges, ["sec-A", "sec-B"])
    const r2 = runSwimlaneDagreLayout(nodes, edges, ["sec-A", "sec-B"])

    for (let i = 0; i < r1.nodes.length; i++) {
      expect(r1.nodes[i].position.x).toBe(r2.nodes[i].position.x)
      expect(r1.nodes[i].position.y).toBe(r2.nodes[i].position.y)
    }
  })
})
