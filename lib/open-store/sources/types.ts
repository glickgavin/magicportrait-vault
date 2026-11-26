import type { ShopProduct } from "@/lib/shop/sources/types";

/** A Shopify collection the store shows (the Magic Store collection, or a category from the menu). */
export type StoreCollection = {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string | null;
  image: { url: string; width: number | null; height: number | null; alt: string | null } | null;
  /** Product gids in the collection's own order. */
  productIds: string[];
};

/** One item of the store's Shopify navigation menu: a category circle. */
export type StoreMenuItem = { title: string; collectionHandle: string | null; image: StoreCollection["image"] };
export type StoreMenu = { handle: string; title: string; items: StoreMenuItem[] };

/**
 * Pictures for a product's option chips (docs/open-store.md › Product page): Shopify's own swatches (Shopify admin ›
 * the product's option › linked to a category metafield), and each variant's own first photo.
 */
export type OptionPictures = {
  /** option name → value → swatch (a colour, an image, or both). */
  swatches: Record<string, Record<string, { color: string | null; image: string | null }>>;
  /** variant gid → its first photo's URL. */
  variantImages: Record<string, string>;
};

/** Shopify's own shipping and refund policies (HTML from Shopify admin › Policies). */
export type StorePolicies = { shippingHtml: string | null; refundHtml: string | null };

/**
 * The open store's view of Shopify (docs/open-store.md): read live through the Admin API, cached like the
 * shop's, never copied into our database. Writes go through the shop's source (lib/shop/sources), so both
 * stores' fields are saved one way.
 */
export interface OpenStoreSource {
  readonly kind: "live" | "fixtures";
  /** The Magic Store collection: its products with their Magic Store fields, in the collection's order (`position`). */
  storeProducts(handle: string, namespace: string): Promise<{ collection: StoreCollection; products: ShopProduct[] } | null>;
  /** A collection's title, description, image and product ids (a category, or the home collection). */
  collection(handle: string): Promise<StoreCollection | null>;
  /** The navigation menu with each item's collection (null when there's no such menu). */
  menu(handle: string): Promise<StoreMenu | null>;
  policies(): Promise<StorePolicies>;
  /** One product's option swatches and variant photos, for its option chips. */
  optionPictures(productId: string): Promise<OptionPictures>;
}
