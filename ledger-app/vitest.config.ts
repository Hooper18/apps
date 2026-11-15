import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 独立于 vite.config.ts：避免拉起 vite-plugin-pwa 在 jsdom 里跑 SW 注册等无用副作用。
// 仅启用 React 的 JSX 转换，其他构建配置由 vitest 默认提供。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // supabase/functions 下是后端入口（线上跑在 Deno）的纯逻辑和请求处理，用同一套 vitest 测。
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/types/**',
        'src/lib/database.types.ts',
      ],
    },
  },
})
