import { describe, expect, it } from 'vitest'

import { extractTargetSubtree, TargetNotFoundError } from '../extract-subtree'

describe('extractTargetSubtree', () => {
  it('features는 targetId와 일치하는 전체 항목을 반환한다', () => {
    const item = { id: 'F-AAAAAA', title: '결제', parent: 'R-AAAAAA', links: ['P-FLOW01'] }
    const graph = { schemaVersion: '1.0' as const, items: [item] }
    expect(extractTargetSubtree('features', graph, item.id)).toBe(item)
  })

  it('flow는 sectionId와 versionId를 포함한 전체 디스크 노드를 반환한다', () => {
    const node = {
      id: 'P-FLOW01',
      type: 'page' as const,
      label: '결제',
      sectionId: 'checkout',
      versionId: 'P-VER001',
      positionX: 10,
      positionY: 20,
    }
    const graph = { schemaVersion: '1.0' as const, nodes: [node], edges: [] }
    expect(extractTargetSubtree('flow', graph, node.id)).toBe(node)
  })

  it('prd는 targetId와 무관하게 검증된 전체 그래프를 반환한다', () => {
    const graph = { schemaVersion: '1.0' as const, id: 'R-AAAAAA', title: '테스트' }
    expect(extractTargetSubtree('prd', graph, 'overview')).toBe(graph)
  })

  it('features와 flow 대상이 없으면 TargetNotFoundError를 던진다', () => {
    expect(() => extractTargetSubtree('features', { schemaVersion: '1.0', items: [] }, 'F-ZZZZZZ'))
      .toThrow(TargetNotFoundError)
    expect(() => extractTargetSubtree('flow', { schemaVersion: '1.0', nodes: [], edges: [] }, 'P-ZZZZZZ'))
      .toThrow(TargetNotFoundError)
  })
})
