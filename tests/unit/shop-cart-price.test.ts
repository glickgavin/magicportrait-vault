import { describe, expect, it } from "vitest";
import { linePrice } from "@/components/shop/CartView";

const line = (o: Partial<Parameters<typeof linePrice>[0]> = {}) =>
  ({ id: "l1", page: "gifts", productTitle: "Magic Mug", variantTitle: null, quantity: 2, previewUrl: null, unitPrice: "49.00", listTotal: "98.00", ourTotal: "49.00", shopify: null, problem: null, ...o }) as Parameters<typeof linePrice>[0];

describe("the discount on each cart line", () => {
  it("shows our discount when Shopify hasn't applied one to the line", () => {
    expect(linePrice(line())).toEqual({ was: "98.00", now: "49.00", pct: 50 });
    expect(linePrice(line({ shopify: { subtotal: "98.00", total: "98.00" } }))).toEqual({ was: "98.00", now: "49.00", pct: 50 });
  });
  it("uses Shopify's figures when its line total includes the discount", () => {
    expect(linePrice(line({ shopify: { subtotal: "98.00", total: "49.00" } }))).toEqual({ was: "98.00", now: "49.00", pct: 50 });
  });
  it("shows the plain price with no discount", () => {
    expect(linePrice(line({ ourTotal: null }))).toEqual({ was: null, now: "98.00", pct: null });
    expect(linePrice(line({ ourTotal: "98.00", shopify: { subtotal: "98.00", total: "98.00" } }))).toEqual({ was: null, now: "98.00", pct: null });
  });
});
