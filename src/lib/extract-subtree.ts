import type { Features } from '@/schemas/graph/features'
import type { Prd } from '@/schemas/graph/prd'
import type { Userflow } from '@/schemas/graph/userflow'
import type { QueueTargetArtifact } from '@/schemas/queue'

export class TargetNotFoundError extends Error {
  constructor(
    public readonly targetArtifact: QueueTargetArtifact,
    public readonly targetId: string
  ) {
    super(`${targetArtifact} 산출물에서 요청 대상을 찾을 수 없어요.`)
    this.name = 'TargetNotFoundError'
  }
}

/**
 * 큐 적재와 apply 충돌 검사가 공유하는 해시 대상 선택 규칙.
 * 호출자는 각 산출물 스키마로 검증된 그래프를 전달해야 한다.
 */
export function extractTargetSubtree(
  targetArtifact: QueueTargetArtifact,
  graph: Features | Userflow | Prd,
  targetId: string
): unknown {
  switch (targetArtifact) {
    case 'features': {
      const target = ((graph as Features).items ?? []).find((item) => item.id === targetId)
      if (target == null) throw new TargetNotFoundError(targetArtifact, targetId)
      return target
    }
    case 'flow': {
      const target = ((graph as Userflow).nodes ?? []).find((node) => node.id === targetId)
      if (target == null) throw new TargetNotFoundError(targetArtifact, targetId)
      return target
    }
    case 'prd':
      return graph as Prd
    default: {
      const exhaustive: never = targetArtifact
      throw new Error(`지원하지 않는 산출물: ${exhaustive}`)
    }
  }
}
