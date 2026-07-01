# 纪念日 App 设计文档（Design Spec）

- 日期：2026-07-01
- 工作名：**纪念**（repo 暂定 `jinian-app`，子域名暂定 `jinian.tuchenguang.com`，均可后续改名）
- 状态：设计定稿（已过 3 视角对抗审查并据实修订），待写实现计划（writing-plans）
- 技术未知点已由 4 路并行 agent 核验（webcal/.ics、农历库、Supabase、领域计算）；spec 又经 3 视角审查（技术正确/一致性/完整性）收敛。结论见文末附录。

---

## 1. 这是什么 / 目标

一个**纯自己用**的纪念日 App，记录「对人重要的日子」。混合型：一个日子既能**倒数/正数**、又能**记录**（一段文字 + 一张封面图）、又能**提醒**（导出到系统日历）。

三条成功标准：

1. 打开就能一眼看到「最近要到的日子」和各种日子的天数。
2. 能把日子一次性订阅进手机系统日历，之后 App 里新增/修改会（在系统日历自己的刷新节奏内）自动同步，由系统日历负责真正的提醒。
3. 视觉达到「像 Claude web 端一样优雅」的产品感，而非 demo 感。

## 2. 非目标（YAGNI，明确不做）

- ❌ **Web Push / App 内推送**：提醒完全交给系统日历（用户选 C）。不做推送。
- ❌ **多人 / 共享 / 协作**：纯单用户（用户选 A）。仍带 `user_id` + RLS（零成本防手滑、未来可扩），但无分享 UI。
- ❌ **多张照片 / 相册**：每个日子只有一张封面图（用户选 B）。
- ❌ **暗色模式**（v1 不做，但颜色走 CSS 变量，v1.1 低成本可加）。
- ❌ 复杂重复规则（每周/每两年/自定义 RRULE）。只支持三种类型。
- ❌ **置顶（pinned）**（审查指出为悬空字段，v1 删除；未来加列成本极低）。
- ❌ **农历 since/until**：农历仅用于每年循环的纪念日（`anniversary`）。

## 3. 技术栈与部署拓扑

对标现有 `ledger-app`：

| 层 | 选型 |
|---|---|
| 前端 | Vite + React 18 + TypeScript（strict） |
| 样式 | CSS 变量 + 现有 app 样式方案；遵循全局设计规范（暖白 / 单一强调色 / 无渐变无阴影 / 1px 极淡边框） |
| 后端 | Supabase：Auth（magic-link）+ Postgres + Storage |
| 日历订阅接口 | 1 个 Vercel serverless 函数 `/api/cal/[token].ics`（service-role，免登录，token 鉴权） |
| 农历 | `lunar-typescript`（6tail，MIT，零依赖，自带 .d.ts） |
| .ics 生成 | `ical-generator`（不手拼字符串） |
| PWA | manifest + 最小 service worker（仅「装到主屏 + 离线读缓存」，**不推送**） |
| 部署 | 独立 Vercel 项目 → 子域名 + Cloudflare CNAME（灰云）→ vercel-dns |

**独立仓**：按现有拓扑，本项目作为嵌套独立 git 仓，登记进工作区根 `.gitignore`，自己的 remote 部署（参考仓库既有 side-project 拓扑）。

## 4. 视觉规范（已通过可视化伴侣定稿）

### 配色（Claude 暖白 + 黏土色），CSS 变量

| 变量 | 值 | 用途 |
|---|---|---|
| `--bg-primary` | `#FAF9F7` | App 画布 / 暖白背景 |
| `--bg-secondary` | `#FFFFFF` | 卡片 / 输入框底 |
| `--bg-tertiary` | `#F0EEE9` | 层级填充 / 分段控件槽 |
| `--border` | `#E7E3DB` | 1px 极淡边框、分割线 |
| `--text-primary` | `#2B2A27` | 正文近黑（暖调） |
| `--text-secondary` | `#78756E` | 次要文字 |
| `--text-tertiary` | `#A9A59C` | 辅助/占位 |
| `--accent` | `#C96442` | 黏土强调色（倒数数字、主按钮、选中态） |
| `--accent-hover` | `#B5563A` | 强调色 hover/按下 |
| `--accent-tint` | `rgba(201,100,66,0.07)` | 强调色淡底（选中背景、里程碑框） |

强调色只用在「数字 / 主操作 / 选中态 / 里程碑」。禁止渐变、彩色图标阵列、shadow-md 及以上、装饰性动画。排版：界面文字 13–15px、标题 18–20px；正文 regular、强调 medium、几乎不 bold；中文行高 1.7–1.8；内容区居中约束、移动端优先。

### 4.1 首页 —「近期聚焦」（版式 A）

- 顶部一张**大卡**突出「最近要到的一个日子」：封面图 + 顶部渐隐深色 scrim + 大倒数数字。
- 下面**紧凑列表**：小圆封面缩略图 + 标题/副标题 + 右侧天数。
- 「回忆」分区：`until` 已过期（运行时 `daysBetween<0`）的日子折叠于此。
- 排序：默认按「下一关键日距今天数」升序（`since` 用已过天数排在合适位置或单独分区，实现时定；无 pinned）。
- 右上角 `＋` 新建。

### 4.2 详情页 —「编辑排版」（版式 ②）

- 顶部返回 + `···`（编辑/删除/订阅/重置订阅链接）。
- 封面**框图**（圆角 14，非全屏）；无封面时占位（纯色底 `--bg-tertiary` + 标题首字），不留破图。
- 标题 + 起点/日期副标题。
- **克制内联数字**（如「已经 **1024** 天」），强调色只落在数字。
- **里程碑区**（仅 `since`）：下一个里程碑 + 已达成列表。
- 那段文字（细排版，hairline 分割）。
- 元信息行（Apple 设置页式）：类型 / 日历（公历·农历 X 月 X 日）/ 提醒。
- 底部文字型「＋ 加入系统日历」。

### 4.3 新建/编辑表单（编辑排版风格）

- **封面**：空态虚线「＋ 添加封面照片」；已有封面时**点击可替换**、提供**「移除封面」**动作（移除同时删 Storage 对象）。
- 名字。
- **类型分段控件**：`每年循环` / `累加计天` / `倒数到某天`（切换改下方字段语义）。
- **日期行** + **农历开关**（农历开关**仅在类型=每年循环时可用**）：打开后下方实时提示「农历 X 月 X 日 · 今年对应公历 …」。
- 类型=`累加(since)` 时显示**里程碑区**（预设 chips + 自定义「第 N 天」）。其他类型不显示。
- **提醒** chips（多选）：当天 / 提前 1 天 / 3 天 / 1 周（默认：当天 + 提前 1 天）。
- 「写点什么」多行文本。
- 底部**实时预览**：显示它在首页那一行的样子（所见即所得）。

## 5. 数据模型

三种「日子」类型 = 单一 `kind` 枚举。

| kind | 含义 | 显示 | 日期字段语义 | 农历 | 里程碑 |
|---|---|---|---|---|---|
| `anniversary` | 每年循环（生日/周年） | 距下次 N 天 + 第 N 周年/N 岁 | 出生/首次那天 | ✅ 可选 | 周年+年龄（自动） |
| `since` | 从过去累加 | 已经 N 天 + 里程碑 | 起点 | ❌ | ✅ 可配 |
| `until` | 一次性倒数 | 还有 N 天，过期归回忆 | 目标日 | ❌ | ❌ |

### 表 `occasions`

```sql
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
  remind_days   int[]  not null default '{0,1}',            -- 提前几天，0=当天，如 {0,1,7}
  milestones    jsonb  not null default '{"hundreds":true,"thousand":true}'::jsonb,
  leap_fallback text   not null default 'feb28' check (leap_fallback in ('feb28','mar1')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 农历仅用于每年循环的纪念日
  constraint lunar_only_anniversary check ( (not lunar) or (kind = 'anniversary') )
);
alter table public.occasions enable row level security;

-- updated_at 自动刷新（Postgres 不会自动更新该列）
create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists occasions_set_updated_at on public.occasions;
create trigger occasions_set_updated_at before update on public.occasions
  for each row execute function public.set_updated_at();
```

- **`archived` 不落库**：由运行时 `computeOccasion` 的 `daysBetween<0`（仅 `until`）派生，首页据此分区，单一真相源，避免列与实时计算不一致。
- **`lunar=true` 权威来源**是 `(lunar_month, lunar_day, lunar_is_leap)`，每次运算/导出按目标公历年重算（§7）。`date` 列仅存创建时换算出的公历基准，用于排序/兜底，不作农历复现依据。
- **`milestones` 解析语义**：缺省的键按 `false` 处理；列默认 `{"hundreds":true,"thousand":true}`（与新建表单预选一致）。仅 `kind=since` 读取；非法组合（如某行残留 `romantic` 但 kind≠since）在展开时**静默忽略**。

### 表 `profiles`（含日历订阅 token）

```sql
create extension if not exists pgcrypto;
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  calendar_token text not null unique default encode(gen_random_bytes(32),'hex'), -- 256-bit
  created_at     timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 新用户自动建 profile
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

- 「重置订阅链接」= 前端 `update profiles set calendar_token = encode(gen_random_bytes(32),'hex') where id = auth.uid()`，旧 webcal 立即失效。走下方 `profiles update own` 策略（前端直连，单用户零风险）。

### RLS（occasions ×4 + storage ×4 + profiles ×2）

```sql
-- occasions（四操作，using/with check 均 (select auth.uid()) = user_id）
create policy occasions_select_own on public.occasions for select to authenticated
  using ( (select auth.uid()) = user_id );
create policy occasions_insert_own on public.occasions for insert to authenticated
  with check ( (select auth.uid()) = user_id );
create policy occasions_update_own on public.occasions for update to authenticated
  using ( (select auth.uid()) = user_id ) with check ( (select auth.uid()) = user_id );
create policy occasions_delete_own on public.occasions for delete to authenticated
  using ( (select auth.uid()) = user_id );

-- profiles（select own + update own；update 两段都限 id，防改归属）
create policy profiles_select_own on public.profiles for select to authenticated
  using ( (select auth.uid()) = id );
create policy profiles_update_own on public.profiles for update to authenticated
  using ( (select auth.uid()) = id ) with check ( (select auth.uid()) = id );

-- covers 私有桶（四操作，路径首段 = user_id）
-- 建桶：insert into storage.buckets (id,name,public) values ('covers','covers',false)
--       on conflict (id) do update set public = false;
create policy covers_select_own on storage.objects for select to authenticated
  using ( bucket_id='covers' and (storage.foldername(name))[1] = (select auth.uid())::text );
create policy covers_insert_own on storage.objects for insert to authenticated
  with check ( bucket_id='covers' and (storage.foldername(name))[1] = (select auth.uid())::text );
create policy covers_update_own on storage.objects for update to authenticated
  using ( bucket_id='covers' and (storage.foldername(name))[1] = (select auth.uid())::text )
  with check ( bucket_id='covers' and (storage.foldername(name))[1] = (select auth.uid())::text );
create policy covers_delete_own on storage.objects for delete to authenticated
  using ( bucket_id='covers' and (storage.foldername(name))[1] = (select auth.uid())::text );
```

### Storage（封面图生命周期）

- 桶 `covers`（**private**）。路径固定 `{user_id}/{id}.jpg`（**覆盖式**，替换封面不产生孤儿）。
- App 内用 `createSignedUrl` 显示（private 桶）。**封面图不进日历**（日历事件是纯文本）。
- 上传前 canvas 压缩：最长边 ≤ 1600px、JPEG ≈ 0.8。
- **删除清理**：删除 occasion 时前端显式 `storage.from('covers').remove([cover_path])`（DB `on delete cascade` 不清 Storage 对象）；「移除封面」同样删对象并置 `cover_path=null`。
- **签名 URL 缓存**：覆盖式命名下，用 `?v={updated_at}` 之类做缓存击穿，避免换图后仍显示旧图。

## 6. 领域计算 `lib/occasion.ts`（纯函数，最该被测）

**铁律**：全部用 `CivilDate {y,m,d}` + `Date.UTC(y,m-1,d,12)` 正午锚点做整数天差、`Math.round`。**绝不**混用 `new Date('YYYY-MM-DD')`（UTC 午夜）与 `new Date(y,m,d)`（本地午夜）；**绝不** `toISOString()` 存/显示日期。

```ts
type LeapFallback = 'feb28' | 'mar1';
type OccasionKind = 'anniversary' | 'since' | 'until';

isLeap(y): boolean
daysInMonth(y, m): number
diffDays(a: CivilDate, b: CivilDate): number          // Math.round((UTC(b)-UTC(a))/86400000)
addDays(c, n): CivilDate
addMonthsClamped(c, n): CivilDate                      // Jan31 +1月 -> Feb28（clamp 月末，不回弹）
anchorInYear(anchor, year, fb): CivilDate              // 2/29 平年落 2/28 或 3/1
nextAnniversaryDateSolar(anchor, today, fb): CivilDate // 公历 anniversary 下次
nextAnniversaryDateLunar(spec, today): CivilDate|null  // 农历 anniversary 下次（见 §7）
completedMonths(from, to): number                      // 满周期截断（anchor-day 感知）
completedYears(from, to): number
computeOccasion(o, today): OccasionState
```

`OccasionState`：
- `since`：`daysBetween=已过天数(≥0)`，`years/months=满年/满月`，`nextDate=null`。
- `until`：`daysBetween=剩余天数(可负=已过→归回忆)`，`nextDate=目标日`。
- `anniversary`：`daysBetween=距下次天数`，`years=已满周岁`，`nextDate=下次发生日`（公历或农历分支）。

**边界规则（写死 + 测试）**：
- 闰年 2/29：平年默认回退 **2/28**（`leap_fallback` 可切 `mar1`），UI 标注「今年按 2/28 计」。因导出改为逐年展开 dated 事件（§8），`mar1` 在 ICS 中也能忠实表达。
- `completedMonths`：按「日是否到达锚点日（按目标月 clamp）」判断，2/15→3/14=0、3/15=1；1/31→2/28 满月边界；`addMonthsClamped` 不回弹。
- 「今天恰好到达」= 单独 `isToday` 态（既非 achieved 也非未来），文案一致。

### 里程碑（**仅 `since`**）

`milestones` jsonb schema：
```jsonc
{ "hundreds": true,   // 每 100 天
  "thousand": true,   // 第 1000 天
  "monthly":  false,  // 每满一个月（addMonthsClamped，真实日历月，非 30 天近似）
  "romantic": false,  // 第 520、1314 天
  "customDays": [888] // 自定义「第 N 天」
}
```

```ts
interface Milestone { key: string; label: string; date: CivilDate;
  dayOffset: number|null; achieved: boolean; isToday: boolean; isNext: boolean }

expandMilestones(o, today, horizonDays=366*60): Milestone[]   // 仅 since：起点+偏移天数展开、去重、排序、标 isNext
expandAnniversaryMilestones(anchor, today, fb, maxYears=100): Milestone[]  // 周年+年龄
```

- `expandMilestones`：`since` 专用。`until`/`anniversary` 不调用。去重（同一天多规则取首个），升序，`isNext = 第一个未达成`，`horizon` 上界防无限展开，`customDays` 去重/clamp。
- `expandAnniversaryMilestones`：复用 `Milestone` 类型，`dayOffset=null`（周年非固定天偏移），`label` 用「第 N 周年 / N 岁」。例：`{key:'y10', label:'第 10 周年', date: 锚点+10年那天, dayOffset:null, ...}`。
- `romantic` 仅 `since` 语义合理；`monthly` 亦 `since` 专属。非法组合静默忽略。

## 7. 农历 `lib/lunar.ts`（`lunar-typescript`，仅 anniversary）

- 闰月 = **负月份**：`Lunar.fromYmd(y, isLeap ? -Math.abs(m) : m, d).getSolar()`。
- **一个公历年可能命中 0/1/2 次**：`lunarToSolarInYear(spec, gYear)` 扫 `[gYear-1, gYear, gYear+1]`，过滤 `solar.getYear() === gYear`，返回**升序数组**。
- 守卫：闰月先 `LunarYear.fromYear(ly).getLeapMonth() === Math.abs(m)` 再 try/catch（不存在的闰月会 **throw**）；短月用 `LunarMonth.fromYm(ly, signedMonth).getDayCount()` 判断该日是否存在。
- 输出用 `new Date(solar.getYear(), solar.getMonth()-1, solar.getDay())` 或 `{y,m,d}`，**绝不** `toISOString()`。
- **下次发生日**：从 `today` 起，把 `[gy, gy+1, …]` 每年的全部命中日期拉平、过滤 `> today`、**取最小**。搜索窗口 **25 年**（闰月纪念日间隔可达 ~19 年，如闰二月 2023→2042）；窗口内无命中返回 `null`，UI 诚实显示「下次在 YYYY 年」或「近年无对应农历日」，**不做**回落开关（YAGNI）。

## 8. 日历订阅 `/api/cal/[token].ics`（Vercel serverless）

**动态生成**：每次被拉取时以「当前年」为基准实时重算，天然向后滚动补充。

- token：64-hex（`gen_random_bytes(32)`）。URL：`webcal://<APP_HOST>/api/cal/<token>.ics`（`<APP_HOST>` 来自 §14 的 base-url env）。
- **安全**（service-role 绕 RLS，边界全在应用层）：
  - token 形状不符 `^[0-9a-f]{64}$` → **404**。
  - 按 token 查 `profiles` 拿 `user_id`，查不到 → **404**（不泄露存在性，不返 401）。
  - 查 occasions **必须手动 `.eq('user_id', user_id)`**（无 RLS 兜底，漏写=全表泄露）。
  - service-role key 只在 serverless env，**绝不**带 `VITE_/NEXT_PUBLIC_` 前缀。
  - 响应 `Content-Type: text/calendar; charset=utf-8`；`Cache-Control: private, max-age` 短时；别进公共 CDN。

### 事件生成：**全部为 dated（一次性）全天 VEVENT，不用 RRULE**

> 决策（见 §13）：放弃 RRULE、把循环事件也逐年展开为 dated 事件。换来统一的「当天 09:00」提醒、`mar1`/2·29 忠实表达、农历 0/1/2 次自然处理——单一代码路径。代价：ICS 略大（每纪念日约 10 条），超窗口靠 feed 滚动刷新补齐（动态端点已保证）。

- `anniversary`（公历）：对 `[今年 .. 今年+9]` 每年用 `anchorInYear(anchor, y, leap_fallback)` 得一天 → 每年一条 VEVENT（约 10 条）。2/29 由 `anchorInYear` 处理（feb28/mar1）。
- `anniversary`（农历）：对窗口每年调 `lunarToSolarInYear` → **命中几次生成几条**（0/1/2 均可）。**闰月日**：普通窗口若 0 命中，则把窗口延伸到「下一次命中」（≤25 年），保证 ICS **至少 1 条**、纪念日不「消失」。
- `since` 里程碑（仅 since）：`isNext` 及窗口内后续若干个 → 每个一条 VEVENT。
- `until`：未过期则一条 VEVENT。
- 每条 VEVENT：`DTSTART;VALUE=DATE:YYYYMMDD`，`DTEND;VALUE=DATE` = **次日**（排他）；稳定 `UID`（如 `{occasionId}-{YYYYMMDD}@<host>`）+ `DTSTAMP`；CRLF/折行/中文 UTF-8 由 `ical-generator` 保证。
- **VALARM（提醒）**：因全部是 dated 事件，对每个 `remind_days` 值用**绝对触发**在「事件日前 d 天的当地 09:00」响：`TRIGGER;VALUE=DATE-TIME:...Z`，09:00 按固定应用时区 `Asia/Shanghai`(UTC+8) 换算（09:00 CST = 01:00Z）。
- **窗口是两个独立参数**：ICS 导出窗口（普通 10 年 / 闰月延伸至下一次命中）与 §7「找下次」搜索窗口（25 年）**勿共用常量**。

### 现实（写进产品文案）

系统日历刷新低频且不可控（iOS 1–3h，Google 8–24h 且无手动刷新，`X-PUBLISHED-TTL`/`REFRESH-INTERVAL` 只能放慢不能加快）。**提醒不保证即时生效**；App 内首页始终是「实时」那份，日历是「最终会同步」的镜像。

## 9. 认证与 Auth 超时修复

- **magic-link**：`supabase.auth.signInWithOtp({ email, options:{ emailRedirectTo } })`。纯自用 → 关闭公开注册 / 邮箱 allowlist 只放行本人。
- **焊入 schedule-app 教训**：
  - 启动 `getSession()` 用 `Promise.race([getSession(), 3s 超时])`；**超时先乐观渲染**（`ready=true, confirmed=false`），不卡 spinner、不把用户踢去登录页（超时≠未登录）。
  - `onAuthStateChange` 拿到真 session 再纠正（`confirmed=true`）。
  - **回调内任何 supabase 调用必须 `setTimeout(fn, 0)` 推迟**，否则触发 supabase-js 已知死锁。
- 前端只用 anon key（受 RLS 约束）。

## 10. 错误处理与边界

- 农历某年无命中（闰月/短月）：`lunarToSolarInYear` 返回空数组；「下次」诚实显示未来年份或「近年无对应」，不静默让提醒消失（ICS 端已保证闰月日至少 1 条）。
- 图片上传失败/超限：压缩后再传；失败 toast 可重试（参考 ledger toast 规范：多行、可点关、错误延时长）。
- `until` 过期：运行时按 `daysBetween<0` 归入「回忆」，可手动编辑目标日改回（无持久 archived 列，不会互相打架）。
- 订阅 token 泄露：详情/设置「重置订阅链接」一键 rotate。
- 空态：无日子时首页引导「记下第一个重要的日子」。
- 封面：无封面时首页大卡/详情框图用纯色占位（`--bg-tertiary` + 标题首字），不破图。

## 11. 测试策略

- **`lib/occasion.ts` / `lib/lunar.ts` 纯函数**（vitest 重点，TDD）：
  - `diffDays` 跨年/跨月/同日=0；时区/DST 不「差一天」。
  - 2/29 生日平年（feb28 / mar1 两种）；下次发生日跨年。
  - `completedMonths`：2/15→3/14=0、3/15=1；1/31→2/28 满月边界；`addMonthsClamped` 不回弹。
  - 里程碑（仅 since）：hundreds/thousand/monthly/romantic/custom 展开、去重、`isNext`、`isToday` 边界、horizon 上界；`until`/`anniversary` 不产出 since 里程碑。
  - 农历：`(8,15,false)@2026→[9/25]`；`(12,1,false)@2024→[1/10, 12/30]`（一年两次）；`(2,1,true)@2024→[]`（无闰二月）；`(9,30,false)@2024→[]`（九月 29 天）；「下次」跨 ~19 年闰月。
- **`.ics` 生成**（快照 + 解析器校验）：
  - 每条含 UID/DTSTAMP、DTEND=次日（排他）、无 RRULE。
  - 公历 anniversary 展开约 10 条；2/29 平年落 2/28（或选 mar1 时落 3/1）。
  - 农历某年 2 命中 → 该年 2 条；闰月日 ICS 非空（延伸窗口生效）。
  - VALARM 绝对触发、09:00 CST=01:00Z 换算正确、每个 `remind_days` 一条。
  - **库冒烟**：确认 `ical-generator` 输出 `DTEND` 排他、绝对 `VALARM`、稳定 `UID`（实现前一条冒烟测试验证）。
- **`/api/cal` 鉴权**：坏 token→404、无此 token→404、正确 token 只回本人数据（`.eq('user_id')` 回归）。
- **组件/交互**（Testing Library）：类型切换改字段语义；农历开关仅 anniversary 可用；里程碑区仅 since 出现；封面替换/移除。
- **e2e**（Playwright）：新建三种类型各一条 → 首页/详情正确 → 生成订阅链接可访问；CI 注入 stub `VITE_SUPABASE_*` + base-url 防真实构建白屏（参考 ledger CI 经验）。
- **CI**：Node 24、`npm ci`、lint（ESLint+Prettier）先本地跑绿再推。

## 12. 交付顺序（粗切，细化留给 writing-plans）

1. 脚手架 + Supabase schema/RLS/Storage/触发器 + 环境变量 + 部署管线打通（能登录、建一条、刷新看到）。
2. `lib/occasion.ts` + `lib/lunar.ts` + 全套单测（先纯逻辑，TDD）。
3. 首页 A + 详情 ② + 新建/编辑表单（类型切换、农历开关、里程碑区、实时预览、封面增改删）。
4. `/api/cal/[token].ics`（dated 展开 + 09:00 VALARM）+ 订阅入口 + token 重置。
5. 视觉打磨（对照 Claude/Apple 设计审查）+ PWA 装主屏 + 空态/错误态。
6. 测试补齐 + CI 绿 + 上线子域名。

## 13. 已解决的取舍一览

| 决策点 | 结论 | 依据 |
|---|---|---|
| 核心形态 | 混合（提醒+记录+倒数） | 用户选 D |
| 用户 | 纯单用户、需登录 | 用户选 A |
| 农历 | 公历为主、农历可选；**仅 anniversary** | 用户选 C + 审查收敛 |
| 提醒方式 | 导出/订阅系统日历（webcal，无推送） | 用户选 C |
| 记录内容 | 文字 + 一张封面图 | 用户选 B |
| 存储 | Supabase 云端 + 跨设备 | 用户选 B |
| 日子类型 | anniversary / since / until 全要 | 用户「全要」 |
| 里程碑 | 预设+自定义；**仅 since**；anniversary=周年+年龄 | 用户补充 + 审查收敛 |
| 首页版式 | A 近期聚焦 | 可视化伴侣 |
| 详情气质 | ② 编辑排版 | 可视化伴侣 |
| 配色 | Claude 暖白 `#FAF9F7` + 黏土 `#C96442` | 用户「照抄 Claude 可以」 |
| **日历事件** | **全部 dated 展开、不用 RRULE、当天 09:00 绝对提醒** | 审查（RRULE 只能午夜、2/29/mar1 表达难） |
| **archived** | **运行时派生、不落库** | 审查（避免双真相源） |
| **pinned** | **v1 删除** | 审查（悬空字段，YAGNI） |
| 2/29 平年 | 默认 2/28（可切 3/1），ICS 逐年忠实表达 | 领域核验 |
| 农历一年 0/1/2 次 | nextDate=拉平取最小；ICS 命中几条出几条；闰月延伸窗口 | 审查 |
| token | `gen_random_bytes(32)` hex（256-bit）；rotate 走 update-own | Supabase 核验 + 审查 |

## 14. 环境变量与部署清单

| 变量 | 位置 | 用途 |
|---|---|---|
| `VITE_SUPABASE_URL` | 前端（打包公开） | Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | 前端（打包公开） | anon key，受 RLS 约束 |
| `VITE_PUBLIC_BASE_URL` | 前端（打包公开） | app origin：拼 `emailRedirectTo`、给用户展示/复制 webcal 订阅链接 |
| `SUPABASE_URL` | **仅 serverless** | `/api/cal` 用 |
| `SUPABASE_SERVICE_ROLE_KEY` | **仅 serverless**（绝不带 VITE_ 前缀） | `/api/cal` 绕 RLS 读数据；泄露=全库钥匙 |
| `APP_HOST` | serverless（可由 base-url 推导） | 生成 `webcal://<host>/...` 与 VEVENT UID 域 |
| `APP_TZ`（常量 `Asia/Shanghai`） | serverless | VALARM 09:00→UTC 换算 |

- **CI stub**：注入 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_PUBLIC_BASE_URL` 假值，避免真实构建因缺 env 白屏（ledger 经验）。
- **Vercel**：前端 env（VITE_ 前缀）+ serverless env（service-role）分开配置；serverless 函数放 `/api/cal/[token].ts`。

---

## 附录：已核验技术事实（4 路并行 agent，均 high confidence）

> 完整原始结论见会话工作流 `anniversary-spec-research`（run `wf_0868c0d7-0a7`）；spec 又经 `anniversary-spec-review`（run `wf_0e39129d-a94`）3 视角审查收敛。

### A. webcal/.ics
- Vercel serverless 动态生成完整 VCALENDAR；本 spec 采用**全 dated 展开**（不用 RRULE），换取统一 09:00 提醒与简单的 2/29/农历处理。
- 全天事件 `DTSTART;VALUE=DATE` + `DTEND` 次日（排他）；VEVENT 必须 `UID`+`DTSTAMP`；CRLF + 75 字节折行 + 转义 → 用 `ical-generator` 别手拼。
- dated 事件可用**绝对 VALARM**（本地 09:00 = UTC−8h），观感优于 RRULE 的午夜相对触发。
- 刷新不可控（iOS 1–3h / Google 8–24h）；`X-PUBLISHED-TTL`/`REFRESH-INTERVAL` 只能放慢。
- token = capability URL：免登录、不可枚举、404 不 401、可 rotate、别放敏感文字、no-store。

### B. lunar-typescript（6tail v1.8.6，MIT，零依赖，带 .d.ts，实测）
- `Lunar.fromYmd(y, signedMonth, d).getSolar()`；闰月 = 负月份（非 isLeap 布尔）。
- 农历年整数 ≠ 目标公历年 → 扫 `[gy-1,gy,gy+1]` 过滤 `getYear()===gy`，返回数组（0/1/2 次）。
- 守卫：`LunarYear.getLeapMonth()`（不存在的闰月 throw）、`LunarMonth.getDayCount()`（短月无 30）。
- `toISOString()` 会在 UTC+8 挪错一天；一律 `getYear/getMonth/getDay` 拼。

### C. Supabase 单用户
- occasions RLS 4 条 `(select auth.uid()) = user_id`；covers **private** 桶 `(storage.foldername(name))[1] = auth.uid()::text` 4 条；profiles select/update own。
- `calendar_token`：`encode(gen_random_bytes(32),'hex')`（256-bit，比裸 uuid 抗枚举）。
- `/api/cal` service-role **必须手动 `.eq('user_id')`**；key 仅 serverless env。
- getSession `Promise.race` 超时→乐观渲染；`onAuthStateChange` 回调调 supabase 必 `setTimeout(fn,0)` 防死锁。

### D. 领域计算
- `CivilDate{y,m,d}` + `Date.UTC(..,12,..)` 正午锚点 + `Math.round` 天差；不混 UTC/本地午夜。
- 2/29 平年默认 2/28（可切 3/1）；`addMonthsClamped` 月末 clamp 不回弹。
- `completedMonths/Years` = 满周期截断（anchor-day 感知），非 `(y2-y1)*12+(m2-m1)`。
- `monthly` 里程碑按真实日历月非近似；`romantic`/里程碑仅 since；horizon 有上界。
