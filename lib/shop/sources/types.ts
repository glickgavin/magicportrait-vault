/**
 * The shop's view of Shopify (docs/shop.md). Its own interface, separate from `lib/sources`
 * (orders, mugs), so the shop can grow without touching what /redeem relies on.
 */

export const SHOP_PAGES = ["gifts", "products", "all"] as const;
export type ShopPageSetting = (typeof SHOP_PAGES)[number];

/** A raw metafield as Shopify returns it: rules are parsed by `lib/shop/rules.ts`. */
export type RawMetafield = { key: string; value: string; type: string; updatedAt: string | null };

export type ShopMedia = { id: string; url: string; alt: string | null; width: number | null; height: number | null };

export type ShopVariant = {
  id: string; // gid://shopify/ProductVariant/…
  legacyId: string;
  title: string;
  sku: string | null;
  price: string; // decimal string in the shop currency
  compareAtPrice: string | null;
  availableForSale: boolean;
  options: { name: string; value: string }[];
  metafields: RawMetafield[];
};

export type ShopProduct = {
  id: string; // gid://shopify/Product/…
  legacyId: string;
  handle: string;
  title: string;
  description: string;
  /** Shopify's formatted description; shown as paragraphs and lists, never as raw HTML. */
  descriptionHtml?: string | null;
  productType: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";
  position: number; // order in the Store collection, from 0
  media: ShopMedia[];
  /** `mmp_shop.page`, as stored (e.g. "Gifts"); null when unset. */
  page: string | null;
  /** `mmp_shop.occasions`, as stored; [] when unset. */
  occasions: string[];
  /** `mmp_shop.categories`, as stored: the Products page's sections; [] when unset. */
  categories: string[];
  /** `mmp_shop.short_description`: the shop's own short text (lines starting "- " are bullets); null when unset. */
  shortDescription?: string | null;
  /** `mmp_shop.dreamship_product_id` (docs/dreamship.md › Part A): the Dreamship product it was published from. */
  dreamshipProductId?: string | null;
  /** `mmp_shop.template` JSON text; null when unset. */
  template: { value: string; updatedAt: string | null } | null;
  variants: ShopVariant[];
  /** The Magic Store's extra fields (docs/open-store.md); only read for products in the Magic Store collection. */
  store?: OpenStoreFields;
};

/** A product's Magic Store fields and the Shopify extras the open store shows. Raw values: checked by lib/open-store/fields.ts. */
export type OpenStoreFields = {
  /** `mmp_shop.imagen_theme`: the Imagen theme slug. */
  imagenTheme: string | null;
  /** `mmp_shop.generation`: picture settings JSON text. */
  generation: string | null;
  /** `mmp_shop.related`: product gids under "On more gifts", in order. */
  related: string[];
  /** `mmp_shop.open_store_related`, as stored ("true"/"false"). */
  relatedOnly: string | null;
  /** `mmp_shop.details`: size and materials. */
  details: string | null;
  createdAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  /** The standard reviews metafields, when a reviews app writes them. */
  rating: number | null;
  ratingCount: number | null;
  /** Publications (sales channels) the product is published to. */
  publicationIds: string[];
};

/** Product metafields Settings may write (CLAUDE.md, allowed write 5): mmp_shop keys only, checked by the caller. */
export type ProductMetafieldChange = { set: { key: string; type: string; value: string }[]; clear: string[] };

export type ShopFieldDefinition = { id: string; key: string; name: string; type: string; ownerType: "PRODUCT" | "PRODUCTVARIANT"; choices: string[] | null };

export type DiscountInfo = {
  code: string;
  status: "ACTIVE" | "EXPIRED" | "SCHEDULED" | "UNKNOWN";
  title: string;
  percentage: number | null; // 0.5 = 50%
  amount: { amount: string; currency: string } | null;
  /** Collection gids it is limited to; null = all items; [] = specific products only. */
  collections: string[] | null;
  combinesWithProduct: boolean;
  combinesWithOrder: boolean;
  combinesWithShipping: boolean;
  startsAt: string | null;
  endsAt: string | null;
  /** An automatic discount (found by its title, no code to apply): Shopify applies it itself at checkout. */
  automatic?: boolean;
  /** Shopify's own one-line summary, e.g. "65% off entire order • For 5 customer segments". */
  summary?: string | null;
};

/** One size's rule changes: values to set (with their Shopify type) and keys to clear. */
export type VariantRuleChange = { variantId: string; set: { key: string; type: string; value: string }[]; clear: string[] };

/** The two lists super users manage in Settings › Shop: Gifts page occasions and Products page categories. */
export type ShopListKey = "occasions" | "categories";
export type ProductFieldChanges = { page?: string | null; occasions?: string[]; categories?: string[] };

export type WriteResult = { ok: true } | { ok: false; reason: string };

export interface ShopCatalogSource {
  readonly kind: "live" | "fixtures";
  /** Every product in the Store collection, in the collection's order. */
  storeProducts(collectionId: string, namespace: string): Promise<ShopProduct[]>;
  /** The `mmp_shop` metafield definitions on products and variants. */
  fieldDefinitions(namespace: string): Promise<ShopFieldDefinition[]>;
  /** Allowed write 5 (CLAUDE.md): only `mmp_shop.page`, `.occasions` and `.categories` on one product. */
  setProductFields(productId: string, namespace: string, fields: ProductFieldChanges): Promise<WriteResult>;
  /** Allowed write 5: `mmp_shop.template` on one product (the template editor's Publish). */
  setProductTemplate(productId: string, namespace: string, templateJson: string): Promise<WriteResult>;
  /**
   * Allowed write 5: the `mmp_shop` print rules on sizes (variants) of one Store product, from Settings ›
   * Shop › Print rules. Only the keys given; never any other variant field.
   */
  setVariantRules(productId: string, namespace: string, changes: VariantRuleChange[]): Promise<WriteResult>;
  /** Allowed write 5: the choices of the occasions or categories definition (the list, in order). */
  setListChoices(namespace: string, key: ShopListKey, choices: string[]): Promise<WriteResult>;
  /**
   * Allowed write 5: other `mmp_shop` fields on one product (the short description and the Magic Store fields),
   * from Settings › Shop's one product page. The caller allows only known keys.
   */
  setProductMetafields(productId: string, namespace: string, change: ProductMetafieldChange): Promise<WriteResult>;
  /** Allowed write 5: the Imagen theme dropdown (the `mmp_shop.imagen_theme` definition's choices), from Settings › Shop › Magic Store. */
  setThemeChoices(namespace: string, choices: string[]): Promise<WriteResult>;
  /** Allowed write 5: creates whichever `mmp_shop` definitions are missing. */
  createFieldDefinitions(namespace: string, defs: FieldDefinitionSpec[]): Promise<{ created: string[]; failed: { key: string; reason: string }[] }>;
  discountByCode(code: string): Promise<DiscountInfo | null>;
  /** The Shopify customer's tags for this email; null when there is no customer. */
  customerTags(email: string): Promise<string[] | null>;
}

/** What `createFieldDefinitions` creates (lib/shop/fields.ts lists them). */
export type FieldDefinitionSpec = {
  ownerType: "PRODUCT" | "PRODUCTVARIANT";
  key: string;
  name: string;
  type: string;
  description: string;
  choices?: string[];
};
