// IdChip — R/F/S 레벨별 기능적 색 칩 (D-08, 03-04-PLAN.md Task 2)
//
// 규칙:
//   - border-only 색 + --color-surface fill (풀채도 fill 금지 — AP-01 회피)
//   - R: oklch(0.62 0.14 250) blue-indigo
//   - F: oklch(0.58 0.18 150) accent green
//   - S: oklch(0.60 0.12 200) teal
//   - --font-mono 12px weight 400
//   - pure #000/#fff 금지, var(--color-*) 우선, Inter 금지, em-dash 금지

type IdPrefix = 'R' | 'F' | 'S' | string

interface IdChipProps {
  id: string
  className?: string
}

// 레벨 색상 맵 (border-only — fill은 --color-surface 고정)
const LEVEL_COLOR: Record<string, string> = {
  R: 'oklch(0.62 0.14 250)',
  F: 'oklch(0.58 0.18 150)',
  S: 'oklch(0.60 0.12 200)',
}

function getPrefix(id: string): IdPrefix {
  return id.charAt(0).toUpperCase()
}

export function IdChip({ id, className = '' }: IdChipProps) {
  const prefix = getPrefix(id)
  const borderColor = LEVEL_COLOR[prefix] ?? 'var(--color-border)'

  return (
    <span
      className={`inline-flex items-center shrink-0 rounded px-1 py-0 text-[12px] leading-[1.4] font-normal font-mono ${className}`}
      style={{
        border: `1px solid ${borderColor}`,
        background: 'var(--color-surface)',
        color: 'var(--color-text-muted)',
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap',
      }}
      title={id}
    >
      {id}
    </span>
  )
}
