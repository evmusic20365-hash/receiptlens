-- Run in Supabase Dashboard → SQL Editor

-- ── Fix: plaid_account_id needs a UNIQUE constraint for upsert to work ────────
-- (The upsert in exchange-token uses onConflict: "plaid_account_id")
ALTER TABLE public.linked_accounts
  ADD CONSTRAINT IF NOT EXISTS linked_accounts_plaid_account_id_key
  UNIQUE (plaid_account_id);

-- ── spending_alerts: AI overpayment analysis results ─────────────────────────
CREATE TABLE IF NOT EXISTS public.spending_alerts (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid         REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  merchant      text,
  category      text,
  avg_amount    numeric(10,2),
  cheaper_store text,
  cheaper_price numeric(10,2),
  savings_pct   integer,
  suggestion    text,
  analyzed_at   timestamptz  DEFAULT now()
);

ALTER TABLE public.spending_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spending_alerts: own rows" ON public.spending_alerts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_spending_alerts_user
  ON public.spending_alerts (user_id, analyzed_at DESC);
