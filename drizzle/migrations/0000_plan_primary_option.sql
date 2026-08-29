-- Plan-oriented pivot: persisted primary option + one active watch per plan.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS primary_option_id uuid REFERENCES public.plan_options(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS watch_plans_one_active_per_plan
  ON public.watch_plans (user_id, plan_id)
  WHERE state = 'active' AND plan_id IS NOT NULL;

-- Backfill primary from active watches where the plan has no primary yet.
UPDATE public.plans p
SET primary_option_id = w.plan_option_id
FROM public.watch_plans w
WHERE w.plan_id = p.id
  AND w.state = 'active'
  AND p.primary_option_id IS NULL;