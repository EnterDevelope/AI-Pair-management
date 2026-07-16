import type { Metadata } from 'next'
import { Suspense } from 'react'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { AppShell } from '@/components/shell/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'AIPM',
  description: '로컬 AI 기획 하네스',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-(--color-bg) text-(--color-text) font-sans min-h-screen">
        <Suspense
          fallback={(
            <main className="min-h-screen bg-[var(--color-bg)] p-[var(--spacing-8)]">
              {children}
            </main>
          )}
        >
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  )
}
