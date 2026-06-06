-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ankzgmyrdbkraxftikht/sql

CREATE TABLE IF NOT EXISTS receipts (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  store_name    text,
  receipt_date  text,
  items         jsonb,
  total         numeric,
  image_base64  text
);

CREATE TABLE IF NOT EXISTS analyses (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id       uuid        REFERENCES receipts(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now(),
  leaks            jsonb,
  total_found      numeric,
  yearly_potential numeric,
  score            integer
);

-- Enable RLS and allow the anon key to read/write (demo — no auth required)
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON receipts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON analyses FOR ALL TO anon USING (true) WITH CHECK (true);
