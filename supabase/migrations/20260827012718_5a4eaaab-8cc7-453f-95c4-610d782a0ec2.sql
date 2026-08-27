CREATE TABLE public.hist_dataset_months (
  dataset text NOT NULL,
  year smallint NOT NULL,
  month smallint NOT NULL,
  available_after date NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset, year, month)
);
GRANT SELECT ON public.hist_dataset_months TO anon, authenticated;
GRANT ALL ON public.hist_dataset_months TO service_role;
ALTER TABLE public.hist_dataset_months ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist_dataset_months public read" ON public.hist_dataset_months FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.hist_ontime_pattern (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_iata text NOT NULL,
  dest_iata text NOT NULL,
  marketing_carrier text NOT NULL DEFAULT 'UA',
  month smallint NOT NULL,
  year smallint,
  dow smallint,
  time_block text,
  flights_sampled integer NOT NULL DEFAULT 0,
  cancel_rate numeric NOT NULL DEFAULT 0,
  dep15_rate numeric NOT NULL DEFAULT 0,
  median_later_backups smallint NOT NULL DEFAULT 0,
  source_period text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origin_iata, dest_iata, marketing_carrier, month, year, dow, time_block)
);
CREATE INDEX hist_ontime_pattern_route_idx ON public.hist_ontime_pattern (origin_iata, dest_iata, month);
GRANT SELECT ON public.hist_ontime_pattern TO anon, authenticated;
GRANT ALL ON public.hist_ontime_pattern TO service_role;
ALTER TABLE public.hist_ontime_pattern ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist_ontime_pattern public read" ON public.hist_ontime_pattern FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.hist_t100_route_month (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_iata text NOT NULL,
  dest_iata text NOT NULL,
  marketing_carrier text NOT NULL DEFAULT 'UA',
  year smallint NOT NULL,
  month smallint NOT NULL,
  departures integer NOT NULL DEFAULT 0,
  passengers integer NOT NULL DEFAULT 0,
  seats integer NOT NULL DEFAULT 0,
  load_factor numeric NOT NULL DEFAULT 0,
  avg_empty_seats numeric NOT NULL DEFAULT 0,
  vs_network_pp numeric,
  source_period text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origin_iata, dest_iata, marketing_carrier, year, month)
);
CREATE INDEX hist_t100_route_month_route_idx ON public.hist_t100_route_month (origin_iata, dest_iata, month);
GRANT SELECT ON public.hist_t100_route_month TO anon, authenticated;
GRANT ALL ON public.hist_t100_route_month TO service_role;
ALTER TABLE public.hist_t100_route_month ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist_t100_route_month public read" ON public.hist_t100_route_month FOR SELECT TO anon, authenticated USING (true);