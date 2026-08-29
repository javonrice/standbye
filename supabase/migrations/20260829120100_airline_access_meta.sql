-- Additive: per-carrier travel access typing (home | zed | other). Legacy airline_access retained.
ALTER TABLE public.standby_profiles
  ADD COLUMN IF NOT EXISTS airline_access_meta jsonb NOT NULL DEFAULT '{}'::jsonb;
