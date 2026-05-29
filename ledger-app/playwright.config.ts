import { defineConfig, devices } from '@playwright/test'

// 沿用 schedule-app 的 smoke E2E 策略：测真实构建产物 + 拦截 supabase REST
// 让 app shell 在无会话场景下可预测渲染。业务路径覆盖由 vitest 完成。
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
    command: process.env.CI
      ? 'npm run preview -- --port 5174 --strictPort'
      : 'npm run build && npm run preview -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
