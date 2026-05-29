-- 002_transfer_direction_and_check_repair.sql
--
-- 修两件事，必须**手动**在 Supabase Dashboard 的 SQL Editor 里跑一次。
-- （生产 schema 跟 001_initial_schema.sql 已漂移；这个文件就是把它修齐 + 加新列。）
--
-- 背景：
--   1) 生产的 transactions_type_check / categories_type_check 实际不允许
--      'transfer'（001 写的是允许，但生产部署时 transfer 还没有这个值，
--      后来加进代码但没有把 DB 的 CHECK 同步上去）。
--      症状：用户记一笔转账 → 23514 check_violation
--             constraint "transactions_type_check"。
--      同理 seed 转账类目也会撞 categories_type_check。
--   2) 用户要求转账可选「转入(+)」/「转出(-)」，给 transactions 加一列
--      direction TEXT，老数据 NULL 视为转入（兼容当前 + 行为）。
--
-- 跑完后：客户端代码已经准备好这些字段，无需再做别的。

BEGIN;

-- ── (1) 把过时的 type CHECK 重建为 ('expense','income','transfer') ──
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions
  ADD  CONSTRAINT transactions_type_check
       CHECK (type IN ('expense', 'income', 'transfer'));

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_type_check;
ALTER TABLE public.categories
  ADD  CONSTRAINT categories_type_check
       CHECK (type IN ('expense', 'income', 'transfer'));

-- ── (2) 给 transactions 加 direction 列 ──
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS direction TEXT
  CHECK (direction IS NULL OR direction IN ('in', 'out'));

COMMENT ON COLUMN public.transactions.direction
  IS '转账方向：in=转入(+), out=转出(-); NULL 视为 in（兼容老数据）。仅 type=transfer 时使用。';

COMMIT;
