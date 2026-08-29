-- Mirror: standby_profiles.airline_access_meta
ALTER TABLE public.standby_profiles
  ADD COLUMN IF NOT EXISTS airline_access_meta jsonb NOT NULL DEFAULT '{}'::jsonb;
