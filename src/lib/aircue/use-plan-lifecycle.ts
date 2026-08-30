import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getPlan, setPrimaryOptionFn, startWatchPlan } from "@/lib/aircue/plan.functions";

/**
 * Plan lifecycle activation.
 *
 * Building a Plan is enough — the traveler should never have to pick a primary
 * option or turn monitoring on by hand. After a Plan is created we:
 *
 *  1. read it back,
 *  2. set the current top recommendation as the initial current option
 *     (a lifecycle action; ranking is untouched),
 *  3. start the existing monitoring lifecycle via `startWatchPlan`.
 *
 * Both steps are skipped for a zero-option Plan, and monitoring failure never
 * fails the Plan — the Plan is the primary user object.
 * `beginWatch()` already de-duplicates active plan watches, so this is safe to
 * call from every entry point.
 */
export function useActivatePlan() {
  const queryClient = useQueryClient();
  const load = useServerFn(getPlan);
  const setPrimary = useServerFn(setPrimaryOptionFn);
  const beginWatch = useServerFn(startWatchPlan);

  return useCallback(
    async (planId: string) => {
      let hasOptions = false;
      try {
        const plan = await load({ data: { planId } });
        if (!plan || plan.options.length === 0) return;
        hasOptions = true;

        if (!plan.primaryOptionId) {
          const top =
            plan.options.find((o) => o.id === plan.preferredOptionId) ?? plan.options[0]!;
          await setPrimary({ data: { planId, optionId: top.id } });
        }

        if (!plan.watching) {
          await beginWatch({ data: { planId, mode: "meaningful" } });
        }
      } catch {
        // Monitoring/selection setup is best effort. The Plan still exists and
        // the Plan screen surfaces a quiet retry if monitoring did not start.
      } finally {
        if (hasOptions) {
          queryClient.invalidateQueries({ queryKey: ["plan", planId] });
          queryClient.invalidateQueries({ queryKey: ["plans"] });
          queryClient.invalidateQueries({ queryKey: ["watches"] });
        }
      }
    },
    [load, setPrimary, beginWatch, queryClient],
  );
}
