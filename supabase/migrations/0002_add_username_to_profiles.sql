-- Run this in the Supabase Dashboard → SQL Editor
-- Adds the username column collected during onboarding

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE;
