import { expect, test } from "@playwright/test";
import { signInWithLink } from "./auth";
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
    await expect(tile.getByText("No preview template yet")).toBeVisible();
    const ornaments = page.getByTestId("shop-product").filter({ hasText: "Magic Xmas Ornaments" });
    await expect(ornaments.getByText("SHOWN")).toBeVisible();
    await expect(page.getByText("SITEWIDE OFF").first()).toBeVisible();
    await expectNoAxeViolations(page, { exclude: ["iframe"] });
  });

  test("a product's page and occasions save to Shopify and show again", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    await page.goto("/settings/shop");
    const poster = page.getByTestId("shop-product").filter({ hasText: "Magic Poster" });
    await poster.getByLabel("Page").selectOption("all");
    await poster.getByText("Birthday", { exact: true }).click();
    await poster.getByRole("button", { name: "Save page and occasions for Magic Poster" }).click();
    await expect(poster.getByRole("status")).toHaveText("Saved to Shopify.");
    await page.reload();
    const again = page.getByTestId("shop-product").filter({ hasText: "Magic Poster" });
    await expect(again.getByLabel("Page")).toHaveValue("all");
    await expect(again.getByText("GIFTS + PRODUCTS")).toBeVisible();
    // Put it back.
    await again.getByLabel("Page").selectOption("products");
    await again.getByText("Birthday", { exact: true }).click();
    await again.getByRole("button", { name: "Save page and occasions for Magic Poster" }).click();
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
});
