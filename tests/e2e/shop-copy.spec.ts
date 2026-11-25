import { expect, test } from "@playwright/test";
import { admin, signInWithLink } from "./auth";
import { expectNoAxeViolations } from "./helpers";

// "Copy settings from…" (docs/shop.md › Copy settings) on the fixtures: the Magic Canvas's settings onto the Magic
// Portrait Poster. Lead times match by size name; the poster keeps its own theme and print rules.
test.describe.configure({ mode: "serial" });

const POSTER = "8706000000";

test.describe("Copy settings from…", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("/api/test/reset-fixtures?shop=1");
  });
  test.afterAll(async ({ request }) => {
    await request.post("/api/test/reset-fixtures?shop=1");
  });

  test("copy the canvas's settings onto the poster, then see them on the page", async ({ page }) => {
    await signInWithLink(page, "super@example.com", `/settings/shop/products/${POSTER}`);
    const card = page.getByTestId("copy-settings");
    await card.getByLabel("Copy from").selectOption({ label: "Magic Canvas" });
    await card.getByRole("button", { name: "Copy settings" }).click();
    await expect(card.getByText("Replace this product's settings with Magic Canvas's?")).toBeVisible();
    await expectNoAxeViolations(page);
    await card.getByRole("button", { name: "Yes, copy" }).click();
    const status = card.getByRole("status");
    await expect(status).toContainText("Copied from Magic Canvas: 3 parts.");
    // The poster has sizes the canvas doesn't: listed, not guessed.
    await expect(status).toContainText("No size called “8 × 10 in” on Magic Canvas.");

    // The lead time from the canvas's 12 × 16 in is now on the poster's 12 × 16 in; the theme is the poster's own.
    await expect(page.getByLabel("Making time, working days (12 × 16 in)")).toHaveValue("4-6");
    await expect(page.getByLabel("Making time, working days (8 × 10 in)")).toHaveValue("");
    const ev = (await admin().from("activity_log").select("props").eq("event", "admin_shop_settings_copied").order("occurred_at", { ascending: false }).limit(1)).data!;
    expect(ev[0].props).toMatchObject({ product_id: POSTER, from_product_id: "8709000000", parts: ["template", "magic_store", "sizes"] });
  });

  test("at phone width the card fits", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInWithLink(page, "super@example.com", `/settings/shop/products/${POSTER}`);
    const card = page.getByTestId("copy-settings");
    await expect(card.getByLabel("Copy from")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
