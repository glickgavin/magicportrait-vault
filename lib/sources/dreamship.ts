import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { SourceNotConfigured } from "./index";

/**
 * Dreamship, the printer (docs/dreamship.md), with this app's own key (DREAMSHIP_API_KEY, server only).
 *
 * CLAUDE.md allowed write 8 (26 Nov): `createProduct` makes a new Dreamship product as a copy of one of ours (a
 * clone with a new name), published to the same shops as a draft. Nothing else about products is ever written.
 *
 * CLAUDE.md allowed write 7: the only order writes are uploading the customer's picture as artwork and setting it on a
 * line of the Dreamship order imported for a paid Shopify order. There is deliberately **no submit, cancel or
 * status change** here: order status is Shopify's and Dreamship's. A test checks this interface has none.
 *
 * Field names (checked against Dreamship's API reference, docs.dreamship.com/reference, 26 Nov):
 * - `GET /products/{id}/`: `item` {id, name}; `product_variants` [{id, item_variant, size, color, price, cost}];
 *   `print_areas` [{key, name, url, …}] without pixel sizes (those are the catalog item's).
 * - `GET /products/?page&limit`: `{ paging: {count, next, previous}, data: [product…] }`, each with
 *   `shop_products` [{marketplace_id (the Shopify product id), shop}].
 * - `GET /items/{id}/`: `production_days_min`/`_max`; `print_areas` [{key, w, h, dpi}] (pixels).
 * - `GET /orders/{id}/`, `GET /orders/?reference_id=`: line items with `product_variant` and `item_variant` (integers).
 * The older shape read through Dreamship's connector (24 Nov: `variants` with `product_variant_id`, print areas with
 * `width_px`/`height_px`) is still read, so either works. The two write paths (artwork upload, a line's artwork) aren't
 * in the public reference; they're listed under Blocked in BUILD_LOG.md.
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
export type DreamshipCloneSource = {
  id: number;
  name: string;
  description: string | null;
  itemId: number;
  primaryColorId: number | null;
  tags: string[];
  personalized: boolean;
  variants: { itemVariantId: number; price: string }[];
  /** As Dreamship holds them: the artwork's address and how it's placed. */
  printAreas: { key: string; url: string; resize: string | null; position: string | null; left: string | null; top: string | null; width: string | null; height: string | null; rotate: number | null; aiUpscale: boolean }[];
  shopKeys: string[];
};

const asObj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const asNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
const asStr = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** Reads `GET /products/{id}/` for cloning (docs.dreamship.com/reference/retrieveproduct). */
export function parseCloneSource(body: unknown, id: number): DreamshipCloneSource | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const dec = (v: unknown) => (v == null || v === "" ? null : String(v));
  const itemId = asNum(asObj(b.item).id) ?? asNum(b.item);
  if (!itemId) return null;
  const variants = (Array.isArray(b.product_variants) ? b.product_variants : []).flatMap((x) => {
    const v = asObj(x);
    const iv = asNum(v.item_variant) ?? asNum(asObj(v.item_variant).id);
    const price = dec(v.price);
    return iv && price && Number.isFinite(Number(price)) ? [{ itemVariantId: iv, price: Number(price).toFixed(2) }] : [];
  });
  const printAreas = (Array.isArray(b.print_areas) ? b.print_areas : []).flatMap((x) => {
    const a = asObj(x);
    const key = asStr(a.key);
    const url = asStr(a.url);
    return key && url && url.startsWith("https://") ? [{ key, url, resize: asStr(a.resize), position: asStr(a.position), left: dec(a.artwork_left), top: dec(a.artwork_top), width: dec(a.artwork_width), height: dec(a.artwork_height), rotate: asNum(a.rotate), aiUpscale: a.ai_upscale === true }] : [];
  });
  const shopKeys = [
    ...new Set(
      (Array.isArray(b.shop_products) ? b.shop_products : []).flatMap((x) => {
        const k = asStr(asObj(asObj(x).shop).key);
        return k ? [k] : [];
      }),
    ),
  ];
  return {
    id: asNum(b.id) ?? id,
    name: asStr(b.name) ?? "",
    description: asStr(b.description),
    itemId,
    primaryColorId: asNum(asObj(b.primary_color).id) ?? asNum(b.primary_color),
    tags: (Array.isArray(b.product_tags) ? b.product_tags : []).filter((x): x is string => typeof x === "string").slice(0, 50),
    personalized: b.personalized === true,
    variants,
    printAreas,
    shopKeys,
  };
}

/** The body of `POST /products/` for a copy (docs.dreamship.com/reference/createproduct): always a draft in the shop. */
export function createProductBody(source: DreamshipCloneSource, name: string): Record<string, unknown> {
  return {
    item: source.itemId,
    name,
    ...(source.description ? { description: source.description } : {}),
    ...(source.primaryColorId ? { primary_color: source.primaryColorId } : {}),
    ...(source.tags.length ? { product_tags: source.tags } : {}),
    item_variants: source.variants.map((v) => ({ id: v.itemVariantId, price: v.price })),
    print_areas: source.printAreas.map((a) => {
      const custom = a.resize === "custom" && a.left != null && a.top != null && a.width != null && a.height != null;
      return {
        key: a.key,
        url: a.url,
        ...(a.resize ? { resize: custom || a.resize !== "custom" ? a.resize : "exact" } : {}),
        ...(a.position ? { position: a.position } : {}),
        ...(custom ? { artwork_left: a.left, artwork_top: a.top, artwork_width: a.width, artwork_height: a.height } : {}),
        ...(a.rotate ? { rotate: a.rotate } : {}),
        ...(a.aiUpscale ? { ai_upscale: true } : {}),
      };
    }),
    shops: source.shopKeys,
    personalized: source.personalized,
    marketplace_draft: true,
  };
}

/** The Shopify listing of a Dreamship product, from `GET /products/{id}/`. */
export function parseListing(body: unknown): { shopifyProductId: string | null; status: string | null; error: string | null } {
  const b = asObj(body);
  const sp = (Array.isArray(b.shop_products) ? b.shop_products : []).map(asObj);
  const listed = sp.find((x) => asNum(x.marketplace_id));
  const any = listed ?? sp[0];
  return { shopifyProductId: listed ? String(asNum(listed.marketplace_id)) : null, status: asStr(any?.publish_status) ?? asStr(b.process_status), error: asStr(any?.error_reason) ?? asStr(b.error_reason) };
}

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
  /**
   * The Dreamship product published as a Shopify product: listed on it (`shop_products.marketplace_id`), or owning
   * one of its SKUs (= Dreamship product variant ids). Null when none. Reads Dreamship's product list.
   */
  findProduct(by: { shopifyProductId?: string | null; variantIds?: number[] }): Promise<number | null>;
  /** What's needed to make a copy of a product: its item, sizes and prices, artwork and shops. Null when not found. */
  cloneSource(productId: number): Promise<DreamshipCloneSource | null>;
  /** Allowed write 8: a new product, a copy of `source` with a new name, published to its shops as a draft. */
  createProduct(source: DreamshipCloneSource, name: string): Promise<{ id: number }>;
  /** The Shopify product a Dreamship product is listed as (null until Dreamship has published it). */
  shopifyIdOf(productId: number): Promise<{ shopifyProductId: string | null; status: string | null; error: string | null } | null>;
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
  /** The fixture product is listed on the fixture Shopify product "Flush" (tests/fixtures). */
  shopifyIdOfProduct = "8710000000";
  /** Products made by `createProduct`, by id: listed in Shopify (as the fixture Flush) on the second look. */
  created = new Map<number, { name: string; looks: number }>();
  async cloneSource(productId: number): Promise<DreamshipCloneSource | null> {
    if (productId !== FX_PRODUCT.id) return null;
    return { id: FX_PRODUCT.id, name: FX_PRODUCT.name, description: null, itemId: FX_PRODUCT.itemId, primaryColorId: 1, tags: [], personalized: false, variants: FX_PRODUCT.variants.map((v) => ({ itemVariantId: v.itemVariantId, price: v.price ?? "0.00" })), printAreas: [{ key: "8x10", url: "https://cdn.example/fixture-art.png", resize: "fill", position: "center_center", left: null, top: null, width: null, height: null, rotate: 0, aiUpscale: false }], shopKeys: ["fixture-shop"] };
  }
  async createProduct(source: DreamshipCloneSource, name: string) {
    const id = ++this.nextId;
    this.created.set(id, { name, looks: 0 });
    this.calls.push({ op: "createProduct", args: createProductBody(source, name) });
    return { id };
  }
  async shopifyIdOf(productId: number) {
    const c = this.created.get(productId);
    if (c) return { shopifyProductId: ++c.looks > 1 ? this.shopifyIdOfProduct : null, status: c.looks > 1 ? "published" : "processing", error: null };
    return productId === FX_PRODUCT.id ? { shopifyProductId: this.shopifyIdOfProduct, status: "published", error: null } : null;
  }
  async findProduct(by: { shopifyProductId?: string | null; variantIds?: number[] }) {
    if (by.shopifyProductId && by.shopifyProductId === this.shopifyIdOfProduct) return FX_PRODUCT.id;
    return (by.variantIds ?? []).some((id) => FX_PRODUCT.variants.some((v) => v.productVariantId === id)) ? FX_PRODUCT.id : null;
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

/** The REST paths, in one place (docs.dreamship.com/reference; the two write paths aren't documented: BUILD_LOG › Blocked). */
export const PATHS = {
  // Dreamship's public API has no account or settings endpoint (docs.dreamship.com/llms.txt, 24 Nov): the
  // shop list proves the key works and names the account.
  shops: "/shops/?limit=20",
  product: (id: number) => `/products/${id}/`,
  products: (page: number) => `/products/?limit=100&page=${page}`,
  createProduct: "/products/",
  item: (id: number) => `/items/${id}/`,
  ordersByReference: (ref: string) => `/orders/?reference_id=${encodeURIComponent(ref)}`,
  order: (id: number) => `/orders/${id}/`,
  artworks: "/artworks/",
  lineItem: (orderId: number, lineId: number) => `/orders/${orderId}/line-items/${lineId}/`,
} as const;

const idOf = (v: unknown): number | null => (v && typeof v === "object" ? num((v as { id?: unknown }).id) : num(v));
const productSchema = z
  .object({
    id: z.number().optional(),
    product_id: z.number().optional(),
    name: z.string().nullable().optional(),
    item_id: z.number().optional(),
    item: z.unknown().optional(),
    status: z.string().nullable().optional(),
    process_status: z.string().nullable().optional(),
    // The REST shape (product_variants) and the connector's (variants); each entry is read on its own below.
    product_variants: z.array(z.unknown()).optional(),
    variants: z.array(z.unknown()).optional(),
    print_areas: z.array(z.unknown()).optional(),
  })
  .passthrough();
/** A print area's pixel size: `w`/`h` (an item's, in the REST API) or `width_px`/`height_px` (the connector's). */
function areaOf(a: unknown): (DreamshipPrintArea & { artworkId: number | null; aiUpscale: boolean }) | null {
  if (!a || typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  const key = typeof o.key === "string" && o.key.trim() ? o.key.trim() : null;
  const w = num(o.width_px ?? o.w);
  const h = num(o.height_px ?? o.h);
  if (!key || !w || !h) return null;
  return { key, widthPx: w, heightPx: h, dpi: num(o.dpi), minDpi: num(o.min_dpi), artworkId: num(o.artwork_id), aiUpscale: o.ai_upscale === true };
}
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
            product_variant: z.unknown().optional(),
            item_variant_id: z.number().nullable().optional(),
            item_variant: z.unknown().optional(),
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
  const itemId = p.item_id ?? idOf(p.item) ?? 0;
  const pid = p.id ?? p.product_id ?? id;
  const money = (v: unknown) => (v == null || v === "" ? null : String(v));
  const variants = (p.product_variants ?? p.variants ?? []).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const v = x as Record<string, unknown>;
    const pv = num(v.product_variant_id) ?? num(v.id);
    const iv = num(v.item_variant_id) ?? idOf(v.item_variant);
    const str = (k: string) => (typeof v[k] === "string" && (v[k] as string).trim() ? (v[k] as string) : null);
    return pv && iv ? [{ productVariantId: pv, itemVariantId: iv, size: str("size"), color: str("color"), price: money(v.retail_price ?? v.price), cost: money(v.cost) }] : [];
  });
  return {
    id: pid,
    name: p.name ?? "",
    itemId,
    status: p.status ?? p.process_status ?? null,
    url: designerUrl(pid),
    variants,
    // The REST product's print areas carry no pixel sizes (the catalog item's do); only sized ones are kept.
    printAreas: (p.print_areas ?? []).flatMap((a) => {
      const x = areaOf(a);
      return x ? [x] : [];
    }),
  };
}

/** A page of Dreamship's product list: the products, and whether there's another page. */
export function parseProductPage(body: unknown): { products: { id: number; shopifyIds: string[]; variantIds: number[] }[]; next: boolean } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const list = Array.isArray(body) ? body : Array.isArray(b.data) ? b.data : Array.isArray(b.results) ? b.results : [];
  const paging = b.paging && typeof b.paging === "object" ? (b.paging as Record<string, unknown>) : null;
  const products = (list as unknown[]).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const id = num(o.id ?? o.product_id);
    if (!id) return [];
    const shops = Array.isArray(o.shop_products) ? o.shop_products : [];
    const shopifyIds = shops.flatMap((sp) => {
      if (!sp || typeof sp !== "object") return [];
      const m = num((sp as Record<string, unknown>).marketplace_id);
      return m ? [String(m)] : [];
    });
    const vs = Array.isArray(o.product_variants) ? o.product_variants : Array.isArray(o.variants) ? o.variants : [];
    const variantIds = vs.flatMap((v) => {
      const n = v && typeof v === "object" ? (num((v as Record<string, unknown>).product_variant_id) ?? num((v as Record<string, unknown>).id)) : null;
      return n ? [n] : [];
    });
    return [{ id, shopifyIds, variantIds }];
  });
  return { products, next: Boolean(paging?.next) || Boolean(b.next) };
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
    lineItems: o.line_items.map((l) => ({ id: l.id, productVariantId: l.product_variant_id ?? idOf(l.product_variant), itemVariantId: l.item_variant_id ?? idOf(l.item_variant), quantity: l.quantity, printAreas: l.print_areas.map((a) => ({ key: a.key, artworkId: a.artwork_id ?? null })) })),
  };
}

/**
 * The account, from Dreamship's shop list (the public API's only account-level read). Dreamship's
 * own order settings aren't in its API, so they stay null ("Not reported"): check them in Dreamship.
 */
export function parseShops(body: unknown): DreamshipAccount {
  // A bare list, or a page of them under `results` or `data` (Dreamship's list endpoints use both).
  const page = body && typeof body === "object" && !Array.isArray(body) ? (body as { results?: unknown; data?: unknown }) : null;
  const list = Array.isArray(body) ? body : Array.isArray(page?.results) ? (page.results as unknown[]) : Array.isArray(page?.data) ? (page.data as unknown[]) : [];
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
    const item = await this.get(PATHS.item(itemId));
    if (!item) return null;
    const i = item as Record<string, unknown>;
    // The item's own print areas, with their pixel size as `w` and `h`.
    const printAreas = (Array.isArray(i.print_areas) ? i.print_areas : []).flatMap((a) => {
      const x = areaOf(a);
      return x ? [{ key: x.key, widthPx: x.widthPx, heightPx: x.heightPx, dpi: x.dpi, minDpi: x.minDpi }] : [];
    });
    return { id: itemId, name: String(i.name ?? ""), productionDaysMin: num(i.production_days_min), productionDaysMax: num(i.production_days_max), printAreas };
  }
  async productForVariant(productVariantId: number) {
    return this.findProduct({ variantIds: [productVariantId] });
  }
  /** Dreamship's product list, read once per request (a few pages for this account), then matched. */
  private listed: Promise<{ id: number; shopifyIds: string[]; variantIds: number[] }[]> | null = null;
  private async allProducts() {
    this.listed ??= (async () => {
      const out: { id: number; shopifyIds: string[]; variantIds: number[] }[] = [];
      for (let page = 1; page <= 20; page++) {
        const r = parseProductPage(await this.req(PATHS.products(page)));
        out.push(...r.products);
        if (!r.next || !r.products.length) break;
      }
      return out;
    })();
    return this.listed;
  }
  async findProduct(by: { shopifyProductId?: string | null; variantIds?: number[] }) {
    const list = await this.allProducts();
    const shopify = by.shopifyProductId?.trim();
    const byShop = shopify ? list.find((p) => p.shopifyIds.includes(shopify)) : undefined;
    if (byShop) return byShop.id;
    const ids = new Set(by.variantIds ?? []);
    return list.find((p) => p.variantIds.some((v) => ids.has(v)))?.id ?? null;
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
  async cloneSource(productId: number) {
    const body = await this.get(PATHS.product(productId));
    return body ? parseCloneSource(body, productId) : null;
  }
  async createProduct(source: DreamshipCloneSource, name: string) {
    const body = (await this.req(PATHS.createProduct, { method: "POST", body: JSON.stringify(createProductBody(source, name)) })) as { id?: number } | null;
    if (!body?.id) throw new DreamshipError("no product id", "bad_response");
    return { id: body.id };
  }
  async shopifyIdOf(productId: number) {
    const body = await this.get(PATHS.product(productId));
    return body ? parseListing(body) : null;
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
