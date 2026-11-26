import { describe, expect, it } from "vitest";
import { groupLabel, productGroups, UNGROUPED } from "@/lib/open-store/groups";
import type { StoreCollection } from "@/lib/open-store/sources/types";

// Settings › Shop › Products groups: one per "magic…" collection, made-up products only.
const row = (id: string, hidden = false, warnings = 0) => ({ product: { id, media: [{ url: `https://cdn.example/${id}.jpg` }] }, hidden, warnings });
const col = (handle: string, title: string, productIds: string[]): StoreCollection => ({ id: handle, handle, title, description: "", descriptionHtml: null, image: null, productIds });

describe("product groups", () => {
  const rows = [row("a"), row("b", true), row("c", false, 2), row("d")];
  const { groups, ungrouped } = productGroups(rows, [col("magic-store", "Magic Store", ["a", "b", "c", "d"]), col("magic-store-wall-art", "Magic Store · Wall art", ["b", "a", "zz"]), col("magic-store-mugs", "Magic Store · Mugs", ["c", "a"]), col("magic2", "Magic2", [])], "magic-store");

  it("one group per collection, in its order, leaving out the store's own collection, empty ones and unknown products", () => {
    expect(groups.map((g) => [g.handle, g.productIds])).toEqual([
      ["magic-store-wall-art", ["b", "a"]],
      ["magic-store-mugs", ["c", "a"]],
    ]);
    expect(groups[0]).toMatchObject({ hidden: 1, warnings: 0, image: "https://cdn.example/b.jpg" });
    expect(groups[1]).toMatchObject({ hidden: 0, warnings: 2 });
  });

  it("products in no group get their own", () => {
    expect(ungrouped).toMatchObject({ handle: UNGROUPED, title: "Not in a group", productIds: ["d"] });
    expect(productGroups([row("a")], [col("magic-x", "X", ["a"])], "magic-store").ungrouped).toBeNull();
  });

  it("drops the shared start of a title", () => {
    expect(groupLabel("Magic Store · Wall art")).toBe("Wall art");
    expect(groupLabel("Framed posters")).toBe("Framed posters");
  });
});
