import type { ImagenSource, MirrorSource, ShopifyOrder, ShopifySource } from "./types";
import { FX_MIRROR, FX_MUG_JOBS, FX_SESSIONS, buildFixtureOrders, fxPortraitRows } from "./fixtures-data";

/** In-memory Shopify. Writes (mug choice, tags) change the in-memory orders, never anything real. */
export class ShopifyFixtures implements ShopifySource {
  readonly kind = "fixtures" as const;
  private orders: ShopifyOrder[] = buildFixtureOrders();
  /** Every write, so tests can assert exactly what would have been sent to Shopify. */
  readonly writes: { type: "metafieldsSet" | "tagsAdd"; orderGid: string; payload: unknown }[] = [];
  failNextWrite: string | null = null;

  reset() {
    this.orders = buildFixtureOrders();
    this.writes.length = 0;
    this.failNextWrite = null;
  }

  async ordersByEmail(email: string) {
    const e = email.toLowerCase();
    return structuredClone(
      this.orders
        .filter((o) => !o.test && (o.email?.toLowerCase() === e || o.customer?.email?.toLowerCase() === e))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }
  async orderById(id: string) {
    const gid = /^\d+$/.test(id) ? `gid://shopify/Order/${id}` : id;
    const o = this.orders.find((x) => x.id === gid);
    return o ? structuredClone(o) : null;
  }
  async resolveOrderByName(name: string) {
    const n = name.startsWith("#") ? name : `#${name}`;
    const o = this.orders.find((x) => x.name === n);
    return o ? { id: o.id, name: o.name } : null;
  }
  async setMugChoice(input: { orderGid: string; namespace: string; key: string; type: string; value: string; compareDigest: string | null }) {
    this.writes.push({ type: "metafieldsSet", orderGid: input.orderGid, payload: input });
    if (this.failNextWrite) {
      const reason = this.failNextWrite;
      this.failNextWrite = null;
      return { ok: false as const, reason };
    }
    const o = this.orders.find((x) => x.id === input.orderGid);
    if (!o) return { ok: false as const, reason: "not_found" };
    if (input.compareDigest !== (o.mugChoice?.compareDigest ?? null)) return { ok: false as const, reason: "STALE_OBJECT" };
    o.mugChoice = { value: input.value, updatedAt: new Date().toISOString(), compareDigest: `fx-${Date.now()}` };
    return { ok: true as const };
  }
  async addTags(orderGid: string, tags: string[]) {
    this.writes.push({ type: "tagsAdd", orderGid, payload: tags });
    const o = this.orders.find((x) => x.id === orderGid);
    if (o) o.tags = [...new Set([...o.tags, ...tags])];
    return { ok: true as const };
  }
  async ping() {
    return { shop: "Fixture shop", scopes: ["read_orders", "read_all_orders", "write_orders", "read_customers"] };
  }
}

export class MirrorFixtures implements MirrorSource {
  readonly kind = "fixtures" as const;
  async sessionsForEmail(candidates: string[]) {
    const seen = new Map<string, (typeof FX_MIRROR)[string][number]>();
    for (const c of candidates) for (const s of FX_MIRROR[c] ?? []) seen.set(s.imagenSessionId, s);
    return [...seen.values()];
  }
  async mugJobs(orderLegacyId: string) {
    return structuredClone(FX_MUG_JOBS[orderLegacyId] ?? []);
  }
  async ping() {
    return { rows: 10 };
  }
}

export class ImagenFixtures implements ImagenSource {
  readonly kind = "fixtures" as const;
  async portraits(sessionIds: string[], opts: { includeChildren: boolean }) {
    return fxPortraitRows(sessionIds, opts.includeChildren);
  }
  async sessions(sessionIds: string[]) {
    return FX_SESSIONS.filter((s) => sessionIds.includes(s.id)).map((s) => ({ id: s.id, createdAt: s.createdAt, status: "done", petName: s.petName, themeName: s.theme.name }));
  }
  async ping() {
    return { rows: 10 };
  }
}
