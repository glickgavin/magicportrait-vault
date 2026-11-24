import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { SourceNotConfigured } from "./index";

/**
 * Dreamship, the printer (docs/dreamship.md), with this app's own key (DREAMSHIP_API_KEY, server only).
 *
 * CLAUDE.md allowed write 7: the only writes are uploading the customer's picture as artwork and setting it on a
 * line of the Dreamship order imported for a paid Shopify order. There is deliberately **no submit, cancel or
 * status change** here: order status is Shopify's and Dreamship's. A test checks this interface has none.
 *
 * Field names follow what Dreamship returns for this account (read through Dreamship's connector, 24 Nov): the
 * business settings (`auto_submit_order_import_orders`, `auto_submit_api_orders`), a product's design (variants
 * with `product_variant_id`, `item_variant_id`, `retail_price`, `cost`; print areas with `key`, `width_px`,
 * `height_px`, `min_dpi`, `ai_upscale`, `artwork_id`) and a catalog item (`production_days_min`/`_max`). The REST
 * paths in `PATHS` and the two write bodies couldn't be read from the schema; they're listed under Blocked in
 * BUILD_LOG.md and live in one place so confirming them is a small change.
 */

export type DreamshipAccount = {
  businessName: string;
  plan: string | null;
  /** Dreamship's own order settings, read only. null when Dreamship doesn't say. */
  settings: { autoImportOrders: boolean | null; autoSubmitImportOrders: boolean | null; autoSubmitApiOrders: boolean | null };
};

export type DreamshipPrintArea = { key: string; widthPx: number; heightPx: number; dpi: number | null; minDpi: number | null };

export type DreamshipProduct = {
  id: number;
  name: string;
  itemId: number;
  status: string | null;
  url: string;
  variants: { productVariantId: number; itemVariantId: number; size: string | null; color: string | null; price: string | null; cost: string | null }[];
  /** The print areas the design uses, with the artwork on each. */
  printAreas: (DreamshipPrintArea & { artworkId: number | null; aiUpscale: boolean })[];
};

export type DreamshipCatalogItem = { id: number; name: string; productionDaysMin: number | null; productionDaysMax: number | null; printAreas: DreamshipPrintArea[] };

export type DreamshipOrderStatus = "draft" | "submitted" | "accepted" | "rejected" | "partially_fulfilled" | "fulfilled" | "cancelled" | string;
export type DreamshipLineItem = { id: number; productVariantId: number | null; itemVariantId: number | null; quantity: number; printAreas: { key: string; artworkId: number | null }[] };
export type DreamshipOrder = { id: number; referenceId: string | null; status: DreamshipOrderStatus; url: string; lineItems: DreamshipLineItem[] };

export type DreamshipArtwork = { id: number; status: string | null };

/** Why setting a line's artwork was refused: Dreamship already sent the order to print, or something else. */
export class DreamshipError extends Error {
  constructor(
    message: string,
    public code: "not_editable" | "not_found" | "http" | "bad_response",
    public status = 0,
  ) {
    super(message);
  }
}

export interface DreamshipSource {
  readonly kind: "live" | "fixtures";
  account(): Promise<DreamshipAccount>;
  product(productId: number): Promise<DreamshipProduct | null>;
  catalogItem(itemId: number): Promise<DreamshipCatalogItem | null>;
  /** The product a product variant belongs to (Dreamship's Shopify app sets a size's SKU to that variant's id). */
  productForVariant(productVariantId: number): Promise<number | null>;
  /** The order Dreamship imported for a Shopify order, by its reference id (null until it's imported). */
  orderByReference(referenceId: string): Promise<DreamshipOrder | null>;
  order(orderId: number): Promise<DreamshipOrder | null>;
  /** Allowed write 7: the customer's picture as artwork, from a short-lived link to our print file. */
  uploadArtwork(input: { url: string; name: string }): Promise<DreamshipArtwork>;
  /** Allowed write 7: that artwork on one line's print area. Throws DreamshipError("not_editable") once it's in production. */
  setLineArtwork(orderId: number, lineItemId: number, input: { printArea: string; artworkId: number }): Promise<void>;
}

/** Statuses after which Dreamship no longer takes artwork changes. */
export const LOCKED_STATUSES = new Set(["submitted", "accepted", "partially_fulfilled", "fulfilled", "cancelled"]);

export const designerUrl = (productId: number) => `https://app.dreamship.com/app/products/${productId}`;
export const orderUrl = (orderId: number) => `https://app.dreamship.com/app/orders/${orderId}`;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

// ------------------------------------------------------------------------------------------------ fixtures

/** Made-up orders only; the product and catalog item mirror the real Flush poster's numbers (docs/dreamship.md). */
const FX_PRODUCT: DreamshipProduct = {
  id: 9972256,
  name: 'Framed Dog Poster "Flush"',
  itemId: 958,
  status: "processed",
  url: designerUrl(9972256),
  variants: [
    { productVariantId: 45378125, itemVariantId: 17383, size: '8x10"', color: "Black", price: "59.99", cost: "22.99" },
    { productVariantId: 45378127, itemVariantId: 17398, size: '12x16"', color: "Black", price: "69.99", cost: "32.19" },
    { productVariantId: 45378126, itemVariantId: 17418, size: '16x24"', color: "Black", price: "89.99", cost: "64.79" },
    { productVariantId: 45378124, itemVariantId: 17428, size: '24x36"', color: "Black", price: "129.99", cost: "135.69" },
  ],
  printAreas: [
    { key: "8x10", widthPx: 1800, heightPx: 2400, dpi: 146, minDpi: 250, artworkId: 10669431, aiUpscale: false },
    { key: "12x16", widthPx: 3000, heightPx: 4200, dpi: 80, minDpi: 250, artworkId: 10669431, aiUpscale: false },
    { key: "16x24", widthPx: 4200, heightPx: 6600, dpi: 53, minDpi: 250, artworkId: 10669431, aiUpscale: false },
    { key: "24x36", widthPx: 6600, heightPx: 10200, dpi: 34, minDpi: 250, artworkId: 10669431, aiUpscale: false },
  ],
};
const FX_ITEM: DreamshipCatalogItem = {
  id: 958,
  name: "Framed Poster",
  productionDaysMin: 1,
  productionDaysMax: 3,
  printAreas: [
    { key: "8x10", widthPx: 1800, heightPx: 2400, dpi: 300, minDpi: 250 },
    { key: "12x16", widthPx: 3000, heightPx: 4200, dpi: 300, minDpi: 250 },
    { key: "16x24", widthPx: 4200, heightPx: 6600, dpi: 300, minDpi: 250 },
    { key: "24x36", widthPx: 6600, heightPx: 10200, dpi: 300, minDpi: 250 },
    { key: "8x8", widthPx: 1800, heightPx: 1800, dpi: 300, minDpi: 250 },
  ],
};

type FxOrder = DreamshipOrder & { importAfter: number };

/**
 * In-memory Dreamship for tests and local dev. Orders are "imported" when a test (or the fixture paid-order helper)
 * queues one; `importAfterPolls` lets a test see "not imported yet, then imported".
 */
export class DreamshipFixtures implements DreamshipSource {
  readonly kind = "fixtures" as const;
  readonly calls: { op: string; args: unknown }[] = [];
  settings = { autoImportOrders: true as boolean | null, autoSubmitImportOrders: true as boolean | null, autoSubmitApiOrders: true as boolean | null };
  private orders = new Map<string, FxOrder>();
  private artworks = new Map<number, { url: string; name: string }>();
  private nextId = 7_000_000;
  private polls = new Map<string, number>();

  reset() {
    this.orders.clear();
    this.artworks.clear();
    this.polls.clear();
    this.calls.length = 0;
    this.settings = { autoImportOrders: true, autoSubmitImportOrders: true, autoSubmitApiOrders: true };
  }

  /** Test helper: Dreamship imports this Shopify order (lines by product variant id), after `importAfterPolls` lookups. */
  importOrder(referenceId: string, lines: { productVariantId: number; quantity?: number }[], opts: { status?: DreamshipOrderStatus; importAfterPolls?: number } = {}): DreamshipOrder {
    const id = ++this.nextId;
    const order: FxOrder = {
      id,
      referenceId,
      status: opts.status ?? "draft",
      url: orderUrl(id),
      importAfter: opts.importAfterPolls ?? 0,
      lineItems: lines.map((l, i) => {
        const v = FX_PRODUCT.variants.find((x) => x.productVariantId === l.productVariantId);
        const area = v?.size?.replace(/"/g, "") ?? null;
        return { id: id * 10 + i, productVariantId: l.productVariantId, itemVariantId: v?.itemVariantId ?? null, quantity: l.quantity ?? 1, printAreas: area ? [{ key: area, artworkId: 10669431 }] : [] };
      }),
    };
    this.orders.set(referenceId, order);
    return structuredClone(order);
  }

  setOrderStatus(referenceId: string, status: DreamshipOrderStatus) {
    const o = this.orders.get(referenceId);
    if (o) o.status = status;
  }

  async account(): Promise<DreamshipAccount> {
    return { businessName: "Storyboards Inc", plan: "basic", settings: { ...this.settings } };
  }
  async product(productId: number) {
    return productId === FX_PRODUCT.id ? structuredClone(FX_PRODUCT) : null;
  }
  async catalogItem(itemId: number) {
    return itemId === FX_ITEM.id ? structuredClone(FX_ITEM) : null;
  }
  async productForVariant(productVariantId: number) {
    return FX_PRODUCT.variants.some((v) => v.productVariantId === productVariantId) ? FX_PRODUCT.id : null;
  }
  async orderByReference(referenceId: string) {
    const o = this.orders.get(referenceId);
    if (!o) return null;
    const n = (this.polls.get(referenceId) ?? 0) + 1;
    this.polls.set(referenceId, n);
    if (n <= o.importAfter) return null;
    const { importAfter: _wait, ...rest } = o;
    void _wait;
    return structuredClone(rest);
  }
  async order(orderId: number) {
    for (const o of this.orders.values()) if (o.id === orderId) return this.orderByReference(o.referenceId ?? "");
    return null;
  }
  async uploadArtwork(input: { url: string; name: string }): Promise<DreamshipArtwork> {
    const id = ++this.nextId;
    this.artworks.set(id, input);
    this.calls.push({ op: "uploadArtwork", args: { name: input.name, url: input.url.replace(/[?#].*$/, "") } });
    return { id, status: "valid" };
  }
  async setLineArtwork(orderId: number, lineItemId: number, input: { printArea: string; artworkId: number }) {
    this.calls.push({ op: "setLineArtwork", args: { orderId, lineItemId, ...input } });
    const o = [...this.orders.values()].find((x) => x.id === orderId);
    const line = o?.lineItems.find((l) => l.id === lineItemId);
    if (!o || !line) throw new DreamshipError("line not found", "not_found", 404);
    if (LOCKED_STATUSES.has(o.status)) throw new DreamshipError("order is in production", "not_editable", 400);
    line.printAreas = [...line.printAreas.filter((p) => p.key !== input.printArea), { key: input.printArea, artworkId: input.artworkId }];
  }
  artworkUrl(id: number): string | null {
    return this.artworks.get(id)?.url ?? null;
  }
}

const g = globalThis as unknown as { __dreamshipFixtures?: DreamshipFixtures };
/** One fixture Dreamship per process, so an order "imported" by a test is seen by the app's routes. */
export function dreamshipFixtures(): DreamshipFixtures {
  g.__dreamshipFixtures ??= new DreamshipFixtures();
  return g.__dreamshipFixtures;
}

// ------------------------------------------------------------------------------------------------ live

/** The REST paths, in one place. To confirm against https://api.dreamship.com/v1/schema/ (BUILD_LOG › Blocked). */
export const PATHS = {
  // Dreamship's public API has no account or settings endpoint (docs.dreamship.com/llms.txt, 24 Nov): the
  // shop list proves the key works and names the account.
  shops: "/shops/?limit=20",
  product: (id: number) => `/products/${id}/`,
  productVariant: (id: number) => `/product-variants/${id}/`,
  item: (id: number) => `/items/${id}/`,
  itemPrintAreas: (id: number) => `/items/${id}/print-areas/`,
  ordersByReference: (ref: string) => `/orders/?reference_id=${encodeURIComponent(ref)}`,
  order: (id: number) => `/orders/${id}/`,
  artworks: "/artworks/",
  lineItem: (orderId: number, lineId: number) => `/orders/${orderId}/line-items/${lineId}/`,
} as const;

const area = z.object({ key: z.string(), width_px: z.number(), height_px: z.number(), dpi: z.number().nullable().optional(), min_dpi: z.number().nullable().optional() }).passthrough();
const productSchema = z
  .object({
    id: z.number().optional(),
    product_id: z.number().optional(),
    name: z.string().default(""),
    item_id: z.number().optional(),
    item: z.union([z.number(), z.object({ id: z.number() }).passthrough(), z.string()]).optional(),
    status: z.string().nullable().optional(),
    variants: z.array(z.object({ product_variant_id: z.number().optional(), id: z.number().optional(), item_variant_id: z.number().optional(), size: z.string().nullable().optional(), color: z.string().nullable().optional(), retail_price: z.union([z.string(), z.number()]).nullable().optional(), price: z.union([z.string(), z.number()]).nullable().optional(), cost: z.union([z.string(), z.number()]).nullable().optional() }).passthrough()).default([]),
    print_areas: z.array(area.extend({ artwork_id: z.number().nullable().optional(), ai_upscale: z.boolean().optional() })).default([]),
  })
  .passthrough();
const orderSchema = z
  .object({
    id: z.number(),
    reference_id: z.string().nullable().optional(),
    status: z.string().default("draft"),
    line_items: z
      .array(
        z
          .object({
            id: z.number(),
            product_variant_id: z.number().nullable().optional(),
            item_variant_id: z.number().nullable().optional(),
            quantity: z.number().default(1),
            print_areas: z.array(z.object({ key: z.string(), artwork_id: z.number().nullable().optional() }).passthrough()).default([]),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export function parseProduct(body: unknown, id: number): DreamshipProduct | null {
  const r = productSchema.safeParse(body);
  if (!r.success) return null;
  const p = r.data;
  const itemId = p.item_id ?? (typeof p.item === "number" ? p.item : typeof p.item === "object" ? p.item.id : 0);
  return {
    id: p.id ?? p.product_id ?? id,
    name: p.name,
    itemId,
    status: p.status ?? null,
    url: designerUrl(p.id ?? p.product_id ?? id),
    variants: p.variants.flatMap((v) => {
      const pv = v.product_variant_id ?? v.id;
      return pv && v.item_variant_id ? [{ productVariantId: pv, itemVariantId: v.item_variant_id, size: v.size ?? null, color: v.color ?? null, price: v.retail_price != null ? String(v.retail_price) : v.price != null ? String(v.price) : null, cost: v.cost != null ? String(v.cost) : null }] : [];
    }),
    printAreas: p.print_areas.map((a) => ({ key: a.key, widthPx: a.width_px, heightPx: a.height_px, dpi: a.dpi ?? null, minDpi: a.min_dpi ?? null, artworkId: a.artwork_id ?? null, aiUpscale: Boolean(a.ai_upscale) })),
  };
}

export function parseOrder(body: unknown): DreamshipOrder | null {
  const r = orderSchema.safeParse(body);
  if (!r.success) return null;
  const o = r.data;
  return {
    id: o.id,
    referenceId: o.reference_id ?? null,
    status: o.status,
    url: orderUrl(o.id),
    lineItems: o.line_items.map((l) => ({ id: l.id, productVariantId: l.product_variant_id ?? null, itemVariantId: l.item_variant_id ?? null, quantity: l.quantity, printAreas: l.print_areas.map((a) => ({ key: a.key, artworkId: a.artwork_id ?? null })) })),
  };
}

/**
 * The account, from Dreamship's shop list (the public API's only account-level read). Dreamship's
 * own order settings aren't in its API, so they stay null ("Not reported"): check them in Dreamship.
 */
export function parseShops(body: unknown): DreamshipAccount {
  const list = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as { results?: unknown }).results) ? (body as { results: unknown[] }).results : [];
  const names = list.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const name = [o.name, o.shop_name, o.title].find((v) => typeof v === "string" && v.trim()) as string | undefined;
    const channel = [o.channel, o.platform, o.marketplace, o.type].find((v) => typeof v === "string" && v.trim()) as string | undefined;
    return name ? [channel ? `${name.trim()} (${channel})` : name.trim()] : [];
  });
  return { businessName: names.length ? names.join(", ") : "Connected (no shops)", plan: null, settings: { autoImportOrders: null, autoSubmitImportOrders: null, autoSubmitApiOrders: null } };
}

export function parseAccount(business: unknown, settings: unknown): DreamshipAccount {
  const b = (business ?? {}) as Record<string, unknown>;
  const s = { ...((business ?? {}) as Record<string, unknown>), ...((settings ?? {}) as Record<string, unknown>) };
  const flag = (...keys: string[]) => {
    for (const k of keys) if (typeof s[k] === "boolean") return s[k] as boolean;
    return null;
  };
  return {
    businessName: String(b.business_name ?? b.name ?? s.business_name ?? ""),
    plan: typeof (b.subscription_plan ?? s.subscription_plan) === "string" ? String(b.subscription_plan ?? s.subscription_plan) : null,
    settings: {
      autoImportOrders: flag("auto_import_orders", "auto_import_orders_with_dreamship_products"),
      autoSubmitImportOrders: flag("auto_submit_order_import_orders"),
      autoSubmitApiOrders: flag("auto_submit_api_orders"),
    },
  };
}

export class DreamshipLive implements DreamshipSource {
  readonly kind = "live" as const;
  constructor(private cfg: { url: string; key: string }) {}

  private async req(path: string, init: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${this.cfg.url.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.cfg.key}`, "content-type": "application/json", accept: "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) throw new DreamshipError("not found", "not_found", 404);
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      // Dreamship refuses artwork changes once an order is in production.
      if (res.status === 400 || res.status === 409) throw new DreamshipError(text || `dreamship_http_${res.status}`, /submit|production|editable|status|draft/i.test(text) ? "not_editable" : "http", res.status);
      throw new DreamshipError(`dreamship_http_${res.status}`, "http", res.status);
    }
    return res.status === 204 ? null : res.json();
  }
  private async get(path: string) {
    try {
      return await this.req(path);
    } catch (e) {
      if (e instanceof DreamshipError && e.code === "not_found") return null;
      throw e;
    }
  }

  async account() {
    return parseShops(await this.req(PATHS.shops));
  }
  async product(productId: number) {
    const body = await this.get(PATHS.product(productId));
    return body ? parseProduct(body, productId) : null;
  }
  async catalogItem(itemId: number) {
    const [item, areas] = await Promise.all([this.get(PATHS.item(itemId)), this.get(PATHS.itemPrintAreas(itemId))]);
    if (!item) return null;
    const i = item as Record<string, unknown>;
    const list = (Array.isArray(areas) ? areas : ((areas as Record<string, unknown> | null)?.print_areas ?? (areas as Record<string, unknown> | null)?.data ?? i.print_areas ?? [])) as unknown[];
    const printAreas = list.flatMap((a) => {
      const r = area.safeParse(a);
      return r.success ? [{ key: r.data.key, widthPx: r.data.width_px, heightPx: r.data.height_px, dpi: r.data.dpi ?? null, minDpi: r.data.min_dpi ?? null }] : [];
    });
    return { id: itemId, name: String(i.name ?? ""), productionDaysMin: num(i.production_days_min), productionDaysMax: num(i.production_days_max), printAreas };
  }
  async productForVariant(productVariantId: number) {
    const body = (await this.get(PATHS.productVariant(productVariantId))) as { product_id?: unknown; product?: unknown } | null;
    const id = num(body?.product_id ?? (typeof body?.product === "object" && body?.product ? (body.product as { id?: unknown }).id : body?.product));
    return id && id > 0 ? id : null;
  }
  async orderByReference(referenceId: string) {
    const body = (await this.get(PATHS.ordersByReference(referenceId))) as { data?: unknown[]; results?: unknown[] } | unknown[] | null;
    const list = Array.isArray(body) ? body : (body?.data ?? body?.results ?? []);
    const found = list.map(parseOrder).find((o) => o && o.referenceId === referenceId) ?? null;
    return found ? ((await this.order(found.id)) ?? found) : null;
  }
  async order(orderId: number) {
    const body = await this.get(PATHS.order(orderId));
    return body ? parseOrder(body) : null;
  }
  async uploadArtwork(input: { url: string; name: string }) {
    const body = (await this.req(PATHS.artworks, { method: "POST", body: JSON.stringify({ url: input.url, name: input.name }) })) as { id?: number; status?: string } | null;
    if (!body?.id) throw new DreamshipError("no artwork id", "bad_response");
    return { id: body.id, status: body.status ?? null };
  }
  async setLineArtwork(orderId: number, lineItemId: number, input: { printArea: string; artworkId: number }) {
    await this.req(PATHS.lineItem(orderId, lineItemId), { method: "PATCH", body: JSON.stringify({ print_areas: [{ key: input.printArea, artwork_id: input.artworkId }] }) });
  }
}

/** Fixtures under DATA_SOURCE=fixtures, else Dreamship's API with DREAMSHIP_API_KEY (Vercel only). */
export async function getDreamship(): Promise<DreamshipSource> {
  if (env.dataSource === "fixtures") return dreamshipFixtures();
  const key = env.optional("DREAMSHIP_API_KEY");
  if (!key) throw new SourceNotConfigured("dreamship");
  const { getSettings } = await import("@/lib/settings");
  const url = (await getSettings(["dreamship.api_url"] as const))["dreamship.api_url"];
  return new DreamshipLive({ url, key });
}

export const dreamshipConfigured = () => env.dataSource === "fixtures" || Boolean(env.optional("DREAMSHIP_API_KEY"));
