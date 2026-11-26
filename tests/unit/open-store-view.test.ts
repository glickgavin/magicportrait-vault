import { describe, expect, it } from "vitest";
import { canSeeOpenStore } from "@/lib/open-store/access";
import { addWorkingDays, badgePct, categoryKey, listedThemes, deliveryWindow, fillStep, initialVariant, isSort, optionGroups, parseDays, photoSlots, shortDay, variantFor } from "@/lib/open-store/view";
import type { ShopVariant } from "@/lib/shop/sources/types";

describe("open store: who sees it", () => {
  const su = { isSuperUser: true };
  const cust = { isSuperUser: false };
  it("is hidden with both switches off, for everyone", () => {
    const off = { enabled: false, superUserPreview: false };
    expect(canSeeOpenStore(off, null)).toBe(false);
    expect(canSeeOpenStore(off, cust)).toBe(false);
    expect(canSeeOpenStore(off, su)).toBe(false);
  });
  it("the preview shows it to super users only", () => {
    const pre = { enabled: false, superUserPreview: true };
    expect(canSeeOpenStore(pre, null)).toBe(false);
    expect(canSeeOpenStore(pre, cust)).toBe(false);
    expect(canSeeOpenStore(pre, su)).toBe(true);
  });
  it("enabled shows it to visitors too", () => {
    expect(canSeeOpenStore({ enabled: true, superUserPreview: false }, null)).toBe(true);
  });
});

describe("open store: page helpers", () => {
  it("sorts", () => {
    expect(isSort("price-asc")).toBe(true);
    expect(isSort("cheapest")).toBe(false);
  });

  it("badge: the store discount wins, else the compare-at saving", () => {
    expect(badgePct("20.00", "50.00", 60)).toBe(60);
    expect(badgePct("20.00", "50.00", null)).toBe(60);
    expect(badgePct("20.00", null, null)).toBeNull();
    expect(badgePct("20.00", "10.00", null)).toBeNull();
  });

  it("delivery skips weekends and adds making and shipping time", () => {
    expect(parseDays("4-6")).toEqual([4, 6]);
    expect(parseDays("3")).toEqual([3, 3]);
    expect(parseDays("6-4")).toEqual([4, 6]);
    expect(parseDays("soon")).toBeNull();
    expect(parseDays(null)).toBeNull();
    // Friday 20 Nov 2026 + 1 working day is Monday 23 Nov.
    expect(addWorkingDays("2026-11-20", 1)).toBe("2026-11-23");
    // Monday 23 Nov: 4-6 making + 2-3 shipping = 6-9 working days → Tue 1 Dec – Fri 4 Dec.
    expect(deliveryWindow("2026-11-23", "4-6", "2-3")).toEqual({ from: "2026-12-01", to: "2026-12-04" });
    expect(deliveryWindow("2026-11-23", null, "2-3")).toBeNull();
    expect(shortDay("2026-12-01")).toBe("1 Dec");
  });

  it("option chips and the chosen variant", () => {
    const vs = [
      { id: "a", options: [{ name: "Size", value: "S" }, { name: "Colour", value: "Red" }] },
      { id: "b", options: [{ name: "Size", value: "M" }, { name: "Colour", value: "Red" }] },
      { id: "c", options: [{ name: "Size", value: "M" }, { name: "Colour", value: "Blue" }] },
    ];
    expect(optionGroups(vs)).toEqual([{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Red", "Blue"] }]);
    expect(variantFor(vs, { Size: "M", Colour: "Blue" })?.id).toBe("c");
    expect(variantFor(vs, { Size: "S", Colour: "Blue" })).toBeNull();
  });

  it("first variant: the one asked for, else the first available", () => {
    const v = (legacyId: string, availableForSale: boolean) => ({ legacyId, availableForSale }) as ShopVariant;
    const vs = [v("1", false), v("2", true), v("3", true)];
    expect(initialVariant(vs, "3")?.legacyId).toBe("3");
    expect(initialVariant(vs, "999")?.legacyId).toBe("2");
    expect(initialVariant(vs, null)?.legacyId).toBe("2");
    expect(initialVariant([], null)).toBeNull();
  });

  it("photo slots follow the theme's count, worded from Shopify", () => {
    expect(photoSlots(2, [{ label: "First pet's photo" }])).toEqual([
      { label: "First pet's photo", nameLabel: null, namePlaceholder: null },
      { label: "Photo 2", nameLabel: null, namePlaceholder: null },
    ]);
    expect(photoSlots(0, [])).toHaveLength(1);
    // Imagen's own slot labels fill in when Shopify's words have none.
    expect(photoSlots(2, [{ label: "Your dog" }], ["First pet", "Second pet"]).map((x) => x.label)).toEqual(["Your dog", "Second pet"]);
  });

  it("progress steps fill in the name and product", () => {
    expect(fillStep("Painting {name} on the {product}", "Teddy", "pillow")).toBe("Painting Teddy on the pillow");
    expect(fillStep("Painting {name}", " ", "pillow")).toBe("Painting your pet");
  });
});

describe("listedThemes: the Magic Store's own themes (open_store.theme_category)", () => {
  const themes = [
    { slug: "a", category: "magicstore" },
    { slug: "b", category: "Magic Store" },
    { slug: "c", category: "pets" },
    { slug: "d", category: null },
    { slug: "e", category: "magic-store" },
  ];
  it("keeps the category, matched without case, spaces or dashes, in Imagen's order", () => {
    expect(listedThemes(themes, "magicstore").map((t) => t.slug)).toEqual(["a", "b", "e"]);
    expect(listedThemes(themes, " Magic_Store ").map((t) => t.slug)).toEqual(["a", "b", "e"]);
  });
  it("keeps a theme a product already uses, whatever its category", () => {
    expect(listedThemes(themes, "magicstore", ["c"]).map((t) => t.slug)).toEqual(["a", "b", "c", "e"]);
  });
  it("shows every theme when the setting is empty", () => {
    expect(listedThemes(themes, "").map((t) => t.slug)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("compares categories the same way everywhere", () => {
    expect(categoryKey("Magic Store")).toBe("magicstore");
    expect(categoryKey(null)).toBe("");
  });
});
