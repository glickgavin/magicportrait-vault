import { describe, expect, it } from "vitest";
import { canSeeOpenStore } from "@/lib/open-store/access";
import { addWorkingDays, badgePct, categoryKey, chipColumns, chipImageUrl, chipPictures, listedThemes, deliveryWindow, fillStep, initialVariant, isSort, optionGroups, parseDays, shownOptionGroups, photoSlots, shortDay, variantFor } from "@/lib/open-store/view";
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

  it("an option with only one choice (Color: White on a blanket) isn't shown, unless the setting is off", () => {
    const blanket = ["Small - 30x40in", "Medium - 50x60in", "Large - 60x80in"].map((size, i) => ({ id: `v${i}`, options: [{ name: "Color", value: "White" }, { name: "Size", value: size }] }));
    expect(shownOptionGroups(blanket, true)).toEqual([{ name: "Size", values: ["Small - 30x40in", "Medium - 50x60in", "Large - 60x80in"] }]);
    expect(shownOptionGroups(blanket, false).map((g) => g.name)).toEqual(["Color", "Size"]);
    // The size still picks the right variant, with the hidden colour carried along.
    expect(variantFor(blanket, { Color: "White", Size: "Large - 60x80in" })?.id).toBe("v2");
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

describe("option chips: columns and pictures", () => {
  it("four in a row when the values come in fours, else three", () => {
    expect([2, 3, 4, 5, 6, 7, 8, 12].map(chipColumns)).toEqual([3, 3, 4, 3, 3, 3, 4, 4]);
  });
  const variants = [
    { options: [{ name: "Frame", value: "Black" }, { name: "Size", value: "8x10" }], image: "https://cdn.shopify.com/b8.jpg?v=1" },
    { options: [{ name: "Frame", value: "Black" }, { name: "Size", value: "12x16" }], image: "https://cdn.shopify.com/b12.jpg?v=1" },
    { options: [{ name: "Frame", value: "White" }, { name: "Size", value: "8x10" }], image: "https://cdn.shopify.com/w8.jpg?v=1" },
    { options: [{ name: "Frame", value: "White" }, { name: "Size", value: "12x16" }], image: null },
  ];
  it("a listed option shows the photo of the variant each value would pick", () => {
    const m = chipPictures("frame", ["Black", "White"], variants, { Frame: "Black", Size: "8x10" }, {}, ["Frame"]);
    expect(m).toBeNull(); // the option name must match ("frame" ≠ "Frame" as given by Shopify)
    const pics = chipPictures("Frame", ["Black", "White"], variants, { Frame: "Black", Size: "8x10" }, {}, ["frame"]);
    expect(pics?.get("Black")?.image).toBe("https://cdn.shopify.com/b8.jpg?v=1");
    expect(pics?.get("White")?.image).toBe("https://cdn.shopify.com/w8.jpg?v=1");
  });
  it("falls back to any photo with that value, and shows none unless every value has one", () => {
    const pics = chipPictures("Frame", ["Black", "White"], variants, { Frame: "Black", Size: "12x16" }, {}, ["Frame"]);
    expect(pics?.get("White")?.image).toBe("https://cdn.shopify.com/w8.jpg?v=1");
    expect(chipPictures("Frame", ["Black", "Gold"], variants, {}, {}, ["Frame"])).toBeNull();
  });
  it("an option that isn't listed shows pictures only when Shopify has a swatch for every value", () => {
    expect(chipPictures("Size", ["8x10", "12x16"], variants, {}, {}, ["Frame"])).toBeNull();
    const sw = { Size: { "8x10": { color: "#000000", image: null }, "12x16": { color: null, image: "https://cdn.shopify.com/s.png" } } };
    const pics = chipPictures("Size", ["8x10", "12x16"], variants, {}, sw, []);
    expect(pics?.get("8x10")).toEqual({ color: "#000000", image: null });
    expect(pics?.get("12x16")?.image).toBe("https://cdn.shopify.com/s.png");
  });
  it("asks Shopify's CDN for a small copy", () => {
    expect(chipImageUrl("https://cdn.shopify.com/x.jpg?v=1")).toBe("https://cdn.shopify.com/x.jpg?v=1&width=120");
    expect(chipImageUrl("/fixtures/shop/pillow.jpg")).toBe("/fixtures/shop/pillow.jpg");
  });
});
