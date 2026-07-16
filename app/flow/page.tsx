// 유저플로우 다이어그램 페이지 (04A-03-PLAN.md Task 3)
// 서버 컴포넌트: userflow.json 로드 → useUserflowStore 초기화 → UserflowDiagram 렌더
// URL: /flow?project=[projectId]
// userflow.json 없으면 빈 상태 안내 메시지 (파일 부재 = 정상 초기 상태)

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import Link from 'next/link'

import { UserflowDiagram } from '@/components/userflow/UserflowCanvas'
import { UserflowSchema } from '@/schemas/graph/userflow'
import type { Userflow } from '@/schemas/graph/userflow'

interface PageProps {
  searchParams: Promise<{ project?: string }>
}

type UserflowNode = NonNullable<Userflow['nodes']>[number]
type UserflowEdge = NonNullable<Userflow['edges']>[number]
type UserflowVersion = NonNullable<Userflow['versions']>[number]
type UserflowVersionGroup = NonNullable<Userflow['versionGroups']>[number]

interface UserflowData {
  projectId: string
  nodes: UserflowNode[]
  edges: UserflowEdge[]
  versions: UserflowVersion[]
  versionGroups: UserflowVersionGroup[]
}

async function loadUserflow(projectId: string): Promise<UserflowData | null> {
  const base = process.env.AIPM_PROJECT_DIR ?? process.cwd()
  const projectDir = path.resolve(base, projectId)

  // path traversal 차단 (T-03-PT)
  const normalizedBase = path.resolve(base)
  if (
    projectDir !== normalizedBase &&
    !projectDir.startsWith(normalizedBase + path.sep)
  ) {
    return null
  }

  const userflowPath = path.join(projectDir, 'graph', 'userflow.json')
  try {
    const raw = await fs.readFile(userflowPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = UserflowSchema.safeParse(parsed)
    // 파일 존재하지만 스키마 불일치 → null
    if (!result.success) return null
    return {
      projectId,
      nodes: result.data.nodes ?? [],
      edges: result.data.edges ?? [],
      versions: result.data.versions ?? [],
      versionGroups: result.data.versionGroups ?? [],
    }
  } catch {
    // userflow.json 없음 = 정상 초기 상태 → 빈 다이어그램
    return { projectId, nodes: [], edges: [], versions: [], versionGroups: [] }
  }
}

async function listProjects(): Promise<string[]> {
  const base = process.env.AIPM_PROJECT_DIR ?? process.cwd()
  try {
    const entries = await fs.readdir(base, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

export default async function FlowPage({ searchParams }: PageProps) {
  const { project } = await searchParams

  let projectId = project
  if (!projectId) {
    const projects = await listProjects()
    projectId = projects[0]
  }

  if (!projectId) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">
          프로젝트를 찾을 수 없어요.{' '}
          <code className="text-sm">AIPM_PROJECT_DIR</code>을 확인해 주세요.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          홈으로
        </Link>
      </main>
    )
  }

  const data = await loadUserflow(projectId)

  if (!data) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">
          유저플로우 데이터를 불러올 수 없어요. (프로젝트:{' '}
          <code className="text-sm">{projectId}</code>)
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          홈으로
        </Link>
      </main>
    )
  }

  // 서버에서 읽은 userflow.json 노드/엣지를 UserflowDiagram에 주입한다.
  // UserflowDiagram(클라이언트)이 마운트 시 스토어를 하이드레이션한다.
  // nodes 비면 UserflowCanvas 내부 빈 상태 안내가 표시된다.
  // (SSE 실시간 동기화는 04A-04에서 추가 예정)
  return (
    <main className="flex h-screen flex-col">
      <UserflowDiagram
        initialNodes={data.nodes}
        initialEdges={data.edges}
        initialVersions={data.versions}
        initialVersionGroups={data.versionGroups}
        projectId={data.projectId}
      />
    </main>
  )
}
