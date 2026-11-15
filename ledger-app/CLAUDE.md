# 口袋记账（ledger-app）

> 最后校准：2026-05-30，以代码为准重写；2026-11-12 补「界面与安全区」一节。

## 项目概述
React + Supabase 的多币种在线记账 PWA。前身：仓库根目录 `finance-app.html` 离线原型（已不维护，保留参考）。

## 技术栈
| 层 | 技术 |
|----|------|
| 框架 | React 18 + TypeScript 5 |
| 构建 | Vite 5 + `@vitejs/plugin-react` |
| 样式 | Tailwind CSS 3 |
| 路由 | react-router-dom 6 |
| 后端 | Supabase（Auth + PostgreSQL，全表 RLS） |
| 图表 | chart.js 4 + react-chartjs-2 5（**未装 recharts**） |
| PWA | vite-plugin-pwa（Workbox autoUpdate） |
| 移动打包 | Capacitor 6（Android） |
| 通知 | @capacitor/local-notifications 6 |

## 数据库（4 张表 + 自动记账的 2 张）

以 `src/lib/database.types.ts` 为权威。

| 表 | 关键字段 | 备注 |
|----|---------|------|
| `users_profile` | id, preferred_currency, default_currency, created_at, updated_at | 1:1 auth.users |
| `categories` | id, user_id, name, type, icon, created_at | 用户级分类，**无 updated_at** |
| `transactions` | id, user_id, type, amount, currency, **category_id** UUID, description, date, **exchange_rate**, **direction**, created_at, updated_at | 流水 |
| `budgets` | id, user_id, **category_id** (NULL=总预算), amount, currency, **period**, created_at | **无 updated_at** |

全部启用 RLS：仅操作自己的行。

### `transactions.direction`（2026-05-30 加）
- 仅 `type='transfer'` 时使用：`'in'`=转入(+)，`'out'`=转出(-)；`NULL` 视为 `'in'`（兼容 002 迁移前的老数据，UI 全按 `+` 渲染）。
- 列上的 CHECK：`direction IS NULL OR direction IN ('in', 'out')`。
- `useTransactions.insert`：**只有 type='transfer'** 才在 payload 里附 `direction`；其它类型不带这字段，避免 PostgREST 在未跑 002 的 DB 上报 column-not-found。
- AddTransaction：type tabs 选"转账"后下方多一行 `[+ 转入] [- 转出]` toggle，默认转入。

### 触发器与分类兜底
- **`handle_new_user`**：新用户注册 → 仅创建 `users_profile` 行，**不创建任何分类**。
- 分类首次使用前由前端 `buildFallback()`（`src/pages/AddTransaction.tsx`）兜底显示默认列表，**id 是 `'0'/'1'/'2'`... 字符串占位**（不是 UUID，直插会被 PG 拒 22P02）。
- **首次记账 seed**（`useCategories.seedDefaults`）：`AddTransaction.handleSave` 检测到选中 id 不在真实 `allCats` 里，先调 `seedDefaults()`：用 `crypto.randomUUID()` 给 `EXPENSE_CATEGORIES + INCOME_CATEGORIES + TRANSFER_CATEGORIES` 各项建 row，写本地 state + cache，同时入 outbox FIFO；然后按 `(name, type)` 在新列表里找到真实 UUID 替换 `category_id`，再走 insertTx。FIFO 保证离线时也能跑——恢复网络后 categories 先推、transaction 后推，FK 不会冲突。已存在的同 `(name, type)` 跳过，幂等。
- 老 DB 行重命名走 `src/lib/categoryMigrations.ts`：App 启动时 `migratePetToFruit(user.id)` 把名为"宠物"的分类改成"水果"（含图标），先改 localStorage 快照（避免闪一帧旧名），再 supabase UPDATE（跨设备生效）。完全幂等。
- `set_updated_at`：仅 `users_profile` / `transactions` 上挂触发器（`categories` / `budgets` 无 updated_at 列）。

### budgets.period
- 类型：DB 层 `CHECK (period IN ('monthly','yearly'))` 强制；TS 侧 `database.types.ts` 里 period 为 `string`（无字面量联合，`src/types/index.ts` 也不定义 period）。
- 当前代码只用 `'monthly'`（`src/pages/Budget.tsx:44`），`'yearly'` 为预留。
- 唯一性：`(user_id, period, category_id)`，`category_id IS NULL` 表示总预算。
- NULL 默认不参与 unique 约束，需手动建索引：
  ```sql
  CREATE UNIQUE INDEX budgets_user_period_category_unique
  ON budgets(user_id, period, category_id) NULLS NOT DISTINCT;
  ```
- upsert onConflict：`'user_id,period,category_id'`（`src/hooks/useBudgets.ts:91`）。

## Migration

- `supabase/migrations/001_initial_schema.sql`：**当前生产 schema 的快照式 migration**（一次性建表）。已含 `transactions.direction` 列 + `type IN ('expense','income','transfer')` 的两个 CHECK。新环境直接执行可得到与生产一致的结构。
- `supabase/migrations/002_transfer_direction_and_check_repair.sql`：**生产 schema 漂移修复**（2026-05-30）。生产 DB 早期部署的 `transactions_type_check` / `categories_type_check` 实际只允许 `('expense', 'income')`，没把后期加进代码的 `'transfer'` 同步到 DB，所以记一笔转账一直撞 23514 `check_violation`。002 干两件事：
  1. DROP + ADD 两个 type CHECK 重建为含 `'transfer'`
  2. ALTER TABLE transactions ADD COLUMN direction（接上面的方向特性）
- **新环境跑 001 即可**；老环境（生产）需要**额外**在 Supabase Dashboard SQL Editor 跑一次 002。客户端代码已经向后兼容："非转账 insert 不带 direction 字段"，所以未跑 002 的环境支出/收入也能正常工作，只是转账被 23514 拒。

## 多币种与汇率（13 种货币）
- 集中在 `src/types/index.ts`：
  - `Currency` 联合类型
  - `SUPPORTED_CURRENCIES` 数组
  - `CURRENCY_SYMBOLS`、`CURRENCY_LABELS`
- 现有：CNY · MYR · SGD · USD · HKD · JPY · EUR · GBP · THB · KHR · NTD · AUD · MOP
- 历史遗留：早期版本写入的 `currency = 'TWD'` 在读路径会被归一为 `'NTD'`（`normalizeCurrencyCode` in `src/types/index.ts`；`useTransactions` / `useBudgets` / `CurrencyContext` 三处入口都覆盖；FX API 响应里的 `rates.TWD` 也在 `CurrencyContext.normalizeRates` 复制到 `rates.NTD`）。新写入一律 `'NTD'`，老 DB 行会在 user 下次修改时被替换。
- 添加新币种只改这一个文件 4 处。
- 实时汇率：`https://api.exchangerate-api.com/v4/latest/CNY`，localStorage 缓存 1 小时（key: `ledger_fx_rates`）。
- **存储时快照**：`AddTransaction.tsx` 把 currency→baseCurrency 的瞬时比率写入 `transactions.exchange_rate`。
- **展示时还原**：`Home.tsx` 优先用 exchange_rate 还原本币，再按当前实时汇率转目标币种。
- **"上次使用的货币"模式**：Settings 默认记账货币列表顶部的特殊选项。开启后 `effectiveDefaultCurrency` 走 `lastUsedCurrency`，`AddTransaction` 保存时 `recordLastUsedCurrency(currency)` 写回 localStorage（key: `ledger_last_used_currency`；开关 key: `ledger_default_use_last_used`）。本地偏好，不跨设备同步。

## 类目排序
- `useCategorySort`（`src/hooks/useCategorySort.ts`）：两种模式
  - `custom`：用户在 `/category-order` 页里上下移动调好的顺序，按 type 分别存（localStorage key: `ledger_category_custom_order`，结构 `{ expense: string[], income: string[], transfer: string[] }`）。没排过就保留 `useCategories` 返回的服务端 created_at 顺序。
  - `recent`：最近一次记账用过的类目排最前，未用过的按服务端默认顺序兜底。**"最近"由 caller 从 `useTransactions()` 的 `transactions` 数组派生**（每个 category_id 取最大的 `created_at`），不存独立 localStorage map —— 老用户的历史交易自动算数，避免另外维护一份状态同步。
- 切换 / 写操作通过 `ledger:category-sort-changed` window 事件广播，所有 hook 实例 re-read localStorage，无需 Context Provider。
- 模式切换 + 入口都在 Settings → 类目排序；AddTransaction 渲染时把 lastUsedAt 透传给 `applySort`。

## 路由
定义于 `src/App.tsx`，Provider 嵌套：`LanguageProvider → AuthProvider → CurrencyProvider`。

| 路径 | 组件 | 备注 |
|------|------|------|
| `/auth` | Auth | 登录/注册，已登录自动跳 `/` |
| `/` | Home | 受 ProtectedRoute 保护 |
| `/add` | AddTransaction | hideNav |
| `/calendar` | Calendar | |
| `/charts` | Charts | |
| `/budget` | Budget | hideNav |
| `/settings` | Settings | |
| `*` | redirect → `/` | |

## i18n
- 自定义 Context（`LanguageContext`），无第三方库。
- `src/lib/i18n.ts`：zh/en 两个对象 + 强类型 `TranslationKey`。
- 持久化 key：`ledger_lang`，默认 `'zh'`。
- 支持插值：`t('budgetSubtitle', { year, month, currency })`。

## 离线与同步
- `src/lib/outbox.ts`：写操作先入队 localStorage，联网后批量 push。
- `src/lib/sync.ts`：拉远端 + 推 outbox。
- `src/lib/dataCache.ts`：每张表的快照 localStorage。
- `src/lib/lastSync.ts`：每表最后同步时间。

## 部署
- 主入口：https://ledger.tuchenguang.com（Vercel 默认 URL `ledger-tusts.vercel.app` 仍可访问）
- `vercel.json`：SPA 重写 + sw.js no-cache + assets 长缓存
- 环境变量：`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- Capacitor `server.url` 已指向 `ledger.tuchenguang.com`（`capacitor.config.ts:10`）

## 已知坑位
- `database.types.ts` 是**手写**，未用 `supabase gen types`；改 schema 需手动同步。
- categories / budgets 无 `updated_at` 列。

## 界面与安全区（2026-11-12 按 Apple HIG 翻新）

进展和决策过程见 `进展日志.md`。这里只记写代码时要遵守的约定。

### 外壳高度
- 一律用 `h-app`（= `var(--app-h)`），**不要再写 `h-dvh` / `h-screen` / `min-h-screen`**。
- 原因：iPhone 把站点加到主屏幕后，`viewport-fit=cover` 下 `100%` / `dvh` / `svh` 会比屏幕矮一截安全区（WebKit bug 254868），底部露出一条 body 背景。`index.css` 里 standalone 用 `100vh`，`src/lib/viewport.ts` 在 iPhone standalone 下再按「视口宽度 × 屏幕长宽比」算一个像素值兜底。
- **`screen.width` / `screen.height` 是设备点，不能直接当 CSS 像素用**：用户手机上网页有约 1.15 倍缩放，两者不相等。2026-11-14 就是把 `screen.height`（956）直接写进 `--app-h`，外壳比屏幕高 122px，贴底的标签栏整条掉到屏幕外。要用屏幕尺寸只能用比例。
- fixed 定位的弹层贴底 / 铺满用 `bottom-app` / `inset-app`（= `--fixed-bottom`），**不要写 `bottom-0` / `inset-0`**：那个 bug 下 fixed 的包含块同样比屏幕矮一截。需要自己算 bottom 的（toast）在 `calc()` 里加上 `var(--fixed-bottom)`。
- 真机排查：设置 → 关于 → 最下面「显示诊断信息」（`collectViewportDiag`），让用户截图。
- 不走 Layout 的页面（Auth / ResetPassword / About）用 `PageShell` 包住，里面自己写 `h-full overflow-y-auto`（html/body 是 `overflow:hidden`，页面得自己能滚）。

### 安全区
- 用 `index.css` 里的变量 `--sat` / `--sab` 和工具类，**不要直接写 `env(safe-area-inset-*)`**：
  - 顶部：`pt-safe`、`pt-safe-2/3/4`（安全区 + 8/12/16px）
  - 底部：`pb-safe-2/4/6`（有 Home 指示条就让出指示条，没有就用最小值）
  - 有标签栏的页面，滚动区底部用 `pb-page`（Layout 上的 `has-tabbar` 会让它自动多让出标签栏高度）
- 这些类自带 padding，别和同方向的 `pt-*` / `pb-*` 写在同一个元素上。旧的 `.safe-top` 就是因为写在 `@layer base`、被同元素的 `pt-4` 盖掉，一直没生效。
- 目标机型：用户的 iPhone 17 Pro Max（屏幕 440×956pt，竖屏安全区顶 62 / 底 34）。但**网页实际的 CSS 视口约 384×834**（有约 1.15 倍缩放，2026-11-14 量截图得出；缩放来源未证实）。本地预览时把视口设成 **384×834**，再手动 `--sat: 62px`、`--sab: 34px` 模拟。真机尺寸别照机型参数表推，先量截图里固定尺寸的元素（比如 40px 的图标圆）换算。

### 状态栏底（`components/layout/StatusBand.tsx`）
- `black-translucent` 模式下状态栏文字的颜色不归页面管：用户手机上同一天出现过白字和黑字，浅色页面配白字时完全看不见。
- 所以**除首页外所有页面**顶部都有一条高度 = 顶部安全区的品牌红色带子（`.status-band`），页面内容是接在下面的圆角面板（`rounded-t-band`，外层 `bg-band`）。品牌红对白字 4.2:1、对黑字 5.0:1，两种都读得出来；**不要改成黑色或白色**。
- 首页是 `<Layout immersive>`：照片自己铺到状态栏后面，不放带子（离线横幅出现时例外，Layout 会自动补上）。
- 带子后面的元素里 `--sat` 被置 0，所以页面头部照常写 `pt-safe-*` 即可，不会让两次。
- 不走 Layout 的页面用 `PageShell` 包一层（Auth / ResetPassword / About 已经这样做）。
- 弹层向上定位别用 `window.innerHeight` 算 `bottom`（主屏幕模式下它偏小），用 `top` + `translateY(-100%)`。

### 底部导航
- `BottomNav` 是浮在内容上方的玻璃胶囊（absolute 定位在 Layout 里），只放 4 个导航项；「记一笔」是胶囊右边独立的圆按钮（HIG：标签栏只做导航、不放操作）。
- 页面内容铺到屏幕底，从标签栏下面滑过去；新页面的滚动容器记得加 `pb-page`。

### 流水行左滑（`components/SwipeRow.tsx`，2026-11-14 加）
- 首页流水行、日历当日明细的行可以往左滑，露出「编辑」（灰）和「删除」（红）两个按钮；轻点行仍然打开详情弹层。
- 手势的数（方向判定、跟手距离、松手停哪）在 `lib/swipe.ts`，是纯函数；`SwipeRow` 只接指针事件。行内容容器带 `touch-action: pan-y`，竖向滚动仍归浏览器。
- 开合状态放页面里（`swipedId`），同一时间只滑开一行；列表 `onScroll`、切月份时收回。新列表要接左滑照这个写。
- 行与行之间的分隔线如果用了 `last:border-0`，要写在 `SwipeRow` 的 `className` 上，不能写在里面的 button 上（button 现在各自包了一层，永远是 last-child）。
- **删除一律用页面自己那份 `useTransactions().remove`**（传给 `DeleteTxDialog` 的 `onConfirm` / `TransactionSheet` 的 `onRemove`）。每个 `useTransactions()` 各有一份列表状态，用别的实例删，页面列表要等联网同步回来才更新，离线时那一行一直不消失。

### 设计变量（`tailwind.config.js`）
- 灰阶 = iOS 系统灰：`gray-50` 页面底色 / 填充，`gray-100` 分隔线，`gray-300` 箭头，`gray-400` 起才能当文字（对比度 ≥ 4.5:1），`gray-900` 正文。
- 字号映射到 HIG 文本样式：`text-xs` 12、`text-sm` 15、`text-base` 17、`text-lg` 20、`text-xl` 22；页面大标题 `text-[28px] leading-[34px] font-bold`；最小 11px。输入框一律 `text-base`。
- 强调色只有 `primary`（红）：选中态、主按钮、可点文字。**流水里的支出金额用正文色**，收入绿（`green-600`）、转账蓝（`blue-600`）；红色文字只用于超支 / 删除这类警示（`red-600`）。统计页图表配色不受此约束。
- 金额数字加 `font-num`（SF Pro Rounded + 等宽数字）。
- 卡片不用阴影，靠 `gray-50` 底 + 白卡片分层；`shadow-glass` 只给浮动的导航层和下拉菜单。
- 分段切换用 `components/Segmented.tsx`，不要再写下划线 tab。
- 可点元素点击区域至少 44×44：视觉上要小的控件加 `hit-44`（行内小按钮用 `hit-row`）撑大点击范围。

### 测试依赖的细节（改样式时别碰）
- 记账页金额 span 必须带 `text-3xl` 类名（`AddTransaction.test.tsx` 靠它找）。
- Segmented 每一段是普通 `<button>`、文字直接放在 button 里（测试按 `getByRole('button', { name })` / `getByText` 定位）。
- 弹层关闭按钮的 aria-label 用 `t('close')`，不要用 `t('cancel')`（和删除确认框的「取消」撞名）。

## 自动记账（2026-11-15 加，**后端还没上线**）

用法和上线步骤见 `自动记账说明.md`，设计见仓库根 `docs/superpowers/specs/2026-11-15-ledger-auto-ingest-design.md`。这里只记写代码时要守的约定。

### 数据
- `003_auto_ingest.sql`：`transactions` 多四列 `source` / `external_id` / `merchant` / `needs_review`；新表 `merchant_rules`（商户 → 类目）、`ingest_tokens`（个人令牌，只存 SHA-256）。**先跑 003 再上线客户端。**
- 手记的流水 `source` 为 NULL。客户端只在编辑**自动流水**时才往 update 里带 `needs_review`（它们存在就说明 003 跑过了），手记流水不带，道理同 `direction`。
- `merchant_rules` 没有 `id` 列，主键是 `(user_id, merchant_key)`，只能用 outbox 的 `upsert`，不能用按 id 的 update / delete。

### 后端入口 `supabase/functions/ingest/`
- `logic.ts` 纯函数、**不能有 import**；`handler.ts` 只 import `./logic.ts`，数据库走注入的 `Db` 接口；`index.ts` 是 Deno 入口。前两个用 vitest 测（`vitest.config.ts` 的 include 已包含 `supabase/functions/**/*.test.ts`），`index.ts` 本地跑不了。
- 部署必须 `--no-verify-jwt`，鉴权靠个人令牌（`Authorization: Bearer lgr_…` 或 `x-ledger-token`）。
- 选类目的顺序：商户记忆 → 请求里带的类目名 → 「其它」并标 `needs_review`。
- 去重靠 `(user_id, source, external_id)`：先查后插，唯一索引兜底（它是部分索引，PostgREST 的 upsert 用不了）。
- **`merchantKey` 有两份**：`supabase/functions/ingest/logic.ts` 和 `src/lib/merchantRules.ts`，必须保持一致（去首尾空格、合并空白、转大写），否则客户端记了后端查不到。`sha256Hex` / `hashToken` 同理。

### 客户端
- `components/AutoTag.tsx`：流水行类目名旁的「自动」/「待分类」标记，首页和日历都用。新列表要显示自动流水照这个接。
- `pages/AutoIngest.tsx`（`/auto-ingest`，设置 → 自动记账）：令牌的生成 / 列表 / 撤销，直接调 supabase，不走离线队列。
- `AddTransaction` 保存自动流水时：清 `needs_review`，支出类再调 `rememberMerchant` 记住商户归类。

### 电脑同步工具 `tools/wechat-sync/`
- Python，自带 `.venv`，测试 `python -m unittest discover -s tests -t .`。说明见那里的 `README.md`。
- **仓库是公开的**：`config.json`（本机路径、令牌）已 gitignore；代码、测试样例、文档里不能出现真实的 wxid、路径、密钥、令牌、未脱敏的聊天内容。

## 全局 Toast
- `src/lib/toast.ts`：window event bus（`ledger:toast`），导出 `showToast(message, { durationMs? })` / `subscribeToast(cb)`。
- `src/components/layout/ToastHost.tsx`：唯一渲染宿主，挂在 `App` 顶层 Provider 内。
  - `rounded-2xl` + `break-words` + `max-w-[85vw]`，长消息（如 PG `同步被拒：23514: new row...`）可换行不裁断
  - `onClick={() => setMsg('')}` + `pointer-events-auto`，用户可点击提前关闭
  - inline `animationDuration: ${duration}ms` 让 `.anim-toast` 的 keyframe 时长跟 setTimeout 对齐，不会出现"动画走完但 DOM 还挂着"的空挂区
- 用途：**模块代码（非 React 树内）的偶发用户级提示**——目前由 `sync.ts:classifyError` 在 outbox 被服务端业务级拒绝时调用，duration 6 秒。同时 `console.error('[sync] outbox entry rejected by supabase', err)` 把完整 err 丢进 DevTools 让用户能看具体哪个约束失败。未来汇率 API、通知权限失败等都走这里。
- AddTransaction 内部的本地 toast 是**业务反馈**（保存成功 / 校验失败），不走全局通道，保持原状。

## 同步队列（`src/lib/sync.ts`）
- `pushOutbox()`：FIFO 推 outbox 到 supabase。`flushOne` 返回 false（网络错）就 bumpRetry + break；返回 true（成功 / 业务错）就 outbox.remove + 继续。
- `pullAll()`：dispatchEvent `ledger:sync-trigger`，所有数据 hook 订阅 + reload。
- `sync()`：先 push 后 pull，**`inFlight` 闸门防止并发同步重复推**。
  - **历史 bug（2026-05-29 修）**：之前写法是 `inFlight = (async () => { try{...} finally { inFlight = null } })()`，离线分支 IIFE 体内**没有 await**，整个体会同步跑完，`inFlight = null` 在外层 `inFlight = <iife>` 赋值前执行；结果离线 sync 一跑完 `inFlight` 反而被 resolved Promise 卡住，下次 sync 一直命中 `if (inFlight) return` 永远不再推。
  - **现写法**：`work.finally(() => { if (inFlight === work) inFlight = null })`，把闸门清理移到 IIFE 外的 .finally 链，两条路径都按预期清。回归用例 `does not get stuck in inFlight after an offline sync` 锁住这个不变式（`src/lib/sync.test.ts`）。
- `classifyError`：网络错（message 含 "failed to fetch" / "network"）→ false 保留重试；其它（PGRST / CHECK / FK 等业务错）→ console.error 完整 err + showToast 6 秒 + return true 出队。

## 统计页（`src/pages/Charts.tsx`）
五个 tab，Settings 里可独立开关：
- **月度趋势** overview：近 6/12 月支出 + 收入对照柱状图、月度明细列表
- **每日支出** daily：当月每日柱状图 + IQR 异常值过滤 toggle（≥4 天有数据才出现）+ 单日明细面板
- **分类占比** category：支出/收入饼图 + 自定义图例（点行隐藏 / 点箭头钻到日明细）。钻取页（2026-07-09 加）：头部显示当月总额+总笔数；每日汇总行可点击展开当天该类目的**逐笔明细**（图标+备注/类目名+金额，金额降序）+ 当日合计与笔数，同时只展开一天；柱状图点某天联动展开。展开状态在切月/切类目/返回列表时重置。测试：`src/pages/Charts.test.tsx`（mock react-chartjs-2 + 真实 zh 文案断言）。
- **更多** extra：日均支出、结余率、最高单笔、Top 类目、**恩格尔系数（带 ⓘ 图标，点开说明"食品"包含哪些类目）**、环比上月、按星期支出分布
- **转账** transfer（2026-05-29 加）：完全独立于上面 4 个 tab 的数据流（`monthlyTransferTxs` 不入 `monthlyTxs`，不进 overview 累加），不影响现有支出/收入统计。4 联卡片（转入 / 转出 / 净额 / 笔数）+ 环比 + 类目饼图 + 每日柱状（蓝 in + 红 out 并排）。空状态 🔄。

恩格尔系数的"食品"按 `FOOD_CATEGORY_NAMES` set（中英对照，含 `三餐 / 零食 / 水果 / Meals / Snacks / Fruits`）匹配类目名聚合；ⓘ 展开会列出这些类目让用户知道分组规则。

## 测试基建（`vitest` + `@testing-library/react` + Playwright）
- **单元 / 组件**：`vitest run`（共 25 文件 / 219 用例），覆盖 lib 全部纯逻辑、所有 hooks、各 contexts、关键组件（AddTransaction / TransactionSheet / ToastHost / OfflineBanner / PasswordInput）。
  - `vitest.config.ts` 独立于 `vite.config.ts`，避开 PWA 插件在 jsdom 里的副作用。`tsconfig.test.json` 给编辑器；构建 `tsconfig.app.json` 排除 test 文件。
  - `.env.test` 提供 stub Supabase URL（mock 不命中真实服务）。
  - 跨用例 `navigator.onLine` 用 `Object.defineProperty` 直接覆盖，避免 `vi.spyOn` 的 getter mockRestore 在 jsdom 里清不回 prototype（spyOn restore 后会返回 undefined）。
- **E2E**：`npm run test:e2e`（Playwright + Chromium），5 个 smoke 用例验证真实生产构建的 app shell：app 启动渲染非空、未登录访问受保护路由跳 /auth、/reset-password 公开、PWA manifest 200。E2E 用 page.route() stub 掉 supabase REST + auth，不连真实服务。
- **CI**：`.github/workflows/ci.yml`（仓库根），push/PR 跑 vitest → build → playwright，失败时上传 playwright-report artifact。

## 历史修复记录（按时间倒序，便于回溯）
- (2026-05-30) 转账可选转入(+)/转出(-)：UI toggle + `transactions.direction` 列 + 客户端向后兼容（非转账不带字段）
- (2026-05-30) 修生产 schema 漂移：`transactions_type_check` / `categories_type_check` 原本不允许 `'transfer'`，002 迁移 DROP+ADD 重建
- (2026-05-29) 修首次记账 22P02：`useCategories.seedDefaults` 自动 seed 默认分类拿真 UUID 再 insert
- (2026-05-29) 全局 toast 通道：sync 业务错从 `console.warn` 静默改为用户可见的 toast
- (2026-05-29) sync 离线 inFlight 卡死 bug：闸门清理移到 IIFE 外
- (2026-05-29) 转账独立统计 tab：现有 4 tab 数据流零修改
- (2026-05-29) 恩格尔系数加 ⓘ 图标说明分组规则
- 全局日期 UTC 偏移修复：用 `localDateStr()` 替代 `toISOString()`，避免 UTC+8 凌晨记账记到昨天
- 日历今日高亮 UTC 偏移修复
- 配置 Resend SMTP（smtp.resend.com:465，发件人 onboarding@resend.dev "口袋记账"）
- 货币定义统一收口到 `types/index.ts`，新增 MOP
- PWA 图标：红底白字"记账"，含 192/512/maskable 三个 PNG
- 全局滚动：html/body/#root 加 `height:100%; overflow:hidden`；Layout 用 `h-dvh`
- BottomNav 从 `fixed` 改为正常流（`shrink-0`），Layout main 去掉 `pb-16`（**2026-11-12 起已作废**：现在是浮动标签栏，见上面「界面与安全区」）
- 删除首页底部"+ 记一笔"文字按钮（保留导航栏 + 圆形按钮）
- 记账页键盘高度压缩（py 缩窄共节省约 50px）
- 各页 header `pt-12 → pt-4`（viewport 未设 viewport-fit=cover，safe-area-inset-top 为 0）（**2026-11-12 起已作废**：现在各页头部用 `pt-safe-*`）
- PWA 状态栏：theme-color = `#ffffff`，viewport 加 `viewport-fit=cover`

## GitHub
Hooper18/apps（main 分支；ledger-app 和 schedule-app 共仓不同子目录）。push 到 main 触发 Vercel 自动部署。

## 参考
离线版源码：`../finance-app.html`
