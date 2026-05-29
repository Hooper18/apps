import { defineConfig, devices } from '@playwright/test'

// E2E 不依赖真实 Supabase：测试场景预先在 localStorage 注入 mock 用户 + dataCache，
// app 首屏直接渲染本地快照；点交互按钮也只测前端行为不实际写库。
//
// 用 vite preview 在 5174 端口起服务（避开 dev 的 5173），保证测的是 build 产物。
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
  ],
  webServer: {
    // CI 流程已在 Build step 跑过 npm run build，这里只起 preview；本地若没建
    // 过 dist，preview 会立刻失败，提示先 `npm run build`。
    // 想一行直接跑 E2E：CI=1 npm run build && npm run test:e2e
    command: process.env.CI
      ? 'npm run preview -- --port 5174 --strictPort'
      : 'npm run build && npm run preview -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
