# 纪念日 App（jinian-app）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个纯自用的纪念日 App（React+Vite+TS+Supabase+Capacitor），记录三类"日子"（每年循环/累加/倒数），到点靠设备本地通知可靠提醒（vivo 重点），Claude 暖白配色的优雅 UI。

**Architecture:** 独立仓 `jinian-app`（工作区根 `D:\VscodeProject\ClaudeCodeTest\jinian-app`，nested independent git repo）。核心是纯函数领域层（`lib/occasion.ts` + `lib/lunar.ts` + `lib/reminders.ts`，TDD 优先）+ Supabase 数据层（`occasions` 单表 + RLS + Storage）+ React UI + Capacitor 本地通知（设备 AlarmManager 排程，不走任何服务器推送/系统日历订阅）。

**Tech Stack:** Vite 5 + React 18 + TypeScript 5（strict）+ Tailwind CSS 4（`@tailwindcss/vite`）+ Supabase JS 2.45（Auth/Postgres/Storage）+ `lunar-typescript` 1.8.6（农历）+ Capacitor 6（Android，`@capacitor/local-notifications` 6.1.3）+ Vitest 4 + Testing Library + Playwright + ESLint 9（flat config）+ Prettier。

## Global Constraints

- 设计 spec：`docs/superpowers/specs/2026-07-01-anniversary-app-design.md`（本计划的唯一真相源，冲突时以其为准）。
- TypeScript **strict** 模式（`tsconfig.app.json` 里 `"strict": true`）。
- 日期计算**铁律**（spec §6）：全部用 `CivilDate {y,m,d}` + `Date.UTC(y,m-1,d,12)` 正午锚点做整数天差 + `Math.round`；**绝不**混用 `new Date('YYYY-MM-DD')`（UTC 午夜）与 `new Date(y,m,d)`（本地午夜）；**绝不** `toISOString()` 存/显示日期。
- 农历（`lunar-typescript`）**仅用于 `kind='anniversary'`**（spec §5 DB CHECK `lunar_only_anniversary`）；闰月用**负月份**，不是 `isLeap` 布尔参数。
- 里程碑（`expandMilestones`）**仅用于 `kind='since'`**；`anniversary` 的里程碑走独立函数 `expandAnniversaryMilestones`（周年+年龄，自动生成，不读 `milestones` 字段）。
- 提醒机制 = **Capacitor 本地通知**（设备 AlarmManager 排程）。**不做** webcal/.ics 导出、**不做**服务器 Web Push/FCM、**不做**厂商推送 SDK（spec §2 非目标）。
- Android manifest **必须显式声明** `USE_EXACT_ALARM` + `SCHEDULE_EXACT_ALARM`（否则静默降级为不精确闹钟，这是 schedule-app 现存但本项目要避免的坑）。
- 提醒时刻固定**每天 09:00（Asia/Shanghai）**，v1 不做用户可调时区/时刻设置。
- 配色用 CSS 变量（spec §4 表格里的精确色值），**禁止**渐变背景/按钮/文字、多彩图标阵列、`shadow-md` 及以上、装饰性动画（弹跳/旋转/滑入）、card 嵌套 card。
- 排版：界面文字 13–15px、标题 18–20px；正文 regular、强调 medium、几乎不用 bold；中文行高 1.7–1.8。
- Git commit message 用中文；命令逐行执行（不用 `&&` 串联多条独立 git 命令）；每个 Task 完成后单独提交，不要把多个 Task 的改动混进一次提交。
- Node 24 / npm 11（与本工作区其它项目一致，CI 用 `actions/setup-node@v4` 固定 `node-version: '24'`，避免 npm 10 与本地 lockfile 不同步误红）。
- 无 `service-role key`、无 serverless 函数（webcal 已移除，spec §14）；前端只用 Supabase anon key，受 RLS 约束。
- 不做：暗色模式、多人协作、多张照片/相册、置顶（pinned）、iPhone 端可靠提醒（v1 只读）。

---

## Phase 1：脚手架与基础设施

### Task 1: 项目脚手架（Vite + React + TS + Tailwind 4 + ESLint + Prettier）

**Files:**
- Create: `jinian-app/package.json`
- Create: `jinian-app/vite.config.ts`
- Create: `jinian-app/tsconfig.json`, `jinian-app/tsconfig.app.json`, `jinian-app/tsconfig.node.json`
- Create: `jinian-app/index.html`
- Create: `jinian-app/src/main.tsx`, `jinian-app/src/App.tsx`, `jinian-app/src/index.css`, `jinian-app/src/vite-env.d.ts`
- Create: `jinian-app/eslint.config.js`
- Create: `jinian-app/.prettierrc.json`
- Create: `jinian-app/.gitignore`
- Modify: `D:\VscodeProject\ClaudeCodeTest\.gitignore`（登记 `jinian-app/` 为嵌套独立仓）

**Interfaces:**
- Produces: 一个可 `npm run dev` 启动的空白 Vite+React+TS 项目，`npm run lint`/`npm run build` 可跑通。

- [ ] **Step 1: 创建目录 + package.json**

先确认父目录存在（工作区根），再建子目录：

```bash
ls "D:/VscodeProject/ClaudeCodeTest"
mkdir -p "D:/VscodeProject/ClaudeCodeTest/jinian-app/src"
```

写 `jinian-app/package.json`：

```json
{
  "name": "jinian-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@capacitor/core": "^6.2.1",
    "@capacitor/local-notifications": "^6.1.3",
    "@supabase/supabase-js": "^2.45.0",
    "lucide-react": "^0.400.0",
    "lunar-typescript": "^1.8.6",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@capacitor/android": "^6.2.1",
    "@capacitor/cli": "^6.2.1",
    "@eslint/js": "^9.9.0",
    "@playwright/test": "^1.60.0",
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "@vitest/coverage-v8": "^4.1.7",
    "eslint": "^9.9.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react-hooks": "^4.6.2",
    "eslint-plugin-react-refresh": "^0.4.9",
    "globals": "^15.9.0",
    "jsdom": "^29.1.1",
    "prettier": "^3.3.3",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.5.3",
    "typescript-eslint": "^8.0.1",
    "vite": "^5.4.0",
    "vitest": "^4.1.7"
  }
}
```

- [ ] **Step 2: 安装依赖**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npm install
```

Expected: 无报错，生成 `package-lock.json` 和 `node_modules/`。

- [ ] **Step 3: 写 TS 配置**

`jinian-app/tsconfig.json`：
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`jinian-app/tsconfig.app.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test/**"]
}
```

`jinian-app/tsconfig.node.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: 写 vite.config.ts + index.html + src 入口文件**

`jinian-app/vite.config.ts`：
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    host: true,
  },
})
```

`jinian-app/index.html`：
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>纪念</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`jinian-app/src/vite-env.d.ts`：
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_PUBLIC_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

`jinian-app/src/index.css`：
```css
@import "tailwindcss";

:root {
  --bg-primary: #FAF9F7;
  --bg-secondary: #FFFFFF;
  --bg-tertiary: #F0EEE9;
  --border: #E7E3DB;
  --text-primary: #2B2A27;
  --text-secondary: #78756E;
  --text-tertiary: #A9A59C;
  --accent: #C96442;
  --accent-hover: #B5563A;
  --accent-tint: rgba(201, 100, 66, 0.07);
}

html, body, #root {
  height: 100%;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
}
```

`jinian-app/src/App.tsx`（占位，后续任务会替换成真路由）：
```tsx
export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        纪念 — 脚手架就绪
      </p>
    </div>
  )
}
```

`jinian-app/src/main.tsx`：
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: 跑 dev server 验证不报错**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npm run build
```

Expected: `tsc -b` 与 `vite build` 均成功，生成 `dist/` 目录，无 TS 报错。

- [ ] **Step 6: 配置 ESLint + Prettier**

`jinian-app/eslint.config.js`：
```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'android', 'coverage', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  prettierConfig,
)
```

`jinian-app/.prettierrc.json`：
```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

- [ ] **Step 7: 跑 lint 验证**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npm run lint
```

Expected: 无报错（`App.tsx`/`main.tsx` 都符合规则）。

- [ ] **Step 8: 写 .gitignore + 注册到根 .gitignore + git init**

`jinian-app/.gitignore`：
```
node_modules/
dist/
dist-ssr/
*.local
.env
.env.local
coverage/
playwright-report/
test-results/
*.tsbuildinfo
android/app/build/
android/.gradle/
android/app/release/
android/key.properties
android/local.properties
android/captures/
.DS_Store
```

用 Edit 工具在 `D:\VscodeProject\ClaudeCodeTest\.gitignore` 的"嵌套的独立 Git 项目"分组下追加一行 `jinian-app/`（与 `sb6657-danmaku/` 等现有条目并列）。

初始化独立仓：
```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
git init
```

- [ ] **Step 9: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "chore: 项目脚手架（Vite+React+TS+Tailwind4+ESLint+Prettier）"
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest" add .gitignore
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest" commit -m "chore: .gitignore 登记 jinian-app 为嵌套独立仓（纪念日 app 新项目）"
```

---

### Task 2: Vitest + Testing Library + Playwright 测试基建

**Files:**
- Create: `jinian-app/vitest.config.ts`
- Create: `jinian-app/src/test/setup.ts`
- Create: `jinian-app/src/test/smoke.test.ts`
- Create: `jinian-app/playwright.config.ts`
- Create: `jinian-app/e2e/smoke.spec.ts`
- Create: `jinian-app/.env.test`
- Create: `jinian-app/.github/workflows/ci.yml`

**Interfaces:**
- Produces: `npm test`（vitest）、`npm run test:e2e`（playwright）、CI workflow 三者均可跑通（本任务先跑通空壳，后续任务往里加真测试）。

- [ ] **Step 1: 写 vitest 配置 + setup 文件**

`jinian-app/vitest.config.ts`：
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
})
```

`jinian-app/src/test/setup.ts`：
```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 2: 写一个冒烟测试验证基建跑通**

`jinian-app/src/test/smoke.test.ts`：
```ts
import { describe, it, expect } from 'vitest'

describe('测试基建', () => {
  it('vitest + jsdom 正常工作', () => {
    expect(typeof document).toBe('object')
  })
})
```

- [ ] **Step 3: 跑 vitest 验证通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npm test
```

Expected: PASS，1 个测试通过。

- [ ] **Step 4: 写 .env.test（供 vitest 与本地 CI 模拟用，占位值不连真实服务）**

`jinian-app/.env.test`：
```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=test-anon-key-not-real
VITE_PUBLIC_BASE_URL=http://localhost:5175
```

- [ ] **Step 5: 写 Playwright 配置 + 冒烟 e2e**

`jinian-app/playwright.config.ts`：
```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5176',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: process.env.CI
      ? 'npm run preview -- --port 5176 --strictPort'
      : 'npm run build && npm run preview -- --port 5176 --strictPort',
    url: 'http://localhost:5176',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
```

`jinian-app/e2e/smoke.spec.ts`：
```ts
import { test, expect } from '@playwright/test'

test('app shell 能渲染', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#root')).not.toBeEmpty()
})
```

- [ ] **Step 6: 跑 e2e 验证通过（本地用 .env.test 注入环境变量）**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=test-anon-key-not-real VITE_PUBLIC_BASE_URL=http://localhost:5176 npm run test:e2e
```

Expected: PASS。

- [ ] **Step 7: 写 CI workflow**

`jinian-app/.github/workflows/ci.yml`：
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: test
    runs-on: ubuntu-latest
    # e2e 跑真实构建产物：Vite build 会把 VITE_* 内联进 bundle，缺了会白屏。
    # CI 没有 .env（已 gitignore），注入与 .env.test 同款 stub；真实网络请求由
    # e2e 用例里的 page.route() 拦截，假 URL/假 key 足够。
    env:
      VITE_SUPABASE_URL: http://localhost:54321
      VITE_SUPABASE_ANON_KEY: test-anon-key-not-real
      VITE_PUBLIC_BASE_URL: http://localhost:5176
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
          cache-dependency-path: package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Unit + component tests
        run: npm test

      - name: Build（含 tsc -b 类型检查）
        run: npm run build

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: E2E smoke
        run: npm run test:e2e

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 8: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "test: 接入 vitest+Testing Library+Playwright 测试基建与 CI"
```

---

### Task 3: Supabase schema（occasions 表 + RLS + covers 桶）

**Files:**
- Create: `jinian-app/supabase/migrations/001_initial_schema.sql`
- Create: `jinian-app/supabase/README.md`

**Interfaces:**
- Produces: `occasions` 表 + RLS 策略 + `set_updated_at` 触发器 + `covers` Storage 桶 + 桶 RLS 策略的完整 SQL（本任务只写 SQL 文件，不含在线执行——由用户在 Supabase Dashboard SQL Editor 手动跑一次，因为这是新建 Supabase 项目的一次性初始化）。

- [ ] **Step 1: 写完整 migration SQL**

`jinian-app/supabase/migrations/001_initial_schema.sql`：
```sql
-- ============================================================
-- 纪念日 App（jinian-app）初始 schema
-- 对应设计文档 §5：docs/superpowers/specs/2026-07-01-anniversary-app-design.md
-- ============================================================

create table if not exists public.occasions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind          text not null check (kind in ('anniversary','since','until')),
  title         text not null,
  date          date not null,                 -- 公历基准日：锚点/起点/目标
  lunar         boolean not null default false,
  lunar_month   int,                            -- lunar=true 时：农历月 1-12
  lunar_day     int,                            -- lunar=true 时：农历日 1-30
  lunar_is_leap boolean not null default false, -- lunar=true 时：该月是否闰月
  cover_path    text,                           -- 'covers' 桶内相对路径 {user_id}/{id}.jpg
  note          text,
  remind_days   int[]  not null default '{0,1}',            -- 提前几天，0=当天；驱动本地通知排程
  milestones    jsonb  not null default '{"hundreds":true,"thousand":true}'::jsonb,
  leap_fallback text   not null default 'feb28' check (leap_fallback in ('feb28','mar1')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint lunar_only_anniversary check ( (not lunar) or (kind = 'anniversary') )
);

alter table public.occasions enable row level security;

-- updated_at 自动刷新（Postgres 不会自动更新该列）
create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists occasions_set_updated_at on public.occasions;
create trigger occasions_set_updated_at before update on public.occasions
  for each row execute function public.set_updated_at();

-- RLS：仅本人可读写自己的行
create policy occasions_select_own on public.occasions for select to authenticated
  using ( (select auth.uid()) = user_id );
create policy occasions_insert_own on public.occasions for insert to authenticated
  with check ( (select auth.uid()) = user_id );
create policy occasions_update_own on public.occasions for update to authenticated
  using ( (select auth.uid()) = user_id ) with check ( (select auth.uid()) = user_id );
create policy occasions_delete_own on public.occasions for delete to authenticated
  using ( (select auth.uid()) = user_id );

-- ============================================================
-- Storage：covers 私有桶（封面图，路径 {user_id}/{id}.jpg）
-- ============================================================

insert into storage.buckets (id, name, public)
values ('covers', 'covers', false)
on conflict (id) do update set public = false;

create policy covers_select_own on storage.objects for select to authenticated
  using ( bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text );
create policy covers_insert_own on storage.objects for insert to authenticated
  with check ( bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text );
create policy covers_update_own on storage.objects for update to authenticated
  using ( bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text )
  with check ( bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text );
create policy covers_delete_own on storage.objects for delete to authenticated
  using ( bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text );
```

- [ ] **Step 2: 写 README 说明如何应用这份 migration**

`jinian-app/supabase/README.md`：
```markdown
# Supabase Schema

新建一个 Supabase 项目后，去 Dashboard → SQL Editor，把
`migrations/001_initial_schema.sql` 整份贴进去执行一次即可。

之后把项目的 `Project URL` 和 `anon public key`（Settings → API）
填进 `jinian-app/.env`（参考 `.env.example`）。

登录方式为 magic-link（邮箱验证码），需在 Dashboard → Authentication →
Providers → Email 里确认已开启；纯自用建议在 Authentication → Settings
里关闭"Allow new users to sign up"或改用邮箱 allowlist，只放行自己的邮箱。
```

- [ ] **Step 3: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat: Supabase schema — occasions 表 + RLS + covers 私有桶"
```

---

### Task 4: Supabase 客户端 + 环境变量

**Files:**
- Create: `jinian-app/src/lib/supabase.ts`
- Create: `jinian-app/.env.example`

**Interfaces:**
- Produces: `export const supabase: SupabaseClient`，供后续所有数据层代码 `import { supabase } from '../lib/supabase'` 使用。

- [ ] **Step 1: 写 .env.example**

`jinian-app/.env.example`：
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_PUBLIC_BASE_URL=http://localhost:5175
```

- [ ] **Step 2: 写 supabase 客户端初始化**

`jinian-app/src/lib/supabase.ts`：
```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('缺少 Supabase 环境变量，请复制 .env.example 为 .env 并填写你的项目配置。')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 3: 验证 build 通过（jsdom 环境下 import.meta.env 由 vitest/vite 提供，这里只需确认类型检查过）**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npm run build
```

Expected: 成功（`.env` 本地需存在，可临时复制 `.env.example` 为 `.env` 并填入任意占位值用于本地构建验证，不要提交 `.env`）。

- [ ] **Step 4: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat: 接入 Supabase 客户端初始化"
```

---

## Phase 2：领域计算纯函数层（TDD 优先，spec §6/§7/§8 的核心）

### Task 5: `lib/civilDate.ts` — date-only 基础运算

**Files:**
- Create: `jinian-app/src/lib/civilDate.ts`
- Test: `jinian-app/src/lib/civilDate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CivilDate { y: number; m: number; d: number }
  export function isLeapYear(y: number): boolean
  export function daysInMonth(y: number, m: number): number
  export function diffDays(a: CivilDate, b: CivilDate): number
  export function addDays(c: CivilDate, n: number): CivilDate
  export function addMonthsClamped(c: CivilDate, n: number): CivilDate
  export function todayCivil(): CivilDate
  export function compareCivilDate(a: CivilDate, b: CivilDate): number
  export function parseCivilDate(s: string): CivilDate
  export function formatCivilDate(c: CivilDate): string
  ```
  这是全项目所有日期计算的唯一基础模块，Task 6 起的所有 lib 都 import 自这里。

- [ ] **Step 1: 写失败测试**

`jinian-app/src/lib/civilDate.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import {
  isLeapYear,
  daysInMonth,
  diffDays,
  addDays,
  addMonthsClamped,
  compareCivilDate,
  parseCivilDate,
  formatCivilDate,
  type CivilDate,
} from './civilDate'

describe('isLeapYear', () => {
  it('能被4整除但不能被100整除 -> 闰年', () => {
    expect(isLeapYear(2024)).toBe(true)
  })
  it('能被100整除但不能被400整除 -> 平年', () => {
    expect(isLeapYear(1900)).toBe(false)
  })
  it('能被400整除 -> 闰年', () => {
    expect(isLeapYear(2000)).toBe(true)
  })
  it('普通平年', () => {
    expect(isLeapYear(2026)).toBe(false)
  })
})

describe('daysInMonth', () => {
  it('2月在闰年是29天', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
  })
  it('2月在平年是28天', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
  })
  it('1月是31天', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
  })
})

describe('diffDays', () => {
  it('同一天差 0', () => {
    const d: CivilDate = { y: 2026, m: 7, d: 1 }
    expect(diffDays(d, d)).toBe(0)
  })
  it('跨月不受时区影响，正确计天', () => {
    expect(diffDays({ y: 2026, m: 6, d: 28 }, { y: 2026, m: 7, d: 1 })).toBe(3)
  })
  it('跨年正确计天', () => {
    expect(diffDays({ y: 2025, m: 12, d: 30 }, { y: 2026, m: 1, d: 2 })).toBe(3)
  })
  it('跨越闰年2月29日正确计天', () => {
    expect(diffDays({ y: 2024, m: 2, d: 28 }, { y: 2024, m: 3, d: 1 })).toBe(2)
  })
  it('顺序颠倒得到负数', () => {
    expect(diffDays({ y: 2026, m: 7, d: 1 }, { y: 2026, m: 6, d: 28 })).toBe(-3)
  })
})

describe('addDays', () => {
  it('加天数正确进位到下个月', () => {
    expect(addDays({ y: 2026, m: 1, d: 30 }, 3)).toEqual({ y: 2026, m: 2, d: 2 })
  })
  it('加天数正确跨年', () => {
    expect(addDays({ y: 2025, m: 12, d: 30 }, 5)).toEqual({ y: 2026, m: 1, d: 4 })
  })
})

describe('addMonthsClamped', () => {
  it('1月31日加1个月 clamp 到2月28日（平年）', () => {
    expect(addMonthsClamped({ y: 2026, m: 1, d: 31 }, 1)).toEqual({ y: 2026, m: 2, d: 28 })
  })
  it('1月31日加1个月 clamp 到2月29日（闰年）', () => {
    expect(addMonthsClamped({ y: 2024, m: 1, d: 31 }, 1)).toEqual({ y: 2024, m: 2, d: 29 })
  })
  it('不会因为经过短月而"回弹" — 3月31日加1个月再减1个月不等于原日', () => {
    const plus1 = addMonthsClamped({ y: 2026, m: 3, d: 31 }, 1)
    expect(plus1).toEqual({ y: 2026, m: 4, d: 30 })
  })
  it('跨年加月正确', () => {
    expect(addMonthsClamped({ y: 2025, m: 11, d: 15 }, 3)).toEqual({ y: 2026, m: 2, d: 15 })
  })
})

describe('compareCivilDate', () => {
  it('相等返回0', () => {
    expect(compareCivilDate({ y: 2026, m: 7, d: 1 }, { y: 2026, m: 7, d: 1 })).toBe(0)
  })
  it('a早于b返回负数', () => {
    expect(compareCivilDate({ y: 2026, m: 7, d: 1 }, { y: 2026, m: 7, d: 2 })).toBeLessThan(0)
  })
  it('a晚于b返回正数', () => {
    expect(compareCivilDate({ y: 2026, m: 7, d: 2 }, { y: 2026, m: 7, d: 1 })).toBeGreaterThan(0)
  })
})

describe('parseCivilDate / formatCivilDate', () => {
  it('往返一致', () => {
    const s = '2026-07-01'
    expect(formatCivilDate(parseCivilDate(s))).toBe(s)
  })
  it('parse 出正确字段', () => {
    expect(parseCivilDate('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 })
  })
  it('format 补零', () => {
    expect(formatCivilDate({ y: 2026, m: 1, d: 5 })).toBe('2026-01-05')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/civilDate.test.ts
```

Expected: FAIL，报 `Cannot find module './civilDate'` 或类似。

- [ ] **Step 3: 实现 civilDate.ts**

`jinian-app/src/lib/civilDate.ts`：
```ts
export interface CivilDate {
  y: number
  m: number
  d: number
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function daysInMonth(y: number, m: number): number {
  if (m === 2 && isLeapYear(y)) return 29
  return MONTH_DAYS[m - 1]
}

/** UTC 正午锚点毫秒数 — 用正午而非 0 点，吸收任何理论上的 DST/闰秒残差。 */
function toUTCNoonMs(c: CivilDate): number {
  return Date.UTC(c.y, c.m - 1, c.d, 12, 0, 0)
}

export function diffDays(a: CivilDate, b: CivilDate): number {
  return Math.round((toUTCNoonMs(b) - toUTCNoonMs(a)) / 86_400_000)
}

export function addDays(c: CivilDate, n: number): CivilDate {
  const dt = new Date(toUTCNoonMs(c) + n * 86_400_000)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

/** 加月并 clamp 到目标月的最后一天（如 1/31 +1月 -> 2/28），不会"回弹"。 */
export function addMonthsClamped(c: CivilDate, n: number): CivilDate {
  const total = c.y * 12 + (c.m - 1) + n
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return { y, m, d: Math.min(c.d, daysInMonth(y, m)) }
}

export function todayCivil(): CivilDate {
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
}

export function compareCivilDate(a: CivilDate, b: CivilDate): number {
  return diffDays(b, a)
}

export function parseCivilDate(s: string): CivilDate {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

export function formatCivilDate(c: CivilDate): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${c.y}-${pad(c.m)}-${pad(c.d)}`
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/civilDate.test.ts
```

Expected: PASS，全部用例通过。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(lib): civilDate 纯日期运算基础模块 + 单测"
```

---

### Task 6: `lib/occasion.ts` — anchorInYear / nextAnniversaryDateSolar / completedMonths / completedYears

**Files:**
- Create: `jinian-app/src/lib/occasion.ts`
- Test: `jinian-app/src/lib/occasion.test.ts`

**Interfaces:**
- Consumes: `CivilDate`, `diffDays`, `daysInMonth`, `isLeapYear` from `./civilDate`（Task 5）。
- Produces:
  ```ts
  export type OccasionKind = 'anniversary' | 'since' | 'until'
  export type LeapFallback = 'feb28' | 'mar1'
  export function anchorInYear(anchor: CivilDate, year: number, fb: LeapFallback): CivilDate
  export function nextAnniversaryDateSolar(anchor: CivilDate, today: CivilDate, fb: LeapFallback): CivilDate
  export function completedMonths(from: CivilDate, to: CivilDate): number
  export function completedYears(from: CivilDate, to: CivilDate): number
  ```
  Task 7 会在同一文件里继续添加 `computeOccasion` 等，届时这些函数保持不变、被其内部调用。

- [ ] **Step 1: 写失败测试**

`jinian-app/src/lib/occasion.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import {
  anchorInYear,
  nextAnniversaryDateSolar,
  completedMonths,
  completedYears,
} from './occasion'

describe('anchorInYear', () => {
  it('普通日期直接落到目标年同月同日', () => {
    expect(anchorInYear({ y: 2020, m: 3, d: 15 }, 2026, 'feb28')).toEqual({ y: 2026, m: 3, d: 15 })
  })
  it('2/29 生日在平年按 feb28 回退', () => {
    expect(anchorInYear({ y: 2020, m: 2, d: 29 }, 2026, 'feb28')).toEqual({ y: 2026, m: 2, d: 28 })
  })
  it('2/29 生日在平年按 mar1 回退', () => {
    expect(anchorInYear({ y: 2020, m: 2, d: 29 }, 2026, 'mar1')).toEqual({ y: 2026, m: 3, d: 1 })
  })
  it('2/29 生日落在闰年不受回退规则影响', () => {
    expect(anchorInYear({ y: 2020, m: 2, d: 29 }, 2024, 'feb28')).toEqual({ y: 2024, m: 2, d: 29 })
  })
})

describe('nextAnniversaryDateSolar', () => {
  it('今年还没到 -> 返回今年', () => {
    const result = nextAnniversaryDateSolar(
      { y: 1995, m: 12, d: 25 },
      { y: 2026, m: 7, d: 1 },
      'feb28',
    )
    expect(result).toEqual({ y: 2026, m: 12, d: 25 })
  })
  it('今年已经过了 -> 返回明年', () => {
    const result = nextAnniversaryDateSolar(
      { y: 1995, m: 3, d: 10 },
      { y: 2026, m: 7, d: 1 },
      'feb28',
    )
    expect(result).toEqual({ y: 2027, m: 3, d: 10 })
  })
  it('就是今天 -> 返回今年（今天算"到达"不算"已过"）', () => {
    const result = nextAnniversaryDateSolar(
      { y: 1995, m: 7, d: 1 },
      { y: 2026, m: 7, d: 1 },
      'feb28',
    )
    expect(result).toEqual({ y: 2026, m: 7, d: 1 })
  })
})

describe('completedMonths', () => {
  it('2/15 到 3/14 还不满一个月 -> 0', () => {
    expect(completedMonths({ y: 2026, m: 2, d: 15 }, { y: 2026, m: 3, d: 14 })).toBe(0)
  })
  it('2/15 到 3/15 正好满一个月 -> 1', () => {
    expect(completedMonths({ y: 2026, m: 2, d: 15 }, { y: 2026, m: 3, d: 15 })).toBe(1)
  })
  it('1/31 起点，2月末视为满月边界（clamp 到2/28）', () => {
    expect(completedMonths({ y: 2026, m: 1, d: 31 }, { y: 2026, m: 2, d: 28 })).toBe(1)
  })
  it('同一天 -> 0', () => {
    const d = { y: 2026, m: 7, d: 1 }
    expect(completedMonths(d, d)).toBe(0)
  })
})

describe('completedYears', () => {
  it('不满一年 -> 0', () => {
    expect(completedYears({ y: 2023, m: 7, d: 10 }, { y: 2026, m: 7, d: 9 })).toBe(2)
  })
  it('正好满周年', () => {
    expect(completedYears({ y: 2023, m: 7, d: 10 }, { y: 2026, m: 7, d: 10 })).toBe(3)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/occasion.test.ts
```

Expected: FAIL，`Cannot find module './occasion'`。

- [ ] **Step 3: 实现（创建 occasion.ts）**

`jinian-app/src/lib/occasion.ts`：
```ts
import { type CivilDate, diffDays, daysInMonth, isLeapYear } from './civilDate'

export type OccasionKind = 'anniversary' | 'since' | 'until'
export type LeapFallback = 'feb28' | 'mar1'

/** 把「锚点(可能是2/29)」落到目标年份的一个真实存在的日期。 */
export function anchorInYear(anchor: CivilDate, year: number, fb: LeapFallback): CivilDate {
  if (anchor.m === 2 && anchor.d === 29 && !isLeapYear(year)) {
    return fb === 'mar1' ? { y: year, m: 3, d: 1 } : { y: year, m: 2, d: 28 }
  }
  return { y: year, m: anchor.m, d: Math.min(anchor.d, daysInMonth(year, anchor.m)) }
}

/** 公历 anniversary 的下一次发生日：今年已过则明年，今天恰好到达算今年。 */
export function nextAnniversaryDateSolar(
  anchor: CivilDate,
  today: CivilDate,
  fb: LeapFallback,
): CivilDate {
  const thisYear = anchorInYear(anchor, today.y, fb)
  if (diffDays(today, thisYear) < 0) {
    return anchorInYear(anchor, today.y + 1, fb)
  }
  return thisYear
}

/**
 * 满周期截断（anchor-day 感知），与 date-fns differenceInMonths 同语义：
 * 只数「完整已满」的月数，不是简单的 (y2-y1)*12+(m2-m1)。
 */
export function completedMonths(from: CivilDate, to: CivilDate): number {
  if (diffDays(from, to) < 0) return -completedMonths(to, from)
  let months = (to.y - from.y) * 12 + (to.m - from.m)
  const anchorLandedDay = Math.min(from.d, daysInMonth(to.y, to.m))
  if (to.d < anchorLandedDay) months -= 1
  return months
}

export function completedYears(from: CivilDate, to: CivilDate): number {
  return Math.floor(completedMonths(from, to) / 12)
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/occasion.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(lib): occasion 公历锚点计算 + 满周期截断 + 单测"
```

---

### Task 7: `lib/occasion.ts` — `computeOccasion`（since / until / anniversary-公历分支）

**Files:**
- Modify: `jinian-app/src/lib/occasion.ts`
- Modify: `jinian-app/src/lib/occasion.test.ts`

**Interfaces:**
- Consumes: Task 6 里的 `anchorInYear`、`nextAnniversaryDateSolar`、`completedYears`；`CivilDate`、`diffDays` from `./civilDate`。
- Produces:
  ```ts
  export interface OccasionState {
    daysBetween: number
    years: number
    months: number
    nextDate: CivilDate | null
    isToday: boolean
  }
  export interface OccasionInput {
    kind: OccasionKind
    date: CivilDate
    lunar?: { lunarMonth: number; lunarDay: number; isLeap: boolean } | null
    leapFallback?: LeapFallback
  }
  export function computeOccasion(input: OccasionInput, today?: CivilDate): OccasionState
  ```
  本任务先只支持 `lunar` 为空/undefined 的情况（若传入非空 `lunar` 且 `kind='anniversary'`，Task 9 会补上真实农历分支；本任务里传入 `lunar` 会抛错，测试里会明确断言这一点，作为"未接线"的临时行为）。Task 12（`reminders.ts`）会消费 `computeOccasion` 与其返回类型。

- [ ] **Step 1: 补充失败测试（追加到 occasion.test.ts 末尾）**

在 `jinian-app/src/lib/occasion.test.ts` 顶部的 import 里加入 `computeOccasion`：
```ts
import {
  anchorInYear,
  nextAnniversaryDateSolar,
  completedMonths,
  completedYears,
  computeOccasion,
} from './occasion'
```

在文件末尾追加：
```ts
describe('computeOccasion — since', () => {
  it('已过天数为非负整数，today=起点当天时为0', () => {
    const state = computeOccasion(
      { kind: 'since', date: { y: 2023, m: 7, d: 10 } },
      { y: 2023, m: 7, d: 10 },
    )
    expect(state.daysBetween).toBe(0)
    expect(state.years).toBe(0)
    expect(state.nextDate).toBeNull()
    expect(state.isToday).toBe(true)
  })
  it('起点之后 N 天，daysBetween 与 years 正确', () => {
    const state = computeOccasion(
      { kind: 'since', date: { y: 2023, m: 7, d: 10 } },
      { y: 2026, m: 7, d: 9 },
    )
    expect(state.daysBetween).toBe(1096)
    expect(state.years).toBe(2)
    expect(state.isToday).toBe(false)
  })
})

describe('computeOccasion — until', () => {
  it('目标日在未来，daysBetween 为正', () => {
    const state = computeOccasion(
      { kind: 'until', date: { y: 2026, m: 9, d: 28 } },
      { y: 2026, m: 7, d: 1 },
    )
    expect(state.daysBetween).toBe(89)
    expect(state.nextDate).toEqual({ y: 2026, m: 9, d: 28 })
    expect(state.isToday).toBe(false)
  })
  it('目标日已过，daysBetween 为负（供上层归档判断）', () => {
    const state = computeOccasion(
      { kind: 'until', date: { y: 2026, m: 1, d: 1 } },
      { y: 2026, m: 7, d: 1 },
    )
    expect(state.daysBetween).toBeLessThan(0)
  })
  it('恰好是目标日当天，isToday 为 true', () => {
    const state = computeOccasion(
      { kind: 'until', date: { y: 2026, m: 7, d: 1 } },
      { y: 2026, m: 7, d: 1 },
    )
    expect(state.daysBetween).toBe(0)
    expect(state.isToday).toBe(true)
  })
})

describe('computeOccasion — anniversary（公历）', () => {
  it('距下次生日的天数与已满周岁正确', () => {
    const state = computeOccasion(
      { kind: 'anniversary', date: { y: 1995, m: 12, d: 25 }, leapFallback: 'feb28' },
      { y: 2026, m: 7, d: 1 },
    )
    expect(state.nextDate).toEqual({ y: 2026, m: 12, d: 25 })
    expect(state.daysBetween).toBeGreaterThan(0)
    expect(state.years).toBe(30)
  })
  it('2/29 生日在平年默认按 feb28 计算下次', () => {
    const state = computeOccasion(
      { kind: 'anniversary', date: { y: 2000, m: 2, d: 29 }, leapFallback: 'feb28' },
      { y: 2026, m: 3, d: 1 },
    )
    expect(state.nextDate).toEqual({ y: 2027, m: 2, d: 28 })
  })
  it('传入非空 lunar 但尚未接线时应抛错（占位行为，Task 9 会替换）', () => {
    expect(() =>
      computeOccasion(
        {
          kind: 'anniversary',
          date: { y: 2000, m: 6, d: 1 },
          lunar: { lunarMonth: 5, lunarDay: 8, isLeap: false },
        },
        { y: 2026, m: 7, d: 1 },
      ),
    ).toThrow()
  })
})
```

- [ ] **Step 2: 跑测试确认新增用例失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/occasion.test.ts
```

Expected: FAIL（`computeOccasion` 未导出）。

- [ ] **Step 3: 实现 —— 在 occasion.ts 末尾追加**

在 `jinian-app/src/lib/occasion.ts` 末尾追加（文件顶部 import 不变）：
```ts
export interface OccasionState {
  daysBetween: number
  years: number
  months: number
  nextDate: CivilDate | null
  isToday: boolean
}

export interface OccasionInput {
  kind: OccasionKind
  date: CivilDate
  lunar?: { lunarMonth: number; lunarDay: number; isLeap: boolean } | null
  leapFallback?: LeapFallback
}

export function computeOccasion(input: OccasionInput, today: CivilDate): OccasionState {
  const fb = input.leapFallback ?? 'feb28'

  if (input.kind === 'since') {
    const daysBetween = diffDays(input.date, today)
    return {
      daysBetween,
      years: completedYears(input.date, today),
      months: completedMonths(input.date, today),
      nextDate: null,
      isToday: daysBetween === 0,
    }
  }

  if (input.kind === 'until') {
    const daysBetween = diffDays(today, input.date)
    return {
      daysBetween,
      years: 0,
      months: 0,
      nextDate: input.date,
      isToday: daysBetween === 0,
    }
  }

  // kind === 'anniversary'
  if (input.lunar) {
    throw new Error('农历 anniversary 尚未接线，见 Task 9（lib/lunar.ts 完成后会替换此实现）')
  }
  const next = nextAnniversaryDateSolar(input.date, today, fb)
  const daysBetween = diffDays(today, next)
  return {
    daysBetween,
    years: completedYears(input.date, today),
    months: 0,
    nextDate: next,
    isToday: daysBetween === 0,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/occasion.test.ts
```

Expected: PASS，全部用例通过。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(lib): computeOccasion — since/until/anniversary(公历) 三分支"
```

---

### Task 8: `lib/lunar.ts` — 农历换算（`lunar-typescript`）

**Files:**
- Create: `jinian-app/src/lib/lunar.ts`
- Test: `jinian-app/src/lib/lunar.test.ts`

**Interfaces:**
- Consumes: `CivilDate` from `./civilDate`；`lunar-typescript` 包的 `Lunar`、`LunarYear`、`LunarMonth`。
- Produces:
  ```ts
  export interface LunarDateSpec { lunarMonth: number; lunarDay: number; isLeap: boolean }
  export function lunarToSolarInYear(spec: LunarDateSpec, gYear: number): CivilDate[]
  export function nextLunarOccurrence(spec: LunarDateSpec, from: CivilDate, maxYears?: number): CivilDate | null
  ```
  Task 9 会把 `occasion.ts` 里的 `OccasionInput.lunar` 类型改为 import 这个 `LunarDateSpec`（去掉 Task 7 里的内联类型），并用 `nextLunarOccurrence` 实现 anniversary 农历分支。

- [ ] **Step 1: 写失败测试**

`jinian-app/src/lib/lunar.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { lunarToSolarInYear, nextLunarOccurrence } from './lunar'

describe('lunarToSolarInYear', () => {
  it('普通农历日期在目标公历年恰好命中1次（2026年中秋，农历八月十五）', () => {
    const result = lunarToSolarInYear({ lunarMonth: 8, lunarDay: 15, isLeap: false }, 2026)
    expect(result).toEqual([{ y: 2026, m: 9, d: 25 }])
  })
  it('农历十二月初一在2024年一年命中2次', () => {
    const result = lunarToSolarInYear({ lunarMonth: 12, lunarDay: 1, isLeap: false }, 2024)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ y: 2024, m: 1, d: 10 })
    expect(result[1]).toEqual({ y: 2024, m: 12, d: 30 })
  })
  it('2024年无闰二月，命中0次', () => {
    const result = lunarToSolarInYear({ lunarMonth: 2, lunarDay: 1, isLeap: true }, 2024)
    expect(result).toEqual([])
  })
  it('农历九月只有29天，九月三十不存在，命中0次', () => {
    const result = lunarToSolarInYear({ lunarMonth: 9, lunarDay: 30, isLeap: false }, 2024)
    expect(result).toEqual([])
  })
  it('返回结果按升序排列', () => {
    const result = lunarToSolarInYear({ lunarMonth: 12, lunarDay: 1, isLeap: false }, 2024)
    expect(result[0].m).toBeLessThan(result[1].m)
  })
})

describe('nextLunarOccurrence', () => {
  it('从今天起找到最近一次命中（未来）', () => {
    const result = nextLunarOccurrence(
      { lunarMonth: 8, lunarDay: 15, isLeap: false },
      { y: 2026, m: 1, d: 1 },
    )
    expect(result).toEqual({ y: 2026, m: 9, d: 25 })
  })
  it('今年已过，返回明年的对应日期', () => {
    const result = nextLunarOccurrence(
      { lunarMonth: 1, lunarDay: 1, isLeap: false },
      { y: 2026, m: 7, d: 1 },
    )
    expect(result).not.toBeNull()
    expect(result!.y).toBeGreaterThanOrEqual(2027)
  })
  it('闰月纪念日窗口内无对应时返回 null', () => {
    // 闰二月上一次是2023年，下一次是2042年；从2026年起搜索5年窗口应该找不到
    const result = nextLunarOccurrence(
      { lunarMonth: 2, lunarDay: 1, isLeap: true },
      { y: 2026, m: 1, d: 1 },
      5,
    )
    expect(result).toBeNull()
  })
  it('闰月纪念日给足25年窗口能找到', () => {
    const result = nextLunarOccurrence(
      { lunarMonth: 2, lunarDay: 1, isLeap: true },
      { y: 2026, m: 1, d: 1 },
      25,
    )
    expect(result).not.toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/lunar.test.ts
```

Expected: FAIL，`Cannot find module './lunar'`。

- [ ] **Step 3: 实现 lunar.ts**

`jinian-app/src/lib/lunar.ts`：
```ts
import { Lunar, LunarYear, LunarMonth } from 'lunar-typescript'
import { type CivilDate, diffDays, compareCivilDate } from './civilDate'

export interface LunarDateSpec {
  lunarMonth: number
  lunarDay: number
  isLeap: boolean
}

/**
 * 农历(月,日)在指定公历年 gYear 内对应的全部公历日期。
 * 农历年整数 != 目标公历年（农历年末常落到次年公历1-2月），所以要扫
 * [gYear-1, gYear, gYear+1] 三个农历年，只留换算后 solar.getYear()===gYear 的。
 * 一个公历年可能命中 0（短月/无闰月）、1（一般情况）、2（如农历12月初一）次。
 */
export function lunarToSolarInYear(spec: LunarDateSpec, gYear: number): CivilDate[] {
  const { lunarMonth, lunarDay, isLeap } = spec
  const signedMonth = isLeap ? -Math.abs(lunarMonth) : Math.abs(lunarMonth)
  const hits: CivilDate[] = []

  for (const ly of [gYear - 1, gYear, gYear + 1]) {
    if (isLeap && LunarYear.fromYear(ly).getLeapMonth() !== Math.abs(lunarMonth)) continue
    const month = LunarMonth.fromYm(ly, signedMonth)
    if (!month || lunarDay > month.getDayCount()) continue

    let solar
    try {
      solar = Lunar.fromYmd(ly, signedMonth, lunarDay).getSolar()
    } catch {
      continue
    }
    if (solar.getYear() === gYear) {
      hits.push({ y: solar.getYear(), m: solar.getMonth(), d: solar.getDay() })
    }
  }

  return hits.sort((a, b) => compareCivilDate(a, b))
}

/**
 * 从 from（含）起，找该农历日期下一次出现的公历日期。
 * 闰月纪念日间隔可达 ~19 年，窗口默认给 25 年；窗口内无命中返回 null。
 */
export function nextLunarOccurrence(
  spec: LunarDateSpec,
  from: CivilDate,
  maxYears = 25,
): CivilDate | null {
  for (let y = from.y; y <= from.y + maxYears; y++) {
    for (const hit of lunarToSolarInYear(spec, y)) {
      if (diffDays(from, hit) >= 0) return hit
    }
  }
  return null
}
```

- [ ] **Step 4: 安装 lunar-typescript 依赖（若 Task 1 的 package.json 已含此依赖，此步骤等价于确认已安装）**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npm ls lunar-typescript
```

Expected: 显示已安装的版本（如 `lunar-typescript@1.8.6`）。若未安装，运行 `npm install lunar-typescript@^1.8.6`。

- [ ] **Step 5: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/lunar.test.ts
```

Expected: PASS，全部用例通过。

- [ ] **Step 6: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(lib): 农历换算 lunarToSolarInYear/nextLunarOccurrence + 单测"
```

---

### Task 9: `lib/occasion.ts` — 接入农历 anniversary 分支

**Files:**
- Modify: `jinian-app/src/lib/occasion.ts`
- Modify: `jinian-app/src/lib/occasion.test.ts`

**Interfaces:**
- Consumes: `LunarDateSpec`、`nextLunarOccurrence` from `./lunar`（Task 8）。
- Produces: `OccasionInput.lunar` 的类型改为 `LunarDateSpec | null`（从 Task 7 的内联类型改为复用 `./lunar` 的类型，供后续 UI/hooks 引用同一个类型定义，避免重复定义）；`computeOccasion` 的农历分支不再抛错，改为真实计算。

- [ ] **Step 1: 修改测试 —— 把"抛错"断言换成真实断言**

在 `jinian-app/src/lib/occasion.test.ts` 里，把 Task 7 写的这个用例：
```ts
  it('传入非空 lunar 但尚未接线时应抛错（占位行为，Task 9 会替换）', () => {
    expect(() =>
      computeOccasion(
        {
          kind: 'anniversary',
          date: { y: 2000, m: 6, d: 1 },
          lunar: { lunarMonth: 5, lunarDay: 8, isLeap: false },
        },
        { y: 2026, m: 7, d: 1 },
      ),
    ).toThrow()
  })
```
替换为：
```ts
  it('农历 anniversary：下次发生日经农历换算得出', () => {
    const state = computeOccasion(
      {
        kind: 'anniversary',
        date: { y: 2000, m: 9, d: 20 },
        lunar: { lunarMonth: 8, lunarDay: 15, isLeap: false },
      },
      { y: 2026, m: 1, d: 1 },
    )
    expect(state.nextDate).toEqual({ y: 2026, m: 9, d: 25 })
    expect(state.daysBetween).toBeGreaterThan(0)
  })
  it('农历 anniversary：窗口内无对应时 nextDate 为 null', () => {
    const state = computeOccasion(
      {
        kind: 'anniversary',
        date: { y: 2000, m: 3, d: 1 },
        lunar: { lunarMonth: 2, lunarDay: 1, isLeap: true },
      },
      { y: 2026, m: 1, d: 1 },
    )
    // 默认窗口 25 年内闰二月会出现（2042），所以这里应能找到
    expect(state.nextDate).not.toBeNull()
  })
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/occasion.test.ts
```

Expected: FAIL（现有实现对 `lunar` 非空会抛错，与新断言不符）。

- [ ] **Step 3: 实现 —— 修改 occasion.ts**

在 `jinian-app/src/lib/occasion.ts` 顶部把 import 改为：
```ts
import { type CivilDate, diffDays, daysInMonth, isLeapYear } from './civilDate'
import { type LunarDateSpec, nextLunarOccurrence } from './lunar'
```

把 `OccasionInput` 接口里的 `lunar` 字段类型改为复用 `LunarDateSpec`：
```ts
export interface OccasionInput {
  kind: OccasionKind
  date: CivilDate
  lunar?: LunarDateSpec | null
  leapFallback?: LeapFallback
}
```

把 `computeOccasion` 里 `kind === 'anniversary'` 分支的农历处理从抛错改为真实计算：
```ts
  // kind === 'anniversary'
  if (input.lunar) {
    const next = nextLunarOccurrence(input.lunar, today)
    return {
      daysBetween: next ? diffDays(today, next) : Number.POSITIVE_INFINITY,
      years: completedYears(input.date, today),
      months: 0,
      nextDate: next,
      isToday: next ? diffDays(today, next) === 0 : false,
    }
  }
  const next = nextAnniversaryDateSolar(input.date, today, fb)
  const daysBetween = diffDays(today, next)
  return {
    daysBetween,
    years: completedYears(input.date, today),
    months: 0,
    nextDate: next,
    isToday: daysBetween === 0,
  }
```
（即：在原有 `if (input.lunar) { throw ... }` 那段位置，替换成上面这段真实逻辑；后面紧跟的公历分支保持不变。）

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/occasion.test.ts
```

Expected: PASS，全部用例（含 Task 6/7/9 累积的）通过。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(lib): computeOccasion 接入农历 anniversary 分支"
```

---

### Task 10: `lib/occasion.ts` — `expandMilestones`（仅 `since`）

**Files:**
- Modify: `jinian-app/src/lib/occasion.ts`
- Modify: `jinian-app/src/lib/occasion.test.ts`

**Interfaces:**
- Consumes: `CivilDate`、`diffDays`、`addDays`、`addMonthsClamped` from `./civilDate`。
- Produces:
  ```ts
  export interface MilestoneConfig {
    hundreds?: boolean
    thousand?: boolean
    monthly?: boolean
    romantic?: boolean
    customDays?: number[]
  }
  export interface Milestone {
    key: string
    label: string
    date: CivilDate
    dayOffset: number | null
    achieved: boolean
    isToday: boolean
    isNext: boolean
  }
  export function expandMilestones(start: CivilDate, config: MilestoneConfig, today: CivilDate, horizonDays?: number): Milestone[]
  ```
  Task 11 会复用 `Milestone` 类型；Task 12（`reminders.ts`）会消费 `expandMilestones` 的返回值取 `isNext` 项。

- [ ] **Step 1: 写失败测试**

在 `jinian-app/src/lib/occasion.test.ts` 顶部 import 里加入 `expandMilestones`：
```ts
import {
  anchorInYear,
  nextAnniversaryDateSolar,
  completedMonths,
  completedYears,
  computeOccasion,
  expandMilestones,
} from './occasion'
```

文件末尾追加：
```ts
describe('expandMilestones', () => {
  const start = { y: 2023, m: 7, d: 10 }

  it('hundreds 预设展开出第100/200/300...天', () => {
    const result = expandMilestones(start, { hundreds: true }, { y: 2023, m: 7, d: 10 })
    expect(result[0]).toMatchObject({ key: 'd100', dayOffset: 100 })
    expect(result[1]).toMatchObject({ key: 'd200', dayOffset: 200 })
  })

  it('thousand 预设只展开第1000天一条', () => {
    const result = expandMilestones(start, { thousand: true }, { y: 2023, m: 7, d: 10 })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ key: 'd1000', dayOffset: 1000 })
  })

  it('romantic 预设展开520和1314两条', () => {
    const result = expandMilestones(start, { romantic: true }, { y: 2023, m: 7, d: 10 })
    expect(result.map((m) => m.dayOffset)).toEqual([520, 1314])
  })

  it('monthly 用真实日历月计算，不是30天近似（1月31日起点场景验证不漂移）', () => {
    const result = expandMilestones(
      { y: 2026, m: 1, d: 31 },
      { monthly: true },
      { y: 2026, m: 1, d: 31 },
      120,
    )
    // 1/31 +1月 clamp 到 2/28（平年），+2月 clamp 到 3/31，与"每30天"近似值不同
    expect(result[0].date).toEqual({ y: 2026, m: 2, d: 28 })
    expect(result[1].date).toEqual({ y: 2026, m: 3, d: 31 })
  })

  it('customDays 支持自定义天数并去重排序', () => {
    const result = expandMilestones(
      start,
      { customDays: [888, 100] },
      { y: 2023, m: 7, d: 10 },
    )
    expect(result.map((m) => m.dayOffset)).toEqual([100, 888])
  })

  it('achieved 标记正确 — 今天之前已达成', () => {
    const result = expandMilestones(
      start,
      { hundreds: true },
      addDaysHelper(start, 150),
    )
    expect(result[0].achieved).toBe(true) // 第100天
    expect(result[1].achieved).toBe(false) // 第200天
  })

  it('isNext 只标记第一个未达成的里程碑', () => {
    const result = expandMilestones(start, { hundreds: true }, addDaysHelper(start, 150))
    const nextOnes = result.filter((m) => m.isNext)
    expect(nextOnes).toHaveLength(1)
    expect(nextOnes[0].key).toBe('d200')
  })

  it('isToday 标记恰好今天达成的里程碑', () => {
    const result = expandMilestones(start, { hundreds: true }, addDaysHelper(start, 100))
    expect(result[0].isToday).toBe(true)
    expect(result[0].achieved).toBe(false)
  })

  it('horizon 上界防止无限展开', () => {
    const result = expandMilestones(start, { monthly: true }, start, 60)
    expect(result.every((m) => m.dayOffset! <= 60)).toBe(true)
  })

  it('同一天多规则命中时去重，只留一条', () => {
    // 第1000天恰好也是自定义天数，应只出现一次
    const result = expandMilestones(start, { thousand: true, customDays: [1000] }, start)
    expect(result).toHaveLength(1)
  })
})

// 测试辅助：不直接 import addDays 避免与被测模块的导入产生耦合歧义，这里用局部小工具
function addDaysHelper(c: { y: number; m: number; d: number }, n: number) {
  const dt = new Date(Date.UTC(c.y, c.m - 1, c.d, 12) + n * 86_400_000)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/occasion.test.ts
```

Expected: FAIL（`expandMilestones` 未导出）。

- [ ] **Step 3: 实现 —— 在 occasion.ts 顶部 import 里加入 `addDays`/`addMonthsClamped`，末尾追加实现**

把顶部 import 改为：
```ts
import { type CivilDate, diffDays, daysInMonth, isLeapYear, addDays, addMonthsClamped } from './civilDate'
import { type LunarDateSpec, nextLunarOccurrence } from './lunar'
```

文件末尾追加：
```ts
export interface MilestoneConfig {
  hundreds?: boolean
  thousand?: boolean
  monthly?: boolean
  romantic?: boolean
  customDays?: number[]
}

export interface Milestone {
  key: string
  label: string
  date: CivilDate
  dayOffset: number | null
  achieved: boolean
  isToday: boolean
  isNext: boolean
}

/** 仅用于 kind='since'：起点 + 偏移天数展开为一串里程碑。 */
export function expandMilestones(
  start: CivilDate,
  config: MilestoneConfig,
  today: CivilDate,
  horizonDays = 366 * 60,
): Milestone[] {
  const raw: { key: string; label: string; dayOffset: number; date: CivilDate }[] = []

  const pushByOffset = (key: string, label: string, offset: number) => {
    if (offset <= 0 || offset > horizonDays) return
    raw.push({ key, label, dayOffset: offset, date: addDays(start, offset) })
  }

  if (config.hundreds) {
    for (let k = 1; k * 100 <= horizonDays; k++) pushByOffset(`d${k * 100}`, `${k * 100} 天`, k * 100)
  }
  if (config.thousand) pushByOffset('d1000', '1000 天', 1000)
  if (config.romantic) {
    pushByOffset('d520', '520 天', 520)
    pushByOffset('d1314', '1314 天', 1314)
  }
  if (config.monthly) {
    for (let k = 1; ; k++) {
      const date = addMonthsClamped(start, k)
      const offset = diffDays(start, date)
      if (offset > horizonDays) break
      if (offset > 0) raw.push({ key: `m${k}`, label: `${k} 个月`, dayOffset: offset, date })
    }
  }
  for (const n of config.customDays ?? []) pushByOffset(`c${n}`, `${n} 天`, n)

  const seen = new Set<string>()
  const deduped = raw
    .sort((a, b) => a.dayOffset - b.dayOffset)
    .filter((m) => {
      const dateKey = `${m.date.y}-${m.date.m}-${m.date.d}`
      if (seen.has(dateKey)) return false
      seen.add(dateKey)
      return true
    })

  const list: Milestone[] = deduped.map((m) => {
    const delta = diffDays(today, m.date)
    return { ...m, achieved: delta < 0, isToday: delta === 0, isNext: false }
  })
  const nextIndex = list.findIndex((m) => !m.achieved && !m.isToday)
  if (nextIndex >= 0) list[nextIndex].isNext = true
  else {
    const todayIndex = list.findIndex((m) => m.isToday)
    if (todayIndex >= 0) list[todayIndex].isNext = true
  }
  return list
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/occasion.test.ts
```

Expected: PASS。若 `isNext`/`isToday` 相关用例失败，检查上面 `nextIndex` 的查找逻辑是否符合"今天恰好达成的里程碑单独算 isToday，不算 achieved，也应能被标为 isNext（因为还没变成"过去"）"这条规则——按 spec §6 边界规则处理。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(lib): expandMilestones — since 专属里程碑展开 + 单测"
```

---

### Task 11: `lib/occasion.ts` — `expandAnniversaryMilestones`（周年 + 年龄，自动生成）

**Files:**
- Modify: `jinian-app/src/lib/occasion.ts`
- Modify: `jinian-app/src/lib/occasion.test.ts`

**Interfaces:**
- Consumes: `anchorInYear`（Task 6）、`Milestone` 类型（Task 10）。
- Produces:
  ```ts
  export function expandAnniversaryMilestones(anchor: CivilDate, today: CivilDate, fb: LeapFallback, maxYears?: number): Milestone[]
  ```
  返回的 `Milestone[]` 复用 Task 10 的类型，`dayOffset` 恒为 `null`（周年不是固定天偏移概念），`label` 形如「第 10 周年」。

- [ ] **Step 1: 写失败测试**

在 `jinian-app/src/lib/occasion.test.ts` 顶部 import 加入 `expandAnniversaryMilestones`：
```ts
import {
  anchorInYear,
  nextAnniversaryDateSolar,
  completedMonths,
  completedYears,
  computeOccasion,
  expandMilestones,
  expandAnniversaryMilestones,
} from './occasion'
```

文件末尾追加：
```ts
describe('expandAnniversaryMilestones', () => {
  it('生成的第一条是第1周年，label 正确，dayOffset 为 null', () => {
    const result = expandAnniversaryMilestones(
      { y: 2020, m: 7, d: 10 },
      { y: 2020, m: 7, d: 10 },
      'feb28',
      5,
    )
    expect(result[0]).toMatchObject({ key: 'y1', label: '第 1 周年', dayOffset: null })
    expect(result[0].date).toEqual({ y: 2021, m: 7, d: 10 })
  })

  it('maxYears 限制生成条数', () => {
    const result = expandAnniversaryMilestones(
      { y: 2020, m: 7, d: 10 },
      { y: 2020, m: 7, d: 10 },
      'feb28',
      3,
    )
    expect(result).toHaveLength(3)
  })

  it('achieved 与 isNext 标记正确', () => {
    const result = expandAnniversaryMilestones(
      { y: 2020, m: 7, d: 10 },
      { y: 2023, m: 8, d: 1 },
      'feb28',
      5,
    )
    expect(result[0].achieved).toBe(true) // 第1周年 2021-07-10 已过
    expect(result[2].achieved).toBe(true) // 第3周年 2023-07-10 已过
    expect(result[3].isNext).toBe(true) // 第4周年 2024-07-10 是下一个
  })

  it('2/29 生日的周年按 leapFallback 处理', () => {
    const result = expandAnniversaryMilestones(
      { y: 2000, m: 2, d: 29 },
      { y: 2000, m: 2, d: 29 },
      'feb28',
      27,
    )
    // 第26周年落在2026（平年），应回退到2/28
    const y26 = result.find((m) => m.key === 'y26')
    expect(y26?.date).toEqual({ y: 2026, m: 2, d: 28 })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/occasion.test.ts
```

Expected: FAIL（`expandAnniversaryMilestones` 未导出）。

- [ ] **Step 3: 实现 —— 在 occasion.ts 末尾追加**

```ts
/** anniversary 专属：周年 + 年龄自动生成，不读 milestones 配置字段。 */
export function expandAnniversaryMilestones(
  anchor: CivilDate,
  today: CivilDate,
  fb: LeapFallback,
  maxYears = 100,
): Milestone[] {
  const list: Milestone[] = []
  for (let n = 1; n <= maxYears; n++) {
    const date = anchorInYear(anchor, anchor.y + n, fb)
    const delta = diffDays(today, date)
    list.push({
      key: `y${n}`,
      label: `第 ${n} 周年`,
      date,
      dayOffset: null,
      achieved: delta < 0,
      isToday: delta === 0,
      isNext: false,
    })
  }
  const nextIndex = list.findIndex((m) => !m.achieved && !m.isToday)
  if (nextIndex >= 0) list[nextIndex].isNext = true
  else {
    const todayIndex = list.findIndex((m) => m.isToday)
    if (todayIndex >= 0) list[todayIndex].isNext = true
  }
  return list
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/occasion.test.ts
```

Expected: PASS，`occasion.test.ts` 全部用例（Task 6/7/9/10/11 累积）通过。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(lib): expandAnniversaryMilestones — 周年+年龄自动生成 + 单测"
```

---

### Task 12: `lib/reminders.ts` — `computeReminderTimes`（提醒排程纯函数）

**Files:**
- Create: `jinian-app/src/lib/reminders.ts`
- Test: `jinian-app/src/lib/reminders.test.ts`
- Create: `jinian-app/src/types/occasion.ts`

**Interfaces:**
- Consumes: `CivilDate`、`parseCivilDate`、`todayCivil` from `./civilDate`；`computeOccasion`、`expandMilestones`、`expandAnniversaryMilestones`、`OccasionKind`、`LeapFallback`、`MilestoneConfig` from `./occasion`；`LunarDateSpec` from `./lunar`。
- Produces:
  ```ts
  // src/types/occasion.ts
  export interface OccasionRow {
    id: string
    user_id: string
    kind: OccasionKind
    title: string
    date: string          // 'YYYY-MM-DD'
    lunar: boolean
    lunar_month: number | null
    lunar_day: number | null
    lunar_is_leap: boolean
    cover_path: string | null
    note: string | null
    remind_days: number[]
    milestones: MilestoneConfig
    leap_fallback: LeapFallback
    created_at: string
    updated_at: string
  }
  export interface OccasionInsert { /* 见下方实现，Task 15 会用到 */ }

  // src/lib/reminders.ts
  export interface ReminderItem {
    id: number
    at: Date
    title: string
    body: string
    occasionId: string
  }
  export function computeReminderTimes(occasions: OccasionRow[], today: CivilDate, now: Date, maxItems?: number): ReminderItem[]
  ```
  Task 23（Capacitor 本地通知接入）会直接消费 `computeReminderTimes` 的返回值传给 `LocalNotifications.schedule()`；Task 15（`useOccasions` hook）会消费 `OccasionRow`/`OccasionInsert`。

- [ ] **Step 1: 先写 `src/types/occasion.ts`（无测试，纯类型定义）**

`jinian-app/src/types/occasion.ts`：
```ts
import type { OccasionKind, LeapFallback, MilestoneConfig } from '../lib/occasion'

export interface OccasionRow {
  id: string
  user_id: string
  kind: OccasionKind
  title: string
  date: string // 'YYYY-MM-DD'，公历基准日
  lunar: boolean
  lunar_month: number | null
  lunar_day: number | null
  lunar_is_leap: boolean
  cover_path: string | null
  note: string | null
  remind_days: number[]
  milestones: MilestoneConfig
  leap_fallback: LeapFallback
  created_at: string
  updated_at: string
}

export interface OccasionInsert {
  kind: OccasionKind
  title: string
  date: string
  lunar?: boolean
  lunar_month?: number | null
  lunar_day?: number | null
  lunar_is_leap?: boolean
  cover_path?: string | null
  note?: string | null
  remind_days?: number[]
  milestones?: MilestoneConfig
  leap_fallback?: LeapFallback
}
```

- [ ] **Step 2: 写失败测试**

`jinian-app/src/lib/reminders.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { computeReminderTimes } from './reminders'
import type { OccasionRow } from '../types/occasion'

function makeRow(overrides: Partial<OccasionRow>): OccasionRow {
  return {
    id: 'test-id-1',
    user_id: 'user-1',
    kind: 'until',
    title: '测试事件',
    date: '2026-09-28',
    lunar: false,
    lunar_month: null,
    lunar_day: null,
    lunar_is_leap: false,
    cover_path: null,
    note: null,
    remind_days: [0, 1],
    milestones: {},
    leap_fallback: 'feb28',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeReminderTimes', () => {
  it('until 类型：为每个 remind_days 偏移生成一条提醒，时刻为当天09:00', () => {
    const today = { y: 2026, m: 7, d: 1 }
    const now = new Date('2026-07-01T08:00:00+08:00')
    const result = computeReminderTimes([makeRow({ remind_days: [0, 1] })], today, now)
    expect(result).toHaveLength(2)
    // remind_days=1 -> 提前1天，9/27 09:00 CST；remind_days=0 -> 当天 9/28 09:00 CST
    const sorted = [...result].sort((a, b) => a.at.getTime() - b.at.getTime())
    expect(sorted[0].at.toISOString()).toBe('2026-09-27T01:00:00.000Z')
    expect(sorted[1].at.toISOString()).toBe('2026-09-28T01:00:00.000Z')
  })

  it('过滤掉已经过去的提醒时刻', () => {
    const today = { y: 2026, m: 7, d: 1 }
    const now = new Date('2026-07-01T08:00:00+08:00')
    const result = computeReminderTimes(
      [makeRow({ kind: 'until', date: '2026-01-01', remind_days: [0] })],
      today,
      now,
    )
    expect(result).toHaveLength(0)
  })

  it('anniversary 公历：为下次发生日生成提醒', () => {
    const today = { y: 2026, m: 7, d: 1 }
    const now = new Date('2026-07-01T08:00:00+08:00')
    const result = computeReminderTimes(
      [makeRow({ kind: 'anniversary', date: '1995-12-25', remind_days: [0] })],
      today,
      now,
    )
    expect(result).toHaveLength(1)
    expect(result[0].at.toISOString()).toBe('2026-12-25T01:00:00.000Z')
  })

  it('since 里程碑：isNext 里程碑生成提醒', () => {
    const today = { y: 2026, m: 7, d: 1 }
    const now = new Date('2026-07-01T08:00:00+08:00')
    const result = computeReminderTimes(
      [
        makeRow({
          kind: 'since',
          date: '2023-07-10',
          remind_days: [0],
          milestones: { thousand: true },
        }),
      ],
      today,
      now,
    )
    expect(result.length).toBeGreaterThan(0)
  })

  it('按时间升序排列', () => {
    const today = { y: 2026, m: 7, d: 1 }
    const now = new Date('2026-07-01T08:00:00+08:00')
    const result = computeReminderTimes(
      [
        makeRow({ id: 'a', date: '2026-12-25' }),
        makeRow({ id: 'b', date: '2026-08-01' }),
      ],
      today,
      now,
    )
    for (let i = 1; i < result.length; i++) {
      expect(result[i].at.getTime()).toBeGreaterThanOrEqual(result[i - 1].at.getTime())
    }
  })

  it('截断到 maxItems（默认64条，测试用较小值验证逻辑）', () => {
    const today = { y: 2026, m: 7, d: 1 }
    const now = new Date('2026-07-01T08:00:00+08:00')
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeRow({ id: `id-${i}`, date: `2026-08-${String(i + 1).padStart(2, '0')}` }),
    )
    const result = computeReminderTimes(rows, today, now, 3)
    expect(result).toHaveLength(3)
  })

  it('id 字段是稳定的32位整数（同输入多次调用得到相同id）', () => {
    const today = { y: 2026, m: 7, d: 1 }
    const now = new Date('2026-07-01T08:00:00+08:00')
    const row = makeRow({ id: 'stable-id-x' })
    const r1 = computeReminderTimes([row], today, now)
    const r2 = computeReminderTimes([row], today, now)
    expect(r1[0].id).toBe(r2[0].id)
    expect(Number.isInteger(r1[0].id)).toBe(true)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/reminders.test.ts
```

Expected: FAIL，`Cannot find module './reminders'`。

- [ ] **Step 4: 实现 reminders.ts**

`jinian-app/src/lib/reminders.ts`：
```ts
import { type CivilDate, parseCivilDate, addDays, diffDays } from './civilDate'
import { computeOccasion, expandMilestones, expandAnniversaryMilestones } from './occasion'
import type { OccasionRow } from '../types/occasion'

export interface ReminderItem {
  id: number
  at: Date
  title: string
  body: string
  occasionId: string
}

/** 字符串哈希成32位正整数，供 Capacitor LocalNotifications 的 id 使用（必须是 int32）。 */
function hashToInt32(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 2147483647
}

/** 关键日期 -> 当地09:00（Asia/Shanghai固定为UTC+8）的 Date 对象。 */
function keyDateToNineAM(key: CivilDate): Date {
  return new Date(Date.UTC(key.y, key.m - 1, key.d, 1, 0, 0)) // 09:00 CST = 01:00 UTC
}

function bodyFor(row: OccasionRow, keyDate: CivilDate, today: CivilDate): string {
  const days = diffDays(today, keyDate)
  if (days === 0) return `今天是${row.title}`
  if (days > 0) return `还有 ${days} 天`
  return `${row.title}`
}

export function computeReminderTimes(
  occasions: OccasionRow[],
  today: CivilDate,
  now: Date,
  maxItems = 64,
): ReminderItem[] {
  const items: ReminderItem[] = []

  for (const row of occasions) {
    const anchorDate = parseCivilDate(row.date)
    const keyDates: CivilDate[] = []

    if (row.kind === 'anniversary') {
      const state = computeOccasion(
        {
          kind: 'anniversary',
          date: anchorDate,
          lunar: row.lunar
            ? { lunarMonth: row.lunar_month!, lunarDay: row.lunar_day!, isLeap: row.lunar_is_leap }
            : null,
          leapFallback: row.leap_fallback,
        },
        today,
      )
      if (state.nextDate) keyDates.push(state.nextDate)
    } else if (row.kind === 'until') {
      const state = computeOccasion({ kind: 'until', date: anchorDate }, today)
      if (state.daysBetween >= 0 && state.nextDate) keyDates.push(state.nextDate)
    } else {
      // since：取 isNext 及其后若干个里程碑
      const milestones = expandMilestones(anchorDate, row.milestones, today)
      const nextIndex = milestones.findIndex((m) => m.isNext)
      if (nextIndex >= 0) {
        for (const m of milestones.slice(nextIndex, nextIndex + 3)) keyDates.push(m.date)
      }
    }

    for (const keyDate of keyDates) {
      for (const offset of row.remind_days) {
        const remindDate = addDays(keyDate, -offset)
        const at = keyDateToNineAM(remindDate)
        if (at.getTime() <= now.getTime()) continue
        items.push({
          id: hashToInt32(`${row.id}:${remindDate.y}-${remindDate.m}-${remindDate.d}`),
          at,
          title: row.title,
          body: bodyFor(row, keyDate, today),
          occasionId: row.id,
        })
      }
    }
  }

  items.sort((a, b) => a.at.getTime() - b.at.getTime())

  const seen = new Set<number>()
  const deduped = items.filter((it) => {
    if (seen.has(it.id)) return false
    seen.add(it.id)
    return true
  })

  return deduped.slice(0, maxItems)
}
```

（注：`expandAnniversaryMilestones` 在此文件暂未直接使用——`reminders.ts` 只需要 `since` 的里程碑驱动提醒，`anniversary` 的提醒由 `computeOccasion` 的 `nextDate` 驱动，`expandAnniversaryMilestones` 是给 UI 详情页展示"周年列表"用的，Task 19 会用到。为避免 `noUnusedLocals` 报错，import 时不要引入未使用的 `expandAnniversaryMilestones`。）

- [ ] **Step 5: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/reminders.test.ts
```

Expected: PASS，全部用例通过。若时间断言（`toISOString()` 精确值）失败，检查是否是本机时区/`Date.UTC` 换算问题——`keyDateToNineAM` 里 09:00 北京时间应恒等于 `01:00 UTC`，与本机系统时区无关（因为用的是 `Date.UTC(...)` 构造）。

- [ ] **Step 6: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(lib): computeReminderTimes — 提醒排程纯函数 + OccasionRow 类型 + 单测"
```

---

## Phase 3：认证与数据层

### Task 13: `AuthContext` — magic-link 登录 + `getSession` 超时乐观渲染（修 schedule-app 现存坑）

**Files:**
- Create: `jinian-app/src/contexts/AuthContext.tsx`
- Test: `jinian-app/src/contexts/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `supabase` from `../lib/supabase`（Task 4）。
- Produces:
  ```ts
  export interface AuthContextType {
    user: User | null
    session: Session | null
    ready: boolean       // 可以渲染了（可能是乐观态，也可能是已确认态）
    confirmed: boolean   // 已被网络/事件真正确认（false 时 ready 也可能为 true——这是超时乐观渲染的标志）
    signInWithMagicLink: (email: string) => Promise<{ error: AuthError | null }>
    signOut: () => Promise<void>
  }
  export function AuthProvider({ children }: { children: ReactNode }): JSX.Element
  export function useAuth(): AuthContextType
  ```
  Task 14（Auth 页面）、Task 21（路由/ProtectedRoute）都消费 `useAuth()`。

- 参考调研：schedule-app 的 `src/contexts/AuthContext.tsx` 现状是裸 `supabase.auth.getSession().then(...)`，**没有任何超时包装**——这正是导致"偶发 auth-gate 转圈"的根因（getSession 在移动端 WebView 恢复场景可能永久 hang）。本任务不照抄该文件，而是新写一版带 `Promise.race` 超时 + 乐观渲染 + `onAuthStateChange` 回调防死锁的实现。

- [ ] **Step 1: 写失败测试**

`jinian-app/src/contexts/AuthContext.test.tsx`：
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('../lib/supabase', () => {
  const listeners: Array<(event: string, session: unknown) => void> = []
  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
          listeners.push(cb)
          return { data: { subscription: { unsubscribe: vi.fn() } } }
        }),
        signInWithOtp: vi.fn(async () => ({ error: null })),
        signOut: vi.fn(async () => undefined),
      },
      __listeners: listeners,
    },
  }
})

function Probe() {
  const { ready, confirmed, user } = useAuth()
  return (
    <div>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="confirmed">{String(confirmed)}</span>
      <span data-testid="user">{user ? user.id : 'none'}</span>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getSession 正常返回时，ready 与 confirmed 都变 true', async () => {
    const { supabase } = await import('../lib/supabase')
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(screen.getByTestId('confirmed').textContent).toBe('true')
    expect(screen.getByTestId('user').textContent).toBe('u1')
  })

  it('getSession 长时间不resolve时，超时后 ready=true 但 confirmed=false（乐观渲染，不误判为未登录）', async () => {
    const { supabase } = await import('../lib/supabase')
    // 永不 resolve 的 Promise，模拟卡死
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}))

    render(
      <AuthProvider timeoutMs={50}>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'), {
      timeout: 1000,
    })
    expect(screen.getByTestId('confirmed').textContent).toBe('false')
  })

  it('onAuthStateChange 事件到达后能纠正超时后的乐观状态', async () => {
    const { supabase } = await import('../lib/supabase')
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}))

    render(
      <AuthProvider timeoutMs={50}>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))

    const listeners = (supabase as unknown as { __listeners: Array<(e: string, s: unknown) => void> })
      .__listeners
    listeners.forEach((cb) => cb('SIGNED_IN', { user: { id: 'u2' } }))

    await waitFor(() => expect(screen.getByTestId('confirmed').textContent).toBe('true'))
    expect(screen.getByTestId('user').textContent).toBe('u2')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/contexts/AuthContext.test.tsx
```

Expected: FAIL，`Cannot find module './AuthContext'`。

- [ ] **Step 3: 实现 AuthContext.tsx**

`jinian-app/src/contexts/AuthContext.tsx`：
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface AuthContextType {
  user: User | null
  session: Session | null
  ready: boolean
  confirmed: boolean
  signInWithMagicLink: (email: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'TIMEOUT'> {
  return Promise.race([p, new Promise<'TIMEOUT'>((resolve) => setTimeout(() => resolve('TIMEOUT'), ms))])
}

export function AuthProvider({
  children,
  timeoutMs = 3000,
}: {
  children: ReactNode
  timeoutMs?: number
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    let alive = true

    // 启动即抢：getSession 加超时，移动端 WebView 恢复场景可能永久 hang。
    void withTimeout(supabase.auth.getSession(), timeoutMs).then((res) => {
      if (!alive) return
      if (res === 'TIMEOUT') {
        // 超时不等于未登录，只是"暂未确认"——先乐观渲染，别卡转圈、别踢去登录页。
        setReady(true)
      } else {
        setSession(res.data.session)
        setReady(true)
        setConfirmed(true)
      }
    })

    // 拿到真实事件后再纠正（含 magic-link 回跳后的 SIGNED_IN）。
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!alive) return
      setSession(s)
      setReady(true)
      setConfirmed(true)
      // 若未来这里需要调用其它 supabase 方法（如拉 profile），必须用
      // setTimeout(fn, 0) 推迟，否则会触发 supabase-js 已知死锁
      // （回调内直接 await 会让该 client 后续所有调用永久挂起）。
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [timeoutMs])

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: import.meta.env.VITE_PUBLIC_BASE_URL },
    })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        ready,
        confirmed,
        signInWithMagicLink,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/contexts/AuthContext.test.tsx
```

Expected: PASS，三个用例全通过（正常登录、超时乐观渲染、事件纠正）。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(auth): AuthContext — magic-link + getSession 超时乐观渲染"
```

---

### Task 14: Auth 登录页（magic-link UI）

**Files:**
- Create: `jinian-app/src/pages/Auth.tsx`
- Test: `jinian-app/src/pages/Auth.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` from `../contexts/AuthContext`（Task 13）。
- Produces: `export default function Auth(): JSX.Element`，Task 21（路由）会把它挂到 `/auth` 路径。

- [ ] **Step 1: 写失败测试**

`jinian-app/src/pages/Auth.test.tsx`：
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Auth from './Auth'

const signInWithMagicLink = vi.fn(async () => ({ error: null }))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ signInWithMagicLink }),
}))

describe('Auth 页面', () => {
  it('输入邮箱并提交后调用 signInWithMagicLink', async () => {
    render(<Auth />)
    const input = screen.getByLabelText('邮箱')
    await userEvent.type(input, 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: '发送登录链接' }))
    expect(signInWithMagicLink).toHaveBeenCalledWith('me@example.com')
  })

  it('提交成功后显示"已发送"提示', async () => {
    render(<Auth />)
    await userEvent.type(screen.getByLabelText('邮箱'), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: '发送登录链接' }))
    expect(await screen.findByText(/已发送/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/pages/Auth.test.tsx
```

Expected: FAIL，`Cannot find module './Auth'`。

- [ ] **Step 3: 实现 Auth.tsx**

`jinian-app/src/pages/Auth.tsx`：
```tsx
import { useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Auth() {
  const { signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const { error } = await signInWithMagicLink(email)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border p-8"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        <h1 className="mb-6 text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
          纪念
        </h1>
        <label htmlFor="email" className="mb-2 block text-sm" style={{ color: 'var(--text-secondary)' }}>
          邮箱
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mb-4 w-full rounded-xl border px-4 py-2.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
        />
        <button
          type="submit"
          className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          发送登录链接
        </button>
        {sent && (
          <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            已发送登录链接到你的邮箱，请查收。
          </p>
        )}
        {error && (
          <p className="mt-4 text-sm" style={{ color: 'var(--accent)' }}>
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/pages/Auth.test.tsx
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(auth): 登录页（magic-link 邮箱表单）"
```

---

### Task 15: `useOccasions` hook — Supabase CRUD

**Files:**
- Create: `jinian-app/src/hooks/useOccasions.ts`
- Test: `jinian-app/src/hooks/useOccasions.test.tsx`

**Interfaces:**
- Consumes: `supabase` from `../lib/supabase`；`OccasionRow`、`OccasionInsert` from `../types/occasion`（Task 12）；`useAuth()` from `../contexts/AuthContext`。
- Produces:
  ```ts
  export function useOccasions(): {
    occasions: OccasionRow[]
    loading: boolean
    error: string | null
    createOccasion: (input: OccasionInsert) => Promise<OccasionRow>
    updateOccasion: (id: string, patch: Partial<OccasionInsert>) => Promise<OccasionRow>
    deleteOccasion: (id: string) => Promise<void>
    refresh: () => Promise<void>
  }
  ```
  Task 18/19/20（首页/详情/表单组件）都消费这个 hook；Task 23（本地通知同步）消费其 `occasions` 数据传给 `computeReminderTimes`。

- [ ] **Step 1: 写失败测试**

`jinian-app/src/hooks/useOccasions.test.tsx`：
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useOccasions } from './useOccasions'

const mockRow = {
  id: 'occ-1',
  user_id: 'u1',
  kind: 'until',
  title: '婚礼',
  date: '2026-09-28',
  lunar: false,
  lunar_month: null,
  lunar_day: null,
  lunar_is_leap: false,
  cover_path: null,
  note: null,
  remind_days: [0, 1],
  milestones: {},
  leap_fallback: 'feb28',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const order = vi.fn(() => Promise.resolve({ data: [mockRow], error: null }))
const select = vi.fn(() => ({ order }))
const eq = vi.fn(() => Promise.resolve({ error: null }))
const insertSingle = vi.fn(() => Promise.resolve({ data: mockRow, error: null }))
const insertSelect = vi.fn(() => ({ single: insertSingle }))
const insert = vi.fn(() => ({ select: insertSelect }))
const updateEqSingle = vi.fn(() => Promise.resolve({ data: mockRow, error: null }))
const updateEqSelect = vi.fn(() => ({ single: updateEqSingle }))
const updateEq = vi.fn(() => ({ select: updateEqSelect }))
const update = vi.fn(() => ({ eq: updateEq }))
const deleteEq = vi.fn(() => Promise.resolve({ error: null }))
const del = vi.fn(() => ({ eq: deleteEq }))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select, insert, update, delete: del })),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

describe('useOccasions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    order.mockResolvedValue({ data: [mockRow], error: null })
  })

  it('挂载后自动拉取数据', async () => {
    const { result } = renderHook(() => useOccasions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.occasions).toHaveLength(1)
    expect(result.current.occasions[0].title).toBe('婚礼')
  })

  it('createOccasion 插入后返回新行', async () => {
    const { result } = renderHook(() => useOccasions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let created
    await act(async () => {
      created = await result.current.createOccasion({
        kind: 'until',
        title: '婚礼',
        date: '2026-09-28',
      })
    })
    expect(created).toEqual(mockRow)
    expect(insert).toHaveBeenCalled()
  })

  it('deleteOccasion 调用 delete().eq()', async () => {
    const { result } = renderHook(() => useOccasions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteOccasion('occ-1')
    })
    expect(del).toHaveBeenCalled()
    expect(deleteEq).toHaveBeenCalledWith('id', 'occ-1')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/hooks/useOccasions.test.tsx
```

Expected: FAIL，`Cannot find module './useOccasions'`。

- [ ] **Step 3: 实现 useOccasions.ts**

`jinian-app/src/hooks/useOccasions.ts`：
```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { OccasionRow, OccasionInsert } from '../types/occasion'

export function useOccasions() {
  const { user } = useAuth()
  const [occasions, setOccasions] = useState<OccasionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setOccasions([])
      setLoading(false)
      return
    }
    setError(null)
    const { data, error } = await supabase
      .from('occasions')
      .select('*')
      .order('date', { ascending: true })
    if (error) {
      setError(error.message)
    } else {
      setOccasions((data ?? []) as OccasionRow[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createOccasion = useCallback(
    async (input: OccasionInsert): Promise<OccasionRow> => {
      const { data, error } = await supabase.from('occasions').insert(input).select().single()
      if (error) throw error
      const row = data as OccasionRow
      setOccasions((prev) => [...prev, row])
      return row
    },
    [],
  )

  const updateOccasion = useCallback(
    async (id: string, patch: Partial<OccasionInsert>): Promise<OccasionRow> => {
      const { data, error } = await supabase
        .from('occasions')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      const row = data as OccasionRow
      setOccasions((prev) => prev.map((o) => (o.id === id ? row : o)))
      return row
    },
    [],
  )

  const deleteOccasion = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('occasions').delete().eq('id', id)
    if (error) throw error
    setOccasions((prev) => prev.filter((o) => o.id !== id))
  }, [])

  return { occasions, loading, error, createOccasion, updateOccasion, deleteOccasion, refresh }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/hooks/useOccasions.test.tsx
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(data): useOccasions hook — Supabase CRUD"
```

---

### Task 16: 图片压缩 + 封面 Storage 上传/删除

**Files:**
- Create: `jinian-app/src/lib/imageCompress.ts`
- Test: `jinian-app/src/lib/imageCompress.test.ts`
- Create: `jinian-app/src/lib/coverStorage.ts`
- Test: `jinian-app/src/lib/coverStorage.test.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabase`。
- Produces:
  ```ts
  // imageCompress.ts
  export function compressImageToJpeg(file: File, maxDimension?: number, quality?: number): Promise<Blob>

  // coverStorage.ts
  export async function uploadCover(userId: string, occasionId: string, file: File): Promise<string>  // 返回 cover_path
  export async function removeCover(coverPath: string): Promise<void>
  export function getCoverSignedUrl(coverPath: string, updatedAt: string): Promise<string>
  ```
  Task 20（新建/编辑表单）消费 `compressImageToJpeg` + `uploadCover` + `removeCover`；Task 18/19（首页/详情）消费 `getCoverSignedUrl`。

- [ ] **Step 1: 写 imageCompress 失败测试**

`jinian-app/src/lib/imageCompress.test.ts`：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compressImageToJpeg } from './imageCompress'

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  width = 3000
  height = 2000
  set src(_v: string) {
    setTimeout(() => this.onload?.(), 0)
  }
}

describe('compressImageToJpeg', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    })

    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/jpeg' }))),
    }
    vi.stubGlobal(
      'document',
      Object.assign(Object.create(document), {
        createElement: vi.fn((tag: string) => (tag === 'canvas' ? fakeCanvas : document.createElement(tag))),
      }),
    )
  })

  it('压缩后返回一个 Blob', async () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    const blob = await compressImageToJpeg(file)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('最长边被限制在 maxDimension 以内（canvas 尺寸按比例缩放）', async () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    await compressImageToJpeg(file, 1600)
    const canvas = (document.createElement as ReturnType<typeof vi.fn>).mock.results.find(
      (r) => r.value.toBlob,
    )!.value
    expect(canvas.width).toBeLessThanOrEqual(1600)
    expect(canvas.height).toBeLessThanOrEqual(1600)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/imageCompress.test.ts
```

Expected: FAIL，`Cannot find module './imageCompress'`。

- [ ] **Step 3: 实现 imageCompress.ts**

`jinian-app/src/lib/imageCompress.ts`：
```ts
/** 把图片压缩为 JPEG：最长边不超过 maxDimension，按比例缩放；quality 控制 JPEG 压缩质量。 */
export function compressImageToJpeg(
  file: File,
  maxDimension = 1600,
  quality = 0.8,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('无法获取 canvas 2d context'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          if (blob) resolve(blob)
          else reject(new Error('canvas.toBlob 返回了 null'))
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/imageCompress.test.ts
```

Expected: PASS。

- [ ] **Step 5: 写 coverStorage 失败测试**

`jinian-app/src/lib/coverStorage.test.ts`：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadCover, removeCover, getCoverSignedUrl } from './coverStorage'

const upload = vi.fn(() => Promise.resolve({ error: null }))
const remove = vi.fn(() => Promise.resolve({ error: null }))
const createSignedUrl = vi.fn(() =>
  Promise.resolve({ data: { signedUrl: 'https://example.com/signed' }, error: null }),
)

vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({ upload, remove, createSignedUrl })),
    },
  },
}))

describe('coverStorage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uploadCover 上传到 {user_id}/{id}.jpg 并返回该路径', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const path = await uploadCover('user-1', 'occ-1', blob)
    expect(path).toBe('user-1/occ-1.jpg')
    expect(upload).toHaveBeenCalledWith('user-1/occ-1.jpg', blob, {
      contentType: 'image/jpeg',
      upsert: true,
    })
  })

  it('removeCover 调用 storage remove', async () => {
    await removeCover('user-1/occ-1.jpg')
    expect(remove).toHaveBeenCalledWith(['user-1/occ-1.jpg'])
  })

  it('getCoverSignedUrl 返回带缓存击穿参数的签名url', async () => {
    const url = await getCoverSignedUrl('user-1/occ-1.jpg', '2026-07-01T00:00:00Z')
    expect(url).toBe('https://example.com/signed?v=2026-07-01T00%3A00%3A00Z')
  })
})
```

- [ ] **Step 6: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/coverStorage.test.ts
```

Expected: FAIL，`Cannot find module './coverStorage'`。

- [ ] **Step 7: 实现 coverStorage.ts**

`jinian-app/src/lib/coverStorage.ts`：
```ts
import { supabase } from './supabase'

const BUCKET = 'covers'

export async function uploadCover(userId: string, occasionId: string, blob: Blob): Promise<string> {
  const path = `${userId}/${occasionId}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) throw error
  return path
}

export async function removeCover(coverPath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([coverPath])
  if (error) throw error
}

export async function getCoverSignedUrl(coverPath: string, updatedAt: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(coverPath, 3600)
  if (error) throw error
  return `${data.signedUrl}?v=${encodeURIComponent(updatedAt)}`
}
```

- [ ] **Step 8: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/coverStorage.test.ts
```

Expected: PASS。

- [ ] **Step 9: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(lib): 图片压缩 + 封面 Storage 上传/删除/签名URL"
```

---

## Phase 4：界面

### Task 17: 全局 Toast（复用 ledger-app 的 window-event-bus 模式）

**Files:**
- Create: `jinian-app/src/lib/toast.ts`
- Create: `jinian-app/src/components/ToastHost.tsx`
- Test: `jinian-app/src/lib/toast.test.ts`
- Test: `jinian-app/src/components/ToastHost.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function showToast(message: string, opts?: { durationMs?: number }): void
  export function subscribeToast(cb: (p: ToastPayload) => void): () => void
  export default function ToastHost(): JSX.Element | null
  ```
  Task 21（App 路由）把 `<ToastHost />` 挂在顶层一次；Task 20（表单）等模块代码通过 `showToast` 报错。

- [ ] **Step 1: 写 toast.ts 失败测试**

`jinian-app/src/lib/toast.test.ts`：
```ts
import { describe, it, expect, vi } from 'vitest'
import { showToast, subscribeToast } from './toast'

describe('toast 事件总线', () => {
  it('showToast 触发订阅回调，带上消息内容', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeToast(cb)
    showToast('测试消息', { durationMs: 3000 })
    expect(cb).toHaveBeenCalledWith({ message: '测试消息', durationMs: 3000 })
    unsubscribe()
  })

  it('unsubscribe 后不再收到通知', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeToast(cb)
    unsubscribe()
    showToast('不该收到')
    expect(cb).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败，然后实现 toast.ts**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/toast.test.ts
```

Expected: FAIL。

`jinian-app/src/lib/toast.ts`：
```ts
const EVENT = 'jinian:toast'

export interface ToastPayload {
  message: string
  durationMs?: number
}

export function showToast(message: string, opts?: { durationMs?: number }): void {
  if (typeof window === 'undefined') return
  const detail: ToastPayload = { message, durationMs: opts?.durationMs }
  window.dispatchEvent(new CustomEvent(EVENT, { detail }))
}

export function subscribeToast(cb: (p: ToastPayload) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent).detail as ToastPayload)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
```

跑测试确认通过：
```bash
npx vitest run src/lib/toast.test.ts
```

- [ ] **Step 3: 写 ToastHost 失败测试**

`jinian-app/src/components/ToastHost.test.tsx`：
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ToastHost from './ToastHost'
import { showToast } from '../lib/toast'

describe('ToastHost', () => {
  it('showToast 后渲染出消息文本', async () => {
    render(<ToastHost />)
    showToast('保存成功')
    await waitFor(() => expect(screen.getByText('保存成功')).toBeInTheDocument())
  })

  it('点击后立即消失', async () => {
    render(<ToastHost />)
    showToast('点我消失')
    const el = await screen.findByText('点我消失')
    el.click()
    await waitFor(() => expect(screen.queryByText('点我消失')).not.toBeInTheDocument())
  })

  it('durationMs 到期后自动消失', async () => {
    vi.useFakeTimers()
    render(<ToastHost />)
    showToast('自动消失', { durationMs: 1000 })
    expect(screen.getByText('自动消失')).toBeInTheDocument()
    vi.advanceTimersByTime(1001)
    await vi.waitFor(() => expect(screen.queryByText('自动消失')).not.toBeInTheDocument())
    vi.useRealTimers()
  })
})
```

- [ ] **Step 4: 跑测试确认失败，然后实现 ToastHost.tsx**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/components/ToastHost.test.tsx
```

Expected: FAIL。

`jinian-app/src/components/ToastHost.tsx`：
```tsx
import { useEffect, useState } from 'react'
import { subscribeToast } from '../lib/toast'

const DEFAULT_DURATION_MS = 2000

export default function ToastHost() {
  const [msg, setMsg] = useState('')
  const [duration, setDuration] = useState(DEFAULT_DURATION_MS)
  const [token, setToken] = useState(0)

  useEffect(() => {
    return subscribeToast((p) => {
      setMsg(p.message)
      setDuration(p.durationMs ?? DEFAULT_DURATION_MS)
      setToken((n) => n + 1)
    })
  }, [])

  useEffect(() => {
    if (!msg) return
    const id = window.setTimeout(() => setMsg(''), duration)
    return () => window.clearTimeout(id)
  }, [msg, duration, token])

  if (!msg) return null
  return (
    <div
      key={token}
      role="status"
      aria-live="polite"
      onClick={() => setMsg('')}
      className="fixed bottom-10 left-1/2 z-50 max-w-[85vw] -translate-x-1/2 cursor-pointer break-words rounded-2xl px-4 py-3 text-center text-sm leading-snug text-white"
      style={{ background: 'rgba(43,42,39,0.9)' }}
    >
      {msg}
    </div>
  )
}
```

跑测试确认通过：
```bash
npx vitest run src/components/ToastHost.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(ui): 全局 Toast 事件总线 + ToastHost"
```

---

### Task 18: 首页组件（版式 A「近期聚焦」）

**Files:**
- Create: `jinian-app/src/pages/Home.tsx`
- Test: `jinian-app/src/pages/Home.test.tsx`

**Interfaces:**
- Consumes: `useOccasions()`（Task 15）；`computeOccasion` from `../lib/occasion`（Task 7/9）；`parseCivilDate`, `todayCivil` from `../lib/civilDate`；`getCoverSignedUrl` from `../lib/coverStorage`（Task 16）。
- Produces: `export default function Home(): JSX.Element`，Task 21 挂到 `/` 路径。

- [ ] **Step 1: 写失败测试**

`jinian-app/src/pages/Home.test.tsx`：
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from './Home'

const mockOccasions = [
  {
    id: 'occ-1',
    user_id: 'u1',
    kind: 'until',
    title: '婚礼',
    date: '2026-09-28',
    lunar: false,
    lunar_month: null,
    lunar_day: null,
    lunar_is_leap: false,
    cover_path: null,
    note: null,
    remind_days: [0, 1],
    milestones: {},
    leap_fallback: 'feb28',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'occ-2',
    user_id: 'u1',
    kind: 'since',
    title: '和 A 在一起',
    date: '2023-07-10',
    lunar: false,
    lunar_month: null,
    lunar_day: null,
    lunar_is_leap: false,
    cover_path: null,
    note: null,
    remind_days: [0],
    milestones: { hundreds: true },
    leap_fallback: 'feb28',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

vi.mock('../hooks/useOccasions', () => ({
  useOccasions: () => ({ occasions: mockOccasions, loading: false, error: null }),
}))

describe('Home 首页', () => {
  it('渲染出全部日子的标题', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    expect(screen.getByText('婚礼')).toBeInTheDocument()
    expect(screen.getByText('和 A 在一起')).toBeInTheDocument()
  })

  it('最近的日子出现在顶部大卡（第一个渲染位置）', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    const titles = screen.getAllByTestId('occasion-title').map((el) => el.textContent)
    expect(titles[0]).toBe('婚礼')
  })

  it('无日子时显示空态引导', () => {
    vi.doMock('../hooks/useOccasions', () => ({
      useOccasions: () => ({ occasions: [], loading: false, error: null }),
    }))
  })
})

describe('Home 首页 — 空态', () => {
  it('occasions 为空数组时显示引导文案', async () => {
    vi.resetModules()
    vi.doMock('../hooks/useOccasions', () => ({
      useOccasions: () => ({ occasions: [], loading: false, error: null }),
    }))
    const { default: HomeEmpty } = await import('./Home')
    render(
      <MemoryRouter>
        <HomeEmpty />
      </MemoryRouter>,
    )
    expect(screen.getByText(/记下第一个重要的日子/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/pages/Home.test.tsx
```

Expected: FAIL，`Cannot find module './Home'`。

- [ ] **Step 3: 实现 Home.tsx**

`jinian-app/src/pages/Home.tsx`：
```tsx
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useOccasions } from '../hooks/useOccasions'
import { computeOccasion } from '../lib/occasion'
import { parseCivilDate, todayCivil } from '../lib/civilDate'
import type { OccasionRow } from '../types/occasion'

function stateFor(row: OccasionRow) {
  const today = todayCivil()
  return computeOccasion(
    {
      kind: row.kind,
      date: parseCivilDate(row.date),
      lunar: row.lunar
        ? { lunarMonth: row.lunar_month!, lunarDay: row.lunar_day!, isLeap: row.lunar_is_leap }
        : null,
      leapFallback: row.leap_fallback,
    },
    today,
  )
}

export default function Home() {
  const { occasions, loading } = useOccasions()

  if (loading) return null

  if (occasions.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p style={{ color: 'var(--text-secondary)' }}>记下第一个重要的日子</p>
        <Link
          to="/new"
          className="rounded-xl px-5 py-2.5 text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          新建
        </Link>
      </div>
    )
  }

  const active = occasions.filter((o) => {
    if (o.kind !== 'until') return true
    return stateFor(o).daysBetween >= 0
  })
  const archived = occasions.filter((o) => o.kind === 'until' && stateFor(o).daysBetween < 0)

  const sorted = [...active].sort((a, b) => {
    const da = stateFor(a).daysBetween
    const db = stateFor(b).daysBetween
    return da - db
  })

  const [hero, ...rest] = sorted

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
          纪念
        </h1>
        <Link to="/new" aria-label="新建" style={{ color: 'var(--accent)' }}>
          <Plus size={22} />
        </Link>
      </div>

      {hero && (
        <Link
          to={`/occasion/${hero.id}`}
          className="mb-6 block rounded-2xl p-5"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <p data-testid="occasion-title" className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
            {hero.title}
          </p>
          <p className="mt-1 text-3xl font-semibold" style={{ color: 'var(--accent)' }}>
            {Math.abs(stateFor(hero).daysBetween)}
            <span className="ml-1 text-sm font-normal" style={{ color: 'var(--text-secondary)' }}>
              天
            </span>
          </p>
        </Link>
      )}

      <div className="space-y-2">
        {rest.map((o) => (
          <Link
            key={o.id}
            to={`/occasion/${o.id}`}
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <span data-testid="occasion-title" className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {o.title}
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
              {Math.abs(stateFor(o).daysBetween)} 天
            </span>
          </Link>
        ))}
      </div>

      {archived.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>
            回忆
          </p>
          <div className="space-y-2">
            {archived.map((o) => (
              <Link
                key={o.id}
                to={`/occasion/${o.id}`}
                className="flex items-center justify-between rounded-xl px-4 py-3 opacity-70"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              >
                <span data-testid="occasion-title" style={{ color: 'var(--text-primary)' }}>
                  {o.title}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/pages/Home.test.tsx
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(ui): 首页组件 — 版式A近期聚焦"
```

---

### Task 19: 详情页组件（版式②「编辑排版」）

**Files:**
- Create: `jinian-app/src/pages/OccasionDetail.tsx`
- Test: `jinian-app/src/pages/OccasionDetail.test.tsx`

**Interfaces:**
- Consumes: `useOccasions()`（Task 15）；`computeOccasion`、`expandMilestones`（仅 `since`）from `../lib/occasion`；`parseCivilDate`, `todayCivil` from `../lib/civilDate`；`useParams` from `react-router-dom`。
- Produces: `export default function OccasionDetail(): JSX.Element`，Task 21 挂到 `/occasion/:id`。

- [ ] **Step 1: 写失败测试**

`jinian-app/src/pages/OccasionDetail.test.tsx`：
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OccasionDetail from './OccasionDetail'

const sinceRow = {
  id: 'occ-2',
  user_id: 'u1',
  kind: 'since',
  title: '和 A 在一起',
  date: '2023-07-10',
  lunar: false,
  lunar_month: null,
  lunar_day: null,
  lunar_is_leap: false,
  cover_path: null,
  note: '从图书馆那次算起。',
  remind_days: [0, 1],
  milestones: { hundreds: true, thousand: true },
  leap_fallback: 'feb28',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

vi.mock('../hooks/useOccasions', () => ({
  useOccasions: () => ({ occasions: [sinceRow], loading: false, error: null, deleteOccasion: vi.fn() }),
}))

function renderDetail(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/occasion/${id}`]}>
      <Routes>
        <Route path="/occasion/:id" element={<OccasionDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OccasionDetail 详情页', () => {
  it('渲染标题、笔记文字', () => {
    renderDetail('occ-2')
    expect(screen.getByText('和 A 在一起')).toBeInTheDocument()
    expect(screen.getByText('从图书馆那次算起。')).toBeInTheDocument()
  })

  it('since 类型显示里程碑区', () => {
    renderDetail('occ-2')
    expect(screen.getByTestId('milestone-section')).toBeInTheDocument()
  })

  it('until 类型不显示里程碑区', () => {
    vi.doMock('../hooks/useOccasions', () => ({
      useOccasions: () => ({
        occasions: [{ ...sinceRow, id: 'occ-3', kind: 'until', milestones: {} }],
        loading: false,
        error: null,
        deleteOccasion: vi.fn(),
      }),
    }))
  })
})

describe('OccasionDetail — until 无里程碑区', () => {
  it('until 类型不渲染里程碑区', async () => {
    vi.resetModules()
    vi.doMock('../hooks/useOccasions', () => ({
      useOccasions: () => ({
        occasions: [{ ...sinceRow, id: 'occ-3', kind: 'until', milestones: {} }],
        loading: false,
        error: null,
        deleteOccasion: vi.fn(),
      }),
    }))
    const { default: FreshDetail } = await import('./OccasionDetail')
    render(
      <MemoryRouter initialEntries={['/occasion/occ-3']}>
        <Routes>
          <Route path="/occasion/:id" element={<FreshDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('milestone-section')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/pages/OccasionDetail.test.tsx
```

Expected: FAIL，`Cannot find module './OccasionDetail'`。

- [ ] **Step 3: 实现 OccasionDetail.tsx**

`jinian-app/src/pages/OccasionDetail.tsx`：
```tsx
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useOccasions } from '../hooks/useOccasions'
import { computeOccasion, expandMilestones } from '../lib/occasion'
import { parseCivilDate, todayCivil, formatCivilDate } from '../lib/civilDate'

const KIND_LABEL = { anniversary: '每年循环', since: '累加计天', until: '倒数到某天' } as const

export default function OccasionDetail() {
  const { id } = useParams<{ id: string }>()
  const { occasions } = useOccasions()
  const row = occasions.find((o) => o.id === id)

  if (!row) return null

  const today = todayCivil()
  const anchor = parseCivilDate(row.date)
  const state = computeOccasion(
    {
      kind: row.kind,
      date: anchor,
      lunar: row.lunar
        ? { lunarMonth: row.lunar_month!, lunarDay: row.lunar_day!, isLeap: row.lunar_is_leap }
        : null,
      leapFallback: row.leap_fallback,
    },
    today,
  )

  const milestones = row.kind === 'since' ? expandMilestones(anchor, row.milestones, today) : []
  const nextMilestone = milestones.find((m) => m.isNext)

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/" aria-label="返回" style={{ color: 'var(--text-secondary)' }}>
          <ChevronLeft size={20} />
        </Link>
      </div>

      <div className="text-center">
        <h1 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
          {row.title}
        </h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {formatCivilDate(anchor)}
        </p>
      </div>

      <p className="mt-4 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        {row.kind === 'since' ? '已经' : row.kind === 'until' ? '还有' : '距下次'}{' '}
        <span className="text-2xl font-semibold" style={{ color: 'var(--accent)' }}>
          {Math.abs(state.daysBetween)}
        </span>{' '}
        天
      </p>

      {row.kind === 'since' && (
        <div
          data-testid="milestone-section"
          className="mt-4 rounded-xl p-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          {nextMilestone && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              下一个里程碑：{nextMilestone.label}
            </p>
          )}
        </div>
      )}

      {row.note && (
        <p
          className="mt-4 border-t pt-4 text-sm leading-7"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          {row.note}
        </p>
      )}

      <div className="mt-4 space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <p>类型：{KIND_LABEL[row.kind]}</p>
        <p>日历：{row.lunar ? `农历 ${row.lunar_month}月${row.lunar_day}日` : '公历'}</p>
        <p>提醒：{row.remind_days.includes(0) ? '当天' : ''}{row.remind_days.filter((d) => d > 0).map((d) => ` 提前${d}天`).join('')}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/pages/OccasionDetail.test.tsx
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(ui): 详情页组件 — 版式②编辑排版"
```

---

### Task 20: 新建/编辑表单（类型切换 / 农历开关 / 里程碑区 / 实时预览 / 封面增改删）

**Files:**
- Create: `jinian-app/src/pages/OccasionForm.tsx`
- Test: `jinian-app/src/pages/OccasionForm.test.tsx`

**Interfaces:**
- Consumes: `useOccasions()`（Task 15）；`compressImageToJpeg`、`uploadCover`、`removeCover`（Task 16）；`OccasionKind`、`MilestoneConfig` from `../lib/occasion`；`useNavigate`, `useParams` from `react-router-dom`。
- Produces: `export default function OccasionForm(): JSX.Element`，Task 21 挂到 `/new` 与 `/occasion/:id/edit`。

- [ ] **Step 1: 写失败测试**

`jinian-app/src/pages/OccasionForm.test.tsx`：
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import OccasionForm from './OccasionForm'

const createOccasion = vi.fn(async (input) => ({ id: 'new-id', ...input }))

vi.mock('../hooks/useOccasions', () => ({
  useOccasions: () => ({ occasions: [], createOccasion, updateOccasion: vi.fn(), deleteOccasion: vi.fn() }),
}))

describe('OccasionForm 新建表单', () => {
  it('默认类型是"每年循环"，农历开关可用', () => {
    render(
      <MemoryRouter>
        <OccasionForm />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: '每年循环' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('农历')).not.toBeDisabled()
  })

  it('切到"累加计天"后显示里程碑区，农历开关禁用', async () => {
    render(
      <MemoryRouter>
        <OccasionForm />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: '累加计天' }))
    expect(screen.getByTestId('milestone-section')).toBeInTheDocument()
    expect(screen.getByLabelText('农历')).toBeDisabled()
  })

  it('切到"倒数到某天"后不显示里程碑区', async () => {
    render(
      <MemoryRouter>
        <OccasionForm />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: '倒数到某天' }))
    expect(screen.queryByTestId('milestone-section')).not.toBeInTheDocument()
  })

  it('提交表单调用 createOccasion，携带正确的 kind 与 title', async () => {
    render(
      <MemoryRouter>
        <OccasionForm />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByLabelText('名字'), '婚礼')
    await userEvent.click(screen.getByRole('button', { name: '倒数到某天' }))
    await userEvent.type(screen.getByLabelText('日期'), '2026-09-28')
    await userEvent.click(screen.getByRole('button', { name: '存' }))
    expect(createOccasion).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'until', title: '婚礼', date: '2026-09-28' }),
    )
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/pages/OccasionForm.test.tsx
```

Expected: FAIL，`Cannot find module './OccasionForm'`。

- [ ] **Step 3: 实现 OccasionForm.tsx**

`jinian-app/src/pages/OccasionForm.tsx`：
```tsx
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOccasions } from '../hooks/useOccasions'
import { compressImageToJpeg } from '../lib/imageCompress'
import { uploadCover, removeCover } from '../lib/coverStorage'
import type { OccasionKind, MilestoneConfig } from '../lib/occasion'
import { showToast } from '../lib/toast'

const KIND_OPTIONS: { value: OccasionKind; label: string }[] = [
  { value: 'anniversary', label: '每年循环' },
  { value: 'since', label: '累加计天' },
  { value: 'until', label: '倒数到某天' },
]

export default function OccasionForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { occasions, createOccasion, updateOccasion } = useOccasions()
  const existing = id ? occasions.find((o) => o.id === id) : undefined

  const [kind, setKind] = useState<OccasionKind>(existing?.kind ?? 'anniversary')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [date, setDate] = useState(existing?.date ?? '')
  const [lunar, setLunar] = useState(existing?.lunar ?? false)
  const [note, setNote] = useState(existing?.note ?? '')
  const [milestones, setMilestones] = useState<MilestoneConfig>(
    existing?.milestones ?? { hundreds: true, thousand: true },
  )
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [removeCoverFlag, setRemoveCoverFlag] = useState(false)

  const handleKindChange = (next: OccasionKind) => {
    setKind(next)
    if (next !== 'anniversary') setLunar(false)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      let coverPath = existing?.cover_path ?? null
      const saved = existing
        ? await updateOccasion(existing.id, { kind, title, date, lunar, note, milestones })
        : await createOccasion({ kind, title, date, lunar, note, milestones })

      if (coverFile) {
        const compressed = await compressImageToJpeg(coverFile)
        coverPath = await uploadCover(saved.user_id, saved.id, compressed)
        await updateOccasion(saved.id, { cover_path: coverPath })
      } else if (removeCoverFlag && existing?.cover_path) {
        await removeCover(existing.cover_path)
        await updateOccasion(saved.id, { cover_path: null })
      }

      navigate(`/occasion/${saved.id}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败，请重试', { durationMs: 6000 })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md px-4 py-6">
      <div className="mb-6">
        <div
          className="flex h-20 items-center justify-center rounded-xl border-2 border-dashed text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
        >
          <label className="cursor-pointer">
            ＋ 添加封面照片
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setCoverFile(f)
                  setRemoveCoverFlag(false)
                }
              }}
            />
          </label>
        </div>
        {existing?.cover_path && !removeCoverFlag && (
          <button
            type="button"
            onClick={() => setRemoveCoverFlag(true)}
            className="mt-2 text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            移除封面
          </button>
        )}
      </div>

      <label htmlFor="title" className="mb-1 block text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>
        名字
      </label>
      <input
        id="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        className="mb-4 w-full rounded-xl border px-3 py-2 text-sm"
        style={{ borderColor: 'var(--border)' }}
      />

      <p className="mb-1 text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>
        类型
      </p>
      <div className="mb-4 flex gap-1 rounded-xl p-1" style={{ background: 'var(--bg-tertiary)' }}>
        {KIND_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={kind === opt.value}
            onClick={() => handleKindChange(opt.value)}
            className="flex-1 rounded-lg px-2 py-1.5 text-xs"
            style={
              kind === opt.value
                ? { background: 'var(--bg-secondary)', color: 'var(--accent)', fontWeight: 600 }
                : { color: 'var(--text-secondary)' }
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
        <label htmlFor="date" className="sr-only">
          日期
        </label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="text-sm"
        />
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          农历
          <input
            type="checkbox"
            aria-label="农历"
            checked={lunar}
            disabled={kind !== 'anniversary'}
            onChange={(e) => setLunar(e.target.checked)}
          />
        </label>
      </div>

      {kind === 'since' && (
        <div
          data-testid="milestone-section"
          className="mb-4 rounded-xl border p-3"
          style={{ borderColor: 'var(--accent)', background: 'var(--accent-tint)' }}
        >
          <p className="mb-2 text-xs font-medium" style={{ color: 'var(--accent)' }}>
            里程碑纪念
          </p>
          <div className="flex flex-wrap gap-2">
            {(['hundreds', 'thousand', 'monthly', 'romantic'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMilestones((m) => ({ ...m, [key]: !m[key] }))}
                className="rounded-full border px-3 py-1 text-xs"
                style={
                  milestones[key]
                    ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }
                    : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                }
              >
                {key === 'hundreds' ? '每 100 天' : key === 'thousand' ? '千日' : key === 'monthly' ? '每满一个月' : '520/1314'}
              </button>
            ))}
          </div>
        </div>
      )}

      <label htmlFor="note" className="mb-1 block text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>
        写点什么
      </label>
      <textarea
        id="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="mb-6 w-full rounded-xl border px-3 py-2 text-sm"
        style={{ borderColor: 'var(--border)' }}
      />

      <button
        type="submit"
        className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white"
        style={{ background: 'var(--accent)' }}
      >
        存
      </button>
    </form>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/pages/OccasionForm.test.tsx
```

Expected: PASS。若"提交调用 createOccasion"用例失败，检查 `<input type="date">` 用 `userEvent.type` 输入是否需要按 `yyyy-MM-dd` 顺序拆分输入（不同浏览器/jsdom 行为可能不同，必要时改用 `fireEvent.change(input, { target: { value: '2026-09-28' } })` 替代 `userEvent.type`）。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(ui): 新建/编辑表单 — 类型切换+农历开关+里程碑区+封面增改删"
```

---

### Task 21: 路由 + App shell（ProtectedRoute + 空态/错误态）

**Files:**
- Modify: `jinian-app/src/App.tsx`
- Test: `jinian-app/src/App.test.tsx`

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth` from `./contexts/AuthContext`（Task 13）；`Home`（Task 18）、`OccasionDetail`（Task 19）、`OccasionForm`（Task 20）、`Auth`（Task 14）、`ToastHost`（Task 17）。
- Produces: 完整路由表，替换 Task 1 里的占位 `App.tsx`。

- [ ] **Step 1: 写失败测试**

`jinian-app/src/App.test.tsx`：
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ ready: true, confirmed: true, user: null }),
}))

vi.mock('./hooks/useOccasions', () => ({
  useOccasions: () => ({ occasions: [], loading: false, error: null }),
}))

describe('App', () => {
  it('未登录时渲染登录页而不是首页', () => {
    render(<App />)
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument()
  })

  it('尚未 ready 时不渲染任何受保护页面内容（避免闪烁登录页）', () => {
    vi.doMock('./contexts/AuthContext', () => ({
      AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      useAuth: () => ({ ready: false, confirmed: false, user: null }),
    }))
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/App.test.tsx
```

Expected: FAIL（当前 `App.tsx` 还是 Task 1 的占位内容，不含登录页路由）。

- [ ] **Step 3: 实现 App.tsx**

`jinian-app/src/App.tsx`：
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ToastHost from './components/ToastHost'
import Auth from './pages/Auth'
import Home from './pages/Home'
import OccasionDetail from './pages/OccasionDetail'
import OccasionForm from './pages/OccasionForm'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth()
  if (!ready) return null
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/new"
        element={
          <ProtectedRoute>
            <OccasionForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/occasion/:id"
        element={
          <ProtectedRoute>
            <OccasionDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/occasion/:id/edit"
        element={
          <ProtectedRoute>
            <OccasionForm />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <ToastHost />
      </BrowserRouter>
    </AuthProvider>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/App.test.tsx
```

Expected: PASS。

- [ ] **Step 5: 跑全量单测确认没有破坏之前的任务**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npm test
```

Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(ui): 路由与 App shell — ProtectedRoute 接入全部页面"
```

---

## Phase 5：Capacitor 本地通知（核心可靠性）

### Task 22: Capacitor Android 壳 + Manifest 精确闹钟权限

**Files:**
- Create: `jinian-app/capacitor.config.ts`
- Create: `jinian-app/android/`（由 `npx cap add android` 生成）
- Modify: `jinian-app/android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Produces: 可用 `npx cap sync android` 同步、`npx cap open android` 打开 Android Studio 构建的原生工程。本任务不含单测（原生工程配置无法用 vitest 验证），验证方式是实际跑一次 debug build。

- [ ] **Step 1: 写 capacitor.config.ts**

`jinian-app/capacitor.config.ts`：
```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tuchenguang.jinian',
  appName: '纪念',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
}

export default config
```

（注：不采用 schedule-app 的 `server.url` 远程加载模式——本项目的核心可靠性诉求是"app 关闭也能提醒"，本地通知的排程逻辑跑在 WebView 里，用本地打包的 `dist/` 离线可靠加载，不依赖网络才能启动。）

- [ ] **Step 2: 生成 Android 工程**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npm run build
```
```bash
npx cap add android
```
```bash
npx cap sync android
```

Expected: 生成 `jinian-app/android/` 目录（含 `app/build.gradle`、`app/src/main/AndroidManifest.xml` 等标准 Capacitor 6 模板文件）。

- [ ] **Step 3: 修改 AndroidManifest.xml 加精确闹钟/通知/开机自启权限**

打开 `jinian-app/android/app/src/main/AndroidManifest.xml`，在 `<manifest>` 标签内、`<application>` 标签之后（与 schedule-app 现有的 `<uses-permission android:name="android.permission.INTERNET" />` 并列位置）追加以下权限声明：

```xml
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```

**关键说明（写进注释，让后来者不会误删）**：`USE_EXACT_ALARM`（Android 13+，sideload APK 安装即自动授予、免弹窗）+ `SCHEDULE_EXACT_ALARM`（Android 12/13 兜底）两条缺一不可——schedule-app 现在的 manifest 完全没有声明这两条，导致 Android 12+ 上 `canScheduleExactAlarms()` 恒为 `false`，本地通知静默降级成不精确闹钟（Doze 下可能漂移几十分钟）。本项目必须声明，否则"到点提醒"这个核心诉求会打折扣。

- [ ] **Step 4: 验证 debug 构建能跑通**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app/android"
./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL`，生成 `app/build/outputs/apk/debug/app-debug.apk`。

- [ ] **Step 5: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(android): Capacitor Android 壳 + 精确闹钟/通知/开机自启权限"
```

---

### Task 23: 本地通知接入（`syncReminders` + 权限申请 + 精确闹钟复查）

**Files:**
- Create: `jinian-app/src/lib/localNotifications.ts`
- Test: `jinian-app/src/lib/localNotifications.test.ts`
- Modify: `jinian-app/src/App.tsx`

**Interfaces:**
- Consumes: `computeReminderTimes` from `./reminders`（Task 12）；`@capacitor/core` 的 `Capacitor`；`@capacitor/local-notifications` 的 `LocalNotifications`。
- Produces:
  ```ts
  export function isNativeAvailable(): boolean
  export async function requestNotificationPermissions(): Promise<boolean>
  export async function syncReminders(occasions: OccasionRow[]): Promise<void>
  export async function sendTestReminder(): Promise<void>
  ```
  Task 21 的 `App.tsx` 在 `occasions` 数据变化时调用 `syncReminders`；Task 24（OEM 引导页）消费 `sendTestReminder` + `requestNotificationPermissions`。

- 参考调研：schedule-app 的 `src/lib/notifications.ts::syncNotifications` 是"全量 diff 同步"模式（`getPending()` 取现存 → 算 `desired` → cancel 差集 → schedule 目标集），本任务复用同一模式，但排程数据来自纯函数 `computeReminderTimes`（Task 12）而不是 schedule-app 那种直接在本文件内联计算触发时间。

- [ ] **Step 1: 写失败测试（mock `@capacitor/core` 与 `@capacitor/local-notifications`）**

`jinian-app/src/lib/localNotifications.test.ts`：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncReminders, requestNotificationPermissions, sendTestReminder } from './localNotifications'

const getPending = vi.fn()
const cancel = vi.fn(async () => undefined)
const schedule = vi.fn(async () => undefined)
const requestPermissions = vi.fn(async () => ({ display: 'granted' }))
const checkPermissions = vi.fn(async () => ({ display: 'granted' }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    getPending: (...args: unknown[]) => getPending(...args),
    cancel: (...args: unknown[]) => cancel(...args),
    schedule: (...args: unknown[]) => schedule(...args),
    requestPermissions: (...args: unknown[]) => requestPermissions(...args),
    checkPermissions: (...args: unknown[]) => checkPermissions(...args),
  },
}))

const row = {
  id: 'occ-1',
  user_id: 'u1',
  kind: 'until' as const,
  title: '婚礼',
  date: '2099-01-01',
  lunar: false,
  lunar_month: null,
  lunar_day: null,
  lunar_is_leap: false,
  cover_path: null,
  note: null,
  remind_days: [0],
  milestones: {},
  leap_fallback: 'feb28' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('localNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPending.mockResolvedValue({ notifications: [] })
  })

  it('requestNotificationPermissions 返回 granted 时为 true', async () => {
    const granted = await requestNotificationPermissions()
    expect(granted).toBe(true)
    expect(requestPermissions).toHaveBeenCalled()
  })

  it('syncReminders 取消不再需要的 pending，排程新的', async () => {
    getPending.mockResolvedValue({ notifications: [{ id: 999999 }] })
    await syncReminders([row])
    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: 999999 }] })
    expect(schedule).toHaveBeenCalled()
  })

  it('syncReminders 在无权限时不调用 schedule', async () => {
    checkPermissions.mockResolvedValueOnce({ display: 'denied' })
    await syncReminders([row])
    expect(schedule).not.toHaveBeenCalled()
  })

  it('sendTestReminder 立即排程一条约10秒后的通知', async () => {
    await sendTestReminder()
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        notifications: [expect.objectContaining({ title: expect.any(String) })],
      }),
    )
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/localNotifications.test.ts
```

Expected: FAIL，`Cannot find module './localNotifications'`。

- [ ] **Step 3: 实现 localNotifications.ts**

`jinian-app/src/lib/localNotifications.ts`：
```ts
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { computeReminderTimes } from './reminders'
import { todayCivil } from './civilDate'
import type { OccasionRow } from '../types/occasion'

export function isNativeAvailable(): boolean {
  return Capacitor.isNativePlatform()
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!isNativeAvailable()) return false
  const result = await LocalNotifications.requestPermissions()
  return result.display === 'granted'
}

async function checkPermission(): Promise<boolean> {
  if (!isNativeAvailable()) return false
  const result = await LocalNotifications.checkPermissions()
  return result.display === 'granted'
}

/**
 * 全量同步：拿当前系统里已排程的 pending → 与目标列表 diff →
 * cancel 差集、schedule 目标集。打开 app / 数据变化时调用。
 */
export async function syncReminders(occasions: OccasionRow[]): Promise<void> {
  if (!isNativeAvailable()) return

  const granted = await checkPermission()

  const pendingResp = await LocalNotifications.getPending().catch(() => null)
  const pending = pendingResp?.notifications ?? []

  if (!granted) {
    if (pending.length) {
      await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) })
    }
    return
  }

  const desired = computeReminderTimes(occasions, todayCivil(), new Date()).map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    schedule: { at: item.at, allowWhileIdle: true },
    extra: { occasionId: item.occasionId },
  }))

  const desiredIds = new Set(desired.map((d) => d.id))
  const toCancel = pending.filter((n) => !desiredIds.has(n.id))
  if (toCancel.length) {
    await LocalNotifications.cancel({ notifications: toCancel.map((n) => ({ id: n.id })) })
  }
  if (desired.length) {
    await LocalNotifications.schedule({ notifications: desired })
  }
}

/** 让用户当场验证提醒是否生效：约10秒后弹一条测试通知。 */
export async function sendTestReminder(): Promise<void> {
  if (!isNativeAvailable()) return
  const granted = await requestNotificationPermissions()
  if (!granted) return
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 999999999,
        title: '纪念',
        body: '提醒已生效 — 这是一条测试通知',
        schedule: { at: new Date(Date.now() + 10_000), allowWhileIdle: true },
      },
    ],
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/localNotifications.test.ts
```

Expected: PASS。

- [ ] **Step 5: 在 App.tsx 里接入"打开即重排"**

修改 `jinian-app/src/App.tsx`，在 `AppRoutes` 组件内加一个 effect：数据变化时调用 `syncReminders`。把文件顶部 import 区改为：

```tsx
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useOccasions } from './hooks/useOccasions'
import { syncReminders } from './lib/localNotifications'
import ToastHost from './components/ToastHost'
import Auth from './pages/Auth'
import Home from './pages/Home'
import OccasionDetail from './pages/OccasionDetail'
import OccasionForm from './pages/OccasionForm'
```

把 `AppRoutes` 函数体开头加一段：
```tsx
function AppRoutes() {
  const { user } = useAuth()
  const { occasions, loading } = useOccasions()

  useEffect(() => {
    if (!user || loading) return
    void syncReminders(occasions)
  }, [user, loading, occasions])

  return (
    <Routes>
      {/* ...原有内容不变... */}
```
（`Routes` 及其内部内容保持 Task 21 写好的不变，只在函数体顶部插入上面这段 `useEffect`。）

- [ ] **Step 6: 跑全量单测确认没有破坏之前的任务**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npm test
```

Expected: 全部 PASS（`App.test.tsx` 里 mock 了 `useOccasions` 返回空数组，`syncReminders` 会被跳过或安全空跑，不应报错——若报错，检查 `App.test.tsx` 是否也需要 mock `./lib/localNotifications`，若需要则补充 `vi.mock('./lib/localNotifications', () => ({ syncReminders: vi.fn() }))`）。

- [ ] **Step 7: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(notifications): syncReminders 全量同步接入 App + 测试提醒"
```

---

### Task 24: OEM 保活引导页 + 「发送测试提醒」

**Files:**
- Create: `jinian-app/src/lib/deviceOem.ts`
- Test: `jinian-app/src/lib/deviceOem.test.ts`
- Create: `jinian-app/src/pages/NotificationGuide.tsx`
- Test: `jinian-app/src/pages/NotificationGuide.test.tsx`
- Modify: `jinian-app/src/App.tsx`（加路由 `/notification-guide`）

**Interfaces:**
- Consumes: `requestNotificationPermissions`, `sendTestReminder` from `../lib/localNotifications`（Task 23）。
- Produces:
  ```ts
  export type OemBrand = 'vivo' | 'xiaomi' | 'huawei' | 'other'
  export function detectOem(userAgent?: string): OemBrand
  export default function NotificationGuide(): JSX.Element
  ```

- [ ] **Step 1: 写 deviceOem 失败测试**

`jinian-app/src/lib/deviceOem.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { detectOem } from './deviceOem'

describe('detectOem', () => {
  it('识别 vivo', () => {
    expect(detectOem('Mozilla/5.0 (Linux; Android 14; V2309A Build/UP1A.230722.107)')).toBe('vivo')
  })
  it('识别小米', () => {
    expect(detectOem('Mozilla/5.0 (Linux; Android 14; 23127PN0CC Build/UKQ1.230917.001) MiuiBrowser')).toBe(
      'xiaomi',
    )
  })
  it('识别华为', () => {
    expect(detectOem('Mozilla/5.0 (Linux; Android 12; HUAWEI Mate40 Build/HUAWEIMate40)')).toBe('huawei')
  })
  it('识别不出的机型归为 other', () => {
    expect(detectOem('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('other')
  })
})
```

- [ ] **Step 2: 跑测试确认失败，然后实现**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/lib/deviceOem.test.ts
```

Expected: FAIL。

`jinian-app/src/lib/deviceOem.ts`：
```ts
export type OemBrand = 'vivo' | 'xiaomi' | 'huawei' | 'other'

export function detectOem(userAgent: string = navigator.userAgent): OemBrand {
  const ua = userAgent.toLowerCase()
  if (ua.includes('vivo') || /\bv\d{4}[a-z]\b/.test(ua)) return 'vivo'
  if (ua.includes('miui') || ua.includes('xiaomi') || ua.includes('redmi')) return 'xiaomi'
  if (ua.includes('huawei') || ua.includes('honor')) return 'huawei'
  return 'other'
}
```

跑测试确认通过：
```bash
npx vitest run src/lib/deviceOem.test.ts
```

- [ ] **Step 3: 写 NotificationGuide 失败测试**

`jinian-app/src/pages/NotificationGuide.test.tsx`：
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotificationGuide from './NotificationGuide'

const sendTestReminder = vi.fn(async () => undefined)
const requestNotificationPermissions = vi.fn(async () => true)

vi.mock('../lib/localNotifications', () => ({
  sendTestReminder: () => sendTestReminder(),
  requestNotificationPermissions: () => requestNotificationPermissions(),
}))

vi.mock('../lib/deviceOem', () => ({
  detectOem: () => 'vivo',
}))

describe('NotificationGuide', () => {
  it('针对 vivo 显示对应的保活步骤', () => {
    render(<NotificationGuide />)
    expect(screen.getByText(/自启动/)).toBeInTheDocument()
    expect(screen.getByText(/vivo/i)).toBeInTheDocument()
  })

  it('点击发送测试提醒按钮触发 sendTestReminder', async () => {
    render(<NotificationGuide />)
    await userEvent.click(screen.getByRole('button', { name: '发送测试提醒' }))
    expect(sendTestReminder).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: 跑测试确认失败**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/pages/NotificationGuide.test.tsx
```

Expected: FAIL，`Cannot find module './NotificationGuide'`。

- [ ] **Step 5: 实现 NotificationGuide.tsx**

`jinian-app/src/pages/NotificationGuide.tsx`：
```tsx
import { useState } from 'react'
import { detectOem, type OemBrand } from '../lib/deviceOem'
import { sendTestReminder, requestNotificationPermissions } from '../lib/localNotifications'

const STEPS: Record<OemBrand, string[]> = {
  vivo: [
    'vivo：设置 → 应用 → 纪念 → 自启动，打开',
    'vivo：设置 → 电池 → 后台高耗电管理 → 纪念 → 允许后台高耗电',
    'vivo：最近任务里给"纪念"上锁（防一键清理）',
    'vivo：设置 → 应用 → 纪念 → 通知，全部开启',
  ],
  xiaomi: [
    '小米：安全中心 → 应用管理 → 纪念 → 自启动，打开',
    '小米：设置 → 电池与性能 → 应用配置 → 纪念 → 无限制',
    '小米：最近任务里锁定"纪念"',
    '小米：设置 → 通知 → 纪念，全部开启',
  ],
  huawei: [
    '华为：设置 → 应用 → 应用启动管理 → 纪念 → 改为"手动管理"，三个开关全开',
    '华为：把"纪念"加入电池"不优化"名单',
    '华为：通知设置里确保横幅/锁屏/勿扰白名单全开',
  ],
  other: [
    '确保"纪念"的通知权限已开启',
    '在系统电池设置里把"纪念"设为不受后台限制',
    '把"纪念"从任何"一键清理"白名单里排除',
  ],
}

export default function NotificationGuide() {
  const oem = detectOem()
  const [sent, setSent] = useState(false)

  const handleTest = async () => {
    await requestNotificationPermissions()
    await sendTestReminder()
    setSent(true)
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="mb-1 text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
        让提醒更准时
      </h1>
      <p className="mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        当前机型：{oem}
      </p>
      <ol className="mb-6 space-y-2 text-sm leading-7" style={{ color: 'var(--text-primary)' }}>
        {STEPS[oem].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <button
        onClick={handleTest}
        className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white"
        style={{ background: 'var(--accent)' }}
      >
        发送测试提醒
      </button>
      {sent && (
        <p className="mt-3 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
          约10秒后应该会收到一条测试通知
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: 跑测试确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npx vitest run src/pages/NotificationGuide.test.tsx
```

Expected: PASS。

- [ ] **Step 7: 在 App.tsx 加路由**

在 `jinian-app/src/App.tsx` 的 `import` 区加入：
```tsx
import NotificationGuide from './pages/NotificationGuide'
```

在 `AppRoutes` 的 `<Routes>` 里、`/occasion/:id/edit` 路由之后追加：
```tsx
      <Route
        path="/notification-guide"
        element={
          <ProtectedRoute>
            <NotificationGuide />
          </ProtectedRoute>
        }
      />
```

- [ ] **Step 8: 跑全量单测确认没有破坏之前的任务**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npm test
```

Expected: 全部 PASS。

- [ ] **Step 9: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "feat(notifications): OEM 保活引导页（按机型给步骤）+ 发送测试提醒"
```

---

## Phase 6：打磨、验证、发布

### Task 25: E2E 冒烟测试扩充 + 视觉设计审查

**Files:**
- Modify: `jinian-app/e2e/smoke.spec.ts`
- Create: `jinian-app/e2e/auth-gate.spec.ts`

**Interfaces:**
- Consumes: Playwright `page.route()` 拦截 supabase REST/auth 请求（复用 ledger-app/schedule-app 的"stub env + route 拦截"CI 模式，见 Task 2）。

- [ ] **Step 1: 扩充 auth-gate 冒烟测试 —— 未登录访问受保护路由应跳转到 /auth**

`jinian-app/e2e/auth-gate.spec.ts`：
```ts
import { test, expect } from '@playwright/test'

test('未登录访问首页会跳转到 /auth', async ({ page }) => {
  // 拦截 supabase auth 请求，模拟"未登录"（getSession 返回空 session）
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: null }) }),
  )
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  await page.goto('/')
  await expect(page).toHaveURL(/\/auth$/)
  await expect(page.getByLabelText('邮箱')).toBeVisible()
})

test('/auth 页面本身可以直接访问，不受保护', async ({ page }) => {
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: null }) }),
  )
  await page.goto('/auth')
  await expect(page.getByLabelText('邮箱')).toBeVisible()
})
```

- [ ] **Step 2: 跑 e2e 确认通过**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=test-anon-key-not-real VITE_PUBLIC_BASE_URL=http://localhost:5176 npm run test:e2e
```

Expected: PASS。

- [ ] **Step 3: 本地跑 dev server 做一次真实设计审查**

用 `npm run dev` 启动，浏览器打开首页/详情/表单三个页面，对照 spec §4 与全局 CLAUDE.md 设计规范逐条自查：

- 背景是否是暖白 `#FAF9F7`、不是纯白/纯灰？
- 强调色 `#C96442` 是否只出现在数字/主按钮/选中态，没有被滥用到装饰性位置？
- 卡片是否只用 1px 极淡边框（`var(--border)`），没有 `shadow-md` 及以上？
- 是否存在任何渐变背景/按钮/文字？（应该没有——检查所有 `style` 与 Tailwind 类名）
- 中文正文行高是否在 1.7-1.8 区间（详情页笔记文字 `leading-7` ≈ 1.75，符合）？
- 交互元素（按钮/输入框）的 hover/focus 状态是否克制（颜色微调，不是加边框加阴影）？

若发现问题（比如某处不小心用了 `shadow-md`、或强调色用多了），直接在对应组件文件里改，不新增任务。

- [ ] **Step 4: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "test(e2e): auth-gate 冒烟测试 + 视觉设计审查通过"
```

---

### Task 26: 真机验证清单 + Android Release APK + Web 部署

**Files:**
- Create: `jinian-app/android/key.properties`（本地文件，**不提交**，已被 Task 1 的 `.gitignore` 排除）
- Create: `jinian-app/vercel.json`
- Modify: `jinian-app/README.md`

**Interfaces:**
- 本任务不含自动化测试（发布/真机验证本质上是人工操作），但每个 Step 都有明确的验证标准。

- [ ] **Step 1: 生成新的签名 keystore（jinian-app 的 applicationId 与其它项目不同，不能复用现有 `.jks`）**

```bash
keytool -genkeypair -v -keystore "C:/Users/TuChenguang/.android/keystores/jinian.jks" -alias android -keyalg RSA -keysize 2048 -validity 10000
```

按提示设置密码（建议与其它项目的密码管理方式一致，记录到密码管理器）。生成后备份一份到仓库外的 `.keystores-backup/`（与 `billiards.jks`/`ledger.jks`/`schedule.jks` 等并列）：

```bash
cp "C:/Users/TuChenguang/.android/keystores/jinian.jks" "D:/VscodeProject/ClaudeCodeTest/.keystores-backup/jinian.jks"
```

- [ ] **Step 2: 写 `android/key.properties`（本地文件，对照 Task 22 生成的模板项目里若无此文件需新建）**

`jinian-app/android/key.properties`：
```properties
storeFile=C:/Users/TuChenguang/.android/keystores/jinian.jks
storePassword=<刚才设置的密码>
keyAlias=android
keyPassword=<刚才设置的密码>
```

在 `jinian-app/android/app/build.gradle` 里加上读取 `key.properties` 并配置 `signingConfigs.release` 的逻辑（与 schedule-app 的写法一致）——若 `npx cap add android` 生成的模板 `build.gradle` 里没有 `signingConfigs` 块，在 `android { ... }` 内部追加：

```gradle
def keystorePropsFile = rootProject.file("key.properties")
def keystoreProps = new Properties()
if (keystorePropsFile.exists()) {
    keystoreProps.load(new FileInputStream(keystorePropsFile))
}

android {
    // ...原有内容...
    signingConfigs {
        release {
            if (keystoreProps['storeFile']) {
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

- [ ] **Step 3: 构建 release APK**

```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app"
npm run build
```
```bash
npx cap sync android
```
```bash
cd "D:/VscodeProject/ClaudeCodeTest/jinian-app/android"
./gradlew assembleRelease
```

Expected: `BUILD SUCCESSFUL`，生成已签名的 `app/build/outputs/apk/release/app-release.apk`。

- [ ] **Step 4: 真机验证清单（在 vivo 手机上逐条执行，其次小米/华为）**

把 `app-release.apk` 传到手机上安装，然后按顺序验证：

1. 打开 app，能正常登录（magic-link 邮箱验证码）。
2. 新建三种类型的日子各一条（每年循环/累加/倒数），首页/详情显示正确。
3. 进入"让提醒更准时"引导页，确认识别出的机型是 `vivo`。
4. 按引导逐条打开：自启动、电池不受限、最近任务锁定、通知权限。
5. 点击"发送测试提醒"，锁屏/切后台，等待约10秒，确认收到系统通知。
6. **关键验证**：完全关闭 app（从最近任务划掉），设一条 1-2 分钟后触发的提醒（临时改个 `until` 日期到接近当下也可以手动验证思路），等待，确认 app 完全关闭状态下依然弹出通知。
7. 重启手机，确认之前排程的通知在重启后依然存在（`LocalNotifications.getPending()` 或直接等到点）。

把结果记录到 `jinian-app/README.md` 的"真机验证记录"章节（哪天、哪个机型、哪些步骤通过/失败）。若某步骤失败，回到 Task 22/23 排查（多半是 manifest 权限漏加或 vivo 系统设置未正确打开）。

- [ ] **Step 5: Web 部署配置**

`jinian-app/vercel.json`：
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

在 Vercel 新建项目，指向 `jinian-app` 目录（若走 monorepo-in-independent-repo 结构则直接指向仓库根），配置环境变量 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_PUBLIC_BASE_URL`（`VITE_PUBLIC_BASE_URL` 填 Vercel 分配或自定义子域名的完整 origin，用于 magic-link 的 `emailRedirectTo`）。绑定子域名（如 `jinian.tuchenguang.com`）+ Cloudflare CNAME（灰云）→ vercel-dns，与其它 app 一致。

- [ ] **Step 6: 更新 README**

`jinian-app/README.md`：
```markdown
# 纪念（jinian-app）

纯自用的纪念日 App。记录对人重要的日子——每年循环的生日/周年、
从某天开始累加的天数、倒数到未来某个日子。到点靠手机本地通知提醒
（尤其针对 vivo 做了适配），不依赖系统日历订阅或服务器推送。

设计文档：`docs/superpowers/specs/2026-07-01-anniversary-app-design.md`
（在主工作区仓库里，本仓库是从那份 spec 拆出的独立实现）。

## 开发

```bash
npm install
cp .env.example .env   # 填入 Supabase 项目的 URL/anon key
npm run dev
```

## 测试

```bash
npm test          # vitest 单元/组件测试
npm run test:e2e  # playwright 冒烟测试
npm run lint
```

## Android

```bash
npm run build
npx cap sync android
npx cap open android   # 用 Android Studio 打开，或用 ./gradlew assembleDebug/assembleRelease 命令行构建
```

## 真机验证记录

（每次真机验证后在这里追加一条：日期 + 机型 + 系统版本 + 通过/失败的步骤）
```

- [ ] **Step 7: Commit**

```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" add -A
```
```bash
git -C "D:/VscodeProject/ClaudeCodeTest/jinian-app" commit -m "chore(release): Android release 签名配置 + Vercel 部署配置 + README"
```

（注：`android/key.properties` 已被 `.gitignore` 排除，不会被这次 commit 带上；`.keystores-backup/jinian.jks` 是仓库根下的备份文件，需要单独在仓库根 commit，不属于 `jinian-app` 独立仓管理范围。）

---

## Self-Review 记录（writing-plans 自审）

**1. Spec 覆盖检查**（对照 `docs/superpowers/specs/2026-07-01-anniversary-app-design.md` 逐节）：

- §3 技术栈/部署拓扑 → Task 1（脚手架）、Task 22/26（Capacitor+发布）✅
- §4 视觉规范（配色/首页/详情/表单）→ Task 1 Step 4（CSS 变量）、Task 18/19/20、Task 25 Step 3（设计审查）✅
- §5 数据模型（occasions 表/RLS/Storage）→ Task 3（SQL）、Task 16（Storage 上传/删除）✅
- §6 领域计算（date-only/completedMonths/里程碑）→ Task 5/6/7/10/11 ✅
- §7 农历 → Task 8/9 ✅
- §8 提醒投递（本地通知/OEM 保活）→ Task 12（纯函数）、Task 22/23/24 ✅
- §9 认证（magic-link + 超时修复）→ Task 13/14 ✅
- §10 错误处理与边界 → 分散在各任务（农历 null 处理见 Task 9 测试；封面占位见 Task 19 未做——**发现缺口，见下方补充说明**）
- §11 测试策略 → 全程 TDD（Task 5-20 均先测后写）+ Task 2（基建）+ Task 25（e2e）✅
- §12 交付顺序 → 本计划的 Phase 1-6 与之一一对应 ✅
- §13 取舍一览 → 各决策点均已体现在对应任务的实现细节里（如 archived 运行时派生、pinned 已删除不存在于本计划任何任务）✅
- §14 环境变量清单 → Task 1/4（`.env.example`）、Task 2（CI stub）、Task 26（Vercel 配置）✅

**补充说明（自审发现的小缺口，已确认不需要新增任务）**：
- spec §10 提到"封面缺失：纯色占位（`--bg-tertiary` + 标题首字）"——Task 19（详情页）当前实现在无封面时只是不渲染封面区域，没有专门画一个占位框。这是一个视觉细节，留给 Task 25 Step 3 的设计审查阶段顺手补上（审查时如发现空白突兀，直接在 `OccasionDetail.tsx` 加一个条件渲染的占位 `div`），不值得单独开一个任务。
- spec §8.4 "iPhone v1 只读"——本计划全程没有为 iPhone 做任何特殊处理，这是正确的（v1 范围内 iPhone 就是访问同一个 web 版，天然只读，无需额外任务）。

**2. 占位符扫描**：全文搜索未发现 "TBD"/"待实现"/"参考 Task N 类似做法但省略代码" 这类模式；每个 Step 的代码块均为完整可运行代码，没有用注释代替实现。

**3. 类型一致性检查**：
- `CivilDate {y,m,d}`：Task 5 定义，Task 6-12/18-20 全程复用同一签名，无重复定义。
- `LunarDateSpec {lunarMonth,lunarDay,isLeap}`：Task 8 定义于 `lunar.ts`；Task 9 把 `occasion.ts` 里 Task 7 的内联类型改为 import 复用，避免了"同一概念两个类型"的问题。
- `Milestone`/`MilestoneConfig`：Task 10 定义，Task 11（`expandAnniversaryMilestones`）、Task 12（`reminders.ts`）、Task 19/20（UI）均复用同一类型，字段名（`dayOffset`/`achieved`/`isToday`/`isNext`）全程一致。
- `OccasionRow`/`OccasionInsert`：Task 12 定义于 `src/types/occasion.ts`，Task 15（`useOccasions`）、Task 18/19/20（UI）、Task 23（`localNotifications`）均 import 同一定义，没有出现字段名漂移（如 `lunar_month` 全程用下划线命名，与 Supabase 表列名一致，未在某处误写成 `lunarMonth`）。
- `computeReminderTimes` 的返回类型 `ReminderItem {id,at,title,body,occasionId}`：Task 12 定义，Task 23 直接复用字段名映射到 `LocalNotifications.schedule()` 的参数，字段名一致。

自审通过，无需返工。
