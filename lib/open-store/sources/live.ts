import "server-only";
import { parseList } from "@/lib/shop/fields";
import type { ShopCatalogLive } from "@/lib/shop/sources/live";
import type { RawMetafield, ShopProduct } from "@/lib/shop/sources/types";
import type { OpenStoreSource, StoreCollection, StoreMenu, StorePolicies, OptionPictures } from "./types";

/** Read-only Admin API reads for the open store, through the shop's authenticated client. */
const PRODUCT_FIELDS = `
  id legacyResourceId handle title description descriptionHtml productType status createdAt
  seo { title description }
  media(first: 20) { nodes { id alt mediaContentType preview { image { url width height } } } }
  page: metafield(namespace: $ns, key: "page") { value }
  occasions: metafield(namespace: $ns, key: "occasions") { value }
  categories: metafield(namespace: $ns, key: "categories") { value }
  shortDescription: metafield(namespace: $ns, key: "short_description") { value }
  dreamshipProductId: metafield(namespace: $ns, key: "dreamship_product_id") { value }
  template: metafield(namespace: $ns, key: "template") { value updatedAt }
  imagenTheme: metafield(namespace: $ns, key: "imagen_theme") { value }
  generation: metafield(namespace: $ns, key: "generation") { value }
  related: metafield(namespace: $ns, key: "related") { value }
  relatedOnly: metafield(namespace: $ns, key: "open_store_related") { value }
  details: metafield(namespace: $ns, key: "details") { value }
  rating: metafield(namespace: "reviews", key: "rating") { value }
  ratingCount: metafield(namespace: "reviews", key: "rating_count") { value }
  resourcePublicationsV2(first: 20, onlyPublished: true) { nodes { publication { id } } }
  variants(first: 100) {
    nodes {
      id legacyResourceId title sku price compareAtPrice availableForSale
      selectedOptions { name value }
      metafields(namespace: $ns, first: 30) { nodes { key value type updatedAt } }
    }
  }`;

const Q_STORE_PRODUCTS = `query OpenStoreProducts($handle: String!, $after: String, $ns: String!) {
  collectionByIdentifier(identifier: { handle: $handle }) {
    id handle title description descriptionHtml image { url width height altText }
    products(first: 50, after: $after, sortKey: COLLECTION_DEFAULT) {
      pageInfo { hasNextPage endCursor }
      nodes { ${PRODUCT_FIELDS} }
    }
  }
}`;

const Q_COLLECTION = `query OpenStoreCollection($handle: String!, $after: String) {
  collectionByIdentifier(identifier: { handle: $handle }) {
    id handle title description descriptionHtml image { url width height altText }
    products(first: 250, after: $after, sortKey: COLLECTION_DEFAULT) { pageInfo { hasNextPage endCursor } nodes { id } }
  }
}`;

const Q_MENUS = `query OpenStoreMenus { menus(first: 50) { nodes { handle title items { title type resourceId } } } }`;
const Q_NODES = `query OpenStoreMenuCollections($ids: [ID!]!) { nodes(ids: $ids) { ... on Collection { id handle title image { url width height altText } } } }`;
const Q_POLICIES = `query OpenStorePolicies { shop { shopPolicies { type body } } }`;

type RawImage = { url: string; width: number | null; height: number | null; altText: string | null } | null;
type RawCollectionHead = { id: string; handle: string; title: string; description: string; descriptionHtml: string | null; image: RawImage };
type RawProduct = {
  id: string;
  legacyResourceId: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string | null;
  productType: string;
  status: ShopProduct["status"];
  createdAt: string;
  seo: { title: string | null; description: string | null };
  media: { nodes: { id: string; alt: string | null; mediaContentType: string; preview: { image: { url: string; width: number | null; height: number | null } | null } | null }[] };
  page: { value: string } | null;
  occasions: { value: string } | null;
  categories: { value: string } | null;
  shortDescription: { value: string } | null;
  dreamshipProductId?: { value: string } | null;
  template: { value: string; updatedAt: string | null } | null;
  imagenTheme: { value: string } | null;
  generation: { value: string } | null;
  related: { value: string } | null;
  relatedOnly: { value: string } | null;
  details: { value: string } | null;
  rating: { value: string } | null;
  ratingCount: { value: string } | null;
  resourcePublicationsV2: { nodes: { publication: { id: string } }[] };
  variants: { nodes: { id: string; legacyResourceId: string; title: string; sku: string | null; price: string; compareAtPrice: string | null; availableForSale: boolean; selectedOptions: { name: string; value: string }[]; metafields: { nodes: RawMetafield[] } }[] };
};

const image = (i: RawImage) => (i ? { url: i.url, width: i.width, height: i.height, alt: i.altText } : null);

/** The standard `reviews.rating` metafield is JSON like {"value":"4.8","scale_min":"1.0","scale_max":"5.0"}. */
export function parseRating(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { value?: string | number } | number;
    const n = typeof v === "number" ? v : Number(v?.value);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
  } catch {
    return null;
  }
}

export function mapProduct(p: RawProduct, position: number): ShopProduct {
  const count = p.ratingCount ? Number(p.ratingCount.value) : NaN;
  return {
    id: p.id,
    legacyId: String(p.legacyResourceId),
    handle: p.handle,
    title: p.title,
    description: p.description ?? "",
    descriptionHtml: p.descriptionHtml ?? null,
    productType: p.productType ?? "",
    status: p.status,
    position,
    media: p.media.nodes
      .filter((m) => m.mediaContentType === "IMAGE" && m.preview?.image?.url)
      .map((m) => ({ id: m.id, url: m.preview!.image!.url, alt: m.alt, width: m.preview!.image!.width, height: m.preview!.image!.height })),
    page: p.page?.value ?? null,
    occasions: parseList(p.occasions?.value),
    categories: parseList(p.categories?.value),
    shortDescription: p.shortDescription?.value?.trim() || null,
    dreamshipProductId: p.dreamshipProductId?.value?.trim() || null,
    template: p.template ? { value: p.template.value, updatedAt: p.template.updatedAt } : null,
    variants: p.variants.nodes.map((v) => ({
      id: v.id,
      legacyId: String(v.legacyResourceId),
      title: v.title,
      sku: v.sku,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      availableForSale: v.availableForSale,
      options: v.selectedOptions.filter((o) => o.name !== "Title"),
      metafields: v.metafields.nodes,
    })),
    store: {
      imagenTheme: p.imagenTheme?.value?.trim() || null,
      generation: p.generation?.value ?? null,
      related: parseList(p.related?.value),
      relatedOnly: p.relatedOnly?.value ?? null,
      details: p.details?.value?.trim() || null,
      createdAt: p.createdAt,
      seoTitle: p.seo?.title ?? null,
      seoDescription: p.seo?.description ?? null,
      rating: parseRating(p.rating?.value),
      ratingCount: Number.isFinite(count) && count > 0 ? count : null,
      publicationIds: p.resourcePublicationsV2.nodes.map((n) => n.publication.id),
    },
  };
}

const Q_OPTION_PICTURES = `query OpenStoreOptionPictures($id: ID!) {
  product(id: $id) {
    options { name optionValues { name swatch { color image { preview { image { url } } } } } }
    variants(first: 100) { nodes { id media(first: 1) { nodes { preview { image { url } } } } } }
  }
}`;

export class OpenStoreLive implements OpenStoreSource {
  readonly kind = "live" as const;
  constructor(private shop: ShopCatalogLive) {}

  async storeProducts(handle: string, namespace: string): Promise<{ collection: StoreCollection; products: ShopProduct[] } | null> {
    const products: ShopProduct[] = [];
    let head: RawCollectionHead | null = null;
    let after: string | null = null;
    for (let page = 0; page < 20; page++) {
      type R = { collectionByIdentifier: (RawCollectionHead & { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RawProduct[] } }) | null };
      const d: R = await this.shop.adminQuery<R>(Q_STORE_PRODUCTS, { handle, after, ns: namespace });
      const c = d.collectionByIdentifier;
      if (!c) return null;
      head = c;
      for (const p of c.products.nodes) products.push(mapProduct(p, products.length));
      if (!c.products.pageInfo.hasNextPage) break;
      after = c.products.pageInfo.endCursor;
    }
    if (!head) return null;
    return { collection: { id: head.id, handle: head.handle, title: head.title, description: head.description ?? "", descriptionHtml: head.descriptionHtml, image: image(head.image), productIds: products.map((p) => p.id) }, products };
  }

  async collection(handle: string): Promise<StoreCollection | null> {
    const ids: string[] = [];
    let head: RawCollectionHead | null = null;
    let after: string | null = null;
    for (let page = 0; page < 10; page++) {
      type R = { collectionByIdentifier: (RawCollectionHead & { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { id: string }[] } }) | null };
      const d: R = await this.shop.adminQuery<R>(Q_COLLECTION, { handle, after });
      const c = d.collectionByIdentifier;
      if (!c) return null;
      head = c;
      ids.push(...c.products.nodes.map((n) => n.id));
      if (!c.products.pageInfo.hasNextPage) break;
      after = c.products.pageInfo.endCursor;
    }
    if (!head) return null;
    return { id: head.id, handle: head.handle, title: head.title, description: head.description ?? "", descriptionHtml: head.descriptionHtml, image: image(head.image), productIds: ids };
  }

  async menu(handle: string): Promise<StoreMenu | null> {
    type R = { menus: { nodes: { handle: string; title: string; items: { title: string; type: string; resourceId: string | null }[] }[] } };
    const d = await this.shop.adminQuery<R>(Q_MENUS, {});
    const m = d.menus.nodes.find((n) => n.handle === handle);
    if (!m) return null;
    const ids = m.items.filter((i) => i.type === "COLLECTION" && i.resourceId).map((i) => i.resourceId!);
    const cols = new Map<string, { handle: string; image: RawImage }>();
    if (ids.length) {
      type N = { nodes: ({ id: string; handle: string; title: string; image: RawImage } | null)[] };
      const n = await this.shop.adminQuery<N>(Q_NODES, { ids });
      for (const c of n.nodes) if (c?.id) cols.set(c.id, { handle: c.handle, image: c.image });
    }
    return {
      handle: m.handle,
      title: m.title,
      items: m.items
        .filter((i) => i.type === "COLLECTION" && i.resourceId && cols.has(i.resourceId))
        .map((i) => {
          const c = cols.get(i.resourceId!)!;
          return { title: i.title, collectionHandle: c.handle, image: image(c.image) };
        }),
    };
  }

  async optionPictures(productId: string): Promise<OptionPictures> {
    type Img = { preview: { image: { url: string } | null } | null } | null;
    type R = {
      product: {
        options: { name: string; optionValues: { name: string; swatch: { color: string | null; image: Img } | null }[] }[];
        variants: { nodes: { id: string; media: { nodes: Img[] } }[] };
      } | null;
    };
    const d = await this.shop.adminQuery<R>(Q_OPTION_PICTURES, { id: productId });
    const out: OptionPictures = { swatches: {}, variantImages: {} };
    if (!d.product) return out;
    for (const o of d.product.options) {
      for (const v of o.optionValues) {
        const image = v.swatch?.image?.preview?.image?.url ?? null;
        const color = v.swatch?.color ?? null;
        if (image || color) (out.swatches[o.name] ??= {})[v.name] = { color, image };
      }
    }
    for (const v of d.product.variants.nodes) {
      const url = v.media.nodes[0]?.preview?.image?.url;
      if (url) out.variantImages[v.id] = url;
    }
    return out;
  }

  async policies(): Promise<StorePolicies> {
    type R = { shop: { shopPolicies: { type: string; body: string }[] } };
    const d = await this.shop.adminQuery<R>(Q_POLICIES, {});
    const by = (t: string) => d.shop.shopPolicies.find((p) => p.type === t)?.body?.trim() || null;
    return { shippingHtml: by("SHIPPING_POLICY"), refundHtml: by("REFUND_POLICY") };
  }
}
