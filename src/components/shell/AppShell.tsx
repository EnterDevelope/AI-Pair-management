'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * 영구 앱 셸 — 좌측 사이드바 + 메인 콘텐츠 래퍼.
 * usePathname() 사용으로 클라이언트 컴포넌트 분리 필수('use client' 분리 패턴).
 * RootLayout(서버 컴포넌트)은 AppShell만 임포트해 use client 경계를 관리한다.
 *
 * 데스크톱 우선: 모바일/태블릿 브레이크포인트 없음 (D-09).
 * 잠김 로직: PipelineTabs 잠김 아이콘+툴팁을 NavItem으로 이식 (Pitfall 5).
 * Phase 3까지 projectId 동적 연동 없음 — 정적 내비 + 잠김 표시 (Open Q1).
 */

interface NavItem {
  label: string
  href: string
  locked: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'PRD', href: '/prd', locked: false },
  { label: '기능명세', href: '/features', locked: false },
  { label: '유저플로우', href: '/flow', locked: false },
  { label: '와이어프레임', href: '/wireframes', locked: true },
  { label: '디자인 시스템', href: '/design', locked: false },
]

const LOCKED_TOOLTIP = '이전 단계를 먼저 완료하세요'

const navItemBase =
  'flex min-h-[44px] items-center gap-[var(--spacing-2)] rounded-[var(--radius-md)] px-[var(--spacing-4)] text-sm font-medium transition-colors'

const navItemActive =
  'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-l-2 border-[var(--color-accent)]'

const navItemInactive =
  'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'

const navItemLocked =
  'text-[var(--color-text-muted)] cursor-not-allowed select-none opacity-60'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // 현재 보고 있는 프로젝트 컨텍스트를 내비게이션 간에 유지한다.
  // 쿼리를 버리면 /features 등이 listProjects() 첫 디렉토리로 떨어져
  // 사용자가 보던 프로젝트의 데이터가 사라진 것처럼 보인다.
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project')

  return (
    <TooltipProvider>
      <div className="flex min-h-screen">
        {/* 좌측 사이드바 — w-56(224px) 고정, 데스크톱 우선 (D-09) */}
        <aside
          className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col"
        >
          {/* 앱 이름 */}
          <div className="px-[var(--spacing-4)] py-[var(--spacing-6)]">
            <span className="text-base font-semibold text-[var(--color-text)] tracking-tight">
              AIPM
            </span>
          </div>

          {/* 내비 섹션 */}
          <nav className="flex flex-col gap-[var(--spacing-1)] px-[var(--spacing-2)]">
            <span className="px-[var(--spacing-2)] py-[var(--spacing-1)] text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
              기획 단계
            </span>

            {NAV_ITEMS.map((item) => {
              // locked 항목은 의도적으로 active 상태를 무시한다 (WR-06).
              // 현재는 정적 잠금이라 잠긴 경로로 진입 자체가 불가능해 locked+active
              // 조합이 발생하지 않는다. Phase 3 projectId 연동으로 잠금 해제 로직이
              // 들어올 때 locked 분기에도 active 표식을 추가할 것.
              if (item.locked) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <span
                        role="link"
                        aria-disabled="true"
                        tabIndex={-1}
                        className={cn(navItemBase, navItemLocked)}
                      >
                        <Lock aria-hidden="true" className="size-3.5 shrink-0" />
                        {item.label}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent role="tooltip">{LOCKED_TOOLTIP}</TooltipContent>
                  </Tooltip>
                )
              }

              const isActive =
                pathname === item.href || (pathname?.startsWith(item.href + '/') ?? false)

              const href = projectId
                ? `${item.href}?project=${encodeURIComponent(projectId)}`
                : item.href

              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    navItemBase,
                    isActive ? navItemActive : navItemInactive,
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* 메인 콘텐츠 영역 */}
        <main className="flex-1 bg-[var(--color-bg)] p-[var(--spacing-8)]">
          {children}
        </main>
      </div>
    </TooltipProvider>
  )
}
