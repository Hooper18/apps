# 纪念日 App 设计文档（Design Spec）

- 日期：2026-07-01
- 工作名：**纪念**（repo 暂定 `jinian-app`，子域名暂定 `jinian.tuchenguang.com`，均可后续改名）
- 状态：设计定稿（经可视化伴侣定视觉 + 4 路技术核验 + 3 视角审查 + 跨机型/推送机制 2 轮核验），待写实现计划（writing-plans）

> **重大修订（据「vivo 一定要做好提醒」的硬需求 + 跨机型核验）**：提醒方式从「导出/订阅系统日历（webcal）」**改为「Capacitor 本地通知」**。原因：国产安卓（vivo/小米/华为）自带日历**不支持订阅外部日历链接**，且服务器 Web Push（FCM 系）在国行安卓**基本不通**（华为无 GMS、vivo/小米无可用 GMS + FCM 被墙）。经核验，唯一在 vivo/小米/华为「app 关着也能到点响」且不碰谷歌/跨境的可靠机制，是**在设备本地用 AlarmManager 排程的本地通知**（作者已有 Capacitor→APK 管线，schedule-app 同款）。详见 §8 与附录 E/F。

---

## 1. 这是什么 / 目标

一个**纯自己用**的纪念日 App，记录「对人重要的日子」。混合型：一个日子既能**倒数/正数**、又能**记录**（一段文字 + 一张封面图）、又能**提醒**（app 本地通知，到点弹）。

三条成功标准：

1. 打开就能一眼看到「最近要到的日子」和各种日子的天数。
2. 到了日子（或提前 N 天）**手机能可靠弹提醒**——尤其在 **vivo**（作者主力机），其次小米/华为，即使 app 关着也能响。
3. 视觉达到「像 Claude web 端一样优雅」的产品感，而非 demo 感。

## 2. 非目标（YAGNI，明确不做）

- ❌ **服务器远程推送 / Web Push（FCM）/ 厂商推送 SDK**：国行安卓不通或过度工程（附录 E/F）。提醒走**设备本地通知**。
- ❌ **导出/订阅系统日历（webcal/.ics）**：国产安卓自带日历不支持订阅，价值有限；移除整套 serverless `/api/cal`、`calendar_token`、`profiles`。
- ❌ **iPhone 可靠提醒（v1 不做）**：iPhone 次要，v1 先做好安卓。iPhone 用网页/PWA **只读查看**，提醒不保证。iOS 提醒（Capacitor iOS 原生本地通知，或 PWA+APNs Web Push）留作 v1.1 快速跟进。
- ❌ **多人 / 共享 / 协作**：纯单用户。仍带 `user_id` + RLS（零成本防手滑），但无分享 UI。
- ❌ **多张照片 / 相册**：每个日子只有一张封面图。
- ❌ **暗色模式**（v1 不做，颜色走 CSS 变量，v1.1 低成本可加）。
- ❌ 复杂重复规则（每周/每两年/自定义 RRULE）；置顶（pinned）；农历 since/until（农历仅每年循环用）。

## 3. 技术栈与部署拓扑

核心是一个 React+Vite web app，用 **Capacitor 包成安卓原生 app**（复用 schedule-app 的 Capacitor 配置与 keystore）：

| 层 | 选型 |
|---|---|
| 前端 | Vite + React 18 + TypeScript（strict） |
| 样式 | CSS 变量；遵循全局设计规范（暖白 / 单一强调色 / 无渐变无阴影 / 1px 极淡边框） |
| 原生壳 | **Capacitor**（Android，复用 schedule-app 管线与 `.keystores-backup` 签名）；iOS v1 不打 |
| 提醒 | **`@capacitor/local-notifications`**（设备本地 AlarmManager 排程，见 §8） |
| 后端 | Supabase：Auth（magic-link）+ Postgres + Storage（**仅数据/认证/图片，不参与提醒投递**） |
| 农历 | `lunar-typescript`（6tail，MIT，零依赖，自带 .d.ts） |
| Web 版部署 | Vercel + 子域名（只读查看 + iPhone 用）；无 serverless 函数 |
| 安卓分发 | Capacitor 出 sideload APK（不上应用商店），复用现有 keystore 备份 |

**独立仓**：本项目作为嵌套独立 git 仓，登记进工作区根 `.gitignore`，自己的 remote 部署（参考仓库既有 side-project 拓扑）。

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

- 顶部**大卡**突出「最近要到的一个日子」：封面图 + 顶部渐隐深色 scrim + 大倒数数字。
- 下面**紧凑列表**：小圆封面缩略图 + 标题/副标题 + 右侧天数。
- 「回忆」分区：`until` 已过期（运行时 `daysBetween<0`）折叠于此。
- 排序：默认按「下一关键日距今天数」升序（无 pinned）。
- 右上角 `＋` 新建。

### 4.2 详情页 —「编辑排版」（版式 ②）

- 顶部返回 + `···`（编辑/删除）。
- 封面**框图**（圆角 14）；无封面时占位（`--bg-tertiary` + 标题首字），不留破图。
- 标题 + 起点/日期副标题。
- **克制内联数字**（如「已经 **1024** 天」），强调色只落在数字。
- **里程碑区**（仅 `since`）：下一个里程碑 + 已达成列表。
- 那段文字（细排版，hairline 分割）。
- 元信息行：类型 / 日历（公历·农历 X 月 X 日）/ 提醒（当天·提前 N 天）。

### 4.3 新建/编辑表单（编辑排版风格）

- **封面**：空态「＋ 添加封面照片」；已有封面点击可替换、提供「移除封面」（同时删 Storage 对象）。
- 名字。
- **类型分段控件**：`每年循环` / `累加计天` / `倒数到某天`。
- **日期行** + **农历开关**（仅每年循环可用）：打开后实时提示「农历 X 月 X 日 · 今年对应公历 …」。
- 类型=`累加(since)` 时显示**里程碑区**（预设 chips + 自定义「第 N 天」）。
- **提醒** chips（多选）：当天 / 提前 1 天 / 3 天 / 1 周（默认：当天 + 提前 1 天）。提醒在**每天 09:00**（Asia/Shanghai，v1 固定，可后续做全局设置）弹。
- 「写点什么」多行文本。
- 底部**实时预览**：显示它在首页那一行的样子。

## 5. 数据模型

三种「日子」类型 = 单一 `kind` 枚举。

| kind | 含义 | 显示 | 日期字段语义 | 农历 | 里程碑 |
|---|---|---|---|---|---|
| `anniversary` | 每年循环（生日/周年） | 距下次 N 天 + 第 N 周年/N 岁 | 出生/首次那天 | ✅ 可选 | 周年+年龄（自动） |
| `since` | 从过去累加 | 已经 N 天 + 里程碑 | 起点 | ❌ | ✅ 可配 |
| `until` | 一次性倒数 | 还有 N 天，过期归回忆 | 目标日 | ❌ | ❌ |

### 表 `occasions`（唯一业务表）

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
  remind_days   int[]  not null default '{0,1}',            -- 提前几天，0=当天；驱动本地通知排程
  milestones    jsonb  not null default '{"hundreds":true,"thousand":true}'::jsonb,
  leap_fallback text   not null default 'feb28' check (leap_fallback in ('feb28','mar1')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint lunar_only_anniversary check ( (not lunar) or (kind = 'anniversary') )
);
alter table public.occasions enable row level security;

-- updated_at 自动刷新
create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists occasions_set_updated_at on public.occasions;
create trigger occasions_set_updated_at before update on public.occasions
  for each row execute function public.set_updated_at();
```

- **不再需要 `profiles` 表 / `calendar_token`**（webcal 订阅已移除）。
- **`archived` 不落库**：由运行时 `computeOccasion` 的 `daysBetween<0`（仅 `until`）派生，单一真相源。
- **`lunar=true` 权威来源**是 `(lunar_month, lunar_day, lunar_is_leap)`，每次运算按目标公历年重算（§7）。`date` 仅存创建时换算的公历基准，用于排序/兜底。
- **`milestones` 解析**：缺省键按 `false`；列默认 `{"hundreds":true,"thousand":true}`；仅 `kind=since` 读取；非法组合静默忽略。

### RLS（occasions ×4 + storage ×4）

```sql
create policy occasions_select_own on public.occasions for select to authenticated
  using ( (select auth.uid()) = user_id );
create policy occasions_insert_own on public.occasions for insert to authenticated
  with check ( (select auth.uid()) = user_id );
create policy occasions_update_own on public.occasions for update to authenticated
  using ( (select auth.uid()) = user_id ) with check ( (select auth.uid()) = user_id );
create policy occasions_delete_own on public.occasions for delete to authenticated
  using ( (select auth.uid()) = user_id );

-- covers 私有桶（先建桶 public=false）
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

- 桶 `covers`（**private**）。路径固定 `{user_id}/{id}.jpg`（覆盖式，替换不产生孤儿）。
- App 内 `createSignedUrl` 显示；上传前 canvas 压缩（最长边 ≤1600px、JPEG ≈0.8）。
- 删除 occasion / 移除封面时**显式** `storage.from('covers').remove([cover_path])`（cascade 不清 Storage）。
- 签名 URL 用 `?v={updated_at}` 缓存击穿。

## 6. 领域计算 `lib/occasion.ts`（纯函数，最该被测）

**铁律**：全部用 `CivilDate {y,m,d}` + `Date.UTC(y,m-1,d,12)` 正午锚点做整数天差、`Math.round`。**绝不**混用 `new Date('YYYY-MM-DD')`（UTC 午夜）与 `new Date(y,m,d)`（本地午夜）；**绝不** `toISOString()` 存/显示日期。

```ts
type LeapFallback = 'feb28' | 'mar1';
type OccasionKind = 'anniversary' | 'since' | 'until';

isLeap(y) / daysInMonth(y,m)
diffDays(a, b): number                    // Math.round((UTC(b)-UTC(a))/86400000)
addDays(c, n) / addMonthsClamped(c, n)    // Jan31+1月->Feb28，不回弹
anchorInYear(anchor, year, fb)            // 2/29 平年落 2/28 或 3/1
nextAnniversaryDateSolar(anchor, today, fb)
nextAnniversaryDateLunar(spec, today)     // 见 §7，可能 null
completedMonths(from, to) / completedYears(from, to)  // 满周期截断，anchor-day 感知
computeOccasion(o, today): OccasionState
```

`OccasionState`：`since`→`daysBetween=已过(≥0)`,`years/months`,`nextDate=null`；`until`→`daysBetween=剩余(可负→归回忆)`,`nextDate=目标`；`anniversary`→`daysBetween=距下次`,`years=周岁`,`nextDate=下次(公/农历分支)`。

**边界**：闰年 2/29 平年默认 2/28（可切 mar1）；`completedMonths` 按「日到没到锚点日(目标月 clamp)」判断，2/15→3/14=0、3/15=1；「今天到达」= 单独 `isToday` 态。

### 里程碑（**仅 `since`**）

```jsonc
{ "hundreds": true, "thousand": true, "monthly": false, "romantic": false, "customDays": [888] }
```

- `expandMilestones(o, today, horizonDays)`：仅 since，起点+偏移天数展开、去重、升序、标 `isNext`；`monthly` 用 `addMonthsClamped`（真实日历月，非 30 天近似）；`horizon` 有上界；`customDays` 去重/clamp。
- `expandAnniversaryMilestones(anchor, today, fb, maxYears)`：复用 `Milestone` 类型，`dayOffset=null`，label「第 N 周年 / N 岁」。
- `romantic`/`monthly` 仅 since；非法组合静默忽略。

## 7. 农历 `lib/lunar.ts`（`lunar-typescript`，仅 anniversary）

- 闰月 = **负月份**：`Lunar.fromYmd(y, isLeap ? -Math.abs(m) : m, d).getSolar()`。
- **一个公历年可能命中 0/1/2 次**：`lunarToSolarInYear(spec, gYear)` 扫 `[gYear-1, gYear, gYear+1]`，过滤 `solar.getYear()===gYear`，返回升序数组。
- 守卫：闰月先 `LunarYear.fromYear(ly).getLeapMonth()===Math.abs(m)` 再 try/catch（不存在的闰月 throw）；短月用 `LunarMonth.fromYm(ly, signedMonth).getDayCount()`。
- 输出 `new Date(getYear, getMonth-1, getDay)` 或 `{y,m,d}`，**绝不** `toISOString()`。
- **下次发生日**：从 today 起把 `[gy, gy+1, …]` 全部命中拉平、过滤 `>today`、取最小；窗口 **25 年**（闰月间隔可达 ~19 年）；无命中返回 `null`，UI 诚实显示「下次在 YYYY 年」。

## 8. 提醒投递 `lib/reminders.ts` + Capacitor 本地通知（核心）

> **机制**：纯设备本地、零后端参与。app 用 `@capacitor/local-notifications` 把「未来的提醒」逐条排进系统 **AlarmManager**；到点由**系统**（不是 app 进程）弹通知，因此 **app 关闭 / 进程被杀 / 无网络都能响**——这是本地闹钟相对「后台轮询 / FCM 推送」的根本优势，也是国行安卓（含无 GMS 的华为）唯一可靠的路（附录 E/F）。Supabase 只是数据真源，**不参与投递**。

### 8.1 排程逻辑（纯函数 `computeReminderTimes`，可测）

输入全部 occasions + 今天 → 输出一个**按时间升序、去重、截断到最近 N 条**的通知列表 `{ at: Date(本地时刻), title, body, occasionId }[]`：

1. 对每个 occasion 取其未来关键日期：
   - `anniversary`：未来窗口内的下次发生日（公历/农历，可多年）。
   - `since`：`expandMilestones` 里 `isNext` 及其后若干个里程碑日期。
   - `until`：目标日（未过期时）。
2. 对每个关键日期 × 每个 `remind_days` 偏移 d → 提醒时刻 = `(关键日 − d 天) 当天 09:00`（Asia/Shanghai）。
3. 过滤未来、按时间升序、去重、**截断到最近 64 条**（iOS 硬上限 64；Android 也用同一上界，够个人 app 覆盖数月~数年）。
4. `title` = occasion 标题；`body` = 「今天是…」/「还有 N 天」/「满 1000 天」等；点击 deep-link 回 app 对应详情。

### 8.2 接入 Capacitor（落地要点，含 schedule-app 现存坑）

- **首启权限**：`LocalNotifications.requestPermissions()`（Android 13+ 的 `POST_NOTIFICATIONS`）。
- **精确闹钟**（决定「准不准点」）：在 `android/app/src/main/AndroidManifest.xml **显式加**：
  - `<uses-permission android:name="android.permission.USE_EXACT_ALARM"/>`（sideload APK 安装即授予、免弹窗、纪念日属允许类目）
  - 兜底 `<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>`（Android 12/13）
  - ⚠️ **schedule-app 现在缺这两条**，导致 Android 12+ 静默降级成不精确闹钟、到点漂移几十分钟——本项目必须补上。
- 所有 `schedule()` 带 **`allowWhileIdle: true`**（穿透 Doze）。
- **重排模型**：app 每次打开/回前台 → 从 Supabase 全量拉取 → `cancel` 全部 pending → 按 §8.1 重排（复用 schedule-app 的 syncNotifications 模式）。天然解决「跨设备新增的日子让本机重排」+「iOS 64 上限」+「改了日子提醒同步」。
- **开机重排**：插件自带 `RECEIVE_BOOT_COMPLETED` receiver，无需另配。
- **启动复查**：`checkExactNotificationSetting()`；用户若在系统里关了精确闹钟，重排。
- **不做后台定期同步**（国行安卓不可靠且本地闹钟不需要）：靠「打开即重排 + 通知 deep-link 引导回 app」。

### 8.3 OEM 保活引导（决定性，做成一个真功能页）

vivo/小米/华为的后台清理会杀掉排程/压制通知——**这是「可靠」与否的决定因素，代码解决不了**，必须引导用户手动开：

- 一个「让提醒更准时」引导页，按机型（vivo/小米/华为/其他）给图文步骤：**自启动放行 + 电池设为不受限/不优化 + 最近任务锁定 app + 通知权限（横幅/锁屏/勿扰白名单）**。
- 一个「**发送测试提醒**」按钮：~10 秒后弹一条本地通知，让用户当场验证生效。
- dontkillmyapp 排名参考：华为#1、小米#2 最凶；**vivo #11 相对温和**（对作者主力机是利好）。

### 8.4 iPhone（v1 只读）

iPhone 用 Web/PWA **查看**，v1 **不保证提醒**（次要）。v1.1 可选：Capacitor iOS 原生本地通知（需 Mac + Apple 开发者账号），或 PWA + APNs Web Push（APNs 在国内可达，需加主屏 + 后端 VAPID + 容错订阅失效）。

## 9. 认证

- **magic-link**：`signInWithOtp({ email, options:{ emailRedirectTo } })`。纯自用 → 关闭公开注册 / 邮箱 allowlist 只放行本人。
- **Capacitor 内回跳**：magic-link 回调走 deep link（自定义 scheme / App Links）交换 session（复用 schedule-app 的 Supabase-in-Capacitor 认证模式）。
- **焊入 schedule-app 教训**：`getSession()` 用 `Promise.race([getSession(), 3s 超时])` → 超时先乐观渲染（不卡转圈、超时≠未登录）；`onAuthStateChange` 拿到真 session 再纠正；**回调内任何 supabase 调用必 `setTimeout(fn,0)` 防死锁**。
- 前端只用 anon key（受 RLS 约束；**无 service-role**，因为没有 serverless）。

## 10. 错误处理与边界

- 农历某年无命中（闰月/短月）：`lunarToSolarInYear` 返回空；「下次」诚实显示未来年份，提醒排到那时。
- 图片上传失败/超限：压缩后再传；失败 toast 可重试（参考 ledger toast 规范）。
- `until` 过期：运行时 `daysBetween<0` 归「回忆」，可编辑目标日改回。
- 通知权限被拒 / 精确闹钟被关：引导页明确提示 + 「发送测试提醒」自检；降级到不精确闹钟仍能响（只是可能漂移）。
- 空态：首页引导「记下第一个重要的日子」。
- 封面缺失：纯色占位（`--bg-tertiary` + 标题首字）。

## 11. 测试策略

- **纯函数**（vitest 重点，TDD）：
  - `lib/occasion.ts`：`diffDays` 时区不差一天；2/29 平年 feb28/mar1；`completedMonths` 2/15→3/14=0、3/15=1；1/31→2/28；`addMonthsClamped` 不回弹；里程碑（仅 since）展开/去重/`isNext`/`isToday`。
  - `lib/lunar.ts`：`(8,15,false)@2026→[9/25]`；`(12,1,false)@2024→[1/10,12/30]`（一年两次）；`(2,1,true)@2024→[]`；`(9,30,false)@2024→[]`；下次跨 ~19 年闰月。
  - `lib/reminders.ts`（`computeReminderTimes`）：09:00 本地时刻；`remind_days` 偏移；三类型关键日期正确；里程碑/农历并入；升序去重；**截断到 64**；跨设备数据变化后重排结果幂等。
- **Capacitor 集成/手动**：权限申请流；打开即重排；精确闹钟权限存在性；**真机矩阵手测**（vivo 重点 + 小米/华为）：保活设置后「发送测试提醒」+ 到点提醒到达。
- **组件/交互**（Testing Library）：类型切换改字段语义；农历开关仅 anniversary；里程碑区仅 since；封面替换/移除；OEM 引导页按机型渲染。
- **e2e**（Playwright，web 版）：新建三类型 → 首页/详情正确；CI 注入 stub `VITE_SUPABASE_*` + base-url 防真实构建白屏。
- **CI**：Node 24、`npm ci`、lint（ESLint+Prettier）先本地跑绿再推。

## 12. 交付顺序（粗切，细化留给 writing-plans）

1. 脚手架 + Supabase schema/RLS/Storage/触发器 + 环境变量 + **Capacitor Android 壳打通**（复用 schedule-app 配置/keystore）+ magic-link 登录。
2. `lib/occasion.ts` + `lib/lunar.ts` + 全套单测（先纯逻辑，TDD）。
3. 首页 A + 详情 ② + 新建/编辑表单（类型切换、农历开关、里程碑区、实时预览、封面增改删）。
4. `lib/reminders.ts`（`computeReminderTimes`）+ Capacitor 本地通知接入 + **manifest 精确闹钟权限** + syncNotifications 重排 + 首启权限申请。
5. **OEM 保活引导页 + 「发送测试提醒」** + 视觉打磨（对照 Claude/Apple 审查）+ 空错态。
6. 测试补齐 + CI 绿 + **真机验证（vivo 重点）** + 出 APK + web 版上线子域名。

## 13. 已解决的取舍一览

| 决策点 | 结论 | 依据 |
|---|---|---|
| 核心形态 | 混合（提醒+记录+倒数） | 用户选 D |
| 用户 | 纯单用户、需登录 | 用户选 A |
| 农历 | 公历为主、可选；**仅 anniversary**（DB CHECK） | 用户选 C + 审查 |
| **提醒机制** | **Capacitor 本地通知（设备本地 AlarmManager）** | 跨机型+推送 2 轮核验 |
| ~~webcal 订阅~~ | **移除**（国产安卓自带日历不支持订阅） | 跨机型核验 |
| ~~服务器 Web Push/FCM~~ | **否**（华为无 GMS、vivo/小米 FCM 被墙不通） | 推送核验 high |
| ~~厂商推送 SDK~~ | **否**（vivo/OPPO 要企业账号+上架，过度工程） | 推送核验 |
| 平台 | **v1 安卓优先（vivo 重点）**；iPhone 网页只读，提醒 v1.1 | 用户「iPhone 次要」 |
| 记录内容 | 文字 + 一张封面图 | 用户选 B |
| 存储 | Supabase 云端 + 跨设备（仅数据/图片/认证） | 用户选 B |
| 日子类型 | anniversary / since / until 全要 | 用户「全要」 |
| 里程碑 | 预设+自定义；**仅 since**；anniversary=周年+年龄 | 用户 + 审查 |
| 首页/详情/配色 | A 近期聚焦 / ② 编辑排版 / Claude 暖白 `#FAF9F7`+黏土 `#C96442` | 可视化伴侣 |
| archived / pinned | archived 运行时派生不落库；pinned 删除 | 审查 |
| 精确闹钟 | manifest 加 `USE_EXACT_ALARM`（修 schedule-app 现存漂移坑） | 本地通知核验 |
| 提醒时刻 | 每天 09:00（Asia/Shanghai，v1 固定） | 设计选择 |

## 14. 环境变量与部署清单

| 变量 | 位置 | 用途 |
|---|---|---|
| `VITE_SUPABASE_URL` | 前端（打包公开） | Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | 前端（打包公开） | anon key，受 RLS 约束 |
| `VITE_PUBLIC_BASE_URL` | 前端（打包公开） | app origin：拼 magic-link `emailRedirectTo`（Capacitor 内为 deep link scheme） |
| `APP_TZ`（常量 `Asia/Shanghai`） | 前端 | 09:00 提醒时刻计算 |

- **无 service-role key、无 serverless**（webcal 移除后不需要）。
- **CI stub**：注入 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_PUBLIC_BASE_URL` 假值防白屏。
- **Capacitor**：复用 schedule-app 的 `capacitor.config`、Android 工程与 `.keystores-backup` 签名；APK sideload 分发。

---

## 附录：核验结论（多路并行 agent，均 high/medium confidence）

> 工作流：`anniversary-spec-research`（4 路技术核验）、`anniversary-spec-review`（3 视角审查）、`calendar-delivery-cross-oem`（4 机型）、`push-mechanism-cn-android`（3 路推送机制）。

### A. 农历 lunar-typescript（6tail v1.8.6，MIT，零依赖，带 .d.ts，实测）
- 闰月=负月份（非 isLeap 布尔）；农历年整数≠目标公历年 → 扫 `[gy-1,gy,gy+1]` 过滤 `getYear()===gy`，返回数组（0/1/2 次）；守卫 `getLeapMonth()`/`getDayCount()`；`toISOString()` 会 UTC+8 挪错一天。

### B. 领域计算
- `CivilDate{y,m,d}`+`Date.UTC(..,12,..)`+`Math.round`；2/29 平年默认 2/28；`addMonthsClamped` 不回弹；`completedMonths/Years`=满周期截断；`monthly` 按真实日历月；`romantic`/里程碑仅 since。

### C. Supabase 单用户
- occasions RLS 4 条 `(select auth.uid())=user_id`；covers **private** 桶 `(storage.foldername(name))[1]=auth.uid()::text` 4 条；auth `getSession` 超时乐观渲染 + `onAuthStateChange` 回调 `setTimeout(fn,0)` 防死锁；前端仅 anon key。

### D. 跨机型日历订阅（为何移除 webcal）
- iPhone 原生支持订阅 webcal（但需手动开「订阅日历事件提醒」开关）；**vivo 自带日历无订阅入口、导入也不行**；小米 HyperOS 入口被隐藏/不可靠；**华为无订阅、无 GMS，纯血鸿蒙连第三方 app 都装不了**（`unreliable`）。→ 系统日历路线在国产安卓走不通。

### E. 服务器 Web Push / FCM（为何否掉）
- Web Push（含 TWA）传输走 FCM，依赖设备端 GMS + 连通 Google FCM 服务器；国行 **华为无 GMS 全断、vivo/小米无可用 GMS 且 FCM 被墙**，app 关着投递必败（`broken`，high confidence）。iOS PWA Web Push 走 APNs 国内可达，但需加主屏+订阅易失效（留 v1.1）。

### F. Capacitor 本地通知（选定机制，high confidence）
- 设备本地 AlarmManager 排程，**系统投递**，app 关闭/杀进程/无网都能响，不碰 FCM/GMS/跨境（华为也能用）。
- 必加 `USE_EXACT_ALARM`（+`SCHEDULE_EXACT_ALARM` 兜底），否则静默降级不精确（schedule-app 现存坑）；`allowWhileIdle:true`；插件自带开机重排；iOS 64 条上限 → 打开即滚动重排最近 64。
- 决定性变量是 **OEM 保活/通知权限**（华为#1/小米#2 最凶、vivo #11 温和），须首启引导用户手动放行 + 「发送测试提醒」自检。
- 厂商远程推送（小米/vivo/华为 SDK、个推/极光）对纯倒数需求属过度工程（vivo/OPPO 要企业账号+上架），不做。
