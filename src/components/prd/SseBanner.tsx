'use client'

// SseBanner — SSE 외부 변경 감지 배너 (D-03 편집 보호, 02A-03)
// - shadcn Alert 기반, 48px 고정 높이
// - role="alert" aria-live="polite" 접근성
// - 200ms fade 전환 (prefers-reduced-motion 존중)
// - 두 액션: "다시 불러오기" | "내 편집 유지"

import { Alert, AlertDescription } from '@/components/ui/alert'

interface SseBannerProps {
  visible: boolean
  onReload: () => void
  onKeepEditing: () => void
}

export function SseBanner({ visible, onReload, onKeepEditing }: SseBannerProps) {
  if (!visible) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className="animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none"
    >
      <Alert className="flex h-12 items-center justify-between gap-4 rounded-none border-x-0 border-t-0 px-4 py-0">
        <AlertDescription className="text-sm text-foreground">
          하네스가 이 PRD를 변경했어요. 어떻게 처리할까요?
        </AlertDescription>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onReload}
            className="rounded px-2 py-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            다시 불러오기
          </button>
          <button
            type="button"
            onClick={onKeepEditing}
            className="rounded px-2 py-1 text-sm font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            내 편집 유지
          </button>
        </div>
      </Alert>
    </div>
  )
}
