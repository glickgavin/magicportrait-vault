import { describe, expect, it } from "vitest";
import { withPending, type PendingLines } from "@/components/shop/CartView";
import { afterResponse, mapLimit, opName } from "@/lib/perf";
import { sameCrop } from "@/lib/shop/cart";
import { ImagenFixtures, ShopifyFixtures } from "@/lib/sources/fixtures";
import { needsOlderOrders } from "@/lib/vault/profile";
import { buildProfile } from "@/lib/vault/profile-core";

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
  it("afterResponse runs the work at once outside a request (scripts, crons in tests)", async () => {
    let ran = false;
    await afterResponse(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});

describe("adding the same thing again adds to its line", () => {
  it("compares crops by value, whatever order the database returns the keys in", () => {
    const fromDb = JSON.parse('{"h": 900, "w": 900, "x": 62, "y": 0}');
    expect(sameCrop(fromDb, { x: 62, y: 0, w: 900, h: 900 })).toBe(true);
    expect(sameCrop(fromDb, { x: 62, y: 1, w: 900, h: 900 })).toBe(false);
    expect(sameCrop(null, null)).toBe(true);
    expect(sameCrop(null, { x: 0, y: 0, w: 1, h: 1 })).toBe(false);
  });
});

describe("the newest sessions and orders first (Show more for the rest)", () => {
  const S = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const sam = [S("5e550001", 1), S("5e550001", 2)];

  it("Shopify: the newest orders and whether older ones exist", async () => {
    const shopify = new ShopifyFixtures();
    const one = await shopify.recentOrdersByEmail("sam@example.com", 1);
    expect(one.orders.map((o) => o.name)).toEqual(["#1002"]);
    expect(one.more).toBe(true);
    const all = await shopify.recentOrdersByEmail("sam@example.com", 3);
    expect(all.orders.map((o) => o.name)).toEqual(["#1002", "#1001"]);
    expect(all.more).toBe(false);
  });

  it("Imagen: only the newest sessions (children count as sessions), with totals for all of them", async () => {
    const imagen = new ImagenFixtures();
    const opts = { includeChildren: true, imageBaseUrl: "" };
    const allRows = await imagen.portraits(sam, opts);
    expect(new Set(allRows.map((r) => r.sessionId)).size).toBe(3);
    const newest = await imagen.portraits(sam, { ...opts, newestSessions: 2 });
    // 1 Nov (cozy) and 20 Oct 10:20 (the space child), not the 20 Oct 10:00 parent.
    expect([...new Set(newest.map((r) => r.sessionId))].sort()).toEqual([S("5e550001", 2), S("5e550001", 3)].sort());
    expect(await imagen.portraitTotals(sam, { includeChildren: true })).toEqual({ sessions: 3, portraits: 12, ordered: allRows.filter((r) => r.ordered).length });
  });

  it("older orders are read only when the newest don't show the free gift", () => {
    expect(needsOlderOrders({ hasFreeGift: false }, true)).toBe(true);
    expect(needsOlderOrders({ hasFreeGift: true }, true)).toBe(false);
    expect(needsOlderOrders({ hasFreeGift: false }, false)).toBe(false);
  });

  it("a profile built from everything says nothing more is waiting", () => {
    const p = buildProfile({ email: "x@example.com", orders: [], mirrorSessions: [], rows: [], unlockRule: "any_paid_order", qualifyingProductIds: [], orderUrlTemplate: "", startPortraitUrl: "" });
    expect(p.more).toEqual({ sessions: 0, orders: false });
    expect(p.sessionCount).toBe(0);
  });
});
