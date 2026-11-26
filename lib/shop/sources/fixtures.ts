import { FIXTURE_SCENES, fixtureTemplate } from "../fixture-scenes";
import type {
  DiscountInfo,
  FieldDefinitionSpec,
  OpenStoreFields,
  ProductFieldChanges,
  ProductMetafieldChange,
  RawMetafield,
  ShopCatalogSource,
  ShopFieldDefinition,
  ShopListKey,
  ShopProduct,
  ShopVariant,
  VariantRuleChange,
  WriteResult,
} from "./types";

/**
 * In-memory Store collection for tests and local dev. Made-up products only (no customer images);
 * writes change this memory and are recorded in `writes`, never sent anywhere.
 */
export const FX_COLLECTION_ID = "328021508292";
export const FX_OCCASIONS = [
  "Christmas",
  "Birthday",
  "New Year",
  "For Mom",
  "For Dad",
  "Pet lovers",
];
export const FX_CATEGORIES = [
  "Mugs",
  "Puzzles",
  "Acrylic",
  "Wall art",
  "Pillows",
  "Ornaments",
  "Apparel",
];
export const FX_VIP_EMAIL = "vip.tester@example.com";
/** The Store collection's products (the signed-in Gifts and Products pages); fx-canvas is only in the Magic Store. */
const STORE_HANDLES = new Set([
  "fx-ornaments",
  "fx-mug",
  "fx-pillow",
  "fx-puzzle",
  "fx-acrylic-block",
  "fx-poster",
  "fx-tile",
  "fx-tee",
]);
/** A Storefront sales channel every fixture product is published to (open_store.storefront_publication_id in tests). */
export const FX_PUBLICATION_ID = "gid://shopify/Publication/900000001";

const T = "2026-11-01T10:00:00Z";
const mf = (o: Record<string, string>): RawMetafield[] =>
  Object.entries(o).map(([key, value]) => ({
    key,
    value,
    type:
      key === "extra"
        ? "json"
        : key === "adjustable"
          ? "boolean"
          : /_px$|_pct$/.test(key)
            ? "number_integer"
            : "single_line_text_field",
    updatedAt: T,
  }));

let vid = 9000;
const variant = (
  title: string,
  price: string,
  rules: Record<string, string> | null,
  opts: Partial<ShopVariant> = {},
): ShopVariant => {
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

const TEMPLATE = (scene: keyof typeof FIXTURE_SCENES) =>
  JSON.stringify(fixtureTemplate(scene));

let pid = 700;
const product = (
  p: Omit<
    ShopProduct,
    "id" | "legacyId" | "position" | "media" | "description" | "categories"
  > & { description?: string; categories?: string[] },
): ShopProduct => {
  pid++;
  // A product's category starts as its product type, as the Products page grouped before categories.
  return {
    id: `gid://shopify/Product/8${pid}000000`,
    legacyId: `8${pid}000000`,
    position: 0,
    media: [],
    description: p.description ?? "",
    ...p,
    categories:
      p.categories ?? (p.productType.trim() ? [p.productType.trim()] : []),
  };
};

function buildProducts(): ShopProduct[] {
  vid = 9000;
  pid = 700;
  const list: ShopProduct[] = [
    product({
      handle: "fx-ornaments",
      title: "Magic Xmas Ornaments (set of 2)",
      productType: "Ornaments",
      status: "ACTIVE",
      page: "Gifts",
      occasions: ["Christmas"],
      template: { value: TEMPLATE("ornament"), updatedAt: T },
      variants: [
        variant("Default Title", "54.99", {
          maker: "gelato",
          maker_sku: "fx_ornament_round_set2",
          print_px: "1200x1200",
        }),
      ],
    }),
    product({
      handle: "fx-mug",
      title: "Magic Mug with Photo",
      productType: "Mugs",
      status: "ACTIVE",
      page: "All",
      occasions: ["Christmas", "Birthday", "For Mom", "For Dad"],
      template: { value: TEMPLATE("mug"), updatedAt: T },
      variants: [
        variant("Default Title", "49.00", {
          maker: "gelato",
          maker_sku: "fx_mug_11oz_white",
          print_px: "2475x1155",
          zone_px: "1155x1155",
          placement: "wrap_zone",
        }),
      ],
    }),
    product({
      handle: "fx-pillow",
      title: "Magic Pillow with Photo",
      productType: "Pillows",
      status: "ACTIVE",
      page: "Gifts",
      occasions: ["Christmas", "For Mom"],
      template: { value: TEMPLATE("pillow"), updatedAt: T },
      variants: [
        variant("Default Title", "59.99", {
          maker: "prodigi",
          maker_sku: "FX-CUSH-12X12",
          print_px: "3600x3600",
          extra: '{"sizing":"fillPrintArea"}',
        }),
      ],
    }),
    product({
      handle: "fx-puzzle",
      title: "Magic Puzzle",
      productType: "Puzzles",
      status: "ACTIVE",
      page: "All",
      occasions: ["Christmas", "Birthday"],
      template: { value: TEMPLATE("puzzle"), updatedAt: T },
      variants: [
        variant("252 pieces", "49.00", {
          maker: "in_house",
          maker_sku: "FX-PZ-252",
          print_px: "3000x2400",
        }),
        variant("500 pieces", "59.00", {
          maker: "in_house",
          maker_sku: "FX-PZ-500",
          print_px: "4200x3000",
        }),
      ],
    }),
    product({
      handle: "fx-acrylic-block",
      title: "Acrylic Block",
      productType: "Acrylic",
      status: "ACTIVE",
      page: "All",
      occasions: ["Birthday", "For Mom"],
      template: { value: TEMPLATE("acrylic"), updatedAt: T },
      variants: [
        variant("4 × 6 in", "29.00", {
          maker: "in_house",
          maker_sku: "FX-AB-4X6",
          print_px: "1200x1800",
        }),
        variant("5 × 7 in", "39.00", {
          maker: "in_house",
          maker_sku: "FX-AB-5X7",
          print_px: "1500x2100",
        }),
        variant("6 × 8 in", "59.00", {
          maker: "in_house",
          maker_sku: "FX-AB-6X8",
          print_px: "1800x2400",
        }),
      ],
    }),
    product({
      handle: "fx-poster",
      title: "Magic Poster",
      productType: "Wall art",
      status: "ACTIVE",
      page: "Products",
      occasions: [],
      template: { value: TEMPLATE("poster"), updatedAt: T },
      variants: [
        variant("8 × 10 in", "29.99", {
          maker: "prodigi",
          maker_sku: "FX-POSTER-8X10",
          print_px: "2400x3000",
        }),
        variant("12 × 16 in", "39.00", {
          maker: "prodigi",
          maker_sku: "FX-POSTER-12X16",
          print_px: "3600x4800",
        }),
        variant("18 × 24 in", "39.99", {
          maker: "prodigi",
          maker_sku: "FX-POSTER-18X24",
          print_px: "5400x7200",
          min_short_side_px: "1800",
        }),
        variant("24 × 36 in", "49.00", null),
      ],
    }),
    product({
      handle: "fx-tile",
      title: "Magic Portrait Tile",
      productType: "",
      status: "ACTIVE",
      page: "Products",
      occasions: [],
      template: null,
      variants: [variant("8 × 8 in", "39.98", null)],
    }),
    product({
      handle: "fx-tee",
      title: "Magic Tee",
      productType: "Apparel",
      status: "DRAFT",
      page: null,
      occasions: [],
      template: null,
      variants: [variant("M", "34.00", null, { availableForSale: false })],
    }),
  ];
  list.push(
    product({
      handle: "fx-canvas",
      title: "Magic Canvas",
      productType: "Wall art",
      status: "ACTIVE",
      page: null,
      occasions: [],
      template: { value: TEMPLATE("poster"), updatedAt: T },
      description: "Gallery canvas, hand-stretched.",
      variants: [
        variant("12 × 16 in", "59.00", {
          maker: "prodigi",
          maker_sku: "FX-CANVAS-12X16",
          print_px: "3600x4800",
          lead_days: "4-6",
        }),
        variant("16 × 20 in", "79.00", {
          maker: "prodigi",
          maker_sku: "FX-CANVAS-16X20",
          print_px: "4800x6000",
          lead_days: "4-6",
          badge: "Bestseller",
        }),
      ],
    }),
  );
  // The Framed Dog Poster "Flush" (docs/dreamship.md): made by Dreamship, SKU = Dreamship product variant id. Only the
  // first two sizes carry rules so a sync has something to propose; its theme isn't in the fixture theme list, so
  // the Magic Store hides it (as the real one is hidden today).
  list.push(
    product({
      handle: "fx-flush-poster",
      title: 'Framed Dog Poster "Flush"',
      productType: "Wall art",
      status: "ACTIVE",
      page: null,
      occasions: [],
      template: { value: TEMPLATE("poster"), updatedAt: T },
      description: "Archival paper under clear acrylic, ready to hang.",
      variants: [
        variant('8x10"', "59.99", { maker: "dreamship", maker_sku: "17383", print_px: "1800x2400", lead_days: "1-3" }, { sku: "45378125" }),
        variant('12x16"', "69.99", { maker: "dreamship", maker_sku: "17398", print_px: "3000x4000" }, { sku: "45378127" }),
        variant('16x24"', "89.99", null, { sku: "45378126" }),
        variant('24x36"', "129.99", null, { sku: "45378124" }),
      ],
    }),
  );
  applyStoreFields(list);
  list.forEach((p, i) => {
    p.position = i;
    const scene = p.template
      ? (
          JSON.parse(p.template.value) as {
            background: { media_id: string; url: string };
          }
        ).background
      : null;
    if (scene)
      p.media = [
        {
          id: scene.media_id,
          url: scene.url,
          alt: `Blank ${p.title}`,
          width: 1000,
          height: 1000,
        },
      ];
  });
  // The tile has a blank photo but no template yet, so the template editor has something to start from.
  const tile = list.find((p) => p.handle === "fx-tile");
  if (tile)
    tile.media = [
      {
        id: "fixture:tile",
        url: "/fixtures/shop/tile.jpg",
        alt: "Blank tile",
        width: 1000,
        height: 1000,
      },
    ];
  return list;
}

const pid_ = (list: ShopProduct[], handle: string) =>
  list.find((p) => p.handle === handle)!.id;

/** Magic Store fields: themes, picture settings and a few cases the checks must handle (made-up values). */
function applyStoreFields(list: ShopProduct[]) {
  const base = (
    p: ShopProduct,
    f: Partial<OpenStoreFields>,
  ): OpenStoreFields => ({
    imagenTheme: null,
    generation: null,
    related: [],
    relatedOnly: null,
    details: null,
    createdAt: T,
    seoTitle: null,
    seoDescription: null,
    rating: null,
    ratingCount: null,
    publicationIds: [FX_PUBLICATION_ID],
    ...f,
  });
  const by = (h: string) => list.find((p) => p.handle === h)!;
  const set = (h: string, f: Partial<OpenStoreFields>) =>
    (by(h).store = base(by(h), f));
  set("fx-pillow", {
    imagenTheme: "admiral-01",
    generation: JSON.stringify({
      photos: [
        {
          label: "Their photo",
          name_label: "Their name (optional, shown on the picture)",
          name_placeholder: "Teddy",
        },
      ],
      name_max: 14,
      subject: "pet",
      step_labels: [
        "Uploading your photo",
        "Painting {name} as The Admiral",
        "Putting it on your pillow",
      ],
    }),
    related: [pid_(list, "fx-mug"), pid_(list, "fx-puzzle")],
    details: "Linen-look cover, 12 × 12 in, zip closure. Insert included.",
    rating: 4.8,
    ratingCount: 132,
    createdAt: "2026-10-01T10:00:00Z",
  });
  // A bad value set by hand in Shopify: flagged in Settings, the store default used instead.
  set("fx-mug", {
    imagenTheme: "bathroom-01",
    generation: JSON.stringify({ images_to_show: "lots" }),
    createdAt: "2026-10-05T10:00:00Z",
  });
  set("fx-puzzle", {
    imagenTheme: "journal-02",
    createdAt: "2026-10-03T10:00:00Z",
  });
  // Two photos (two pets): the theme says so (Imagen fixtures); the labels come from here.
  set("fx-acrylic-block", {
    imagenTheme: "duo-portrait-01",
    generation: JSON.stringify({
      photos: [
        { label: "First pet's photo", name_label: "First name" },
        { label: "Second pet's photo", name_label: "Second name" },
      ],
    }),
    createdAt: "2026-10-08T10:00:00Z",
  });
  set("fx-poster", {
    imagenTheme: "plumber-01",
    createdAt: "2026-10-02T10:00:00Z",
  });
  set("fx-canvas", {
    imagenTheme: "admiral-01",
    createdAt: "2026-11-02T10:00:00Z",
  });
  // Related only: shown under "On more gifts", never in the grid.
  set("fx-ornaments", {
    relatedOnly: "true",
    createdAt: "2026-10-04T10:00:00Z",
  });
  set("fx-tile", { createdAt: "2026-10-06T10:00:00Z" });
  // Its theme (a 2K Royal Flush) isn't in Imagen's fixture list, so the Magic Store hides it.
  set("fx-flush-poster", { imagenTheme: "royal-flush", createdAt: "2026-11-24T10:00:00Z" });
  // Lead times and a badge on some sizes.
  for (const v of by("fx-pillow").variants)
    v.metafields.push(...mf({ lead_days: "4-6" }));
  for (const v of by("fx-mug").variants)
    v.metafields.push(...mf({ lead_days: "3-5", badge: "Bestseller" }));
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
  private categoryChoices = [...FX_CATEGORIES];
  private themeChoices: string[] = [];
  private definitionsCreated = true;
  readonly writes: {
    type:
      | "metafieldsSet"
      | "metafieldDefinitionUpdate"
      | "metafieldDefinitionCreate";
    target: string;
    payload: unknown;
  }[] = [];
  failNextWrite: string | null = null;

  reset() {
    this.products = buildProducts();
    this.occasionChoices = [...FX_OCCASIONS];
    this.categoryChoices = [...FX_CATEGORIES];
    this.themeChoices = [];
    this.definitionsCreated = true;
    this.writes.length = 0;
    this.failNextWrite = null;
  }
  /** Tests only: start as if the `mmp_shop` definitions didn't exist yet. */
  withoutDefinitions() {
    this.definitionsCreated = false;
  }

  async storeProducts(collectionId: string): Promise<ShopProduct[]> {
    // Store fields are only read for the Magic Store (lib/open-store), as the live query does.
    return collectionId === FX_COLLECTION_ID
      ? this.products
          .filter((p) => STORE_HANDLES.has(p.handle))
          .map((p) => {
            const c = structuredClone(p);
            delete c.store;
            return c;
          })
      : [];
  }

  /** Open-store fixtures (lib/open-store/sources/fixtures.ts) read the same products, so a save shows in both stores. */
  allProducts(): ShopProduct[] {
    return structuredClone(this.products);
  }

  /** The Imagen theme dropdown's choices (`mmp_shop.imagen_theme`); empty until Refresh themes from Imagen. */
  imagenThemeChoices(): string[] {
    return [...this.themeChoices];
  }

  async fieldDefinitions(): Promise<ShopFieldDefinition[]> {
    if (!this.definitionsCreated) return [];
    const { fieldSpecs } = await import("../fields");
    return fieldSpecs(
      this.occasionChoices,
      this.categoryChoices,
      this.themeChoices,
    ).map((s, i) => ({
      id: `gid://shopify/MetafieldDefinition/${100 + i}`,
      key: s.key,
      name: s.name,
      type: s.type,
      ownerType: s.ownerType,
      choices: s.choices ?? null,
    }));
  }

  private takeFailure(): WriteResult | null {
    if (!this.failNextWrite) return null;
    const reason = this.failNextWrite;
    this.failNextWrite = null;
    return { ok: false, reason };
  }

  async setProductFields(
    productId: string,
    namespace: string,
    fields: ProductFieldChanges,
  ): Promise<WriteResult> {
    const fail = this.takeFailure();
    if (fail) return fail;
    const p = this.products.find((x) => x.id === productId);
    if (!p) return { ok: false, reason: "not_found" };
    if (fields.occasions?.some((o) => !this.occasionChoices.includes(o)))
      return { ok: false, reason: "INCLUSION" };
    if (fields.categories?.some((o) => !this.categoryChoices.includes(o)))
      return { ok: false, reason: "INCLUSION" };
    this.writes.push({
      type: "metafieldsSet",
      target: productId,
      payload: { namespace, ...fields },
    });
    if (fields.page !== undefined) p.page = fields.page;
    if (fields.occasions !== undefined) p.occasions = [...fields.occasions];
    if (fields.categories !== undefined) p.categories = [...fields.categories];
    return { ok: true };
  }

  async setVariantRules(
    productId: string,
    namespace: string,
    changes: VariantRuleChange[],
  ): Promise<WriteResult> {
    const fail = this.takeFailure();
    if (fail) return fail;
    const p = this.products.find((x) => x.id === productId);
    if (!p) return { ok: false, reason: "not_found" };
    for (const c of changes) {
      const v = p.variants.find((x) => x.id === c.variantId);
      if (!v) return { ok: false, reason: "variant_not_found" };
      this.writes.push({
        type: "metafieldsSet",
        target: c.variantId,
        payload: { namespace, set: c.set, clear: c.clear },
      });
      const drop = new Set([...c.clear, ...c.set.map((f) => f.key)]);
      v.metafields = [
        ...v.metafields.filter((m) => !drop.has(m.key)),
        ...c.set.map((f) => ({
          key: f.key,
          value: f.value,
          type: f.type,
          updatedAt: new Date().toISOString(),
        })),
      ];
    }
    return { ok: true };
  }

  async setProductTemplate(
    productId: string,
    namespace: string,
    templateJson: string,
  ): Promise<WriteResult> {
    const fail = this.takeFailure();
    if (fail) return fail;
    const p = this.products.find((x) => x.id === productId);
    if (!p) return { ok: false, reason: "not_found" };
    this.writes.push({
      type: "metafieldsSet",
      target: productId,
      payload: { namespace, template: templateJson },
    });
    p.template = { value: templateJson, updatedAt: new Date().toISOString() };
    return { ok: true };
  }

  async setListChoices(
    namespace: string,
    key: ShopListKey,
    choices: string[],
  ): Promise<WriteResult> {
    const fail = this.takeFailure();
    if (fail) return fail;
    this.writes.push({
      type: "metafieldDefinitionUpdate",
      target: `${namespace}.${key}`,
      payload: { choices },
    });
    if (key === "occasions") this.occasionChoices = [...choices];
    else this.categoryChoices = [...choices];
    return { ok: true };
  }

  async setProductMetafields(
    productId: string,
    namespace: string,
    change: ProductMetafieldChange,
  ): Promise<WriteResult> {
    const fail = this.takeFailure();
    if (fail) return fail;
    const p = this.products.find((x) => x.id === productId);
    if (!p) return { ok: false, reason: "not_found" };
    const theme = change.set.find((f) => f.key === "imagen_theme")?.value;
    if (theme && this.themeChoices.length && !this.themeChoices.includes(theme))
      return { ok: false, reason: "INCLUSION" };
    this.writes.push({
      type: "metafieldsSet",
      target: productId,
      payload: { namespace, set: change.set, clear: change.clear },
    });
    const st: OpenStoreFields = (p.store ??= {
      imagenTheme: null,
      generation: null,
      related: [],
      relatedOnly: null,
      details: null,
      createdAt: T,
      seoTitle: null,
      seoDescription: null,
      rating: null,
      ratingCount: null,
      publicationIds: [FX_PUBLICATION_ID],
    });
    const put = (key: string, value: string | null) => {
      if (key === "short_description") p.shortDescription = value;
      else if (key === "imagen_theme") st.imagenTheme = value;
      else if (key === "generation") st.generation = value;
      else if (key === "related")
        st.related = value ? (JSON.parse(value) as string[]) : [];
      else if (key === "open_store_related") st.relatedOnly = value;
      else if (key === "details") st.details = value;
      else if (key === "dreamship_product_id") p.dreamshipProductId = value;
    };
    for (const f of change.set) put(f.key, f.value);
    for (const k of change.clear) put(k, null);
    return { ok: true };
  }

  async setThemeChoices(
    namespace: string,
    choices: string[],
  ): Promise<WriteResult> {
    const fail = this.takeFailure();
    if (fail) return fail;
    this.writes.push({
      type: "metafieldDefinitionUpdate",
      target: `${namespace}.imagen_theme`,
      payload: { choices },
    });
    this.themeChoices = [...choices];
    return { ok: true };
  }

  async createFieldDefinitions(namespace: string, defs: FieldDefinitionSpec[]) {
    const fail = this.takeFailure();
    if (fail)
      return {
        created: [],
        failed: defs.map((d) => ({
          key: d.key,
          reason: fail.ok ? "" : fail.reason,
        })),
      };
    for (const d of defs)
      this.writes.push({
        type: "metafieldDefinitionCreate",
        target: `${namespace}.${d.key}`,
        payload: { ownerType: d.ownerType, type: d.type },
      });
    this.definitionsCreated = true;
    return { created: defs.map((d) => `${d.ownerType}:${d.key}`), failed: [] };
  }

  async discountByCode(code: string): Promise<DiscountInfo | null> {
    return code.trim().toUpperCase() === SITEWIDE.code
      ? structuredClone(SITEWIDE)
      : null;
  }

  async customerTags(email: string): Promise<string[] | null> {
    const e = email.trim().toLowerCase();
    if (e === FX_VIP_EMAIL) return ["VIP", "newsletter"];
    if (e.endsWith("@example.com")) return [];
    return null;
  }
}
