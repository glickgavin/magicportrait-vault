import "server-only";
import { opName, timed } from "@/lib/perf";
import type { ShopifyTokenProvider } from "@/lib/sources/shopify-auth";
import { parseList } from "../fields";
import type { DiscountInfo, FieldDefinitionSpec, RawMetafield, ShopCatalogSource, ShopFieldDefinition, ShopProduct, WriteResult } from "./types";

/**
 * The shop's Shopify Admin reads and its two kinds of write (CLAUDE.md, allowed writes 4–5).
 * Writes touch only the `mmp_shop` namespace: `setProductFields` refuses any other key by construction.
 */
const Q_PRODUCTS = `query ShopStoreProducts($id: ID!, $after: String, $ns: String!) {
  collection(id: $id) {
    id
    products(first: 50, after: $after, sortKey: COLLECTION_DEFAULT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id legacyResourceId handle title description descriptionHtml productType status
        media(first: 20) { nodes { id alt mediaContentType preview { image { url width height } } } }
        page: metafield(namespace: $ns, key: "page") { value }
        occasions: metafield(namespace: $ns, key: "occasions") { value }
        shortDescription: metafield(namespace: $ns, key: "short_description") { value }
        template: metafield(namespace: $ns, key: "template") { value updatedAt }
        variants(first: 100) {
          nodes {
            id legacyResourceId title sku price compareAtPrice availableForSale
            selectedOptions { name value }
            metafields(namespace: $ns, first: 20) { nodes { key value type updatedAt } }
          }
        }
      }
    }
  }
}`;

const Q_DEFINITIONS = `query ShopFieldDefinitions($ns: String!, $owner: MetafieldOwnerType!) {
  metafieldDefinitions(first: 50, ownerType: $owner, namespace: $ns) {
    nodes { id key name type { name } validations { name value } }
  }
}`;

const M_SET = `mutation ShopSetProductFields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { key } userErrors { field message code } }
}`;

const M_DELETE = `mutation ShopClearProductField($metafields: [MetafieldIdentifierInput!]!) {
  metafieldsDelete(metafields: $metafields) { deletedMetafields { key } userErrors { field message } }
}`;

const M_DEF_UPDATE = `mutation ShopSetOccasionChoices($definition: MetafieldDefinitionUpdateInput!) {
  metafieldDefinitionUpdate(definition: $definition) { updatedDefinition { id } userErrors { field message code } }
}`;

const M_DEF_CREATE = `mutation ShopCreateField($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) { createdDefinition { id } userErrors { field message code } }
}`;

const Q_DISCOUNT = `query ShopDiscountByCode($code: String!) {
  codeDiscountNodeByCode(code: $code) {
    id
    codeDiscount {
      __typename
      ... on DiscountCodeBasic {
        title status startsAt endsAt
        combinesWith { productDiscounts orderDiscounts shippingDiscounts }
        customerGets {
          value {
            __typename
            ... on DiscountPercentage { percentage }
            ... on DiscountAmount { amount { amount currencyCode } }
          }
          items {
            __typename
            ... on DiscountCollections { collections(first: 20) { nodes { id } } }
          }
        }
      }
    }
  }
}`;

const Q_AUTOMATIC = `query ShopAutomaticDiscount($q: String!) {
  discountNodes(first: 10, query: $q) {
    nodes {
      discount {
        __typename
        ... on DiscountAutomaticBasic {
          title status startsAt endsAt summary
          combinesWith { productDiscounts orderDiscounts shippingDiscounts }
          customerGets {
            value {
              __typename
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount { amount { amount currencyCode } }
            }
            items {
              __typename
              ... on DiscountCollections { collections(first: 20) { nodes { id } } }
            }
          }
        }
      }
    }
  }
}`;

const Q_CUSTOMER = `query ShopCustomerTags($q: String!) { customers(first: 1, query: $q) { nodes { tags } } }`;

type Raw = {
  collection: {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: {
        id: string;
        legacyResourceId: string;
        handle: string;
        title: string;
        description: string;
        descriptionHtml: string | null;
        productType: string;
        status: ShopProduct["status"];
        media: { nodes: { id: string; alt: string | null; mediaContentType: string; preview: { image: { url: string; width: number | null; height: number | null } | null } | null }[] };
        page: { value: string } | null;
        occasions: { value: string } | null;
        shortDescription: { value: string } | null;
        template: { value: string; updatedAt: string | null } | null;
        variants: {
          nodes: {
            id: string;
            legacyResourceId: string;
            title: string;
            sku: string | null;
            price: string;
            compareAtPrice: string | null;
            availableForSale: boolean;
            selectedOptions: { name: string; value: string }[];
            metafields: { nodes: RawMetafield[] };
          }[];
        };
      }[];
    };
  } | null;
};

export type ShopLiveConfig = { domain: string; auth: ShopifyTokenProvider; apiVersion: string };

export class ShopCatalogLive implements ShopCatalogSource {
  readonly kind = "live" as const;
  constructor(private cfg: ShopLiveConfig) {}

  private async gql<T>(query: string, variables: Record<string, unknown>, attempt = 0, refreshed = false): Promise<T> {
    const token = await this.cfg.auth.get(refreshed ? { fresh: true } : undefined);
    const res = await timed(`shopify.admin ${opName(query)}`, () =>
      fetch(`https://${this.cfg.domain}/admin/api/${this.cfg.apiVersion}/graphql.json`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-shopify-access-token": token },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
      }),
    );
    if (res.status === 401 && !refreshed && this.cfg.auth.mode === "client_credentials") return this.gql(query, variables, attempt, true);
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return this.gql(query, variables, attempt + 1, refreshed);
    }
    if (!res.ok) throw new Error(`shopify_http_${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
    if (body.errors?.length) {
      if (body.errors.some((e) => e.extensions?.code === "THROTTLED") && attempt < 4) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        return this.gql(query, variables, attempt + 1, refreshed);
      }
      throw new Error(`shopify_graphql: ${body.errors.map((e) => e.message).join("; ").slice(0, 300)}`);
    }
    return body.data as T;
  }

  async storeProducts(collectionId: string, namespace: string): Promise<ShopProduct[]> {
    const out: ShopProduct[] = [];
    let after: string | null = null;
    for (let page = 0; page < 20; page++) {
      const d: Raw = await this.gql<Raw>(Q_PRODUCTS, { id: `gid://shopify/Collection/${collectionId}`, after, ns: namespace });
      if (!d.collection) return [];
      for (const p of d.collection.products.nodes) {
        out.push({
          id: p.id,
          legacyId: String(p.legacyResourceId),
          handle: p.handle,
          title: p.title,
          description: p.description ?? "",
          descriptionHtml: p.descriptionHtml ?? null,
          productType: p.productType ?? "",
          status: p.status,
          position: out.length,
          media: p.media.nodes
            .filter((m) => m.mediaContentType === "IMAGE" && m.preview?.image?.url)
            .map((m) => ({ id: m.id, url: m.preview!.image!.url, alt: m.alt, width: m.preview!.image!.width, height: m.preview!.image!.height })),
          page: p.page?.value ?? null,
          occasions: parseList(p.occasions?.value),
          shortDescription: p.shortDescription?.value?.trim() || null,
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
        });
      }
      if (!d.collection.products.pageInfo.hasNextPage) break;
      after = d.collection.products.pageInfo.endCursor;
    }
    return out;
  }

  async fieldDefinitions(namespace: string): Promise<ShopFieldDefinition[]> {
    const out: ShopFieldDefinition[] = [];
    for (const owner of ["PRODUCT", "PRODUCTVARIANT"] as const) {
      const d = await this.gql<{ metafieldDefinitions: { nodes: { id: string; key: string; name: string; type: { name: string }; validations: { name: string; value: string | null }[] }[] } }>(Q_DEFINITIONS, { ns: namespace, owner });
      for (const n of d.metafieldDefinitions.nodes) {
        const c = n.validations.find((v) => v.name === "choices")?.value;
        out.push({ id: n.id, key: n.key, name: n.name, type: n.type.name, ownerType: owner, choices: c ? parseList(c) : null });
      }
    }
    return out;
  }

  async setProductFields(productId: string, namespace: string, fields: { page?: string | null; occasions?: string[] }): Promise<WriteResult> {
    if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) return { ok: false, reason: "bad_product_id" };
    const set: { ownerId: string; namespace: string; key: "page" | "occasions"; type: string; value: string }[] = [];
    const clear: { ownerId: string; namespace: string; key: "page" | "occasions" }[] = [];
    if (fields.page !== undefined) {
      if (fields.page) set.push({ ownerId: productId, namespace, key: "page", type: "single_line_text_field", value: fields.page });
      else clear.push({ ownerId: productId, namespace, key: "page" });
    }
    if (fields.occasions !== undefined) {
      if (fields.occasions.length) set.push({ ownerId: productId, namespace, key: "occasions", type: "list.single_line_text_field", value: JSON.stringify(fields.occasions) });
      else clear.push({ ownerId: productId, namespace, key: "occasions" });
    }
    if (set.length) {
      const d = await this.gql<{ metafieldsSet: { userErrors: { message: string; code?: string }[] } }>(M_SET, { metafields: set });
      if (d.metafieldsSet.userErrors.length) return { ok: false, reason: d.metafieldsSet.userErrors.map((e) => e.code || e.message).join(",").slice(0, 200) };
    }
    if (clear.length) {
      const d = await this.gql<{ metafieldsDelete: { userErrors: { message: string }[] } }>(M_DELETE, { metafields: clear });
      if (d.metafieldsDelete.userErrors.length) return { ok: false, reason: d.metafieldsDelete.userErrors.map((e) => e.message).join(",").slice(0, 200) };
    }
    return { ok: true };
  }

  async setProductTemplate(productId: string, namespace: string, templateJson: string): Promise<WriteResult> {
    if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) return { ok: false, reason: "bad_product_id" };
    const d = await this.gql<{ metafieldsSet: { userErrors: { message: string; code?: string }[] } }>(M_SET, { metafields: [{ ownerId: productId, namespace, key: "template", type: "json", value: templateJson }] });
    const errs = d.metafieldsSet.userErrors;
    return errs.length ? { ok: false, reason: errs.map((e) => e.code || e.message).join(",").slice(0, 200) } : { ok: true };
  }

  async setOccasionChoices(namespace: string, choices: string[]): Promise<WriteResult> {
    const d = await this.gql<{ metafieldDefinitionUpdate: { userErrors: { message: string; code?: string }[] } }>(M_DEF_UPDATE, {
      definition: { namespace, key: "occasions", ownerType: "PRODUCT", validations: [{ name: "choices", value: JSON.stringify(choices) }] },
    });
    const errs = d.metafieldDefinitionUpdate.userErrors;
    return errs.length ? { ok: false, reason: errs.map((e) => e.code || e.message).join(",").slice(0, 200) } : { ok: true };
  }

  async createFieldDefinitions(namespace: string, defs: FieldDefinitionSpec[]) {
    const created: string[] = [];
    const failed: { key: string; reason: string }[] = [];
    for (const def of defs) {
      const d = await this.gql<{ metafieldDefinitionCreate: { userErrors: { message: string; code?: string }[] } }>(M_DEF_CREATE, {
        definition: {
          namespace,
          key: def.key,
          name: def.name,
          description: def.description,
          type: def.type,
          ownerType: def.ownerType,
          ...(def.choices?.length ? { validations: [{ name: "choices", value: JSON.stringify(def.choices) }] } : {}),
        },
      });
      const errs = d.metafieldDefinitionCreate.userErrors;
      if (errs.length) failed.push({ key: `${def.ownerType}:${def.key}`, reason: errs.map((e) => e.code || e.message).join(",").slice(0, 200) });
      else created.push(`${def.ownerType}:${def.key}`);
    }
    return { created, failed };
  }

  async discountByCode(code: string): Promise<DiscountInfo | null> {
    type V = { __typename: string; percentage?: number; amount?: { amount: string; currencyCode: string } };
    type N = {
      codeDiscountNodeByCode: {
        codeDiscount: {
          __typename: string;
          title?: string;
          status?: DiscountInfo["status"];
          startsAt?: string | null;
          endsAt?: string | null;
          combinesWith?: { productDiscounts: boolean; orderDiscounts: boolean; shippingDiscounts: boolean };
          customerGets?: { value: V; items: { __typename: string; collections?: { nodes: { id: string }[] } } };
        };
      } | null;
    };
    type C = NonNullable<N["codeDiscountNodeByCode"]>["codeDiscount"] & { summary?: string };
    const d = await this.gql<N>(Q_DISCOUNT, { code });
    let c: C | undefined = d.codeDiscountNodeByCode?.codeDiscount;
    let automatic = false;
    if (!c) {
      // Not a code: it may be an automatic discount, named by its title (e.g. a membership discount for customer segments).
      const q = `method:automatic AND title:"${code.replace(/["\\]/g, "")}"`;
      const a = await this.gql<{ discountNodes: { nodes: { discount: C }[] } }>(Q_AUTOMATIC, { q });
      c = a.discountNodes.nodes.map((n) => n.discount).find((x) => x.__typename === "DiscountAutomaticBasic" && (x.title ?? "").trim().toLowerCase() === code.trim().toLowerCase());
      automatic = Boolean(c);
    }
    if (!c) return null;
    const items = c.customerGets?.items;
    return {
      automatic,
      summary: c.summary ?? null,
      code,
      status: c.status ?? "UNKNOWN",
      title: c.title ?? c.__typename,
      percentage: c.customerGets?.value.__typename === "DiscountPercentage" ? (c.customerGets.value.percentage ?? null) : null,
      amount: c.customerGets?.value.__typename === "DiscountAmount" && c.customerGets.value.amount ? { amount: c.customerGets.value.amount.amount, currency: c.customerGets.value.amount.currencyCode } : null,
      collections: !items ? null : items.__typename === "AllDiscountItems" ? null : items.__typename === "DiscountCollections" ? (items.collections?.nodes.map((n) => n.id) ?? []) : [],
      combinesWithProduct: Boolean(c.combinesWith?.productDiscounts),
      combinesWithOrder: Boolean(c.combinesWith?.orderDiscounts),
      combinesWithShipping: Boolean(c.combinesWith?.shippingDiscounts),
      startsAt: c.startsAt ?? null,
      endsAt: c.endsAt ?? null,
    };
  }

  async customerTags(email: string): Promise<string[] | null> {
    const e = email.trim().toLowerCase().replace(/["\\]/g, "");
    const d = await this.gql<{ customers: { nodes: { tags: string[] }[] } }>(Q_CUSTOMER, { q: `email:"${e}"` });
    return d.customers.nodes[0]?.tags ?? null;
  }
}
