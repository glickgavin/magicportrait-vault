import type { DiscountInfo, FieldDefinitionSpec, RawMetafield, ShopCatalogSource, ShopFieldDefinition, ShopProduct, ShopVariant, WriteResult } from "./types";

/**
 * In-memory Store collection for tests and local dev. Made-up products only (no customer images);
 * writes change this memory and are recorded in `writes`, never sent anywhere.
 */
export const FX_COLLECTION_ID = "328021508292";
export const FX_OCCASIONS = ["Christmas", "Birthday", "New Year", "For Mom", "For Dad", "Pet lovers"];
export const FX_VIP_EMAIL = "vip.tester@example.com";

const T = "2026-11-01T10:00:00Z";
const mf = (o: Record<string, string>): RawMetafield[] =>
  Object.entries(o).map(([key, value]) => ({ key, value, type: key === "extra" ? "json" : key === "adjustable" ? "boolean" : /_px$|_pct$/.test(key) ? "number_integer" : "single_line_text_field", updatedAt: T }));

let vid = 9000;
const variant = (title: string, price: string, rules: Record<string, string> | null, opts: Partial<ShopVariant> = {}): ShopVariant => {
  vid++;
  return {
    id: `gid://shopify/ProductVariant/4${vid}00000000`,
    legacyId: `4${vid}00000000`,
    title,
    sku: `FX-${vid}`,
    price,
    compareAtPrice: null,
    availableForSale: true,
    options: title === "Default Title" ? [] : [{ name: "Size", value: title }],
    metafields: rules ? mf(rules) : [],
    ...opts,
  };
};

const TEMPLATE = (kind: "corners" | "wrap") => JSON.stringify({ v: 1, kind, background_media_id: null, zone: kind === "corners" ? [[0.2, 0.15], [0.8, 0.15], [0.8, 0.85], [0.2, 0.85]] : { left: 0.18, right: 0.72, top: 0.3, bottom: 0.78, curve: 0.08 } });

let pid = 700;
const product = (p: Omit<ShopProduct, "id" | "legacyId" | "position" | "media" | "description"> & { description?: string }): ShopProduct => {
  pid++;
  return { id: `gid://shopify/Product/8${pid}000000`, legacyId: `8${pid}000000`, position: 0, media: [], description: p.description ?? "", ...p };
};

function buildProducts(): ShopProduct[] {
  vid = 9000;
  pid = 700;
  const list: ShopProduct[] = [
    product({ handle: "fx-ornaments", title: "Magic Xmas Ornaments (set of 2)", productType: "Ornaments", status: "ACTIVE", page: "Gifts", occasions: ["Christmas"], template: { value: TEMPLATE("corners"), updatedAt: T }, variants: [variant("Default Title", "54.99", { maker: "gelato", maker_sku: "fx_ornament_round_set2", print_px: "1200x1200" })] }),
    product({ handle: "fx-mug", title: "Magic Mug with Photo", productType: "Mugs", status: "ACTIVE", page: "All", occasions: ["Christmas", "Birthday", "For Mom", "For Dad"], template: { value: TEMPLATE("wrap"), updatedAt: T }, variants: [variant("Default Title", "49.00", { maker: "gelato", maker_sku: "fx_mug_11oz_white", print_px: "2475x1155", zone_px: "1155x1155", placement: "wrap_zone" })] }),
    product({ handle: "fx-pillow", title: "Magic Pillow with Photo", productType: "Pillows", status: "ACTIVE", page: "Gifts", occasions: ["Christmas", "For Mom"], template: { value: TEMPLATE("corners"), updatedAt: T }, variants: [variant("Default Title", "59.99", { maker: "prodigi", maker_sku: "FX-CUSH-12X12", print_px: "3600x3600", extra: '{"sizing":"fillPrintArea"}' })] }),
    product({ handle: "fx-puzzle", title: "Magic Puzzle", productType: "Puzzles", status: "ACTIVE", page: "All", occasions: ["Christmas", "Birthday"], template: { value: TEMPLATE("corners"), updatedAt: T }, variants: [variant("252 pieces", "49.00", { maker: "in_house", maker_sku: "FX-PZ-252", print_px: "3000x2400" }), variant("500 pieces", "59.00", { maker: "in_house", maker_sku: "FX-PZ-500", print_px: "4200x3000" })] }),
    product({ handle: "fx-acrylic-block", title: "Acrylic Block", productType: "Acrylic", status: "ACTIVE", page: "All", occasions: ["Birthday", "For Mom"], template: { value: TEMPLATE("corners"), updatedAt: T }, variants: [variant("4 × 6 in", "29.00", { maker: "in_house", maker_sku: "FX-AB-4X6", print_px: "1200x1800" }), variant("5 × 7 in", "39.00", { maker: "in_house", maker_sku: "FX-AB-5X7", print_px: "1500x2100" }), variant("6 × 8 in", "59.00", { maker: "in_house", maker_sku: "FX-AB-6X8", print_px: "1800x2400" })] }),
    product({ handle: "fx-poster", title: "Magic Poster", productType: "Wall art", status: "ACTIVE", page: "Products", occasions: [], template: { value: TEMPLATE("corners"), updatedAt: T }, variants: [variant("8 × 10 in", "29.99", { maker: "prodigi", maker_sku: "FX-POSTER-8X10", print_px: "2400x3000" }), variant("12 × 16 in", "39.00", { maker: "prodigi", maker_sku: "FX-POSTER-12X16", print_px: "3600x4800" }), variant("18 × 24 in", "39.99", { maker: "prodigi", maker_sku: "FX-POSTER-18X24", print_px: "5400x7200", min_short_side_px: "1800" }), variant("24 × 36 in", "49.00", null)] }),
    product({ handle: "fx-tile", title: "Magic Portrait Tile", productType: "", status: "ACTIVE", page: "Products", occasions: [], template: null, variants: [variant("8 × 8 in", "39.98", null)] }),
    product({ handle: "fx-tee", title: "Magic Tee", productType: "Apparel", status: "DRAFT", page: null, occasions: [], template: null, variants: [variant("M", "34.00", null, { availableForSale: false })] }),
  ];
  list.forEach((p, i) => (p.position = i));
  return list;
}

const SITEWIDE: DiscountInfo = {
  code: "SITEWIDE OFF",
  status: "ACTIVE",
  title: "Sitewide 50% off (fixture)",
  percentage: 0.5,
  amount: null,
  collections: [`gid://shopify/Collection/${FX_COLLECTION_ID}`],
  combinesWithProduct: true,
  combinesWithOrder: true,
  combinesWithShipping: true,
  startsAt: "2026-01-11T00:00:00Z",
  endsAt: null,
};

export class ShopCatalogFixtures implements ShopCatalogSource {
  readonly kind = "fixtures" as const;
  private products = buildProducts();
  private occasionChoices = [...FX_OCCASIONS];
  private definitionsCreated = true;
  readonly writes: { type: "metafieldsSet" | "metafieldDefinitionUpdate" | "metafieldDefinitionCreate"; target: string; payload: unknown }[] = [];
  failNextWrite: string | null = null;

  reset() {
    this.products = buildProducts();
    this.occasionChoices = [...FX_OCCASIONS];
    this.definitionsCreated = true;
    this.writes.length = 0;
    this.failNextWrite = null;
  }
  /** Tests only: start as if the `mmp_shop` definitions didn't exist yet. */
  withoutDefinitions() {
    this.definitionsCreated = false;
  }

  async storeProducts(collectionId: string): Promise<ShopProduct[]> {
    return collectionId === FX_COLLECTION_ID ? structuredClone(this.products) : [];
  }

  async fieldDefinitions(): Promise<ShopFieldDefinition[]> {
    if (!this.definitionsCreated) return [];
    const { fieldSpecs } = await import("../fields");
    return fieldSpecs(this.occasionChoices).map((s, i) => ({ id: `gid://shopify/MetafieldDefinition/${100 + i}`, key: s.key, name: s.name, type: s.type, ownerType: s.ownerType, choices: s.choices ?? null }));
  }

  private takeFailure(): WriteResult | null {
    if (!this.failNextWrite) return null;
    const reason = this.failNextWrite;
    this.failNextWrite = null;
    return { ok: false, reason };
  }

  async setProductFields(productId: string, namespace: string, fields: { page?: string | null; occasions?: string[] }): Promise<WriteResult> {
    const fail = this.takeFailure();
    if (fail) return fail;
    const p = this.products.find((x) => x.id === productId);
    if (!p) return { ok: false, reason: "not_found" };
    if (fields.occasions?.some((o) => !this.occasionChoices.includes(o))) return { ok: false, reason: "INCLUSION" };
    this.writes.push({ type: "metafieldsSet", target: productId, payload: { namespace, ...fields } });
    if (fields.page !== undefined) p.page = fields.page;
    if (fields.occasions !== undefined) p.occasions = [...fields.occasions];
    return { ok: true };
  }

  async setOccasionChoices(namespace: string, choices: string[]): Promise<WriteResult> {
    const fail = this.takeFailure();
    if (fail) return fail;
    this.writes.push({ type: "metafieldDefinitionUpdate", target: `${namespace}.occasions`, payload: { choices } });
    this.occasionChoices = [...choices];
    return { ok: true };
  }

  async createFieldDefinitions(namespace: string, defs: FieldDefinitionSpec[]) {
    const fail = this.takeFailure();
    if (fail) return { created: [], failed: defs.map((d) => ({ key: d.key, reason: fail.ok ? "" : fail.reason })) };
    for (const d of defs) this.writes.push({ type: "metafieldDefinitionCreate", target: `${namespace}.${d.key}`, payload: { ownerType: d.ownerType, type: d.type } });
    this.definitionsCreated = true;
    return { created: defs.map((d) => `${d.ownerType}:${d.key}`), failed: [] };
  }

  async discountByCode(code: string): Promise<DiscountInfo | null> {
    return code.trim().toUpperCase() === SITEWIDE.code ? structuredClone(SITEWIDE) : null;
  }

  async customerTags(email: string): Promise<string[] | null> {
    const e = email.trim().toLowerCase();
    if (e === FX_VIP_EMAIL) return ["VIP", "newsletter"];
    if (e.endsWith("@example.com")) return [];
    return null;
  }
}
