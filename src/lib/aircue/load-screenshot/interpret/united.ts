/**
 * United-specific normalization after generic vision extraction.
 * Other airlines get their own interpreter later.
 */
import type { ExtractedFlightLoad } from "@/lib/aircue/load-screenshot/types";
import { normalizeAirlineCode } from "@/lib/aircue/load-screenshot/contribute-auth";

function parseUnitedFlightToken(raw: string): { airline: string; flightNumber: string } | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  const m = /^(UA|UAL)?(\d{1,4})$/.exec(s) || /^UNITED(\d{1,4})$/.exec(s);
  if (m) return { airline: "UA", flightNumber: String(Number(m[2])) };
  const m2 = /^(UA)(\d{1,4})$/.exec(s);
  if (m2) return { airline: "UA", flightNumber: String(Number(m2[2])) };
  return null;
}

export function interpretUnitedFlight(row: ExtractedFlightLoad): ExtractedFlightLoad {
  const out: ExtractedFlightLoad = { ...row };
  const airline = normalizeAirlineCode(row.airline) ?? "UA";

  if (row.flightNumber) {
    const parsed = parseUnitedFlightToken(row.flightNumber);
    if (parsed) {
      out.airline = parsed.airline;
      out.flightNumber = parsed.flightNumber;
    } else {
      out.airline = airline === "UAL" ? "UA" : airline;
      out.flightNumber = row.flightNumber.replace(/\D/g, "").replace(/^0+/, "") || row.flightNumber;
    }
  } else {
    out.airline = airline === "UAL" ? "UA" : airline;
  }

  if (out.origin) out.origin = out.origin.trim().toUpperCase();
  if (out.dest) out.dest = out.dest.trim().toUpperCase();

  if (out.cabin) {
    const c = out.cabin.toLowerCase();
    if (c.includes("first") || c.includes("business") || c === "j" || c === "f") out.cabin = "business";
    else if (c.includes("premium") || c === "pnr" || c === "w") out.cabin = "premium";
    else out.cabin = "economy";
  } else {
    out.cabin = "economy";
  }

  if (typeof out.openSeats === "number" && (!Number.isFinite(out.openSeats) || out.openSeats < 0)) {
    out.openSeats = null;
  }
  if (typeof out.standbys === "number" && (!Number.isFinite(out.standbys) || out.standbys < 0)) {
    out.standbys = null;
  }

  return out;
}

export function interpretUnitedFlights(rows: ExtractedFlightLoad[]): ExtractedFlightLoad[] {
  return rows.map(interpretUnitedFlight);
}
