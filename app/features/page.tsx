// 기능명세 3뷰 페이지 (03-03-PLAN.md Task 3)
// 서버 컴포넌트: AIPM_PROJECT_DIR 내 features.json 로드 → FeaturesShell에 전달
// URL: /features?project=[projectId]
// features.json 없으면 빈 items로 초기화 (prd.json과 달리 파일 부재가 정상 상태)

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import Link from 'next/link'
import { FeaturesShell } from '@/components/features/FeaturesShell'
import { FeaturesSchema } from '@/schemas/graph/features'
import type { Features } from '@/schemas/graph/features'

interface PageProps {
  searchParams: Promise<{ project?: string }>
}

type FeatureItem = NonNullable<Features['items']>[number]

async function loadFeatures(
  projectId: string
): Promise<{ items: FeatureItem[]; projectId: string } | null> {
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

  const featuresPath = path.join(projectDir, 'graph', 'features.json')
  try {
    const raw = await fs.readFile(featuresPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = FeaturesSchema.safeParse(parsed)
    // 파일 존재하지만 스키마 불일치 → null (오염 방지)
    if (!result.success) return null
    return { items: result.data.items ?? [], projectId }
  } catch {
    // features.json 없음 = 정상 (아직 생성 전) → 빈 목록
    return { items: [], projectId }
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

export default async function FeaturesPage({ searchParams }: PageProps) {
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

  const data = await loadFeatures(projectId)

  if (!data) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">
          기능명세가 없습니다. (프로젝트:{' '}
          <code className="text-sm">{projectId}</code>)
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          홈으로
        </Link>
      </main>
    )
  }

  return (
    <main className="flex h-screen flex-col">
      <FeaturesShell
        projectId={data.projectId}
        initialItems={data.items}
      />
    </main>
  )
}
