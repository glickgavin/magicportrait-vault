/** Dates in the app's voice: "28 Oct 2026", "31 Dec, 18:00", "2 days ago". */
export function fmtDate(iso: string | null | undefined, opts: { year?: boolean } = { year: true }): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(opts.year ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined, timeZone = "UTC"): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(iso));
}

export function fmtAgo(iso: string, now = new Date()): string {
  const diff = (new Date(iso).getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(diff / 86_400), "day");
  if (abs < 86_400 * 365) return rtf.format(Math.round(diff / (86_400 * 30)), "month");
  return rtf.format(Math.round(diff / (86_400 * 365)), "year");
}
