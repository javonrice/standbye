-- Mirror: plan_options.option_key
ALTER TABLE public.plan_options
  ADD COLUMN IF NOT EXISTS option_key text;

CREATE UNIQUE INDEX IF NOT EXISTS plan_options_plan_option_key_uidx
  ON public.plan_options (plan_id, option_key)
  WHERE option_key IS NOT NULL;
