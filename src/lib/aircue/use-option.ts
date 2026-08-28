import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getOption } from "@/lib/aircue/option.functions";

/** Shared loader for every option-scoped screen. */
export function useOption(optionId: string) {
  const load = useServerFn(getOption);
  return useQuery({
    queryKey: ["option", optionId],
    queryFn: () => load({ data: { optionId } }),
  });
}
