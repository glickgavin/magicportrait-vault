import "server-only";
import { db } from "@/lib/db/client";

export const RANGES = { today: "Today", "7d": "7 days", "30d": "30 days", all: "All time" } as const;
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

/** The period and the one before it, in UTC. */
export function periods(range: Range, now = new Date()): { from: Date; to: Date; prevFrom: Date | null; prevTo: Date | null } {
  const to = now;
  if (range === "all") return { from: new Date("2020-01-01T00:00:00Z"), to, prevFrom: null, prevTo: null };
  if (range === "today") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { from, to, prevFrom: new Date(from.getTime() - 86_400_000), prevTo: from };
  }
  const days = range === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - days * 86_400_000);
  return { from, to, prevFrom: new Date(from.getTime() - days * 86_400_000), prevTo: from };
}

export type Kpi = { key: string; label: string; value: number; previous: number | null; change: number | null };

export async function kpis(range: Range, now = new Date()): Promise<Kpi[]> {
  const p = periods(range, now);
  const [cur, prev] = await Promise.all([
    db().rpc("insights_kpis", { p_from: p.from.toISOString(), p_to: p.to.toISOString() }),
    p.prevFrom ? db().rpc("insights_kpis", { p_from: p.prevFrom.toISOString(), p_to: p.prevTo!.toISOString() }) : Promise.resolve({ data: null }),
  ]);
  const c = (cur.data ?? {}) as Record<string, number>;
  const pr = prev.data as Record<string, number> | null;
  return Object.keys(KPI_LABELS).map((key) => {
    const value = c[key] ?? 0;
    const previous = pr ? (pr[key] ?? 0) : null;
    return { key, label: KPI_LABELS[key], value, previous, change: previous === null ? null : previous === 0 ? (value > 0 ? 100 : 0) : Math.round(((value - previous) / previous) * 100) };
  });
}

export async function cardsPerDay(range: Range, now = new Date()) {
  const p = periods(range === "all" ? "30d" : range === "today" ? "7d" : range, now);
  const r = await db().rpc("insights_cards_per_day", { p_from: p.from.toISOString(), p_to: p.to.toISOString() });
  const byDay = new Map(((r.data ?? []) as { day: string; n: number }[]).map((d) => [d.day, d.n]));
  const out: { day: string; n: number }[] = [];
  for (let t = Date.UTC(p.from.getUTCFullYear(), p.from.getUTCMonth(), p.from.getUTCDate()); t <= p.to.getTime(); t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, n: byDay.get(day) ?? 0 });
  }
  return out;
}

export async function topThemes(range: Range, now = new Date()) {
  const p = periods(range, now);
  return ((await db().rpc("insights_top_themes", { p_from: p.from.toISOString(), p_to: p.to.toISOString(), p_limit: 8 })).data ?? []) as { theme: string; version: string; n: number }[];
}

export async function funnel(range: Range, now = new Date()) {
  const p = periods(range, now);
  return ((await db().rpc("insights_funnel", { p_from: p.from.toISOString(), p_to: p.to.toISOString() })).data ?? {}) as Record<string, number>;
}

export type CardActions = Record<"emailed" | "shared" | "link_copied" | "downloaded", { cards: number; people: number }> & { made: number; not_yet: number };

/** What people did with their cards in the period: distinct cards and people per action, and cards made with no action yet. */
export async function cardActions(range: Range, now = new Date()): Promise<CardActions> {
  const p = periods(range, now);
  const d = ((await db().rpc("insights_card_actions", { p_from: p.from.toISOString(), p_to: p.to.toISOString() })).data ?? {}) as Partial<CardActions>;
  const z = { cards: 0, people: 0 };
  return { emailed: d.emailed ?? z, shared: d.shared ?? z, link_copied: d.link_copied ?? z, downloaded: d.downloaded ?? z, made: d.made ?? 0, not_yet: d.not_yet ?? 0 };
}

export async function liveFeed(limit = 20) {
  return ((await db().from("activity_log").select("id, occurred_at, event, source, ref_type, ref_id, actor").order("id", { ascending: false }).limit(limit)).data ?? []) as { id: number; occurred_at: string; event: string; source: string; ref_type: string | null; ref_id: string | null; actor: string }[];
}
