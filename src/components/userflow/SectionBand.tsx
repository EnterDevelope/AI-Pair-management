// SectionBand - 스윔레인 섹션 오버레이 (04A-03-PLAN.md Task 2)
//
// useViewport()로 뷰포트 좌표 변환: top = band.yTop * zoom + vpY
// pointer-events-none - 클릭 통과, React Flow 캔버스 조작 방해 안 함
// 순수 흑백 금지, Inter 금지, em-dash 금지

'use client'

import { useViewport } from '@xyflow/react'

import type { SectionBand as SectionBandType } from '@/lib/dagre-layout'

interface SectionBandOverlayProps {
  bands: SectionBandType[]
}

export function SectionBandOverlay({ bands }: SectionBandOverlayProps) {
  const { x: vpX, y: vpY, zoom } = useViewport()

  if (bands.length === 0) return null

  return (
    <>
      {bands.map((band) => {
        // 캔버스 좌표 → DOM 픽셀 변환 (Pitfall 3)
        const top = band.yTop * zoom + vpY
        const height = band.height * zoom

        return (
          <div
            key={band.sectionId}
            style={{
              position: 'absolute',
              // 전체 너비 - 섹션은 수평으로 전 구간 걸침
              left: 0,
              right: 0,
              top,
              height,
              // 줄무늬 배경: 명도 약간 다른 surface (교번 없이 단일 톤)
              background: 'oklch(0.13 0.007 280 / 0.6)',
              borderTop: '1px solid var(--color-border)',
              // 클릭 통과 - 캔버스 드래그/줌 방해 금지
              pointerEvents: 'none',
              zIndex: 0,
              display: 'flex',
              alignItems: 'flex-start',
              paddingTop: 4,
              paddingLeft: 8,
              // 긴 레이블이 넘치면 잘라냄
              overflow: 'hidden',
            }}
            aria-hidden="true"
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                userSelect: 'none',
                // 텍스트도 이벤트 통과
                pointerEvents: 'none',
                opacity: 0.7,
              }}
            >
              {band.label}
            </span>
          </div>
        )
      })}
    </>
  )
}
