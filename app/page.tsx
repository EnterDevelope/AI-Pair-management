import fs from 'node:fs/promises'
import path from 'node:path'
import Link from 'next/link'
import { ProjectSchema } from '@/schemas/project'

/**
 * 루트 대시보드 (서버 컴포넌트) — 멀티 프로젝트/워크스페이스 모델.
 *
 * AIPM_PROJECT_DIR(미설정 시 cwd)는 여러 기획 프로젝트를 담는 워크스페이스다.
 * 각 프로젝트는 project.json을 가진 하위 폴더다.
 * - `/`            → 프로젝트 목록
 * - `/?project=id` → 해당 프로젝트 상세 (사이드바 내비로 단계 이동)
 *
 * AppShell이 layout에서 사이드바 내비(파이프라인 단계)를 담당하므로
 * 이 페이지는 프로젝트 목록 + 선택 화면만 렌더한다.
 */

interface PageProps {
  searchParams: Promise<{ project?: string }>
}

function workspaceBase(): string {
  return process.env.AIPM_PROJECT_DIR ?? process.cwd()
}

// base 밖으로 나가는 path traversal 차단(T-02A-04, watch/api와 동일 규칙)
function resolveProjectDir(base: string, id: string): string | null {
  const resolved = path.resolve(base, id)
  const normalizedBase = path.resolve(base)
  if (resolved !== normalizedBase && !resolved.startsWith(normalizedBase + path.sep)) {
    return null
  }
  return resolved
}

// 워크스페이스 하위에서 project.json을 가진 폴더만 프로젝트로 본다.
async function listProjects(base: string): Promise<string[]> {
  let dirNames: string[]
  try {
    const entries = await fs.readdir(base, { withFileTypes: true })
    dirNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
  const projects: string[] = []
  for (const name of dirNames) {
    try {
      await fs.access(path.join(base, name, 'project.json'))
      projects.push(name)
    } catch {
      // project.json 없음 — 기획 프로젝트가 아님
    }
  }
  return projects.sort()
}

async function readPipelineStatus(projectDir: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(projectDir, 'project.json'), 'utf-8')
    const parsed = ProjectSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data.pipelineStatus ?? 'empty'
    return 'empty'
  } catch {
    // 파일 없음 또는 파싱 실패 — 빈 상태로 폴백
    return 'empty'
  }
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const base = workspaceBase()
  const { project } = await searchParams

  // 프로젝트 미선택 → 프로젝트 목록
  if (!project) {
    const projects = await listProjects(base)
    return (
      <div className="flex flex-col gap-[var(--spacing-8)]">
        <header className="flex flex-col gap-[var(--spacing-2)]">
          <h1 className="text-[var(--font-size-3xl)] font-semibold text-[var(--color-text)]">
            워크스페이스
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            기획 프로젝트를 선택하세요.
          </p>
        </header>

        {projects.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            아직 프로젝트가 없어요. `/aipm` 커맨드로 첫 기획을 시작하세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-[var(--spacing-2)]">
            {projects.map((id) => (
              <li key={id}>
                <Link
                  href={`/?project=${encodeURIComponent(id)}`}
                  className="flex min-h-[44px] items-center rounded-[var(--radius-md)] bg-[var(--color-surface)] px-[var(--spacing-4)] text-[var(--color-text)] hover:bg-[var(--color-accent-dim)] transition-colors"
                >
                  {id}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // 프로젝트 선택 → 프로젝트 대시보드 (사이드바 내비로 단계 이동)
  const projectDir = resolveProjectDir(base, project)
  if (projectDir === null) {
    return (
      <div className="flex flex-col gap-[var(--spacing-4)]">
        <p className="text-sm text-[var(--color-text-muted)]">유효하지 않은 프로젝트예요.</p>
        <Link href="/" className="text-sm text-[var(--color-accent)] underline">
          프로젝트 목록으로
        </Link>
      </div>
    )
  }

  const pipelineStatus = await readPipelineStatus(projectDir)

  return (
    <div className="flex flex-col gap-[var(--spacing-8)]">
      <header className="flex flex-col gap-[var(--spacing-2)]">
        <Link href="/" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          ← 프로젝트 목록
        </Link>
        <h1 className="text-[var(--font-size-3xl)] font-semibold text-[var(--color-text)]">
          {project}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">아이디어에서 와이어프레임까지</p>
      </header>

      <div className="rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-[var(--spacing-6)] shadow-[var(--shadow-sm)]">
        <p className="text-sm text-[var(--color-text-muted)]">
          파이프라인 상태: <span className="text-[var(--color-text)]">{pipelineStatus}</span>
        </p>
        <p className="mt-[var(--spacing-2)] text-sm text-[var(--color-text-muted)]">
          좌측 사이드바에서 기획 단계를 선택하세요.
        </p>
      </div>
    </div>
  )
}
