import { expect, test } from "@playwright/test";
import { signInWithLink } from "./auth";
import { setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

// Settings › Shop against the fixtures Store collection (lib/shop/sources/fixtures.ts). Writes go to the
// in-memory fixtures in the dev server, so the test puts back what it changes.
test.describe.configure({ mode: "serial" });

test.describe("Settings › Shop", () => {
  test("lists the Store collection and says why products are hidden", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await page.goto("/settings/shop");
    await expect(page.getByRole("heading", { name: "Shop: products & discounts" })).toBeVisible();
    const tile = page.getByTestId("shop-product").filter({ hasText: "Magic Portrait Tile" });
    await expect(tile.getByText("HIDDEN")).toBeVisible();
    await expect(tile.getByText("No size has its print rules (maker, maker's code, print area)")).toBeVisible();
    const ornaments = page.getByTestId("shop-product").filter({ hasText: "Magic Xmas Ornaments" });
    await expect(ornaments.getByText("SHOWN")).toBeVisible();
    await expect(page.getByText("SITEWIDE OFF").first()).toBeVisible();
    await expectNoAxeViolations(page, { exclude: ["iframe"] });
  });

  test("a product's page and occasions save to Shopify and show again", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await page.goto("/settings/shop");
    const poster = page.getByTestId("shop-product").filter({ hasText: "Magic Poster" });
    await poster.getByLabel("Page", { exact: true }).selectOption("all");
    await poster.getByText("Birthday", { exact: true }).click();
    await poster.getByRole("button", { name: "Save page, occasions and categories for Magic Poster" }).click();
    await expect(poster.getByRole("status")).toHaveText("Saved to Shopify.");
    await page.reload();
    const again = page.getByTestId("shop-product").filter({ hasText: "Magic Poster" });
    await expect(again.getByLabel("Page", { exact: true })).toHaveValue("all");
    await expect(again.getByText("GIFTS + PRODUCTS")).toBeVisible();
    // Put it back.
    await again.getByLabel("Page", { exact: true }).selectOption("products");
    await again.getByText("Birthday", { exact: true }).click();
    await again.getByRole("button", { name: "Save page, occasions and categories for Magic Poster" }).click();
    await expect(again.getByRole("status")).toHaveText("Saved to Shopify.");
  });

  test("an occasion still on a product can't be removed", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await page.goto("/settings/shop");
    await page.getByRole("button", { name: "Remove Christmas" }).click();
    await page.getByRole("button", { name: "Save occasions" }).click();
    await expect(page.getByText(/Still used by a product: Christmas/)).toBeVisible();
  });

  test("the shop API refuses products outside the Store collection", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    const r = await page.request.post("/api/admin/shop/products", { data: { productId: "gid://shopify/Product/1", page: "gifts" } });
    expect(r.status()).toBe(404);
    const bad = await page.request.post("/api/admin/shop/products", { data: { productId: "not-a-gid", page: "gifts" } });
    expect(bad.status()).toBe(400);
  });

  test("the template editor publishes to Shopify, and only with the product's own photos", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await page.goto("/settings/shop");
    const tile = page.getByTestId("shop-product").filter({ hasText: "Magic Portrait Tile" });
    await tile.getByRole("link", { name: /^(Make|Edit) the preview template$/ }).click();
    await expect(page.getByRole("heading", { name: /Preview template: Magic Portrait Tile/ })).toBeVisible();
    const handle = page.getByRole("button", { name: "Top left: move with the arrow keys" });
    await handle.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await page.getByRole("button", { name: "Publish to Shopify" }).click();
    await expect(page.getByText("Published to Shopify.")).toBeVisible();
    await page.goto("/settings/shop");
    await expect(page.getByTestId("shop-product").filter({ hasText: "Magic Portrait Tile" }).getByText("No preview template yet")).toHaveCount(0);

    const r = await page.request.post("/api/admin/shop/template", {
      data: {
        productId: "gid://shopify/Product/8707000000",
        template: { v: 1, background: { media_id: "fixture:elsewhere", url: "https://example.com/x.jpg", w: 1000, h: 1000 }, zone: { kind: "corners", points: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]] } },
      },
    });
    expect(r.status()).toBe(400);
  });

  test("print rules: a size gets its maker, code and print area and the product shows", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await page.goto("/settings/shop");
    const tile = page.getByTestId("shop-product").filter({ hasText: "Magic Portrait Tile" });
    const href = await tile.getByRole("link", { name: /print rules/ }).getAttribute("href");
    await page.goto(href!);
    await expect(page.getByRole("heading", { name: "Print rules: Magic Portrait Tile" })).toBeVisible();
    await expectNoAxeViolations(page);
    const size = page.getByTestId("rules-size").first();
    await size.getByLabel("Maker", { exact: true }).selectOption("prodigi");
    await size.getByLabel("Maker's product code").fill("GLOBAL-TILE-8X8");
    await size.getByLabel("Print area (px)").fill("2400 by 2400");
    await expect(page.getByText("print area must be width x height")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save to Shopify" })).toBeDisabled();
    await size.getByLabel("Print area (px)").fill("2400x2400");
    await page.getByRole("button", { name: "Save to Shopify" }).press("Enter"); // keyboard: the dev-only Next.js badge can sit over it at 390 px
    await expect(page.getByText("Saved to Shopify.")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("rules-size").first().getByText("READY")).toBeVisible();
    await expect(page.getByTestId("rules-size").first().getByLabel("Maker's product code")).toHaveValue("GLOBAL-TILE-8X8");
    // Put it back (the fixtures are shared by the other tests): clearing removes the fields again.
    const again = page.getByTestId("rules-size").first();
    await again.getByLabel("Maker", { exact: true }).selectOption("");
    await again.getByLabel("Maker's product code").fill("");
    await again.getByLabel("Print area (px)").fill("");
    await page.getByRole("button", { name: "Save to Shopify" }).press("Enter"); // keyboard: the dev-only Next.js badge can sit over it at 390 px
    await expect(page.getByText("Saved to Shopify.")).toBeVisible();
    // The API refuses anything outside the rules.
    const bad = await page.request.post("/api/admin/shop/rules", { data: { productId: "gid://shopify/Product/1", variants: [{ variantId: "gid://shopify/ProductVariant/1", rules: { maker: "x" } }] } });
    expect(bad.status()).toBe(400);
  });

  test("categories: managed like occasions, ticked on a product, and the Products page groups by them", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await page.goto("/settings/shop");
    // A category still on a product can't be removed.
    await page.getByRole("button", { name: "Remove Mugs" }).click();
    await page.getByRole("button", { name: "Save categories" }).click();
    await expect(page.getByText(/Still used by a product: Mugs/)).toBeVisible();
    await page.reload();

    // Put the Poster in Acrylic as well as Wall art.
    const poster = page.getByTestId("shop-product").filter({ hasText: "Magic Poster" });
    await poster.getByRole("group", { name: "Categories (Products page)" }).getByText("Acrylic", { exact: true }).click();
    await poster.getByRole("button", { name: "Save page, occasions and categories for Magic Poster" }).click();
    await expect(poster.getByRole("status")).toHaveText("Saved to Shopify.");

    await setSetting("shop.enabled", true);
    try {
      await page.goto("/products");
      await expect(page.getByRole("region", { name: "Acrylic" }).getByText("Magic Poster")).toBeVisible();
      await expect(page.getByRole("region", { name: "Wall art" }).getByText("Magic Poster")).toBeVisible();
      await expect(page.getByRole("link", { name: "Acrylic", exact: true })).toBeVisible();
    } finally {
      await setSetting("shop.enabled", false);
    }

    // Put it back.
    await page.goto("/settings/shop");
    const again = page.getByTestId("shop-product").filter({ hasText: "Magic Poster" });
    await again.getByRole("group", { name: "Categories (Products page)" }).getByText("Acrylic", { exact: true }).click();
    await again.getByRole("button", { name: "Save page, occasions and categories for Magic Poster" }).click();
    await expect(again.getByRole("status")).toHaveText("Saved to Shopify.");
  });
});

