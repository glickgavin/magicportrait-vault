import type { NumbersActivity, NumbersGeneration, NumbersVisitor } from "@/lib/db/store";
import { firstTouchSource, type FirstTouch } from "./first-touch";

/**
 * Settings › Shop › Magic Store numbers (docs/open-store.md): today, 7 and 30 days, from our own tables, with the
 * 30 days split by product, theme and first-touch channel. Pure; the page loads the rows.
 */
export type Period = { key: "today" | "7d" | "30d"; since: Date };
export type Totals = {
  visitors: number;
  started: number;
  ready: number;
  failed: number;
  medianSeconds: number | null;
  costUsd: number;
  emails: number;
  ticked: number;
  carts: number;
  orders: number;
  revenue: number;
  costPerOrder: number | null;
};
export type Split = { key: string; visitors: number; started: number; ready: number; ordered: number; costUsd: number };

const after = (iso: string, since: Date) => new Date(iso).getTime() >= since.getTime();

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function totals(data: { generations: NumbersGeneration[]; visitors: NumbersVisitor[]; activity: NumbersActivity[] }, since: Date): Totals {
  const g = data.generations.filter((x) => after(x.created_at, since));
  const done = g.filter((x) => x.status === "done");
  const cost = g.reduce((a, x) => a + Number(x.cost_usd ?? 0), 0);
  const paid = data.activity.filter((a) => a.event === "store_order_paid" && after(a.created_at, since) && !a.props.test);
  const revenue = paid.reduce((a, x) => a + (Number(x.props.revenue) || 0), 0);
  return {
    visitors: data.visitors.filter((v) => after(v.created_at, since)).length,
    started: g.length,
    ready: done.length,
    failed: g.filter((x) => x.status === "failed" || x.status === "timed_out").length,
    medianSeconds: median(done.flatMap((x) => (x.finished_at ? [Math.round((new Date(x.finished_at).getTime() - new Date(x.created_at).getTime()) / 1000)] : []))),
    costUsd: Math.round(cost * 100) / 100,
    emails: g.filter((x) => x.email_to).length,
    ticked: g.filter((x) => x.email_to && x.email_consent).length,
    carts: data.activity.filter((a) => a.event === "store_added_to_cart" && after(a.created_at, since)).length,
    orders: paid.length,
    revenue: Math.round(revenue * 100) / 100,
    costPerOrder: paid.length ? Math.round((cost / paid.length) * 100) / 100 : null,
  };
}

function splitBy(data: { generations: NumbersGeneration[]; visitors: NumbersVisitor[] }, keyOf: (g: NumbersGeneration) => string, visitorKey?: (v: NumbersVisitor) => string): Split[] {
  const m = new Map<string, Split>();
  const row = (k: string) => m.get(k) ?? (m.set(k, { key: k, visitors: 0, started: 0, ready: 0, ordered: 0, costUsd: 0 }), m.get(k)!);
  for (const g of data.generations) {
    const r = row(keyOf(g));
    r.started++;
    if (g.status === "done") r.ready++;
    if (g.order_id) r.ordered++;
    r.costUsd = Math.round((r.costUsd + Number(g.cost_usd ?? 0)) * 100) / 100;
  }
  if (visitorKey) for (const v of data.visitors) row(visitorKey(v)).visitors++;
  return [...m.values()].sort((a, b) => b.started - a.started || b.visitors - a.visitors || a.key.localeCompare(b.key));
}

/** The 30 days by product (Shopify's numeric id), theme and first-touch channel. */
export function splits(data: { generations: NumbersGeneration[]; visitors: NumbersVisitor[] }, firstTouchOf: (visitorId: string) => FirstTouch | null) {
  return {
    product: splitBy(data, (g) => g.product_id.split("/").pop() ?? g.product_id),
    theme: splitBy(data, (g) => g.theme),
    channel: splitBy(
      data,
      (g) => firstTouchSource(firstTouchOf(g.visitor_id)),
      (v) => firstTouchSource(v.first_touch as FirstTouch | null),
    ),
  };
}
