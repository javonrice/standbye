-- Shared flight-level load snapshots + parse jobs + airline visibility policy.
-- Contribution is home-airline gated; consumption is eligible_reuse by default for UA.

CREATE TABLE IF NOT EXISTS public.airline_load_policies (
  airline text PRIMARY KEY,
  visibility text NOT NULL DEFAULT 'restricted'
    CHECK (visibility IN ('private', 'eligible_reuse', 'aggregate_only', 'restricted')),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.airline_load_policies (airline, visibility, note)
VALUES
  ('UA', 'eligible_reuse', 'MVP default — United screenshots/manual loads may enter the reusable network')
ON CONFLICT (airline) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.load_parse_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL,
  model text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'partial')),
  image_sha256 text,
  contributor_home_airline text NOT NULL,
  airline_hint text,
  flight_count_extracted integer NOT NULL DEFAULT 0,
  flight_count_accepted integer NOT NULL DEFAULT 0,
  flight_count_rejected_airline integer NOT NULL DEFAULT 0,
  cost_units numeric,
  cost_usd_estimate numeric,
  provider_request_id text,
  raw_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

CREATE INDEX IF NOT EXISTS load_parse_jobs_user_created_idx
  ON public.load_parse_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS load_parse_jobs_sha_idx
  ON public.load_parse_jobs (image_sha256, created_at DESC)
  WHERE image_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.load_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_key text NOT NULL,
  airline text NOT NULL,
  flight_number text,
  origin text,
  dest text,
  travel_date date,
  sched_dep_utc timestamptz,
  cabin text NOT NULL DEFAULT 'economy',
  open_seats integer,
  standbys integer,
  observed_at timestamptz NOT NULL,
  timestamp_source text NOT NULL DEFAULT 'inferred_upload'
    CHECK (timestamp_source IN ('screenshot', 'metadata', 'inferred_upload', 'user_confirmed')),
  timestamp_confidence real,
  captured_at timestamptz NOT NULL DEFAULT now(),
  contributor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  source_kind text NOT NULL DEFAULT 'screenshot'
    CHECK (source_kind IN ('screenshot', 'manual', 'import')),
  parser_provider text,
  parser_model text,
  parser_confidence real,
  match_confidence real,
  visibility text NOT NULL DEFAULT 'eligible_reuse'
    CHECK (visibility IN ('private', 'eligible_reuse', 'aggregate_only', 'restricted')),
  content_hash text,
  parse_job_id uuid REFERENCES public.load_parse_jobs (id) ON DELETE SET NULL,
  superseded_by uuid REFERENCES public.load_snapshots (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'rejected', 'unmatched')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS load_snapshots_segment_observed_idx
  ON public.load_snapshots (segment_key, observed_at DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS load_snapshots_airline_segment_idx
  ON public.load_snapshots (airline, segment_key)
  WHERE status = 'active';

ALTER TABLE public.reported_loads
  ADD COLUMN IF NOT EXISTS snapshot_id uuid REFERENCES public.load_snapshots (id) ON DELETE SET NULL;

ALTER TABLE public.load_parse_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airline_load_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own parse jobs" ON public.load_parse_jobs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Snapshots: contributors can see their own rows; reusable reads go through service role / server.
CREATE POLICY "own contributed snapshots" ON public.load_snapshots
  FOR SELECT TO authenticated
  USING (auth.uid() = contributor_user_id);

CREATE POLICY "insert own snapshots" ON public.load_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = contributor_user_id);

CREATE POLICY "read airline load policies" ON public.airline_load_policies
  FOR SELECT TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE ON public.load_parse_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.load_snapshots TO authenticated;
GRANT SELECT ON public.airline_load_policies TO authenticated;
GRANT ALL ON public.load_parse_jobs TO service_role;
GRANT ALL ON public.load_snapshots TO service_role;
GRANT ALL ON public.airline_load_policies TO service_role;
