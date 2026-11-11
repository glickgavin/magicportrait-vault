/**
 * Shopify carts through the Storefront API (CLAUDE.md allowed write 4). Our cart (pictures, crops)
 * and Shopify's (prices, discounts) move together; this is Shopify's side.
 */
export type Attr = { key: string; value: string };
export type Money = { amount: string; currency: string };
export type RemoteLine = { id: string; merchandiseId: string; quantity: number; attributes: Attr[]; subtotal: Money; total: Money; compareAtPerUnit: Money | null };
export type RemoteCart = {
  id: string;
  checkoutUrl: string;
  subtotal: Money;
  total: Money;
  discountCodes: { code: string; applicable: boolean }[];
  attributes: Attr[];
  lines: RemoteLine[];
};
export type CartLineInput = { merchandiseId: string; quantity: number; attributes: Attr[] };

export class CartSourceError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

export interface ShopCartSource {
  readonly kind: "live" | "fixtures";
  create(input: { lines: CartLineInput[]; email: string; discountCodes: string[]; attributes: Attr[] }): Promise<RemoteCart>;
  get(cartId: string): Promise<RemoteCart | null>;
  addLines(cartId: string, lines: CartLineInput[]): Promise<RemoteCart>;
  updateLines(cartId: string, lines: { id: string; quantity: number }[]): Promise<RemoteCart>;
  removeLines(cartId: string, lineIds: string[]): Promise<RemoteCart>;
  setDiscountCodes(cartId: string, codes: string[]): Promise<RemoteCart>;
  setAttributes(cartId: string, attributes: Attr[]): Promise<RemoteCart>;
}

/** In-memory Shopify carts: prices from a lookup, a percentage code, made-up checkout links. */
export class ShopCartFixtures implements ShopCartSource {
  readonly kind = "fixtures" as const;
  private carts = new Map<string, RemoteCart & { email: string }>();
  private n = 0;
  readonly calls: { op: string; cartId: string | null; payload: unknown }[] = [];
  constructor(
    private priceOf: (variantGid: string) => Promise<string | null>,
    private percentFor: (code: string) => Promise<number | null>,
    private currency = "USD",
  ) {}

  reset() {
    this.carts.clear();
    this.calls.length = 0;
  }

  private async price(c: RemoteCart): Promise<RemoteCart> {
    let pct = 0;
    for (const d of c.discountCodes) {
      const p = await this.percentFor(d.code);
      d.applicable = p != null;
      if (p != null) pct = Math.max(pct, p);
    }
    let sub = 0;
    let tot = 0;
    for (const l of c.lines) {
      const unit = Number((await this.priceOf(l.merchandiseId)) ?? "0");
      const lineSub = Math.round(unit * 100) * l.quantity;
      const lineTot = Math.round(lineSub * (1 - pct));
      l.subtotal = { amount: (lineSub / 100).toFixed(2), currency: this.currency };
      l.total = { amount: (lineTot / 100).toFixed(2), currency: this.currency };
      l.compareAtPerUnit = null;
      sub += lineSub;
      tot += lineTot;
    }
    c.subtotal = { amount: (sub / 100).toFixed(2), currency: this.currency };
    c.total = { amount: (tot / 100).toFixed(2), currency: this.currency };
    return structuredClone(c);
  }

  private need(id: string) {
    const c = this.carts.get(id);
    if (!c) throw new CartSourceError("cart not found", "NOT_FOUND");
    return c;
  }

  async create(input: { lines: CartLineInput[]; email: string; discountCodes: string[]; attributes: Attr[] }) {
    const id = `gid://shopify/Cart/fx${++this.n}`;
    this.calls.push({ op: "cartCreate", cartId: null, payload: structuredClone(input) });
    const c = {
      id,
      email: input.email,
      checkoutUrl: `https://fixtures.myshopify.com/cart/c/fx${this.n}`,
      subtotal: { amount: "0.00", currency: this.currency },
      total: { amount: "0.00", currency: this.currency },
      discountCodes: input.discountCodes.map((code) => ({ code, applicable: false })),
      attributes: [...input.attributes],
      lines: input.lines.map((l, i) => ({ id: `${id}/line${i + 1}`, merchandiseId: l.merchandiseId, quantity: l.quantity, attributes: [...l.attributes], subtotal: { amount: "0", currency: this.currency }, total: { amount: "0", currency: this.currency }, compareAtPerUnit: null })),
    };
    this.carts.set(id, c);
    return this.price(c);
  }
  async get(cartId: string) {
    const c = this.carts.get(cartId);
    return c ? this.price(c) : null;
  }
  async addLines(cartId: string, lines: CartLineInput[]) {
    const c = this.need(cartId);
    this.calls.push({ op: "cartLinesAdd", cartId, payload: structuredClone(lines) });
    for (const l of lines) c.lines.push({ id: `${cartId}/line${c.lines.length + 1}-${Math.random().toString(36).slice(2, 6)}`, merchandiseId: l.merchandiseId, quantity: l.quantity, attributes: [...l.attributes], subtotal: { amount: "0", currency: this.currency }, total: { amount: "0", currency: this.currency }, compareAtPerUnit: null });
    return this.price(c);
  }
  async updateLines(cartId: string, lines: { id: string; quantity: number }[]) {
    const c = this.need(cartId);
    this.calls.push({ op: "cartLinesUpdate", cartId, payload: structuredClone(lines) });
    for (const u of lines) {
      const l = c.lines.find((x) => x.id === u.id);
      if (l) l.quantity = u.quantity;
    }
    return this.price(c);
  }
  async removeLines(cartId: string, lineIds: string[]) {
    const c = this.need(cartId);
    this.calls.push({ op: "cartLinesRemove", cartId, payload: [...lineIds] });
    c.lines = c.lines.filter((l) => !lineIds.includes(l.id));
    return this.price(c);
  }
  async setDiscountCodes(cartId: string, codes: string[]) {
    const c = this.need(cartId);
    this.calls.push({ op: "cartDiscountCodesUpdate", cartId, payload: [...codes] });
    c.discountCodes = codes.map((code) => ({ code, applicable: false }));
    return this.price(c);
  }
  async setAttributes(cartId: string, attributes: Attr[]) {
    const c = this.need(cartId);
    this.calls.push({ op: "cartAttributesUpdate", cartId, payload: structuredClone(attributes) });
    c.attributes = [...attributes];
    return this.price(c);
  }
}
