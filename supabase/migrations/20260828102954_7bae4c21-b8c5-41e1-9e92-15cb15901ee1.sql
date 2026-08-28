ALTER TABLE public.standby_profiles
  ADD COLUMN IF NOT EXISTS pain_point text,
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'partners',
  ADD COLUMN IF NOT EXISTS free_day_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_optin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coach_seen text[] NOT NULL DEFAULT '{}'::text[];