/**
 * Local calendar-day offset helper — compare dates, not elapsed hours.
 */
import { describe, expect, it } from "bun:test";

import {
  daysBetweenCalendarDates,
  formatArrivalClock,
  formatLocalTimeWithDayOffset,
  localArrivalDayOffset,
  localCalendarDate,
} from "@/lib/aircue/local-day-offset";

describe("localArrivalDayOffset", () => {
  it("same-day domestic (naive local ISO) has no offset", () => {
    expect(
      localArrivalDayOffset({
        schedDep: "2026-08-29T17:10:00",
        schedArr: "2026-08-29T19:45:00",
      }),
    ).toBe(0);
    expect(
      formatArrivalClock({
        arrLocal: "7:45 PM",
        schedDep: "2026-08-29T17:10:00",
        schedArr: "2026-08-29T19:45:00",
      }),
    ).toBe("7:45 PM");
  });

  it("overnight eastbound international shows +1 from local calendar dates", () => {
    // FRA evening → SIN next local calendar day (provider local-naive).
    expect(
      localArrivalDayOffset({
        schedDep: "2026-08-30T17:45:00",
        schedArr: "2026-08-31T21:55:00",
      }),
    ).toBe(1);
    expect(
      formatArrivalClock({
        arrLocal: "9:55 PM",
        schedDep: "2026-08-30T17:45:00",
        schedArr: "2026-08-31T21:55:00",
      }),
    ).toBe("9:55 PM+1");
  });

  it("date-line / timezone edge uses airport IANA zones for absolute UTC", () => {
    // HNL → NRT: depart Monday evening HST, arrive Wednesday morning JST (+2 local days).
    // 2026-08-31 22:00 HST = 2026-09-01 08:00Z; arrive 2026-09-02 02:00 JST = 2026-09-01 17:00Z
    expect(
      localArrivalDayOffset({
        schedDep: "2026-09-01T08:00:00.000Z",
        schedArr: "2026-09-01T17:00:00.000Z",
        depTimeZone: "Pacific/Honolulu",
        arrTimeZone: "Asia/Tokyo",
      }),
    ).toBe(2);
    expect(
      localCalendarDate("2026-09-01T08:00:00.000Z", "Pacific/Honolulu"),
    ).toBe("2026-08-31");
    expect(localCalendarDate("2026-09-01T17:00:00.000Z", "Asia/Tokyo")).toBe("2026-09-02");
  });

  it("+2 multi-day itinerary from explicit local calendar dates", () => {
    expect(
      localArrivalDayOffset({
        depLocalDate: "2026-10-01",
        arrLocalDate: "2026-10-03",
      }),
    ).toBe(2);
    expect(formatLocalTimeWithDayOffset("11:20 AM", 2)).toBe("11:20 AM+2");
  });

  it("does not infer offset from elapsed hours alone when dates missing", () => {
    expect(
      localArrivalDayOffset({
        schedDep: null,
        schedArr: null,
      }),
    ).toBeNull();
    // Absolute UTC without timezone must not guess local dates.
    expect(
      localArrivalDayOffset({
        schedDep: "2026-08-30T22:00:00.000Z",
        schedArr: "2026-08-31T10:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("daysBetweenCalendarDates is whole local calendar days", () => {
    expect(daysBetweenCalendarDates("2026-08-29", "2026-08-29")).toBe(0);
    expect(daysBetweenCalendarDates("2026-08-29", "2026-08-30")).toBe(1);
    expect(daysBetweenCalendarDates("2026-08-29", "2026-08-31")).toBe(2);
  });
});
