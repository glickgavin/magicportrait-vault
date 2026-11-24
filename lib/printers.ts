import "server-only";
import { adminProducts } from "@/lib/shop";
import { MAKERS } from "@/lib/shop/fields";
import { lastChecks } from "@/lib/sources/health";
import { dreamshipConfigured, getDreamship, type DreamshipAccount } from "@/lib/sources/dreamship";

/**
 * Settings › Printers (docs/dreamship.md › Part C): one card per maker. The app shows Dreamship's own order
 * settings read-only and never changes them, or any order's status.
 */

export type Maker = (typeof MAKERS)[number];
export type MakerUse = { products: number; sizes: number };

/** How many products and sizes name each maker in their print rules (`mmp_shop.maker`). */
export async function makerUse(): Promise<Record<Maker, MakerUse>> {
  const out = Object.fromEntries(MAKERS.map((m) => [m, { products: 0, sizes: 0 }])) as Record<Maker, MakerUse>;
  for (const p of await adminProducts()) {
    const seen = new Set<Maker>();
    for (const v of p.variants) {
      const m = v.metafields.find((f) => f.key === "maker")?.value?.trim() as Maker | undefined;
      if (!m || !(MAKERS as readonly string[]).includes(m)) continue;
      out[m].sizes++;
      seen.add(m);
    }
    for (const m of seen) out[m].products++;
  }
  return out;
}

export type DreamshipConnection = {
  configured: boolean;
  /** Read live when the page opens; null when it can't be read. */
  account: DreamshipAccount | null;
  error: string | null;
  lastCheck: { ok: boolean; checkedAt: string; business: string | null; plan: string | null } | null;
};

export async function dreamshipConnection(): Promise<DreamshipConnection> {
  const configured = dreamshipConfigured();
  const check = (await lastChecks()).find((c) => c.source === "dreamship") ?? null;
  const lastCheck = check ? { ok: check.ok, checkedAt: check.checked_at, business: typeof check.detail.business === "string" ? check.detail.business : null, plan: typeof check.detail.plan === "string" ? check.detail.plan : null } : null;
  if (!configured) return { configured, account: null, error: null, lastCheck };
  try {
    return { configured, account: await (await getDreamship()).account(), error: null, lastCheck };
  } catch (e) {
    return { configured, account: null, error: (e as Error).message.slice(0, 120), lastCheck };
  }
}
