import { shopFixtures } from "@/lib/shop/sources";
import type { ShopProduct } from "@/lib/shop/sources/types";
import type { OpenStoreSource, StoreCollection, StoreMenu, StorePolicies, OptionPictures } from "./types";

/**
 * Made-up Magic Store for tests and local dev. Products are the shop fixtures' products (one in-memory copy,
 * so a Settings save shows in both stores); collections, the menu and policies are here.
 */
export const FX_MAGIC_HANDLE = "magic-store";
/** The Magic Store collection's order: the store's grid order. fx-tee (draft) and fx-poster's sizes are in the Store only. */
const MAGIC_ORDER = ["fx-pillow", "fx-mug", "fx-canvas", "fx-puzzle", "fx-acrylic-block", "fx-poster", "fx-ornaments", "fx-tile", "fx-flush-poster"];
const CATEGORIES: Record<string, { title: string; description: string; image: string; handles: string[] }> = {
  [FX_MAGIC_HANDLE]: { title: "Bestsellers", description: "Your pet, painted in about a minute and printed on gifts they'll love.", image: "/fixtures/shop/pillow.jpg", handles: MAGIC_ORDER },
  "pet-gifts": { title: "Pet gifts", description: "Cosy things with your pet on them.", image: "/fixtures/shop/pillow.jpg", handles: ["fx-pillow", "fx-mug", "fx-ornaments", "fx-canvas"] },
  "wall-art": { title: "Wall art", description: "Your pet, framed for the wall.", image: "/fixtures/shop/poster.jpg", handles: ["fx-canvas", "fx-poster", "fx-acrylic-block", "fx-tile"] },
  "for-the-home": { title: "For the home", description: "Everyday things, made yours.", image: "/fixtures/shop/mug.jpg", handles: ["fx-mug", "fx-pillow", "fx-puzzle"] },
  // The Settings › Shop › Products groups (collections whose handle starts with "magic"); one empty, one product in two.
  "magic-store-wall-art": { title: "Magic Store · Wall art", description: "", image: "/fixtures/shop/poster.jpg", handles: ["fx-canvas", "fx-poster", "fx-flush-poster", "fx-tile", "fx-acrylic-block"] },
  "magic-store-pillows": { title: "Magic Store · Pillows", description: "", image: "/fixtures/shop/pillow.jpg", handles: ["fx-pillow"] },
  "magic-store-mugs": { title: "Magic Store · Mugs", description: "", image: "/fixtures/shop/mug.jpg", handles: ["fx-mug"] },
  "magic-store-acrylic": { title: "Magic Store · Acrylic", description: "", image: "/fixtures/shop/poster.jpg", handles: ["fx-acrylic-block"] },
  "magic-empty": { title: "Magic (empty)", description: "", image: "/fixtures/shop/mug.jpg", handles: [] },
};
const MENU: StoreMenu = {
  handle: "magic-store",
  title: "Magic Store",
  items: [
    { title: "Bestsellers", collectionHandle: FX_MAGIC_HANDLE, image: null },
    { title: "Pet gifts", collectionHandle: "pet-gifts", image: null },
    { title: "Wall art", collectionHandle: "wall-art", image: null },
    { title: "For the home", collectionHandle: "for-the-home", image: null },
  ],
};
const POLICIES: StorePolicies = {
  shippingHtml: "<p>Made to order and shipped within a few working days. Tracked delivery (fixture policy).</p>",
  refundHtml: "<p>Each order is made just for you. If something isn't right, tell us and we'll make it right (fixture policy).</p>",
};

export class OpenStoreFixtures implements OpenStoreSource {
  readonly kind = "fixtures" as const;

  private byHandle(): Map<string, ShopProduct> {
    return new Map(shopFixtures().allProducts().map((p) => [p.handle, p]));
  }

  async collection(handle: string): Promise<StoreCollection | null> {
    const c = CATEGORIES[handle];
    if (!c) return null;
    const all = this.byHandle();
    const n = Object.keys(CATEGORIES).indexOf(handle);
    return {
      id: `gid://shopify/Collection/77000000${n}`,
      handle,
      title: c.title,
      description: c.description,
      descriptionHtml: `<p>${c.description}</p>`,
      image: { url: c.image, width: 1000, height: 1000, alt: c.title },
      productIds: c.handles.map((h) => all.get(h)?.id).filter((id): id is string => Boolean(id)),
    };
  }

  async storeProducts(handle: string): Promise<{ collection: StoreCollection; products: ShopProduct[] } | null> {
    if (handle !== FX_MAGIC_HANDLE) return null;
    const collection = (await this.collection(handle))!;
    const all = this.byHandle();
    const products = MAGIC_ORDER.map((h) => all.get(h)).filter((p): p is ShopProduct => Boolean(p)).map((p, i) => ({ ...p, position: i }));
    return { collection, products };
  }

  async collectionsByPrefix(prefix: string): Promise<StoreCollection[]> {
    const out: StoreCollection[] = [];
    for (const h of Object.keys(CATEGORIES).filter((k) => k.startsWith(prefix)).sort((a, b) => CATEGORIES[a].title.localeCompare(CATEGORIES[b].title))) out.push((await this.collection(h))!);
    return out;
  }

  async menu(handle: string): Promise<StoreMenu | null> {
    if (handle !== MENU.handle) return null;
    return { ...MENU, items: MENU.items.map((it) => ({ ...it, image: it.collectionHandle ? { url: CATEGORIES[it.collectionHandle].image, width: 1000, height: 1000, alt: it.title } : null })) };
  }

  async policies(): Promise<StorePolicies> {
    return { ...POLICIES };
  }

  async optionPictures(productId: string): Promise<OptionPictures> {
    // Made-up products have no swatches; each variant shows the product's first photo.
    const p = shopFixtures().allProducts().find((x) => x.id === productId);
    const out: OptionPictures = { swatches: {}, variantImages: {} };
    if (!p) return out;
    for (const v of p.variants) if (p.media[0]) out.variantImages[v.id] = p.media[0].url;
    return out;
  }
}
