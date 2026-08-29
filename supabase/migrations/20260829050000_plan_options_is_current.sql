-- Plan integrity: current options without deleting FK-anchored rows.
-- Also harden pre-migration watch rows for one-active-per-plan.

ALTER TABLE public.plan_options
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

-- Backfill plan_id on watches that only had plan_option_id.
UPDATE public.watch_plans w
SET plan_id = po.plan_id
FROM public.plan_options po
WHERE w.plan_option_id = po.id
  AND w.plan_id IS NULL
  AND po.plan_id IS NOT NULL;

-- Collapse duplicate active watches per (user_id, plan_id), keeping newest.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, plan_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.watch_plans
  WHERE state = 'active'
    AND plan_id IS NOT NULL
)
UPDATE public.watch_plans w
SET state = 'ended',
    ended_at = COALESCE(w.ended_at, now())
FROM ranked r
WHERE w.id = r.id
  AND r.rn > 1;
