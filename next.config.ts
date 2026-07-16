import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // chokidar v5는 ESM-only — Next.js 번들러가 처리하지 않도록 외부 패키지로 지정
  serverExternalPackages: ['chokidar'],
}

export default nextConfig
