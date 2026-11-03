import "server-only";
import type { FinancialStatus, MetafieldWriteResult, ShopifyLineItem, ShopifyOrder, ShopifySource } from "./types";

/** Queries from docs/data.md §5 (validated against the Admin schema). */
const LINE_FIELDS = `
  id title quantity currentQuantity unfulfilledQuantity
  product { id legacyResourceId }
  variant { id legacyResourceId }
  customAttributes { key value }
  image { url }`;

const ORDER_FIELDS = `
  id legacyResourceId name createdAt processedAt cancelledAt test email
  customer { id firstName lastName defaultEmailAddress { emailAddress } }
  displayFinancialStatus displayFulfillmentStatus tags statusPageUrl
  mugChoice: metafield(namespace: "custom", key: "mug_choice") { value updatedAt compareDigest }
  lineItems(first: $lines) { pageInfo { hasNextPage endCursor } edges { node { ${LINE_FIELDS} } } }`;

const Q_ORDERS = `query VaultOrdersByEmail($search: String!, $first: Int!, $after: String, $lines: Int!) {
  orders(first: $first, after: $after, query: $search, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    edges { cursor node { ${ORDER_FIELDS} } }
  }
}`;

const Q_ORDER = `query VaultOrderForRedeem($id: ID!, $lines: Int!) { order(id: $id) { ${ORDER_FIELDS} } }`;

const Q_LINES = `query VaultOrderLineItemsPage($id: ID!, $after: String, $lines: Int!) {
  order(id: $id) { id lineItems(first: $lines, after: $after) { pageInfo { hasNextPage endCursor } edges { node { ${LINE_FIELDS} } } } }
}`;

const Q_RESOLVE = `query VaultResolveOrderByName($search: String!) { orders(first: 1, query: $search) { edges { node { id name } } } }`;

const M_METAFIELD = `mutation VaultSetMugChoice($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id namespace key value updatedAt compareDigest }
    userErrors { field message code elementIndex }
  }
}`;

const M_TAGS = `mutation VaultTagOrder($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { node { id } userErrors { field message } } }`;

const Q_PING = `query VaultPing { shop { name myshopifyDomain } currentAppInstallation { accessScopes { handle } } }`;

type Conn<T> = { pageInfo: { hasNextPage: boolean; endCursor: string | null }; edges: { node: T }[] };
type RawLine = {
  id: string;
  title: string;
  quantity: number;
  currentQuantity: number;
  unfulfilledQuantity: number;
  product: { id: string; legacyResourceId: string } | null;
  variant: { id: string; legacyResourceId: string } | null;
  customAttributes: { key: string; value: string | null }[];
  image: { url: string } | null;
};
type RawOrder = {
  id: string;
  legacyResourceId: string;
  name: string;
  createdAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  test: boolean;
  email: string | null;
  customer: { id: string; firstName: string | null; lastName: string | null; defaultEmailAddress: { emailAddress: string } | null } | null;
  displayFinancialStatus: FinancialStatus | null;
  displayFulfillmentStatus: string | null;
  tags: string[];
  statusPageUrl: string | null;
  mugChoice: { value: string; updatedAt: string | null; compareDigest: string | null } | null;
  lineItems: Conn<RawLine>;
};

export type ShopifyLiveConfig = { domain: string; token: string; apiVersion: string; pageSize: number; linesPageSize: number };

export class ShopifyLive implements ShopifySource {
  readonly kind = "live" as const;
  constructor(private cfg: ShopifyLiveConfig) {}

  private async gql<T>(query: string, variables: Record<string, unknown>, attempt = 0): Promise<T> {
    const res = await fetch(`https://${this.cfg.domain}/admin/api/${this.cfg.apiVersion}/graphql.json`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-shopify-access-token": this.cfg.token },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        return this.gql(query, variables, attempt + 1);
      }
    }
    if (!res.ok) throw new Error(`shopify_http_${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
    if (body.errors?.length) {
      if (body.errors.some((e) => e.extensions?.code === "THROTTLED") && attempt < 4) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        return this.gql(query, variables, attempt + 1);
      }
      throw new Error(`shopify_graphql: ${body.errors.map((e) => e.message).join("; ").slice(0, 300)}`);
    }
    return body.data as T;
  }

  private mapLine(l: RawLine): ShopifyLineItem {
    return {
      id: l.id,
      title: l.title,
      quantity: l.quantity,
      currentQuantity: l.currentQuantity,
      unfulfilledQuantity: l.unfulfilledQuantity,
      productId: l.product?.id ?? null,
      productLegacyId: l.product?.legacyResourceId ?? null,
      variantId: l.variant?.id ?? null,
      variantLegacyId: l.variant?.legacyResourceId ?? null,
      customAttributes: (l.customAttributes ?? []).map((a) => ({ key: a.key, value: a.value ?? "" })),
      imageUrl: l.image?.url ?? null,
    };
  }

  private async mapOrder(o: RawOrder): Promise<ShopifyOrder> {
    const lines = o.lineItems.edges.map((e) => this.mapLine(e.node));
    let page = o.lineItems.pageInfo;
    while (page.hasNextPage) {
      const d = await this.gql<{ order: { lineItems: Conn<RawLine> } }>(Q_LINES, { id: o.id, after: page.endCursor, lines: this.cfg.linesPageSize });
      lines.push(...d.order.lineItems.edges.map((e) => this.mapLine(e.node)));
      page = d.order.lineItems.pageInfo;
    }
    return {
      id: o.id,
      legacyId: String(o.legacyResourceId),
      name: o.name,
      createdAt: o.createdAt,
      processedAt: o.processedAt,
      cancelledAt: o.cancelledAt,
      test: o.test,
      email: o.email,
      customer: o.customer
        ? { id: o.customer.id, firstName: o.customer.firstName, lastName: o.customer.lastName, email: o.customer.defaultEmailAddress?.emailAddress ?? null }
        : null,
      financialStatus: o.displayFinancialStatus,
      fulfillmentStatus: o.displayFulfillmentStatus,
      tags: o.tags,
      statusPageUrl: o.statusPageUrl,
      mugChoice: o.mugChoice,
      lineItems: lines,
    };
  }

  async ordersByEmail(email: string): Promise<ShopifyOrder[]> {
    const out: ShopifyOrder[] = [];
    let after: string | null = null;
    const search = `email:"${email.replace(/"/g, "")}"`;
    for (let page = 0; page < 40; page++) {
      const d: { orders: Conn<RawOrder> } = await this.gql(Q_ORDERS, { search, first: this.cfg.pageSize, after, lines: this.cfg.linesPageSize });
      for (const e of d.orders.edges) if (!e.node.test) out.push(await this.mapOrder(e.node));
      if (!d.orders.pageInfo.hasNextPage) break;
      after = d.orders.pageInfo.endCursor;
    }
    return out;
  }

  async orderById(id: string): Promise<ShopifyOrder | null> {
    const gid = /^\d+$/.test(id) ? `gid://shopify/Order/${id}` : id;
    const d = await this.gql<{ order: RawOrder | null }>(Q_ORDER, { id: gid, lines: this.cfg.linesPageSize });
    return d.order ? this.mapOrder(d.order) : null;
  }

  async resolveOrderByName(name: string) {
    const n = name.startsWith("#") ? name : `#${name}`;
    const d = await this.gql<{ orders: { edges: { node: { id: string; name: string } }[] } }>(Q_RESOLVE, { search: `name:${n}` });
    return d.orders.edges[0]?.node ?? null;
  }

  async setMugChoice(input: { orderGid: string; namespace: string; key: string; type: string; value: string; compareDigest: string | null }): Promise<MetafieldWriteResult> {
    const d = await this.gql<{ metafieldsSet: { userErrors: { message: string; code?: string }[] } }>(M_METAFIELD, {
      metafields: [{ ownerId: input.orderGid, namespace: input.namespace, key: input.key, type: input.type, value: input.value, compareDigest: input.compareDigest }],
    });
    const errs = d.metafieldsSet.userErrors;
    return errs.length ? { ok: false, reason: errs.map((e) => e.code || e.message).join(",") } : { ok: true };
  }

  async addTags(orderGid: string, tags: string[]): Promise<MetafieldWriteResult> {
    const d = await this.gql<{ tagsAdd: { userErrors: { message: string }[] } }>(M_TAGS, { id: orderGid, tags });
    const errs = d.tagsAdd.userErrors;
    return errs.length ? { ok: false, reason: errs.map((e) => e.message).join(",") } : { ok: true };
  }

  async ping() {
    const d = await this.gql<{ shop: { name: string }; currentAppInstallation: { accessScopes: { handle: string }[] } }>(Q_PING, {});
    return { shop: d.shop.name, scopes: d.currentAppInstallation.accessScopes.map((s) => s.handle) };
  }
}
