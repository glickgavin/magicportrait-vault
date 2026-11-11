import { describe, expect, it } from "vitest";
import { withPending, type PendingLines } from "@/components/shop/CartView";
import { mapLimit, opName } from "@/lib/perf";

type Cart = Parameters<typeof withPending>[0];
const line = (o: Partial<Cart["lines"][number]> = {}) =>
  ({ id: "l1", page: "gifts", productTitle: "Magic Mug", variantTitle: null, quantity: 2, previewUrl: null, unitPrice: "49.00", listTotal: "98.00", ourTotal: "49.00", shopify: null, problem: null, ...o }) as Cart["lines"][number];
const cart = (lines: Cart["lines"]): Cart =>
  ({ cartId: "c1", lines, count: lines.reduce((n, l) => n + l.quantity, 0), hasGift: lines.some((l) => l.page === "gifts"), giftFor: "", giftMessage: "", currency: "USD", figures: { subtotal: "1", total: "1", discount: "0", codeApplied: false }, customerType: "normal", pct: 50 }) as Cart;

describe("cart taps show at once (withPending)", () => {
  it("leaves the cart alone with nothing pending", () => {
    const c = cart([line()]);
    expect(withPending(c, {})).toBe(c);
  });
  it("a new quantity scales the line's prices and the count, and drops Shopify's stale totals", () => {
    const c = cart([line({ shopify: { subtotal: "98.00", total: "49.00" } }), line({ id: "l2", page: "products", quantity: 1, listTotal: "30.00", ourTotal: "15.00" })]);
    const v = withPending(c, { l1: 3 });
    expect(v.lines[0]).toMatchObject({ quantity: 3, listTotal: "147.00", ourTotal: "73.50", shopify: { subtotal: "147.00", total: "73.50" } });
    expect(v.lines[1]).toBe(c.lines[1]);
    expect(v.count).toBe(4);
    expect(v.figures).toBeNull();
  });
  it("a removed line disappears, and the gift box goes with the last gift", () => {
    const c = cart([line(), line({ id: "l2", page: "products", quantity: 1 })]);
    const pending: PendingLines = { l1: null };
    const v = withPending(c, pending);
    expect(v.lines.map((l) => l.id)).toEqual(["l2"]);
    expect(v.hasGift).toBe(false);
    expect(v.count).toBe(1);
  });
});

describe("perf helpers", () => {
  it("opName reads a GraphQL operation's name", () => {
    expect(opName("query ShopCart($id: ID!) { cart(id: $id) { id } }")).toBe("ShopCart");
    expect(opName("mutation ShopCartCodes($id: ID!) { x }")).toBe("ShopCartCodes");
    expect(opName("{ shop { name } }")).toBe("anonymous");
  });
  it("mapLimit keeps the order and never runs more than the limit at once", async () => {
    let running = 0;
    let most = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 0], 2, async (n, i) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, n * 3));
      running--;
      return `${i}:${n}`;
    });
    expect(out).toEqual(["0:5", "1:1", "2:4", "3:2", "4:3", "5:0"]);
    expect(most).toBe(2);
  });
});
