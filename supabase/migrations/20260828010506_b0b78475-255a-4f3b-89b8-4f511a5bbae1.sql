-- AirCue standby decision engine: accounts, standby profile, plans, options,
-- reported loads, plan watches and meaningful-change events.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.standby_profiles (
  user_id uuid PRIMARY KEY,
  home_airline text NOT NULL DEFAULT 'UA',
  traveler_type text NOT NULL DEFAULT 'employee',
  airline_access text[] NOT NULL DEFAULT ARRAY['home']::text[],
  home_airports text[] NOT NULL DEFAULT '{}'::text[],
  notify_mode text NOT NULL DEFAULT 'meaningful',
  onboarded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.standby_profiles TO authenticated;
GRANT ALL ON public.standby_profiles TO service_role;
ALTER TABLE public.standby_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own standby profile" ON public.standby_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  origin_iata text NOT NULL,
  dest_iata text NOT NULL,
  travel_date date NOT NULL,
  travelers smallint NOT NULL DEFAULT 1,
  cabin text NOT NULL DEFAULT 'any',
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plans" ON public.plans FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS plans_user_created_idx ON public.plans (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.plan_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rank smallint NOT NULL DEFAULT 1,
  kind text NOT NULL DEFAULT 'nonstop',
  label text NOT NULL DEFAULT 'mixed',
  confidence text NOT NULL DEFAULT 'medium',
  score smallint NOT NULL DEFAULT 0,
  carrier text,
  flight_number text,
  flight_label text NOT NULL,
  origin_iata text NOT NULL,
  dest_iata text NOT NULL,
  sched_dep_utc timestamptz,
  sched_arr_utc timestamptz,
  dep_local text,
  arr_local text,
  headline text NOT NULL DEFAULT '',
  pillars jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  recovery jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_options TO authenticated;
GRANT ALL ON public.plan_options TO service_role;
ALTER TABLE public.plan_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plan options" ON public.plan_options FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS plan_options_plan_idx ON public.plan_options (plan_id, rank);

CREATE TABLE IF NOT EXISTS public.reported_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  flight_label text NOT NULL,
  travel_date date NOT NULL,
  open_seats smallint,
  standbys smallint,
  cabin text NOT NULL DEFAULT 'economy',
  source text NOT NULL DEFAULT 'employee_system',
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reported_loads TO authenticated;
GRANT ALL ON public.reported_loads TO service_role;
ALTER TABLE public.reported_loads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own loads" ON public.reported_loads FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS reported_loads_lookup_idx
  ON public.reported_loads (user_id, flight_label, travel_date, checked_at DESC);

CREATE TABLE IF NOT EXISTS public.watch_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_option_id uuid NOT NULL REFERENCES public.plan_options(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'meaningful',
  state text NOT NULL DEFAULT 'active',
  verdict text NOT NULL DEFAULT 'steady',
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  unseen_changes smallint NOT NULL DEFAULT 0,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  next_check_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_plans TO authenticated;
GRANT ALL ON public.watch_plans TO service_role;
ALTER TABLE public.watch_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own watch plans" ON public.watch_plans FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS watch_plans_user_idx ON public.watch_plans (user_id, state, created_at DESC);

CREATE TABLE IF NOT EXISTS public.plan_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_id uuid NOT NULL REFERENCES public.watch_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'context',
  headline text NOT NULL,
  detail text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  seen boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_change_events TO authenticated;
GRANT ALL ON public.plan_change_events TO service_role;
ALTER TABLE public.plan_change_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own change events" ON public.plan_change_events FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS plan_change_events_watch_idx
  ON public.plan_change_events (watch_id, occurred_at DESC);