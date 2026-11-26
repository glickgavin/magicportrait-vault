import { expect, test } from "@playwright/test";
import { signInWithLink } from "./auth";
import { setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";
import type { Page } from "@playwright/test";

/** Settings › Shop › one product, opened from the Products list. */
/** Opens one of the product page's tabs (Magic Store, Gifts & Products pages, Print rules). */
async function openTab(page: Page, name: string) {
  await page.getByRole("tab", { name }).click();
  await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
}

async function openProduct(page: Page, title: string) {
  await page.goto("/settings/shop?group=all");
  const row = page.getByTestId("shop-product").filter({ hasText: title }).first();
  const href = await row.getByRole("link", { name: `Open ${title} →` }).getAttribute("href");
  await page.goto(href!);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

// Settings › Shop against the fixtures Store collection (lib/shop/sources/fixtures.ts). Writes go to the
// in-memory fixtures in the dev server, so the test puts back what it changes.
test.describe.configure({ mode: "serial" });

test.describe("Settings › Shop", () => {
  test("lists every product in both collections once and says why each store hides it", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await page.goto("/settings/shop?group=all");
    await expect(page.getByRole("heading", { name: "Shop: products" })).toBeVisible();
    const tile = page.getByTestId("shop-product").filter({ hasText: "Magic Portrait Tile" });
    await expect(tile.getByText("GIFTS & PRODUCTS: HIDDEN")).toBeVisible();
    await expect(tile.getByText("No size has its print rules (maker, maker's code, print area)")).toBeVisible();
    await expect(tile.getByText("MAGIC STORE: HIDDEN")).toBeVisible();
    await expect(tile.getByText("Magic Store: No Imagen theme (or mark it Related only)")).toBeVisible();
    const ornaments = page.getByTestId("shop-product").filter({ hasText: "Magic Xmas Ornaments" });
    await expect(ornaments.getByText("GIFTS & PRODUCTS: SHOWN")).toBeVisible();
    await expect(ornaments.getByText("MAGIC STORE: RELATED ONLY")).toBeVisible();
    // Only in the Magic Store, and only in the Store, each listed once.
    await expect(page.getByTestId("shop-product").filter({ hasText: "Magic Canvas" })).toHaveCount(1);
    await expect(page.getByTestId("shop-product").filter({ hasText: "Magic Canvas" }).getByText("Not in Gifts & Products")).toBeVisible();
    await expect(page.getByTestId("shop-product").filter({ hasText: "Magic Pillow with Photo" })).toHaveCount(1);
    await expectNoAxeViolations(page, { exclude: ["iframe"] });
    // Filters.
    await page.getByRole("link", { name: /^Magic Store · \d+$/ }).click();
    await expect(page).toHaveURL(/filter=magic/);
    await expect(page.getByTestId("shop-product").filter({ hasText: "Magic Tee" })).toHaveCount(0);
    await page.getByRole("link", { name: /^Hidden · \d+$/ }).click();
    await expect(page.getByTestId("shop-product").filter({ hasText: "Magic Portrait Tile" })).toHaveCount(1);
    await expect(page.getByTestId("shop-product").filter({ hasText: "Magic Pillow with Photo" })).toHaveCount(0);
    // The shop's own settings moved to Gifts & Products pages.
    await page.getByRole("link", { name: "Gifts & Products pages" }).first().click();
    await expect(page.getByRole("heading", { name: "Gifts & Products pages" })).toBeVisible();
    await expect(page.getByText("SITEWIDE OFF").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save occasions" })).toBeVisible();
    await expectNoAxeViolations(page, { exclude: ["iframe"] });
  });

  test("a product's page and occasions save to Shopify and show again", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await openProduct(page, "Magic Poster");
    await openTab(page, "Gifts & Products pages");
    const poster = page.getByRole("region", { name: "Gifts & Products pages" });
    await poster.getByLabel("Page", { exact: true }).selectOption("all");
    await poster.getByText("Birthday", { exact: true }).click();
    await poster.getByRole("button", { name: "Save page, occasions and categories for Magic Poster" }).click();
    await expect(poster.getByRole("status")).toHaveText("Saved to Shopify.");
    await page.reload();
    // The open tab is kept in the address.
    await expect(page.getByRole("tab", { name: "Gifts & Products pages" })).toHaveAttribute("aria-selected", "true");
    const again = page.getByRole("region", { name: "Gifts & Products pages" });
    await expect(again.getByLabel("Page", { exact: true })).toHaveValue("all");
    await page.goto("/settings/shop?group=all");
    await expect(page.getByTestId("shop-product").filter({ hasText: "Magic Poster" }).getByText("Gifts + Products · Birthday")).toBeVisible();
    await page.goBack();
    // Put it back.
    await again.getByLabel("Page", { exact: true }).selectOption("products");
    await again.getByText("Birthday", { exact: true }).click();
    await again.getByRole("button", { name: "Save page, occasions and categories for Magic Poster" }).click();
    await expect(again.getByRole("status")).toHaveText("Saved to Shopify.");
  });

  test("an occasion still on a product can't be removed", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await page.goto("/settings/shop/pages");
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
    await openProduct(page, "Magic Portrait Tile");
    await page.getByRole("link", { name: "Open template editor →" }).click();
    await expect(page.getByRole("heading", { name: /Preview template: Magic Portrait Tile/ })).toBeVisible();
    const handle = page.getByRole("button", { name: "Top left corner: move with the arrow keys" });
    await handle.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await page.getByRole("button", { name: "Publish to Shopify" }).click();
    await expect(page.getByText("Published to Shopify.")).toBeVisible();
    await page.goto("/settings/shop?group=all");
    await expect(page.getByTestId("shop-product").filter({ hasText: "Magic Portrait Tile" }).getByText("Gifts & Products: No preview template yet")).toHaveCount(0);

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
    await openProduct(page, "Magic Portrait Tile");
    await openTab(page, "Print rules");
    await expect(page.getByRole("heading", { name: "Print rules" })).toBeVisible();
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
    await expect(page.getByRole("tab", { name: "Print rules" })).toHaveAttribute("aria-selected", "true");
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
    await page.goto("/settings/shop?group=all");
    // A category still on a product can't be removed.
    await page.goto("/settings/shop/pages");
    await page.getByRole("button", { name: "Remove Mugs" }).click();
    await page.getByRole("button", { name: "Save categories" }).click();
    await expect(page.getByText(/Still used by a product: Mugs/)).toBeVisible();

    // Put the Poster in Acrylic as well as Wall art.
    await openProduct(page, "Magic Poster");
    await openTab(page, "Gifts & Products pages");
    const poster = page.getByRole("region", { name: "Gifts & Products pages" });
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
    await openProduct(page, "Magic Poster");
    await openTab(page, "Gifts & Products pages");
    const again = page.getByRole("region", { name: "Gifts & Products pages" });
    await again.getByRole("group", { name: "Categories (Products page)" }).getByText("Acrylic", { exact: true }).click();
    await again.getByRole("button", { name: "Save page, occasions and categories for Magic Poster" }).click();
    await expect(again.getByRole("status")).toHaveText("Saved to Shopify.");
  });

  test("one product page: Magic Store fields save to Shopify, empty ones show the store default", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await openProduct(page, "Magic Pillow with Photo");
    // The status is at the top, and the Magic Store tab opens first for a Magic Store product.
    await expect(page.getByTestId("status-shop").getByText("SHOWN")).toBeVisible();
    await expect(page.getByTestId("status-store").getByText("SHOWN")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Magic Store" })).toHaveAttribute("aria-selected", "true");
    const magic = page.getByRole("region", { name: "Magic Store" });
    await expect(magic.getByLabel("Imagen theme")).toHaveValue("admiral-01");
    // Empty fields show the store default in grey.
    await expect(magic.getByLabel("Photo tips")).toHaveValue("");
    await expect(magic.getByLabel("Photo tips")).toHaveAttribute("placeholder", /Best results/);
    await expectNoAxeViolations(page);
    await magic.getByLabel("Imagen theme").selectOption("journal-02");
    await magic.getByLabel("Photo tips").fill("One pet, facing the camera.");
    await magic.getByLabel("Making time, working days (Default Title)").fill("3-4");
    await magic.getByRole("button", { name: "Save Magic Store fields" }).press("Enter");
    await expect(magic.getByRole("status")).toHaveText("Saved to Shopify.");
    await page.reload();
    const again = page.getByRole("region", { name: "Magic Store" });
    await expect(again.getByLabel("Imagen theme")).toHaveValue("journal-02");
    await expect(again.getByLabel("Photo tips")).toHaveValue("One pet, facing the camera.");
    await expect(page.getByTestId("status-store").getByText("SHOWN")).toBeVisible();
    // Put it back.
    await again.getByLabel("Imagen theme").selectOption("admiral-01");
    await again.getByLabel("Photo tips").fill("");
    await again.getByLabel("Making time, working days (Default Title)").fill("4-6");
    await again.getByRole("button", { name: "Save Magic Store fields" }).press("Enter");
    await expect(again.getByRole("status")).toHaveText("Saved to Shopify.");
  });

  test("one product page: a store the product isn't in stays folded; the theme's photo count sets the slots", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await openProduct(page, "Magic Canvas");
    await expect(page.getByTestId("status-shop").getByText("NOT IN COLLECTION")).toBeVisible();
    await openTab(page, "Gifts & Products pages");
    await expect(page.getByRole("region", { name: "Gifts & Products pages" }).getByText("Not in the Store collection. Add it in Shopify to sell it there.")).toBeVisible();
    await openProduct(page, "Magic Tee");
    await expect(page.getByTestId("status-store").getByText("NOT IN COLLECTION")).toBeVisible();
    // Not in the Magic Store: Gifts & Products pages opens first.
    await expect(page.getByRole("tab", { name: "Gifts & Products pages" })).toHaveAttribute("aria-selected", "true");
    await openTab(page, "Magic Store");
    await expect(page.getByRole("region", { name: "Magic Store" }).getByText("Not in the Magic Store collection. Add it in Shopify to sell it there.")).toBeVisible();
    await openProduct(page, "Acrylic Block");
    const magic = page.getByRole("region", { name: "Magic Store" });
    await expect(magic.getByText("The theme takes 2 photos, so the page shows 2 slots.")).toBeVisible();
    await expect(magic.getByLabel("Photo 2: label")).toHaveValue("Second pet's photo");
    // The API refuses Magic Store fields for a product that isn't in the Magic Store.
    const tee = await page.request.post("/api/admin/shop/store-fields", { data: { productId: "gid://shopify/Product/8708000000", fields: { imagen_theme: "admiral-01" } } });
    expect([400, 404]).toContain(tee.status());
    const bad = await page.request.post("/api/admin/shop/store-fields", { data: { productId: "nope", fields: {} } });
    expect(bad.status()).toBe(400);
  });

  test("Magic Store settings: switches off, collection and menu found, themes refreshed from Imagen", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await page.goto("/settings/shop/magic-store");
    await expect(page.getByRole("heading", { level: 1, name: "Magic Store" })).toBeVisible();
    const who = page.getByRole("region", { name: "Who sees the Magic Store" });
    await expect(who.getByRole("switch").first()).not.toBeChecked();
    await expect(page.getByRole("region", { name: "In Shopify now" }).getByText(/Collection magic-store: \d+ products/)).toBeVisible();
    await expect(page.getByRole("region", { name: "In Shopify now" }).getByText(/4 categories/)).toBeVisible();
    await expect(page.getByTestId("imagen-themes").getByText("Best friends")).toBeVisible();
    // Only the Magic Store's category (open_store.theme_category): a theme in another category isn't listed.
    await expect(page.getByTestId("imagen-themes-category")).toContainText("magicshop");
    await expect(page.getByTestId("imagen-themes").getByText("Card style")).toHaveCount(0);
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Refresh themes from Imagen" }).press("Enter");
    await expect(page.getByText(/The theme dropdown in Shopify now has \d+ themes/)).toBeVisible();
    // The settings menu lists the SHOP group's pages.
    for (const name of ["Products", "Gifts & Products pages", "Magic Store", "Photo library", "AI room photos"]) await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name, exact: true })).toBeVisible();
    // Hidden for people who aren't super users.
    const r = await page.request.post("/api/admin/shop/themes");
    expect(r.status()).toBe(200);
  });
});

