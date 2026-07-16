import { cn } from "@/lib/utils"

// animate-pulse 배경색: --color-surface (bg-accent는 초록 액센트로 로딩 플레이스홀더에 부적합)
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md", className)}
      style={{ background: 'var(--color-surface)' }}
      {...props}
    />
  )
}

export { Skeleton }
