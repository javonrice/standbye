import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StandbyOption } from "@/lib/aircue/standby";

export const getOption = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { optionId: string }) =>
    z.object({ optionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{
    option: StandbyOption | null;
    planId: string | null;
    travelDate: string | null;
    watchId: string | null;
  }> => {
    const { loadOption } = await import("@/lib/aircue/option.server");
    return loadOption(context.supabase, context.userId, data.optionId);
  });
