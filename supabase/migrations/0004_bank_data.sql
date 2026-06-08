-- Run this in Supabase Dashboard → SQL Editor

-- ── Extend linked_accounts with Plaid fields ──────────────────────────────────
ALTER TABLE public.linked_accounts
  ADD COLUMN IF NOT EXISTS plaid_access_token  text,
  ADD COLUMN IF NOT EXISTS plaid_item_id        text,
  ADD COLUMN IF NOT EXISTS plaid_cursor         text,
  ADD COLUMN IF NOT EXISTS last_synced_at       timestamptz,
  ADD COLUMN IF NOT EXISTS mask                 text;

-- ── bank_transactions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid    REFERENCES auth.users(id)          ON DELETE CASCADE NOT NULL,
  account_id          uuid    REFERENCES public.linked_accounts(id) ON DELETE CASCADE,
  plaid_txn_id        text    UNIQUE,
  amount              numeric(10,2) NOT NULL,        -- positive = debit, negative = credit
  merchant            text,
  plaid_category      text[],
  normalized_category text,
  date                date    NOT NULL,
  pending             boolean DEFAULT false,
  matched_receipt_id  uuid    REFERENCES public.receipts(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_txns: own rows" ON public.bank_transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bank_txns_user_date  ON public.bank_transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_txns_user_merch ON public.bank_transactions (user_id, merchant);
CREATE INDEX IF NOT EXISTS idx_bank_txns_account    ON public.bank_transactions (account_id);
