-- Segment-scoped reported loads (canonical identity).
ALTER TABLE public.reported_loads
  ADD COLUMN IF NOT EXISTS segment_key text;

CREATE INDEX IF NOT EXISTS reported_loads_segment_lookup_idx
  ON public.reported_loads (user_id, segment_key, travel_date, checked_at DESC);
