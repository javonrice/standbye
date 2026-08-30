-- Segment-scoped reported loads (canonical identity) + party list state.
ALTER TABLE public.reported_loads
  ADD COLUMN IF NOT EXISTS segment_key text,
  ADD COLUMN IF NOT EXISTS already_listed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS reported_loads_segment_lookup_idx
  ON public.reported_loads (user_id, segment_key, travel_date, checked_at DESC);
