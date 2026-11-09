/**
 * Business time (`brand.timezone`, default America/Los_Angeles: the business runs on Pacific time).
 * Used by Settings and reports: day boundaries for the dashboard and every date/time shown there.
 * Pure and client-safe; no hard-coded offsets, so PST/PDT changes are handled by Intl.
 */
export const DEFAULT_BIZ_TZ = "America/Los_Angeles";

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date (YYYY-MM-DD) of an instant in `tz`. */
export function dayIn(tz: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Milliseconds `tz` is ahead of UTC at `at` (negative for the Americas). */
function offsetMs(tz: string, at: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant a calendar day (YYYY-MM-DD) starts in `tz` (handles the daylight-saving switch days). */
export function startOfDayIn(tz: string, day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(tz, new Date(guess));
  t = guess - offsetMs(tz, new Date(t)); // second pass lands on the right side of a DST change
  return new Date(t);
}

/** A day `n` days after YYYY-MM-DD (calendar arithmetic, zone-free). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

type Style = "date" | "datetime" | "time" | "short";

/** Settings dates and times in business time, labelled with the zone (e.g. "8 Nov 2026, 14:52 PST"). */
export function fmtBiz(iso: string | Date | null | undefined, tz: string, style: Style = "datetime"): string {
  if (!iso) return "";
  const at = typeof iso === "string" ? new Date(iso) : iso;
  const base: Intl.DateTimeFormatOptions = { timeZone: tz };
  const o: Intl.DateTimeFormatOptions =
    style === "date"
      ? { ...base, day: "numeric", month: "short", year: "numeric" }
      : style === "short"
        ? { ...base, day: "numeric", month: "short" }
        : style === "time"
          ? { ...base, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
          : { ...base, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  const text = new Intl.DateTimeFormat("en-GB", o).format(at);
  return style === "time" || style === "datetime" ? `${text} ${zoneName(tz, at)}` : text;
}

/** The zone's short name at that moment, e.g. "PST" / "PDT" (US names read better than "GMT-8"). */
export function zoneName(tz: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? tz;
}
