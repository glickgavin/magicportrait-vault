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
  productType: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";
  position: number; // order in the Store collection, from 0
  media: ShopMedia[];
  /** `mmp_shop.page`, as stored (e.g. "Gifts"); null when unset. */
  page: string | null;
  /** `mmp_shop.occasions`, as stored; [] when unset. */
  occasions: string[];
  /** `mmp_shop.template` JSON text; null when unset. */
  template: { value: string; updatedAt: string | null } | null;
  variants: ShopVariant[];
};

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

export type WriteResult = { ok: true } | { ok: false; reason: string };

export interface ShopCatalogSource {
  readonly kind: "live" | "fixtures";
  /** Every product in the Store collection, in the collection's order. */
  storeProducts(collectionId: string, namespace: string): Promise<ShopProduct[]>;
  /** The `mmp_shop` metafield definitions on products and variants. */
  fieldDefinitions(namespace: string): Promise<ShopFieldDefinition[]>;
  /** Allowed write 5 (CLAUDE.md): only `mmp_shop.page` and `mmp_shop.occasions` on one product. */
  setProductFields(productId: string, namespace: string, fields: { page?: string | null; occasions?: string[] }): Promise<WriteResult>;
  /** Allowed write 5: `mmp_shop.template` on one product (the template editor's Publish). */
  setProductTemplate(productId: string, namespace: string, templateJson: string): Promise<WriteResult>;
  /** Allowed write 5: the occasions definition's choices. */
  setOccasionChoices(namespace: string, choices: string[]): Promise<WriteResult>;
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
