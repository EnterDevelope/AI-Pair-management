'use client'

// SaveButton — 저장 상태(idle/saving/saved/error) 표시 버튼 (02A-02-PLAN.md Task 2)
// min-h-[44px] 터치 타깃 보장 (WCAG 2.5.5)

import { Button } from '@/components/ui/button'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface SaveButtonProps {
  status: SaveStatus
  disabled?: boolean
  'data-testid'?: string
}

const LABEL: Record<SaveStatus, string> = {
  idle: '저장',
  saving: '저장 중…',
  saved: '저장됨',
  error: '저장 실패',
}

export function SaveButton({ status, disabled, 'data-testid': testId }: SaveButtonProps) {
  return (
    <Button
      type="button"
      disabled={disabled || status === 'saving'}
      data-testid={testId ?? 'save-button'}
      className="min-h-[44px]"
      aria-busy={status === 'saving'}
    >
      {LABEL[status]}
    </Button>
  )
}
