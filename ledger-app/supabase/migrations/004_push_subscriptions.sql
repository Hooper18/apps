-- 004_push_subscriptions.sql
--
-- 付款提醒（2026-11-15）。需要**手动**在 Supabase Dashboard 的 SQL Editor 里跑一次，
-- 在上线带「付款提醒」开关的客户端之前跑。可以重复执行。
--
-- 一张表：每台开了提醒的设备一行，存浏览器给的推送地址和两把钥匙。
-- 自动入账时，后端入口（Edge Function ingest）给这个用户的每一行发一条推送。
-- 这三样东西只能用来「给这台设备发通知」，不能读任何数据。

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL UNIQUE,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  label      TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.push_subscriptions IS '付款提醒的推送订阅，每台设备一行';
COMMENT ON COLUMN public.push_subscriptions.endpoint IS '推送服务给这台设备的地址（Apple / Google / Mozilla）';
COMMENT ON COLUMN public.push_subscriptions.p256dh   IS '设备的公钥，加密推送内容用';
COMMENT ON COLUMN public.push_subscriptions.auth     IS '设备给的认证密钥，加密推送内容用';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions: select own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions: insert own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions: update own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions: delete own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: select own" ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_subscriptions: insert own" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_subscriptions: update own" ON public.push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "push_subscriptions: delete own" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

COMMIT;
