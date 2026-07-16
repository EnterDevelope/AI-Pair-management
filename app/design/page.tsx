/**
 * 디자인 시스템 쇼케이스 (서버 컴포넌트)
 *
 * 5개 섹션: 색상 팔레트 / 타이포그래피 / 간격 / 컴포넌트 / 쉐도우
 * 9개 shadcn 컴포넌트 전체 렌더
 * AP-01 금지 패턴 없음 (색상코딩 카드, em-dash, pure #000/#fff, Inter 폰트)
 * D-09: 데스크톱 우선, 모바일/태블릿 브레이크포인트 없음
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/* ── 색상 팔레트 데이터 ─────────────────────────────────────────────── */

const COLOR_SWATCHES = [
  { name: '배경', token: '--color-bg', value: 'oklch(0.10 0.01 280)', role: '앱 배경' },
  { name: '서피스', token: '--color-surface', value: 'oklch(0.14 0.01 280)', role: '카드/패널' },
  { name: '보더', token: '--color-border', value: 'oklch(0.22 0.02 280)', role: '경계선' },
  { name: '본문', token: '--color-text', value: 'oklch(0.92 0.01 280)', role: '본문 텍스트' },
  { name: '보조 텍스트', token: '--color-text-muted', value: 'oklch(0.55 0.02 280)', role: '보조/플레이스홀더' },
  { name: '액센트', token: '--color-accent', value: 'oklch(0.58 0.18 150)', role: '초록 액센트 (C=0.18)' },
  { name: '액센트 호버', token: '--color-accent-hover', value: 'oklch(0.62 0.18 150)', role: '호버 상태' },
  { name: '액센트 딤', token: '--color-accent-dim', value: 'oklch(0.58 0.08 150)', role: '배경 강조' },
  { name: '파괴적 동작', token: '--color-destructive', value: 'oklch(0.55 0.20 25)', role: '삭제/위험 동작' },
] as const

/* ── 타이포그래피 샘플 ──────────────────────────────────────────────── */

const TYPE_SCALE = [
  { label: '3xl · 1.875rem', size: 'text-[var(--font-size-3xl)]', sample: '기획의 시작' },
  { label: '2xl · 1.5rem', size: 'text-[var(--font-size-2xl)]', sample: '아이디어에서 와이어프레임까지' },
  { label: 'xl · 1.25rem', size: 'text-[var(--font-size-xl)]', sample: '요구사항 명세' },
  { label: 'lg · 1.125rem', size: 'text-[var(--font-size-lg)]', sample: '기능 트리 설계' },
  { label: 'base · 1rem', size: 'text-[var(--font-size-base)]', sample: '유저 스토리와 수용 기준을 작성합니다.' },
  { label: 'sm · 0.875rem', size: 'text-[var(--font-size-sm)]', sample: '파이프라인 상태: PRD 완료' },
  { label: 'xs · 0.75rem', size: 'text-[var(--font-size-xs)]', sample: 'ID: R-000001 / 생성: 2026-06-10' },
] as const

/* ── 간격 샘플 ──────────────────────────────────────────────────────── */

const SPACING_SCALE = [
  { token: '--spacing-1', value: '0.25rem (4px)' },
  { token: '--spacing-2', value: '0.5rem (8px)' },
  { token: '--spacing-3', value: '0.75rem (12px)' },
  { token: '--spacing-4', value: '1rem (16px)' },
  { token: '--spacing-6', value: '1.5rem (24px)' },
  { token: '--spacing-8', value: '2rem (32px)' },
  { token: '--spacing-12', value: '3rem (48px)' },
  { token: '--spacing-16', value: '4rem (64px)' },
] as const

/* ── 쉐도우 샘플 ────────────────────────────────────────────────────── */

const SHADOW_SCALE = [
  { token: '--shadow-sm', label: 'sm', desc: '0 1px 2px oklch(0 0 0 / 0.4)' },
  { token: '--shadow-md', label: 'md', desc: '0 4px 12px oklch(0 0 0 / 0.5)' },
  { token: '--shadow-lg', label: 'lg', desc: '0 8px 24px oklch(0 0 0 / 0.6)' },
  { token: '--shadow-accent', label: 'accent', desc: '0 0 16px oklch(0.58 0.18 150 / 0.3)' },
] as const

/* ── Section wrapper ────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[var(--spacing-6)]">
      <div className="flex flex-col gap-[var(--spacing-2)]">
        <h3 className="text-[var(--font-size-xl)] font-semibold text-[var(--color-text)]">
          {title}
        </h3>
        <Separator />
      </div>
      {children}
    </section>
  )
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default function DesignSystemPage() {
  return (
    <div className="flex flex-col gap-[var(--spacing-12)]">
      {/* 페이지 헤더 */}
      <header className="flex flex-col gap-[var(--spacing-2)]">
        <h3 className="text-[var(--font-size-xl)] font-semibold text-[var(--color-text)]">
          디자인 시스템 쇼케이스
        </h3>
        <p className="text-sm text-[var(--color-text-muted)]">
          AIPM 디자인 토큰 + shadcn/ui 컴포넌트 전체 렌더. Phase 0에서 잠긴 토큰 기준.
        </p>
      </header>

      {/* 1. 색상 팔레트 */}
      <Section title="색상 팔레트">
        <div className="grid grid-cols-4 gap-[var(--spacing-4)]">
          {COLOR_SWATCHES.map((swatch) => (
            <div
              key={swatch.token}
              className="flex flex-col gap-[var(--spacing-2)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--spacing-4)]"
            >
              {/* 색상 프리뷰 블록 */}
              <div
                className="h-12 rounded-[var(--radius-md)]"
                style={{ background: `var(${swatch.token})` }}
              />
              {/* 토큰 이름 */}
              <span className="font-mono text-xs text-[var(--color-text-muted)]">
                {swatch.token}
              </span>
              {/* oklch 값 */}
              <span className="font-mono text-[var(--font-size-xs)] text-[var(--color-text)]">
                {swatch.value}
              </span>
              {/* 역할 설명 */}
              <span className="text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
                {swatch.role}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* 2. 타이포그래피 */}
      <Section title="타이포그래피">
        <div className="flex flex-col gap-[var(--spacing-4)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--spacing-6)]">
          {TYPE_SCALE.map((row) => (
            <div key={row.label} className="flex items-baseline gap-[var(--spacing-4)]">
              <span className="w-40 shrink-0 font-mono text-xs text-[var(--color-text-muted)]">
                {row.label}
              </span>
              <span className={`${row.size} text-[var(--color-text)]`}>{row.sample}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-[var(--spacing-8)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--spacing-6)]">
          <div className="flex flex-col gap-[var(--spacing-1)]">
            <span className="text-xs text-[var(--color-text-muted)]">Geist Sans</span>
            <span className="text-base text-[var(--color-text)] font-sans">
              아이디어 PRD 기능명세 유저플로우
            </span>
          </div>
          <Separator orientation="vertical" />
          <div className="flex flex-col gap-[var(--spacing-1)]">
            <span className="text-xs text-[var(--color-text-muted)]">Geist Mono</span>
            <span className="text-base text-[var(--color-text)] font-mono">
              R-000001 oklch(0.58 0.18 150)
            </span>
          </div>
        </div>
      </Section>

      {/* 3. 간격 */}
      <Section title="간격">
        <div className="flex flex-col gap-[var(--spacing-3)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--spacing-6)]">
          {SPACING_SCALE.map((row) => (
            <div key={row.token} className="flex items-center gap-[var(--spacing-4)]">
              <span className="w-32 shrink-0 font-mono text-xs text-[var(--color-text-muted)]">
                {row.token}
              </span>
              <div
                className="h-4 rounded-[var(--radius-sm)] bg-[var(--color-accent-dim)]"
                style={{ width: `var(${row.token})` }}
              />
              <span className="font-mono text-xs text-[var(--color-text)]">{row.value}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 4. 컴포넌트 */}
      <Section title="컴포넌트">
        {/* Button */}
        <div className="flex flex-col gap-[var(--spacing-3)]">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">Button</span>
          <div className="flex flex-wrap gap-[var(--spacing-3)]">
            <Button variant="default">기본 버튼</Button>
            <Button variant="secondary">보조 버튼</Button>
            <Button variant="outline">아웃라인</Button>
            <Button variant="ghost">고스트</Button>
            <Button variant="destructive">삭제</Button>
            <Button disabled>비활성</Button>
          </div>
        </div>

        <Separator />

        {/* Badge */}
        <div className="flex flex-col gap-[var(--spacing-3)]">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">Badge</span>
          <div className="flex flex-wrap gap-[var(--spacing-3)]">
            <Badge variant="default">기본</Badge>
            <Badge variant="secondary">보조</Badge>
            <Badge variant="outline">아웃라인</Badge>
            <Badge variant="destructive">오류</Badge>
          </div>
        </div>

        <Separator />

        {/* Input + Label */}
        <div className="flex flex-col gap-[var(--spacing-3)]">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">Input + Label</span>
          <div className="flex max-w-sm flex-col gap-[var(--spacing-2)]">
            <Label htmlFor="ds-input">프로젝트 이름</Label>
            <Input id="ds-input" placeholder="my-product-v1" />
          </div>
        </div>

        <Separator />

        {/* Textarea */}
        <div className="flex flex-col gap-[var(--spacing-3)]">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">Textarea</span>
          <div className="flex max-w-sm flex-col gap-[var(--spacing-2)]">
            <Label htmlFor="ds-textarea">아이디어 설명</Label>
            <Textarea id="ds-textarea" placeholder="한 문장으로 아이디어를 설명하세요." rows={3} />
          </div>
        </div>

        <Separator />

        {/* Alert */}
        <div className="flex flex-col gap-[var(--spacing-3)]">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">Alert</span>
          <div className="flex max-w-lg flex-col gap-[var(--spacing-3)]">
            <Alert>
              <AlertTitle>파일 변경 감지</AlertTitle>
              <AlertDescription>graph.json이 변경되었습니다. 뷰가 자동 갱신됩니다.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTitle>스키마 오류</AlertTitle>
              <AlertDescription>graph.json이 GraphSchema를 충족하지 않습니다. 파일을 확인하세요.</AlertDescription>
            </Alert>
          </div>
        </div>

        <Separator />

        {/* Tabs */}
        <div className="flex flex-col gap-[var(--spacing-3)]">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">Tabs</span>
          <Tabs defaultValue="prd" className="max-w-lg">
            <TabsList>
              <TabsTrigger value="prd">PRD</TabsTrigger>
              <TabsTrigger value="features">기능명세</TabsTrigger>
              <TabsTrigger value="flow">유저플로우</TabsTrigger>
            </TabsList>
            <TabsContent value="prd">
              <p className="text-sm text-[var(--color-text-muted)] pt-[var(--spacing-3)]">
                PRD 문서 뷰 콘텐츠가 여기에 렌더됩니다.
              </p>
            </TabsContent>
            <TabsContent value="features">
              <p className="text-sm text-[var(--color-text-muted)] pt-[var(--spacing-3)]">
                기능명세 트리 콘텐츠가 여기에 렌더됩니다.
              </p>
            </TabsContent>
            <TabsContent value="flow">
              <p className="text-sm text-[var(--color-text-muted)] pt-[var(--spacing-3)]">
                유저플로우 다이어그램 콘텐츠가 여기에 렌더됩니다.
              </p>
            </TabsContent>
          </Tabs>
        </div>

        <Separator />

        {/* Tooltip */}
        <div className="flex flex-col gap-[var(--spacing-3)]">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">Tooltip</span>
          <TooltipProvider>
            <div className="flex gap-[var(--spacing-4)]">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">잠긴 단계 (호버)</Button>
                </TooltipTrigger>
                <TooltipContent>이전 단계를 먼저 완료하세요</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost">추가 정보 (호버)</Button>
                </TooltipTrigger>
                <TooltipContent>graph.json 기반으로 자동 생성됩니다.</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </Section>

      {/* 5. 쉐도우 */}
      <Section title="쉐도우">
        <div className="grid grid-cols-4 gap-[var(--spacing-6)]">
          {SHADOW_SCALE.map((s) => (
            <div
              key={s.token}
              className="flex flex-col gap-[var(--spacing-3)] rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-[var(--spacing-6)]"
              style={{ boxShadow: `var(${s.token})` }}
            >
              <span className="font-mono text-sm text-[var(--color-text)]">{s.label}</span>
              <span className="font-mono text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
                {s.desc}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
