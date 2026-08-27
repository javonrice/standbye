CREATE TABLE public.api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'aerodatabox',
  endpoint text NOT NULL,
  tier_est smallint,
  units_est smallint NOT NULL DEFAULT 0,
  trip_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.api_usage_log TO service_role;

ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX api_usage_log_created_at_idx ON public.api_usage_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.api_units_this_month(_provider text DEFAULT 'aerodatabox')
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(units_est), 0)::int
  FROM public.api_usage_log
  WHERE provider = _provider
    AND created_at >= date_trunc('month', now());
$$;

REVOKE ALL ON FUNCTION public.api_units_this_month(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_units_this_month(text) TO service_role;