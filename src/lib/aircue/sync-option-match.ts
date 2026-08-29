/**
 * Match a ranked option to an existing plan_options row for sync.
 * option_key is canonical; flight_label is legacy-only fallback.
 */
export type SyncOptionRow = {
  id: string;
  option_key?: string | null;
  flight_label?: string | null;
};

/**
 * Resolve which existing row (if any) a ranked option should update.
 * Never merges two keyed options merely because flight_label matches.
 */
export function matchExistingOptionRow(
  existing: SyncOptionRow[],
  option: { optionKey: string | null | undefined; flightLabel: string },
): SyncOptionRow | null {
  const optionKey = (option.optionKey ?? "").trim();
  if (optionKey) {
    const byKey = existing.find((r) => String(r.option_key ?? "").trim() === optionKey);
    if (byKey) return byKey;
    // Legacy row without a key: allow one-time claim by flight_label.
    const legacy = existing.find(
      (r) =>
        !String(r.option_key ?? "").trim() &&
        String(r.flight_label ?? "") === option.flightLabel,
    );
    return legacy ?? null;
  }
  const byLabel = existing.find((r) => String(r.flight_label ?? "") === option.flightLabel);
  return byLabel ?? null;
}
