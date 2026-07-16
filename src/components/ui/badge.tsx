import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[var(--radius-sm)] border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-[var(--color-accent-dim)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-accent-dim)] aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] [a&]:hover:bg-[var(--color-surface)]/80",
        accent:
          "bg-[var(--color-accent)] text-[var(--color-text)] border-transparent [a&]:hover:bg-[var(--color-accent-hover)]",
        secondary:
          "bg-[var(--color-surface)] text-[var(--color-text)] [a&]:hover:bg-[var(--color-surface)]/80",
        destructive:
          "bg-destructive text-[var(--color-text)] focus-visible:ring-destructive/20 [a&]:hover:bg-destructive/90",
        outline:
          "border-[var(--color-border)] text-[var(--color-text)] [a&]:hover:bg-[var(--color-surface)]",
        ghost: "[a&]:hover:bg-[var(--color-surface)] [a&]:hover:text-[var(--color-text)]",
        link: "text-[var(--color-accent)] underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
