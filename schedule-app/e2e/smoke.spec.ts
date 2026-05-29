import { test, expect } from '@playwright/test'

// 这些是真实生产构建产物的 smoke E2E：不 mock supabase，
// 只验证 app shell 在没有会话时正确渲染到 /auth + 路由保护生效。
// 业务路径覆盖由 vitest 组件层完成。

test.beforeEach(async ({ page }) => {
  // 任何 supabase 调用 stub 出空 array，避免请求挂在 CI 网络上
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  // auth/session 接口返回未登录
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session: null, user: null }),
    }),
  )
})

test('app shell boots at / and is not blank', async ({ page }) => {
  await page.goto('/')
  // 等任意可见内容；ProtectedRoute 没有会话时会显示 LoadingScreen → 跳 /auth
  await page.waitForLoadState('networkidle')
  const bodyText = await page.locator('body').textContent()
  expect(bodyText?.length ?? 0).toBeGreaterThan(0)
})

test('unauthenticated user is redirected to /auth from /todo', async ({ page }) => {
  await page.goto('/todo')
  await page.waitForURL(/\/auth/, { timeout: 15_000 })
  expect(page.url()).toContain('/auth')
})

test('unauthenticated user is redirected to /auth from /calendar', async ({ page }) => {
  await page.goto('/calendar')
  await page.waitForURL(/\/auth/, { timeout: 15_000 })
  expect(page.url()).toContain('/auth')
})

test('/reset-password is public (no auth required)', async ({ page }) => {
  await page.goto('/reset-password')
  await page.waitForLoadState('networkidle')
  // 不应被 redirect 到 /auth
  expect(page.url()).not.toMatch(/\/auth$/)
})

test('PWA manifest is served at /manifest.webmanifest', async ({ page }) => {
  const res = await page.goto('/manifest.webmanifest')
  expect(res?.ok()).toBe(true)
  const manifest = await res?.json()
  expect(manifest.name).toBeTruthy()
})
