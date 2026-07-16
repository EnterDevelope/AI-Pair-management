// Tailwind CSS v4 빌드 통합 — Next.js 16이 @import 'tailwindcss'·@theme를
// 처리하려면 이 PostCSS 플러그인이 필요하다. 없으면 유틸리티·토큰이 생성되지 않아
// 앱이 무스타일(흰 배경)로 렌더된다. (02A 검증 중 누락 발견)
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
