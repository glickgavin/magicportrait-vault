/**
 * Made-up people for tests and local dev (DATA_SOURCE=fixtures). No real customer data.
 *
 * sam@example.com      customer: 2 orders (#1001 mug to choose + hi-res; #1002 mug printed), 3 sessions incl. a recommendation child
 * rose@example.com     customer: an image ordered in one session but not another; Masterpiece order; one image only in a cancelled order
 * charlie@example.com  creator: portraits, no order
 * cancel@example.com   only a cancelled order: not a customer, so a creator
 * super@example.com    super user (local seed) and customer
 * nobody@example.com   nothing found
 */
import type { ImagenPortraitRow, MirrorSession, MugJob, ShopifyLineItem, ShopifyOrder } from "./types";

const IMG = (n: number) => `/fixtures/portraits/pet-${((n - 1) % 8) + 1}.jpg`;
const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

type FxSession = {
  id: string;
  lptemp: string;
  email: string;
  createdAt: string;
  theme: { id: string; name: string; slug: string };
  petName: string | null;
  childOf?: string;
  images: number; // tiles
};

const THEMES = {
  royal: { id: uuid("7e000000", 1), name: "Royal Robes", slug: "royal-robes" },
  cozy: { id: uuid("7e000000", 2), name: "Christmas Cozy", slug: "christmas-cozy" },
  space: { id: uuid("7e000000", 3), name: "Space Explorer", slug: "space-explorer" },
  garden: { id: uuid("7e000000", 4), name: "Garden Party", slug: "garden-party" },
  bath: { id: uuid("7e000000", 5), name: "Bathroom Bliss", slug: "bathroom-bliss" },
};

export const FX_SESSIONS: FxSession[] = [
  { id: uuid("5e550001", 1), lptemp: uuid("1a000000", 1), email: "sam@example.com", createdAt: "2026-10-20T10:00:00Z", theme: THEMES.royal, petName: "Biscuit", images: 4 },
  { id: uuid("5e550001", 2), lptemp: uuid("1a000000", 2), email: "sam@example.com", createdAt: "2026-11-01T09:00:00Z", theme: THEMES.cozy, petName: "Biscuit", images: 4 },
  { id: uuid("5e550001", 3), lptemp: uuid("1a000000", 1), email: "", createdAt: "2026-10-20T10:20:00Z", theme: THEMES.space, petName: "Biscuit", childOf: uuid("5e550001", 1), images: 4 },
  { id: uuid("5e550002", 1), lptemp: uuid("1a000000", 3), email: "rose@example.com", createdAt: "2026-09-12T12:00:00Z", theme: THEMES.garden, petName: "Luna", images: 4 },
  { id: uuid("5e550002", 2), lptemp: uuid("1a000000", 4), email: "rose@example.com", createdAt: "2026-10-02T12:00:00Z", theme: THEMES.bath, petName: "Luna", images: 4 },
  { id: uuid("5e550003", 1), lptemp: uuid("1a000000", 5), email: "charlie@example.com", createdAt: "2026-10-28T15:00:00Z", theme: THEMES.royal, petName: "Pepper", images: 4 },
  { id: uuid("5e550003", 2), lptemp: uuid("1a000000", 6), email: "charlie@example.com", createdAt: "2026-10-29T15:00:00Z", theme: THEMES.space, petName: null, images: 4 },
  { id: uuid("5e550004", 1), lptemp: uuid("1a000000", 7), email: "cancel@example.com", createdAt: "2026-10-10T08:00:00Z", theme: THEMES.garden, petName: "Mochi", images: 4 },
  { id: uuid("5e550005", 1), lptemp: uuid("1a000000", 8), email: "super@example.com", createdAt: "2026-10-15T08:00:00Z", theme: THEMES.cozy, petName: "Rex", images: 4 },
];

/** Image id for session s, tile t. */
export const fxImageId = (sessionId: string, tile: number) => `${sessionId.slice(0, 8)}-${sessionId.slice(-4)}-4000-8000-${String(tile + 1).padStart(12, "0")}`;

let imgCounter = 0;
const IMAGE_FILE = new Map<string, string>();
for (const s of FX_SESSIONS) for (let t = 0; t < s.images; t++) IMAGE_FILE.set(fxImageId(s.id, t), IMG(++imgCounter));
export const fxImageUrl = (imageId: string) => IMAGE_FILE.get(imageId) ?? IMG(1);

/** revenue_events: images ordered (legacy order ids). One of Rose's is ordered on an order from another email. */
const REVENUE: { imageId: string; orderLegacyId: string; lineLegacyId: string; at: string }[] = [
  { imageId: fxImageId(uuid("5e550001", 1), 0), orderLegacyId: "5550000001001", lineLegacyId: "9001", at: "2026-10-21T09:00:00Z" },
  { imageId: fxImageId(uuid("5e550001", 1), 2), orderLegacyId: "5550000001001", lineLegacyId: "9002", at: "2026-10-21T09:00:00Z" },
  { imageId: fxImageId(uuid("5e550002", 1), 0), orderLegacyId: "5550000001003", lineLegacyId: "9101", at: "2026-09-13T09:00:00Z" },
  { imageId: fxImageId(uuid("5e550002", 1), 1), orderLegacyId: "5550000009999", lineLegacyId: "9901", at: "2026-09-20T09:00:00Z" }, // placed on another email
  { imageId: fxImageId(uuid("5e550002", 2), 3), orderLegacyId: "5550000001004", lineLegacyId: "9201", at: "2026-10-03T09:00:00Z" }, // cancelled order
  { imageId: fxImageId(uuid("5e550005", 1), 0), orderLegacyId: "5550000001005", lineLegacyId: "9301", at: "2026-10-16T09:00:00Z" },
];

export const FX_MIRROR: Record<string, MirrorSession[]> = {};
for (const s of FX_SESSIONS) {
  if (!s.email) continue; // recommendation children are never in the mirror
  (FX_MIRROR[s.email] ??= []).push({ imagenSessionId: s.id, lptempSessionId: s.lptemp, firstSeenAt: s.createdAt, lastSeenAt: s.createdAt });
}
for (const list of Object.values(FX_MIRROR)) list.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

export function fxPortraitRows(sessionIds: string[], includeChildren: boolean): ImagenPortraitRow[] {
  const wanted = new Set(sessionIds);
  if (includeChildren) for (const s of FX_SESSIONS) if (s.childOf && wanted.has(s.childOf)) wanted.add(s.id);
  const rows: ImagenPortraitRow[] = [];
  for (const s of FX_SESSIONS) {
    if (!wanted.has(s.id)) continue;
    for (let t = 0; t < s.images; t++) {
      const imageId = fxImageId(s.id, t);
      const rev = REVENUE.filter((r) => r.imageId === imageId);
      rows.push({
        imageId,
        sessionId: s.id,
        sessionCreatedAt: s.createdAt,
        sessionStatus: "done",
        isRecommendationChild: Boolean(s.childOf),
        parentSessionId: s.childOf ?? null,
        petName: s.petName,
        themeId: s.theme.id,
        themeName: s.theme.name,
        themeSlug: s.theme.slug,
        createdAt: new Date(new Date(s.createdAt).getTime() + t * 1000).toISOString(),
        tileIndex: t,
        width: 1024,
        height: 1024,
        format: "jpg",
        imagePath: `sessions/${s.id}/generated/tile_${t}.jpg`,
        imageUrl: fxImageUrl(imageId),
        ordered: rev.length > 0,
        shopifyOrderIds: [...new Set(rev.map((r) => r.orderLegacyId))],
        shopifyLineItemIds: rev.map((r) => r.lineLegacyId),
        firstOrderedAt: rev[0]?.at ?? null,
      });
    }
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ------------------------------------------------------------------ Shopify orders
function line(id: string, title: string, attrs: Record<string, string>, opts: Partial<ShopifyLineItem> = {}): ShopifyLineItem {
  return {
    id: `gid://shopify/LineItem/${id}`,
    title,
    quantity: 1,
    currentQuantity: 1,
    unfulfilledQuantity: 1,
    productId: "gid://shopify/Product/8471707222212",
    productLegacyId: "8471707222212",
    variantId: null,
    variantLegacyId: null,
    customAttributes: Object.entries(attrs).map(([key, value]) => ({ key, value })),
    imageUrl: null,
    ...opts,
  };
}
const portraitLine = (lineId: string, sessionId: string, tile: number, theme: string, extra: Record<string, string> = {}) =>
  line(lineId, "Magic Portrait Canvas", { _tile_id: fxImageId(sessionId, tile), _image_url: fxImageUrl(fxImageId(sessionId, tile)), _theme: theme, _size: "12x12", _tile_type: "portrait", ...extra });
const mugLine = (lineId: string, tile = "none_selected", unfulfilled = 1) =>
  line(lineId, "Magic Mug with Photo", { _free_gift: "magic_mug", _mug_portrait_tile_id: tile, _print_file_status: "none_selected", _gelato_product_uid: "mug_product_msz_11-oz_mmat_ceramic-black_cl_4-0" }, {
    productId: "gid://shopify/Product/8600824643780",
    productLegacyId: "8600824643780",
    variantId: "gid://shopify/ProductVariant/46177764769988",
    variantLegacyId: "46177764769988",
    unfulfilledQuantity: unfulfilled,
  });

const customer = (n: number, first: string, last: string, email: string) => ({ id: `gid://shopify/Customer/77${n}`, firstName: first, lastName: last, email });

function order(o: Partial<ShopifyOrder> & { legacyId: string; name: string; email: string; lineItems: ShopifyLineItem[] }): ShopifyOrder {
  return {
    id: `gid://shopify/Order/${o.legacyId}`,
    createdAt: "2026-10-21T08:55:00Z",
    processedAt: "2026-10-21T08:55:00Z",
    cancelledAt: null,
    test: false,
    customer: null,
    financialStatus: "PAID",
    fulfillmentStatus: "UNFULFILLED",
    tags: [],
    statusPageUrl: null,
    total: { amount: String(29 + o.lineItems.length * 20) + ".00", currency: "USD" },
    mugChoice: null,
    ...o,
  };
}

const S = (p: string, n: number) => uuid(p, n);

/** Mutable copy so fixture writes (mug choice, tags) behave like Shopify in dev and e2e. */
export function buildFixtureOrders(): ShopifyOrder[] {
  const sam = customer(1, "Sam", "Lee", "sam@example.com");
  const rose = customer(2, "Rose", "Patel", "rose@example.com");
  const sup = customer(3, "Alex", "Admin", "super@example.com");
  const can = customer(4, "Casey", "Cancel", "cancel@example.com");
  return [
    order({
      legacyId: "5550000001002",
      name: "#1002",
      email: "sam@example.com",
      customer: sam,
      createdAt: "2026-11-02T10:00:00Z",
      processedAt: "2026-11-02T10:00:00Z",
      fulfillmentStatus: "FULFILLED",
      mugChoice: { value: JSON.stringify({ tile_id: fxImageId(S("5e550001", 2), 1), image_url: fxImageUrl(fxImageId(S("5e550001", 2), 1)), source: "redeem", updated_at: "2026-11-02T11:00:00Z" }), updatedAt: "2026-11-02T11:00:00Z", compareDigest: "fx-digest-1002" },
      lineItems: [portraitLine("8102", S("5e550001", 2), 1, "Christmas Cozy", { _imagegen_session_id: S("5e550001", 2) }), mugLine("8103", fxImageId(S("5e550001", 2), 1), 0)],
    }),
    order({
      legacyId: "5550000001001",
      name: "#1001",
      email: "sam@example.com",
      customer: sam,
      lineItems: [
        portraitLine("8001", S("5e550001", 1), 0, "Royal Robes"),
        portraitLine("8002", S("5e550001", 1), 2, "Royal Robes"),
        mugLine("8003"),
        line("8004", "High-Res Download", { _addon: "hires_download", _image_count: "2" }, { productId: "gid://shopify/Product/8629738045636", productLegacyId: "8629738045636" }),
      ],
    }),
    order({
      legacyId: "5550000001003",
      name: "#1003",
      email: "rose@example.com",
      customer: rose,
      createdAt: "2026-09-13T08:00:00Z",
      processedAt: "2026-09-13T08:00:00Z",
      fulfillmentStatus: "FULFILLED",
      lineItems: [
        portraitLine("8201", S("5e550002", 1), 0, "Garden Party"),
        line("8202", "Masterpiece Digital File", { _masterpiece: "true", _masterpiece_digital: "true", _image_id: fxImageId(S("5e550002", 1), 2), _image_url: fxImageUrl(fxImageId(S("5e550002", 1), 2)), _theme: "Garden Party" }, { productId: "gid://shopify/Product/8801988214980", productLegacyId: "8801988214980" }),
      ],
    }),
    order({
      legacyId: "5550000001004",
      name: "#1004",
      email: "rose@example.com",
      customer: rose,
      createdAt: "2026-10-03T08:00:00Z",
      cancelledAt: "2026-10-03T09:00:00Z",
      financialStatus: "REFUNDED",
      lineItems: [portraitLine("8301", S("5e550002", 2), 3, "Bathroom Bliss")],
    }),
    order({
      legacyId: "5550000001005",
      name: "#1005",
      email: "super@example.com",
      customer: sup,
      createdAt: "2026-10-16T08:00:00Z",
      lineItems: [portraitLine("8401", S("5e550005", 1), 0, "Christmas Cozy"), mugLine("8402")],
    }),
    order({
      legacyId: "5550000001006",
      name: "#1006",
      email: "cancel@example.com",
      customer: can,
      createdAt: "2026-10-11T08:00:00Z",
      cancelledAt: "2026-10-11T12:00:00Z",
      financialStatus: "VOIDED",
      lineItems: [portraitLine("8501", S("5e550004", 1), 0, "Garden Party")],
    }),
  ];
}

export const FX_MUG_JOBS: Record<string, MugJob[]> = {
  "5550000001001": [{ shopifyLineItemId: "8003", tileId: "none_selected", state: "received", gelatoOrderId: null, shopifyFulfillmentId: null, mugReady: false, manualApproval: null, trackingUrl: null, updatedAt: "2026-10-21T09:00:00Z" }],
  "5550000001002": [{ shopifyLineItemId: "8103", tileId: fxImageId(S("5e550001", 2), 1), state: "printed", gelatoOrderId: "gel-1002", shopifyFulfillmentId: null, mugReady: true, manualApproval: null, trackingUrl: null, updatedAt: "2026-11-03T09:00:00Z" }],
};

export const FIXTURE_EMAILS = ["sam@example.com", "rose@example.com", "charlie@example.com", "cancel@example.com", "super@example.com", "nobody@example.com"];
