-- 003_auto_ingest.sql
--
-- 自动记账（2026-11-15）。需要**手动**在 Supabase Dashboard 的 SQL Editor 里跑一次，
-- 而且要在上线带「自动记账」的新版客户端之前跑。可以重复执行。
--
-- 做三件事：
--   1) transactions 加四列，记录自动入账的来源、来源里的唯一号、商户原名、是否待分类。
--   2) 新表 merchant_rules：商户归哪一类的记忆（用户改过一次类目就记住）。
--   3) 新表 ingest_tokens：个人令牌，给电脑同步工具和 iPhone 快捷指令调后端入口用。
--      只存 SHA-256，明文令牌只在生成时显示一次。
--
-- 老数据不受影响：手记的流水 source 为 NULL。

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── (1) transactions 加列 ──
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source       TEXT,
  ADD COLUMN IF NOT EXISTS external_id  TEXT,
  ADD COLUMN IF NOT EXISTS merchant     TEXT,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.transactions.source       IS '自动入账的来源：wechat / applepay / shot 等；手记为 NULL';
COMMENT ON COLUMN public.transactions.external_id  IS '来源里的唯一号（微信是交易号），配合 source 去重';
COMMENT ON COLUMN public.transactions.merchant     IS '商户原名（来源给的原文）';
COMMENT ON COLUMN public.transactions.needs_review IS '自动入账时没能确定类目，等用户看一眼';

-- 同一个来源的同一笔只能入账一次
CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_source_external_unique
  ON public.transactions (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

-- ── (2) merchant_rules ──
CREATE TABLE IF NOT EXISTS public.merchant_rules (
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_key TEXT        NOT NULL,
  category_id  UUID        NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, merchant_key)
);

COMMENT ON TABLE  public.merchant_rules IS '商户 → 类目的记忆，自动入账时优先用';
COMMENT ON COLUMN public.merchant_rules.merchant_key IS '归一后的商户名：去首尾空格、连续空白并成一个、转大写';

ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_rules: select own" ON public.merchant_rules;
DROP POLICY IF EXISTS "merchant_rules: insert own" ON public.merchant_rules;
DROP POLICY IF EXISTS "merchant_rules: update own" ON public.merchant_rules;
DROP POLICY IF EXISTS "merchant_rules: delete own" ON public.merchant_rules;
CREATE POLICY "merchant_rules: select own" ON public.merchant_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "merchant_rules: insert own" ON public.merchant_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "merchant_rules: update own" ON public.merchant_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "merchant_rules: delete own" ON public.merchant_rules FOR DELETE USING (auth.uid() = user_id);

-- ── (3) ingest_tokens ──
CREATE TABLE IF NOT EXISTS public.ingest_tokens (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash   TEXT        NOT NULL UNIQUE,
  label        TEXT        NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

COMMENT ON TABLE  public.ingest_tokens IS '自动记账的个人令牌（只存哈希）';
COMMENT ON COLUMN public.ingest_tokens.token_hash IS '明文令牌的 SHA-256（十六进制小写）';

CREATE INDEX IF NOT EXISTS idx_ingest_tokens_user ON public.ingest_tokens (user_id);

ALTER TABLE public.ingest_tokens ENABLE ROW LEVEL SECURITY;

-- 用户只能看、建、删自己的令牌；不给 UPDATE（last_used_at 由后端入口用 service role 写）
DROP POLICY IF EXISTS "ingest_tokens: select own" ON public.ingest_tokens;
DROP POLICY IF EXISTS "ingest_tokens: insert own" ON public.ingest_tokens;
DROP POLICY IF EXISTS "ingest_tokens: delete own" ON public.ingest_tokens;
CREATE POLICY "ingest_tokens: select own" ON public.ingest_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ingest_tokens: insert own" ON public.ingest_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ingest_tokens: delete own" ON public.ingest_tokens FOR DELETE USING (auth.uid() = user_id);

COMMIT;
