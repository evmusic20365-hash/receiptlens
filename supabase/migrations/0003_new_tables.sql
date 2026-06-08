-- Run this in Supabase Dashboard → SQL Editor
-- Adds: price_history, watchlist, achievements, linked_accounts, loyalty_cards

-- ── price_history ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.price_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  receipt_id   uuid REFERENCES public.receipts(id) ON DELETE SET NULL,
  item_name    text NOT NULL,
  price        numeric(10,2) NOT NULL,
  store        text,
  category     text,
  scanned_at   timestamptz DEFAULT now()
);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_history: own rows" ON public.price_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_price_history_user_item ON public.price_history (user_id, item_name);
CREATE INDEX IF NOT EXISTS idx_price_history_user_date ON public.price_history (user_id, scanned_at DESC);

-- ── watchlist ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.watchlist (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_name             text NOT NULL,
  target_price          numeric(10,2),
  notifications_enabled boolean DEFAULT true,
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "watchlist: own rows" ON public.watchlist
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── achievements ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.achievements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  badge_name  text NOT NULL,
  unlocked_at timestamptz DEFAULT now(),
  UNIQUE(user_id, badge_name)
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "achievements: own rows" ON public.achievements
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── linked_accounts (Plaid) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.linked_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  bank_name         text,
  plaid_account_id  text,
  account_type      text,
  mask              text,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.linked_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "linked_accounts: own rows" ON public.linked_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── loyalty_cards ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  store_name  text NOT NULL,
  card_number text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.loyalty_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_cards: own rows" ON public.loyalty_cards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
