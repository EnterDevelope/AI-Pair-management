// PRD 뷰어·편집 페이지 (02A-02-PLAN.md Task 2)
// 서버 컴포넌트: AIPM_PROJECT_DIR 내 기본 프로젝트의 PRD를 로드해 PrdForm에 전달
// URL: /prd?project=[projectId] — 쿼리 파라미터로 프로젝트 선택
// project 미지정 시 첫 번째 프로젝트 자동 선택

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import Link from 'next/link'
import { PrdForm } from '@/components/prd/PrdForm'
import { PrdSchema } from '@/schemas/graph/prd'

interface PageProps {
  searchParams: Promise<{ project?: string }>
}

async function loadPrd(projectId: string) {
  const base = process.env.AIPM_PROJECT_DIR ?? process.cwd()
  const projectDir = path.resolve(base, projectId)

  // path traversal 차단
  const normalizedBase = path.resolve(base)
  if (projectDir !== normalizedBase && !projectDir.startsWith(normalizedBase + path.sep)) {
    return null
  }

  const prdPath = path.join(projectDir, 'graph', 'prd.json')
  try {
    const raw = await fs.readFile(prdPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = PrdSchema.safeParse(parsed)
    if (!result.success) return null
    return { prd: result.data, projectId }
  } catch {
    return null
  }
}

async function listProjects(): Promise<string[]> {
  const base = process.env.AIPM_PROJECT_DIR ?? process.cwd()
  try {
    const entries = await fs.readdir(base, { withFileTypes: true })
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
    return dirs
  } catch {
    return []
  }
}

export default async function PrdPage({ searchParams }: PageProps) {
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

  const data = await loadPrd(projectId)

  if (!data) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">
          PRD 파일을 불러올 수 없어요. (프로젝트:{' '}
          <code className="text-sm">{projectId}</code>)
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          홈으로
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6">
        <Link href="/" className="text-sm text-muted-foreground underline">
          ← 홈으로
        </Link>
      </nav>
      <h1 className="mb-8 text-2xl font-bold">PRD 편집</h1>
      <PrdForm projectId={data.projectId} initialPrd={data.prd} />
    </main>
  )
}
