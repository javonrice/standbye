CREATE TABLE public.serpapi_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL DEFAULT 'sellable_probe',
  route_key text,
  flight_label text,
  adults smallint,
  bucket text,
  device_id text,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.serpapi_usage_log TO service_role;
ALTER TABLE public.serpapi_usage_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX serpapi_usage_log_device_created ON public.serpapi_usage_log (device_id, created_at);
CREATE INDEX serpapi_usage_log_created ON public.serpapi_usage_log (created_at);

CREATE OR REPLACE FUNCTION public.serpapi_probes_this_month(_device_id text DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::int
  FROM public.serpapi_usage_log
  WHERE purpose = 'sellable_probe'
    AND created_at >= date_trunc('month', now())
    AND (_device_id IS NULL OR device_id = _device_id);
$function$;