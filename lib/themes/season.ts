/** Theme date windows and "in season" (SPEC §8.2). Pure. Dates are compared as UTC calendar days. */

export type Windowed = { available_from: string | null; available_to: string | null; repeats_yearly: boolean };

const DAY = 86_400_000;

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function md(s: string): [number, number] {
  const [, m, d] = s.split("-").map(Number);
  return [m, d];
}
function at(year: number, s: string): number {
  const [m, d] = md(s);
  return Date.UTC(year, m - 1, d);
}

/** The window (start/end, inclusive) that contains or follows `now`; null = always available. */
export function currentWindow(t: Windowed, now: Date): { start: number; end: number } | null {
  if (!t.available_from && !t.available_to) return null;
  const today = utcDay(now);
  if (!t.repeats_yearly) {
    const start = t.available_from ? Date.parse(t.available_from) : -Infinity;
    const end = t.available_to ? Date.parse(t.available_to) : Infinity;
    return { start, end };
  }
  const from = t.available_from ?? "2000-01-01";
  const to = t.available_to ?? "2000-12-31";
  const y = now.getUTCFullYear();
  const wraps = at(2001, to) < at(2001, from);
  // Candidate windows around this year; pick the one containing today, else the next one.
  const candidates = [-1, 0, 1].map((dy) => {
    const start = at(y + dy, from);
    const end = wraps ? at(y + dy + 1, to) : at(y + dy, to);
    return { start, end };
  });
  return candidates.find((w) => today >= w.start && today <= w.end) ?? candidates.find((w) => w.start > today) ?? candidates[2];
}

export function isAvailable(t: Windowed, now: Date): boolean {
  const w = currentWindow(t, now);
  if (!w) return true;
  const today = utcDay(now);
  return today >= w.start && today <= w.end;
}

/** In season: inside its window, or starting within `daysBefore` days. Always-available themes don't count. */
export function isInSeason(t: Windowed, now: Date, daysBefore: number): boolean {
  const w = currentWindow(t, now);
  if (!w) return false;
  const today = utcDay(now);
  if (today >= w.start && today <= w.end) return true;
  return w.start > today && (w.start - today) / DAY <= daysBefore;
}

/** Days until the window starts (0 if inside, null if always available). */
export function daysUntilStart(t: Windowed, now: Date): number | null {
  const w = currentWindow(t, now);
  if (!w) return null;
  const today = utcDay(now);
  if (today >= w.start && today <= w.end) return 0;
  return Math.round((w.start - today) / DAY);
}
