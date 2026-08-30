ALTER TABLE public.reported_loads
  ADD COLUMN IF NOT EXISTS party_included text
  CHECK (party_included IS NULL OR party_included IN ('yes','no','unsure'));