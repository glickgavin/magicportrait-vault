import "server-only";
import { CartSourceError, type Attr, type CartLineInput, type Money, type RemoteCart, type ShopCartSource } from "./cart";

/**
 * Storefront API carts. The token stays on the server: a public Storefront token
 * (SHOPIFY_STOREFRONT_TOKEN) or a private one (SHOPIFY_STOREFRONT_PRIVATE_TOKEN).
 */
const CART = `fragment ShopCart on Cart {
  id checkoutUrl
  cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } }
  discountCodes { code applicable }
  attributes { key value }
  lines(first: 100) {
    edges {
      node {
        id quantity
        attributes { key value }
        merchandise { ... on ProductVariant { id } }
        cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } compareAtAmountPerQuantity { amount currencyCode } }
      }
    }
  }
}`;

const Q_CART = `query ShopCart($id: ID!) { cart(id: $id) { ...ShopCart } } ${CART}`;
const M_CREATE = `mutation ShopCartCreate($input: CartInput!) { cartCreate(input: $input) { cart { ...ShopCart } userErrors { field message code } } } ${CART}`;
const M_ADD = `mutation ShopCartAdd($id: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $id, lines: $lines) { cart { ...ShopCart } userErrors { field message code } } } ${CART}`;
const M_UPDATE = `mutation ShopCartUpdate($id: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $id, lines: $lines) { cart { ...ShopCart } userErrors { field message code } } } ${CART}`;
const M_REMOVE = `mutation ShopCartRemove($id: ID!, $ids: [ID!]!) { cartLinesRemove(cartId: $id, lineIds: $ids) { cart { ...ShopCart } userErrors { field message code } } } ${CART}`;
const M_CODES = `mutation ShopCartCodes($id: ID!, $codes: [String!]) { cartDiscountCodesUpdate(cartId: $id, discountCodes: $codes) { cart { ...ShopCart } userErrors { field message code } } } ${CART}`;
const M_ATTRS = `mutation ShopCartAttrs($id: ID!, $attrs: [AttributeInput!]!) { cartAttributesUpdate(cartId: $id, attributes: $attrs) { cart { ...ShopCart } userErrors { field message code } } } ${CART}`;

type RawMoney = { amount: string; currencyCode: string };
type RawCart = {
  id: string;
  checkoutUrl: string;
  cost: { subtotalAmount: RawMoney; totalAmount: RawMoney };
  discountCodes: { code: string; applicable: boolean }[];
  attributes: { key: string; value: string | null }[];
  lines: { edges: { node: { id: string; quantity: number; attributes: { key: string; value: string | null }[]; merchandise: { id: string }; cost: { subtotalAmount: RawMoney; totalAmount: RawMoney; compareAtAmountPerQuantity: RawMoney | null } } }[] };
};

const money = (m: RawMoney): Money => ({ amount: m.amount, currency: m.currencyCode });
const attrs = (a: { key: string; value: string | null }[]): Attr[] => a.map((x) => ({ key: x.key, value: x.value ?? "" }));

function map(c: RawCart): RemoteCart {
  return {
    id: c.id,
    checkoutUrl: c.checkoutUrl,
    subtotal: money(c.cost.subtotalAmount),
    total: money(c.cost.totalAmount),
    discountCodes: c.discountCodes,
    attributes: attrs(c.attributes),
    lines: c.lines.edges.map(({ node: l }) => ({
      id: l.id,
      merchandiseId: l.merchandise.id,
      quantity: l.quantity,
      attributes: attrs(l.attributes),
      subtotal: money(l.cost.subtotalAmount),
      total: money(l.cost.totalAmount),
      compareAtPerUnit: l.cost.compareAtAmountPerQuantity ? money(l.cost.compareAtAmountPerQuantity) : null,
    })),
  };
}

export type StorefrontConfig = { domain: string; apiVersion: string; publicToken?: string; privateToken?: string };

export class ShopCartLive implements ShopCartSource {
  readonly kind = "live" as const;
  constructor(private cfg: StorefrontConfig) {}

  private async gql<T>(query: string, variables: Record<string, unknown>, attempt = 0): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.cfg.privateToken) headers["shopify-storefront-private-token"] = this.cfg.privateToken;
    else if (this.cfg.publicToken) headers["x-shopify-storefront-access-token"] = this.cfg.publicToken;
    const res = await fetch(`https://${this.cfg.domain}/api/${this.cfg.apiVersion}/graphql.json`, { method: "POST", headers, body: JSON.stringify({ query, variables }), cache: "no-store" });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return this.gql(query, variables, attempt + 1);
    }
    if (!res.ok) throw new CartSourceError(`storefront_http_${res.status}`, `HTTP_${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) throw new CartSourceError(`storefront_graphql: ${body.errors.map((e) => e.message).join("; ").slice(0, 300)}`, "GRAPHQL");
    return body.data as T;
  }

  private async mutate(query: string, field: string, variables: Record<string, unknown>): Promise<RemoteCart> {
    const d = await this.gql<Record<string, { cart: RawCart | null; userErrors: { message: string; code?: string }[] }>>(query, variables);
    const r = d[field];
    if (r.userErrors.length || !r.cart) throw new CartSourceError(r.userErrors.map((e) => e.code || e.message).join(",").slice(0, 200) || "no_cart", r.userErrors[0]?.code ?? "USER_ERROR");
    return map(r.cart);
  }

  create(input: { lines: CartLineInput[]; email: string; discountCodes: string[]; attributes: Attr[] }) {
    return this.mutate(M_CREATE, "cartCreate", { input: { lines: input.lines, buyerIdentity: { email: input.email }, discountCodes: input.discountCodes, attributes: input.attributes } });
  }
  async get(cartId: string) {
    const d = await this.gql<{ cart: RawCart | null }>(Q_CART, { id: cartId });
    return d.cart ? map(d.cart) : null;
  }
  addLines(cartId: string, lines: CartLineInput[]) {
    return this.mutate(M_ADD, "cartLinesAdd", { id: cartId, lines });
  }
  updateLines(cartId: string, lines: { id: string; quantity: number }[]) {
    return this.mutate(M_UPDATE, "cartLinesUpdate", { id: cartId, lines });
  }
  removeLines(cartId: string, lineIds: string[]) {
    return this.mutate(M_REMOVE, "cartLinesRemove", { id: cartId, ids: lineIds });
  }
  setDiscountCodes(cartId: string, codes: string[]) {
    return this.mutate(M_CODES, "cartDiscountCodesUpdate", { id: cartId, codes });
  }
  setAttributes(cartId: string, attributes: Attr[]) {
    return this.mutate(M_ATTRS, "cartAttributesUpdate", { id: cartId, attrs: attributes });
  }
}
