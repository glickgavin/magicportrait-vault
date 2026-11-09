import { describe, expect, it } from "vitest";
import { addDays, dayIn, fmtBiz, isTimeZone, startOfDayIn } from "@/lib/biztime";
import { periods } from "@/lib/admin/insights";

const LA = "America/Los_Angeles";

describe("business time (Pacific)", () => {
  it("knows the Pacific calendar day of an instant", () => {
    // 07:30 UTC on 9 Nov is still 8 Nov in Los Angeles (PST, UTC−8).
    expect(dayIn(LA, new Date("2026-11-09T07:30:00Z"))).toBe("2026-11-08");
    expect(dayIn(LA, new Date("2026-11-09T08:30:00Z"))).toBe("2026-11-09");
  });
  it("finds Pacific midnight in winter (PST) and summer (PDT), and on the switch days", () => {
    expect(startOfDayIn(LA, "2026-11-09").toISOString()).toBe("2026-11-09T08:00:00.000Z");
    expect(startOfDayIn(LA, "2026-07-01").toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(startOfDayIn(LA, "2026-03-08").toISOString()).toBe("2026-03-08T08:00:00.000Z"); // clocks go forward later that night
    expect(startOfDayIn(LA, "2026-11-01").toISOString()).toBe("2026-11-01T07:00:00.000Z"); // still PDT at midnight
  });
  it("adds calendar days", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-11-09", -6)).toBe("2026-11-03");
  });
  it("dashboard ranges start at Pacific midnight", () => {
    const now = new Date("2026-11-09T20:00:00Z"); // 12:00 PST on 9 Nov
    expect(periods("today", now, LA).from.toISOString()).toBe("2026-11-09T08:00:00.000Z");
    const week = periods("7d", now, LA);
    expect(week.from.toISOString()).toBe("2026-11-03T08:00:00.000Z");
    expect(week.prevFrom!.toISOString()).toBe("2026-10-27T07:00:00.000Z"); // before the switch: PDT
    expect(week.prevTo!.toISOString()).toBe(week.from.toISOString());
  });
  it("labels times with the zone, and validates zone names", () => {
    expect(fmtBiz("2026-11-09T22:52:00Z", LA)).toMatch(/9 Nov 2026, 14:52 PST/);
    expect(fmtBiz("2026-07-01T22:52:00Z", LA, "time")).toMatch(/15:52 PDT/);
    expect(isTimeZone(LA)).toBe(true);
    expect(isTimeZone("Pacific/Not_A_Zone")).toBe(false);
  });
});
