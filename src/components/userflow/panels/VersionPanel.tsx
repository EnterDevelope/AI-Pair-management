'use client'
// VersionPanel - 유저플로우 버전 관리 패널 (04A-05-PLAN.md Task 2)
//
// 기능:
//   - 버전 드롭다운: 현재 활성 버전 선택 (versions 배열 기반)
//   - "새 유저 플로우" 버튼: createVersionGroup → PATCH 영속화
//   - "수정본 만들기" 버튼: createRevision(activeVersionId) → PATCH 영속화
//
// D-08: 웹 버튼이 버전 생성 담당. CLI /aipm flow는 생성/재생성만.
// D-07: 모든 버전은 단일 userflow.json 단일 store에 공존.
// 안티슬롭: 순수 #000/#fff 금지, em-dash 금지, Inter 폰트 금지

import { useCallback } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { useUserflowStore } from '@/stores/userflowStore'

interface VersionPanelProps {
  projectId: string
  selfWriteRef: React.MutableRefObject<boolean>
}

function toPersistedNode(node: Node) {
  const data = node.data as {
    label?: string
    sectionId?: string
    pageId?: string
    featureId?: string
    description?: string
    versionId?: string
  }
  return {
    id: node.id,
    type: node.type,
    label: data.label,
    sectionId: data.sectionId,
    pageId: data.pageId,
    featureId: data.featureId,
    description: data.description,
    versionId: data.versionId,
    positionX: node.position.x,
    positionY: node.position.y,
  }
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

export function VersionPanel({ projectId, selfWriteRef }: VersionPanelProps) {
  const {
    versions,
    versionGroups,
    activeVersionId,
    setActiveVersionId,
    createVersionGroup,
    createRevision,
  } = useUserflowStore()

  // 버전 그룹 생성 후 versions/versionGroups PATCH 영속화
  const handleNewFlow = useCallback(async () => {
    const label = `유저 플로우 ${versionGroups.length + 1}`
    createVersionGroup(label)
    // 스토어 갱신 후 최신 상태 읽기 (Zustand getState 패턴)
    const state = useUserflowStore.getState()
    selfWriteRef.current = true
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/userflow`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versions: state.versions,
          versionGroups: state.versionGroups,
          nodes: state.nodes.map(toPersistedNode),
          edges: state.edges.map(toPersistedEdge),
        }),
      })
      if (!response.ok) throw new Error(`유저플로우 저장 실패: ${response.status}`)
    } catch (err) {
      selfWriteRef.current = false
      console.error('[VersionPanel] 새 유저 플로우 PATCH 실패:', err)
    }
  }, [projectId, versionGroups.length, createVersionGroup, selfWriteRef])

  // 현재 버전 복제 후 nodes/versions/versionGroups PATCH 영속화
  const handleRevision = useCallback(async () => {
    if (activeVersionId == null) return
    const baseVersion = versions.find((v) => v.id === activeVersionId)
    const baseLabel = baseVersion?.label ?? '기본'
    const label = `${baseLabel} 수정본`
    createRevision(activeVersionId, label)
    // 스토어 갱신 후 최신 상태 읽기
    const {
      nodes: updatedNodes,
      edges: updatedEdges,
      versions: updatedVersions,
      versionGroups: updatedGroups,
    } = useUserflowStore.getState()
    selfWriteRef.current = true
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/userflow`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: updatedNodes.map(toPersistedNode),
          edges: updatedEdges.map(toPersistedEdge),
          versions: updatedVersions,
          versionGroups: updatedGroups,
        }),
      })
      if (!response.ok) throw new Error(`유저플로우 저장 실패: ${response.status}`)
    } catch (err) {
      selfWriteRef.current = false
      console.error('[VersionPanel] 수정본 만들기 PATCH 실패:', err)
    }
  }, [projectId, activeVersionId, versions, createRevision, selfWriteRef])

  // 버전 드롭다운: 선택 시 activeVersionId 전환
  const handleVersionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setActiveVersionId(e.target.value || null)
    },
    [setActiveVersionId]
  )

  // versions가 없으면 버전 전환 UI 숨김 (초기 상태: 단일 버전 없음)
  const showVersionSelect = versions.length > 0

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* 버전 선택 드롭다운 */}
      {showVersionSelect && (
        <select
          value={activeVersionId ?? ''}
          onChange={handleVersionChange}
          className="text-sm rounded px-2 py-1"
          style={{
            background: 'var(--color-surface-raised)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            minWidth: '140px',
          }}
          aria-label="버전 선택"
        >
          <option value="">전체 보기</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id ?? ''}>
              {v.label ?? v.id}
            </option>
          ))}
        </select>
      )}

      {/* 새 유저 플로우 버튼 */}
      <button
        onClick={() => void handleNewFlow()}
        className="text-sm rounded px-3 py-1 transition-colors"
        style={{
          background: 'var(--color-surface-raised)',
          color: 'var(--color-text-muted)',
          border: '1px solid var(--color-border)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--color-text)'
          e.currentTarget.style.borderColor = 'var(--color-accent)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--color-text-muted)'
          e.currentTarget.style.borderColor = 'var(--color-border)'
        }}
        title="현재 유저플로우와 별개인 새 유저 플로우를 만들어요"
      >
        새 유저 플로우
      </button>

      {/* 수정본 만들기 버튼: 현재 버전의 복제본 */}
      <button
        onClick={() => void handleRevision()}
        disabled={activeVersionId == null}
        className="text-sm rounded px-3 py-1 transition-colors"
        style={{
          background:
            activeVersionId != null
              ? 'oklch(38% 0.14 160 / 0.15)'
              : 'var(--color-surface-raised)',
          color:
            activeVersionId != null ? 'oklch(72% 0.18 160)' : 'var(--color-text-muted)',
          border:
            activeVersionId != null
              ? '1px solid oklch(72% 0.18 160 / 0.4)'
              : '1px solid var(--color-border)',
          cursor: activeVersionId != null ? 'pointer' : 'not-allowed',
          opacity: activeVersionId != null ? 1 : 0.5,
        }}
        onMouseEnter={(e) => {
          if (activeVersionId == null) return
          e.currentTarget.style.background = 'oklch(38% 0.14 160 / 0.25)'
        }}
        onMouseLeave={(e) => {
          if (activeVersionId == null) return
          e.currentTarget.style.background = 'oklch(38% 0.14 160 / 0.15)'
        }}
        title={
          activeVersionId != null
            ? '현재 버전을 복제해 새 수정본을 만들어요'
            : '먼저 버전을 선택해 주세요'
        }
      >
        수정본 만들기
      </button>

      {/* 현재 버전 레이블 (버전이 있을 때만) */}
      {activeVersionId != null && (
        <span
          className="text-xs ml-auto"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {versions.find((v) => v.id === activeVersionId)?.label ?? activeVersionId}
        </span>
      )}
    </div>
  )
}
