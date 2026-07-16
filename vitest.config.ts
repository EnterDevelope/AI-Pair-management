import { defineConfig } from "vitest/config"
import path from "node:path"
import { transformSync } from "rolldown/experimental"
import type { Plugin } from "vite"

/**
 * Vite 8 / vitest 4.x JSX 변환 플러그인
 *
 * vitest 4.x는 내부 Vite 설정을 override할 때 `oxc` 옵션을
 * `{ target: "node18" }` 만으로 덮어씀 — jsx 설정이 소실됨.
 * 따라서 plugins 배열에 직접 transform 훅을 등록해
 * SSR transform 이전에 .tsx/.jsx 파일을 rolldown/experimental
 * transformSync로 미리 변환한다.
 */
function rolldownJsxPlugin(): Plugin {
  return {
    name: "vitest:rolldown-jsx",
    transform(code, id) {
      if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return
      const result = transformSync(id, code, {
        jsx: { runtime: "automatic" },
        sourcemap: true,
      })
      return { code: result.code, map: result.map }
    },
  }
}

export default defineConfig({
  plugins: [rolldownJsxPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: [
      "src/**/__tests__/**/*.test.{ts,tsx}",
      "scripts/**/__tests__/**/*.test.{ts,tsx}",
      "app/**/__tests__/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "__tests__/**/*.test.{ts,tsx}",
    ],
    // 기본은 node — scripts/lib/route 테스트가 child_process·fs를 쓰므로 jsdom이면 깨진다.
    // 컴포넌트 테스트(.tsx)는 파일 상단 `// @vitest-environment jsdom` 도크블록으로 jsdom 사용.
    environment: "node",
    globals: false,
    passWithNoTests: true,
    setupFiles: ["./vitest.setup.ts"],
  },
})
