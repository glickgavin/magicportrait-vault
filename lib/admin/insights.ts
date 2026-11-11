import "server-only";
import { db } from "@/lib/db/client";
import { getSetting } from "@/lib/settings";
import { addDays, dayIn, DEFAULT_BIZ_TZ, startOfDayIn } from "@/lib/biztime";

export const RANGES = { today: "Today", yesterday: "Yesterday", "7d": "7 days", mtd: "MTD", "30d": "30 days", all: "All time" } as const;
export type Range = keyof typeof RANGES;

export const KPI_LABELS: Record<string, string> = {
  cards_created: "Cards created",
  people_creating: "People creating",
  emailed: "Emailed",
  recipient_opens: "Recipient opens",
  recipient_taps: "Recipients who tapped Try MP",
  sign_ins: "Sign-ins",
  mug_photos: "Mug photos chosen",
  downloads: "Downloads",
};

/**
 * The period and the one before it, in business time (`brand.timezone`, Pacific by default):
 * "Today" starts at midnight there; "Yesterday" is the whole day before (compared with the day
 * before that); "7 days" / "30 days" are today plus the 6 / 29 days before it, compared with the same
 * number of days just before; "MTD" is the 1st of this month until now, compared with the same stretch
 * of last month (its 1st until the same day and time, capped at the month's end).
 */
export function periods(range: Range, now = new Date(), tz = DEFAULT_BIZ_TZ): { from: Date; to: Date; prevFrom: Date | null; prevTo: Date | null } {
  const to = now;
  if (range === "all") return { from: new Date("2020-01-01T00:00:00Z"), to, prevFrom: null, prevTo: null };
  const today = dayIn(tz, now);
  if (range === "yesterday") {
    const from = startOfDayIn(tz, addDays(today, -1));
    return { from, to: startOfDayIn(tz, today), prevFrom: startOfDayIn(tz, addDays(today, -2)), prevTo: from };
  }
  if (range === "mtd") {
    const first = `${today.slice(0, 8)}01`;
    const from = startOfDayIn(tz, first);
    const [y, m] = first.split("-").map(Number);
    const prevFirst = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    const prevFrom = startOfDayIn(tz, prevFirst);
    // Same day of the month and time of day, last month (never past the end of that month).
    const dayOfMonth = Number(today.slice(8, 10));
    const sinceMidnight = now.getTime() - startOfDayIn(tz, today).getTime();
    const prevDay = addDays(prevFirst, dayOfMonth - 1);
    const prevTo = new Date(Math.min(startOfDayIn(tz, prevDay).getTime() + sinceMidnight, from.getTime()));
    return { from, to, prevFrom, prevTo };
  }
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
  const firstDay = addDays(today, -(days - 1));
  const from = startOfDayIn(tz, firstDay);
  const prevFrom = startOfDayIn(tz, addDays(firstDay, -days));
  return { from, to, prevFrom, prevTo: from };
}

/** The business time zone from settings (validated there). */
export async function bizTz(): Promise<string> {
  return getSetting("brand.timezone");
}

export type Kpi = { key: string; label: string; value: number; previous: number | null; change: number | null };

export async function kpis(range: Range, now = new Date(), tz?: string, staff = false): Promise<Kpi[]> {
  const p = periods(range, now, tz ?? (await bizTz()));
  const [cur, prev] = await Promise.all([
    db().rpc("insights_kpis", { p_from: p.from.toISOString(), p_to: p.to.toISOString(), p_staff: staff }),
    p.prevFrom ? db().rpc("insights_kpis", { p_from: p.prevFrom.toISOString(), p_to: p.prevTo!.toISOString(), p_staff: staff }) : Promise.resolve({ data: null }),
  ]);
  const c = (cur.data ?? {}) as Record<string, number>;
  const pr = prev.data as Record<string, number> | null;
  return Object.keys(KPI_LABELS).map((key) => {
    const value = c[key] ?? 0;
    const previous = pr ? (pr[key] ?? 0) : null;
    return { key, label: KPI_LABELS[key], value, previous, change: previous === null ? null : previous === 0 ? (value > 0 ? 100 : 0) : Math.round(((value - previous) / previous) * 100) };
  });
}

/** Cards per business day (Pacific by default), oldest first, with empty days as 0. */
export async function cardsPerDay(range: Range, now = new Date(), tz?: string, staff = false) {
  const zone = tz ?? (await bizTz());
  // Single days show the week around them; "All time" shows the last 30 days.
  const p = periods(range === "all" ? "30d" : range === "today" || range === "yesterday" ? "7d" : range, now, zone);
  const r = await db().rpc("insights_cards_per_day_tz", { p_from: p.from.toISOString(), p_to: p.to.toISOString(), p_tz: zone, p_staff: staff });
  const byDay = new Map(((r.data ?? []) as { day: string; n: number }[]).map((d) => [d.day, d.n]));
  const out: { day: string; n: number }[] = [];
  const last = dayIn(zone, p.to);
  for (let day = dayIn(zone, p.from); day <= last; day = addDays(day, 1)) out.push({ day, n: byDay.get(day) ?? 0 });
  return out;
}

export async function topThemes(range: Range, now = new Date(), tz?: string, staff = false) {
  const p = periods(range, now, tz ?? (await bizTz()));
  return ((await db().rpc("insights_top_themes", { p_from: p.from.toISOString(), p_to: p.to.toISOString(), p_limit: 8, p_staff: staff })).data ?? []) as { theme: string; version: string; n: number }[];
}

export async function funnel(range: Range, now = new Date(), tz?: string, staff = false) {
  const p = periods(range, now, tz ?? (await bizTz()));
  return ((await db().rpc("insights_funnel", { p_from: p.from.toISOString(), p_to: p.to.toISOString(), p_staff: staff })).data ?? {}) as Record<string, number>;
}

export type CardActions = Record<"emailed" | "shared" | "link_copied" | "downloaded", { cards: number; people: number }> & { made: number; not_yet: number };

/** What people did with their cards in the period: distinct cards and people per action, and cards made with no action yet. */
export async function cardActions(range: Range, now = new Date(), tz?: string, staff = false): Promise<CardActions> {
  const p = periods(range, now, tz ?? (await bizTz()));
  const d = ((await db().rpc("insights_card_actions", { p_from: p.from.toISOString(), p_to: p.to.toISOString(), p_staff: staff })).data ?? {}) as Partial<CardActions>;
  const z = { cards: 0, people: 0 };
  return { emailed: d.emailed ?? z, shared: d.shared ?? z, link_copied: d.link_copied ?? z, downloaded: d.downloaded ?? z, made: d.made ?? 0, not_yet: d.not_yet ?? 0 };
}

export type EntryRow = { entry: string; clicks: number; signed_in: number; cards: number };
export type Entries = { offer_email: { sent: number; clicked: number; cards: number }; links: EntryRow[] };

/** "Where people came from": the offer email and each tracked entry link (configured ones show even at 0). */
export async function entries(range: Range, configured: string[], now = new Date(), tz?: string, staff = false): Promise<Entries> {
  const p = periods(range, now, tz ?? (await bizTz()));
  const d = ((await db().rpc("insights_entries", { p_from: p.from.toISOString(), p_to: p.to.toISOString(), p_staff: staff })).data ?? {}) as Partial<Entries>;
  const links = [...(d.links ?? [])];
  for (const name of configured) if (!links.some((l) => l.entry === name)) links.push({ entry: name, clicks: 0, signed_in: 0, cards: 0 });
  return { offer_email: d.offer_email ?? { sent: 0, clicked: 0, cards: 0 }, links: links.sort((x, y) => x.entry.localeCompare(y.entry)) };
}

/** Recent activity, newest first; without `staff`, super users' own events are left out. */
export async function liveFeed(limit = 20, staff = false) {
  let q = db().from("activity_log").select("id, occurred_at, event, source, ref_type, ref_id, actor").order("id", { ascending: false }).limit(limit);
  if (!staff) {
    const emails = ((await db().from("super_users").select("email")).data ?? []).map((r) => (r as { email: string }).email);
    if (emails.length) q = q.or(`email.is.null,email.not.in.(${emails.map((e) => `"${e}"`).join(",")})`);
    q = q.not("actor", "like", "super_user:%");
  }
  return ((await q).data ?? []) as { id: number; occurred_at: string; event: string; source: string; ref_type: string | null; ref_id: string | null; actor: string }[];
}
