/**
 * Plan-build error copy — keep airport / provider / generic distinct.
 */
export function isUnresolvedAirportMessage(message: string): boolean {
  return /don'?t recognize/i.test(message);
}

export function planBuildErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "UnresolvedAirportError") {
    return error.message;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message ?? "")
          : "";

  if (message && isUnresolvedAirportMessage(message)) {
    return message;
  }

  // Explicit provider/data signals only — never infer airport from empty results.
  if (/data[_ ]unavailable|provider|temporarily unavailable/i.test(message)) {
    return "Flight data is temporarily unavailable. Try again in a moment.";
  }

  return "We could not build that plan. Try again in a moment.";
}

/** Format UnresolvedAirportError user copy (shared by server throw site). */
export function unresolvedAirportUserMessage(codes: string[]): string {
  const unique = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) {
    return "We don't recognize that airport yet. Check the airport code and try again.";
  }
  if (unique.length === 1) {
    return `We don't recognize ${unique[0]} yet. Check the airport code and try again.`;
  }
  if (unique.length === 2) {
    return `We don't recognize ${unique[0]} or ${unique[1]} yet. Check the airport codes and try again.`;
  }
  const last = unique[unique.length - 1]!;
  const head = unique.slice(0, -1).join(", ");
  return `We don't recognize ${head}, or ${last} yet. Check the airport codes and try again.`;
}
