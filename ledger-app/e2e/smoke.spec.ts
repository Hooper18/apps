import { test, expect } from '@playwright/test'

// 真实构建产物 smoke E2E。不 mock supabase 业务表，
// 只验证 app shell 在无会话场景下渲染正确 + 受保护路由跳到 /auth。
test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session: null, user: null }),
    }),
  )
})

test('app boots at / and is not blank', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const bodyText = await page.locator('body').textContent()
  expect(bodyText?.length ?? 0).toBeGreaterThan(0)
})

test('unauthenticated user is redirected to /auth from /add', async ({ page }) => {
  await page.goto('/add')
  await page.waitForURL(/\/auth/, { timeout: 15_000 })
  expect(page.url()).toContain('/auth')
})

test('unauthenticated user is redirected to /auth from /budget', async ({ page }) => {
  await page.goto('/budget')
  await page.waitForURL(/\/auth/, { timeout: 15_000 })
  expect(page.url()).toContain('/auth')
})

test('/reset-password is public (no auth required)', async ({ page }) => {
  await page.goto('/reset-password')
  await page.waitForLoadState('networkidle')
  expect(page.url()).not.toMatch(/\/auth$/)
})

test('PWA manifest is served at /manifest.webmanifest', async ({ page }) => {
  const res = await page.goto('/manifest.webmanifest')
  expect(res?.ok()).toBe(true)
  const manifest = await res?.json()
  expect(manifest.name).toBeTruthy()
})
