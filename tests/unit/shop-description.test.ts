import { describe, expect, it } from "vitest";
import { descriptionBlocks } from "@/lib/shop/description";

describe("product descriptions from Shopify", () => {
  it("keeps paragraphs and turns '- ' lines into a list (the mug's description)", () => {
    const html = "<div>\n<p>This beautiful ceramic mug is perfect for any event of the day. </p>\n<p>- Ceramic 11oz mug</p>\n<p>- Dishwasher and microwave safe</p>\n<p>- Mug Height 96mm, Bottom Diameter 80mm</p>\n</div>";
    expect(descriptionBlocks(html)).toEqual([
      { kind: "p", text: "This beautiful ceramic mug is perfect for any event of the day." },
      { kind: "list", items: ["Ceramic 11oz mug", "Dishwasher and microwave safe", "Mug Height 96mm, Bottom Diameter 80mm"] },
    ]);
  });
  it("reads real lists, line breaks and entities, and drops markup", () => {
    const html = "<p><strong>Made to last</strong><br>Printed &amp; packed in the US&nbsp;&mdash; fast.</p><ul><li>4&quot; x 6&quot;</li><li><em>Gift</em> ready</li></ul><p>Thanks</p>";
    expect(descriptionBlocks(html)).toEqual([
      { kind: "p", text: "Made to last" },
      { kind: "p", text: "Printed & packed in the US — fast." },
      { kind: "list", items: ['4" x 6"', "Gift ready"] },
      { kind: "p", text: "Thanks" },
    ]);
  });
  it("never passes scripts or tags through, and falls back to plain text", () => {
    expect(descriptionBlocks('<p>Hi<script>alert(1)</script><img src=x onerror="alert(2)"></p>')).toEqual([{ kind: "p", text: "Hi" }]);
    expect(descriptionBlocks(null, "Plain one\n- a\n- b")).toEqual([{ kind: "p", text: "Plain one" }, { kind: "list", items: ["a", "b"] }]);
    expect(descriptionBlocks("", "")).toEqual([]);
  });
});
