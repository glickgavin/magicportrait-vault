import { expect, test } from "@playwright/test";
import { signInWithLink } from "./auth";
import { expectNoAxeViolations } from "./helpers";

// Settings › Shop › Products groups (docs/open-store.md › Settings): one per "magic…" collection (fixtures: Wall art,
// Pillows, Mugs, Acrylic; the Magic Store collection and an empty one left out), then a group's products.
test("products are grouped by collection, and a group opens its products", async ({ page }) => {
  await signInWithLink(page, "super@example.com", "/settings/shop");
  const groups = page.getByTestId("shop-group");
  await expect(page.getByRole("heading", { name: "Product groups" })).toBeVisible();
  await expect(groups.filter({ hasText: "Wall art" })).toContainText("5 products");
  await expect(groups.filter({ hasText: "Pillows" })).toContainText("1 product");
  // The whole-store collection and the empty one aren't groups; products in none have their own card.
  await expect(groups.filter({ hasText: "Bestsellers" })).toHaveCount(0);
  await expect(groups.filter({ hasText: "Magic (empty)" })).toHaveCount(0);
  await expect(groups.filter({ hasText: "Not in a group" })).toBeVisible();
  await expect(page.getByTestId("shop-product")).toHaveCount(0);
  await expectNoAxeViolations(page, { exclude: ["iframe"] });

  await groups.filter({ hasText: "Wall art" }).click();
  await expect(page).toHaveURL(/group=magic-store-wall-art/);
  await expect(page.getByRole("heading", { name: "Wall art" })).toBeVisible();
  const rows = page.getByTestId("shop-product");
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: 'Framed Dog Poster "Flush"' })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Magic Pillow with Photo" })).toHaveCount(0);
  // The filters work inside the group, and lead back to it.
  await page.getByRole("link", { name: /^Hidden · \d+$/ }).click();
  await expect(page).toHaveURL(/group=magic-store-wall-art&filter=hidden/);
  await expect(rows.filter({ hasText: "Magic Portrait Tile" })).toHaveCount(1);
  // A product in two collections is in both groups.
  await page.getByRole("link", { name: "← All groups" }).click();
  await groups.filter({ hasText: "Acrylic" }).click();
  await expect(rows.filter({ hasText: "Acrylic Block" })).toHaveCount(1);
  // All products: the full list, as before.
  await page.getByRole("link", { name: "← All groups" }).click();
  await page.getByRole("link", { name: /^All products · \d+ →$/ }).click();
  await expect(page.getByRole("heading", { name: "All products" })).toBeVisible();
  await expect(rows.filter({ hasText: "Magic Tee" })).toHaveCount(1);
  if (test.info().project.name === "mobile") expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
