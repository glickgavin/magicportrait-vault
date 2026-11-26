import { expect, test } from "@playwright/test";
import { admin, signInWithLink } from "./auth";
import { expectNoAxeViolations } from "./helpers";

// Dreamship link and sync (docs/dreamship.md › Part A), against the fixtures: the Framed Dog Poster "Flush" in
// Shopify (SKUs = Dreamship product variant ids, half its rules filled in) and Dreamship product 9972256.
test.describe.configure({ mode: "serial" });

const FLUSH = "8710000000";

test.describe("Dreamship link and sync", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("/api/test/reset-fixtures?shop=1");
    await admin().from("dreamship_sync").delete().neq("product_id", "");
  });
  test.afterAll(async ({ request }) => {
    await request.post("/api/test/reset-fixtures?shop=1");
  });

  test("link the Flush poster from the suggestion, sync, see the diff and save to Shopify", async ({ page }) => {
    // The Dreamship card is on the Print rules tab; ?tab=print opens it.
    await signInWithLink(page, "super@example.com", `/settings/shop/products/${FLUSH}?tab=print`);
    const card = page.getByRole("region", { name: "Dreamship" });
    await expect(card.getByTestId("dreamship-suggestion")).toContainText("Found on Dreamship: 9972256");
    await expect(card.getByLabel("Dreamship product id or designer link")).toHaveValue("9972256");
    await card.getByRole("button", { name: "Link" }).click();
    await expect(card.getByText("Linked to Dreamship product")).toBeVisible();
    await expect(card.getByRole("link", { name: "9972256" })).toHaveAttribute("href", "https://app.dreamship.com/app/products/9972256");

    await card.getByRole("button", { name: "Sync from Dreamship" }).click();
    const sizes = card.getByTestId("dreamship-sizes");
    await expect(sizes.getByRole("row")).toHaveCount(5);
    const s12 = sizes.getByRole("row", { name: /12x16/ });
    await expect(s12).toContainText("3000x4000 → 3000x4200");
    await expect(s12).toContainText("$32.19");
    await expect(sizes.getByRole("row", { name: /8x10/ })).toContainText("$1.01");
    await expect(card.getByTestId("dreamship-flags")).toContainText('24x36" costs $135.69 at Dreamship and sells for $129.99.');
    await expectNoAxeViolations(page);

    await card.getByRole("button", { name: "Save to Shopify (14 fields)" }).click();
    await expect(card.getByRole("status")).toHaveText("Saved 14 fields to Shopify.");
    await card.getByRole("button", { name: "Sync from Dreamship" }).click();
    await expect(card.getByRole("button", { name: "Shopify matches Dreamship" })).toBeDisabled();
    await expect(sizes.getByRole("row", { name: /24x36/ })).toContainText("Matches");

    // What was recorded: the link and the save, and the kept report.
    const events = (await admin().from("activity_log").select("event, props").in("event", ["admin_dreamship_linked", "admin_dreamship_synced"]).order("occurred_at", { ascending: false }).limit(2)).data!;
    expect(events.map((e) => e.event).sort()).toEqual(["admin_dreamship_linked", "admin_dreamship_synced"]);
    expect(events.find((e) => e.event === "admin_dreamship_synced")!.props).toMatchObject({ product_id: FLUSH, fields_changed: 14 });
    const row = (await admin().from("dreamship_sync").select("differs, warnings").eq("legacy_id", FLUSH).single()).data!;
    expect(row.differs).toBe(0);
    expect(row.warnings).toBeGreaterThan(0);

    // The flags show on Settings › Shop › Products and the product on Settings › Printers.
    await page.goto("/settings/shop?filter=magic");
    await expect(page.getByTestId("shop-product").filter({ hasText: "Flush" }).getByTestId("dreamship-warnings")).toContainText(/Dreamship: \d+ warnings/);
    await page.goto("/settings/printers");
    await expect(page.getByTestId("dreamship-products")).toContainText("Dreamship 9972256");
    // Its warnings link opens the product on the Print rules tab, at the Dreamship card.
    await page.getByTestId("dreamship-products").getByRole("link", { name: /warning/ }).first().click();
    await page.waitForURL(/\/settings\/shop\/products\/\d+\?tab=print/);
    await expect(page.getByRole("tab", { name: "Print rules" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: "Dreamship", exact: true })).toBeVisible();
  });

  test("Check all Dreamship products finds the unlinked Flush poster; Save all links it and writes what differs", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/settings/printers");
    const panel = page.getByTestId("dreamship-check-all");
    await panel.getByRole("button", { name: "Check all Dreamship products" }).click();
    const flush = panel.getByTestId("dreamship-check-rows").getByRole("listitem").filter({ hasText: "Flush" }).first();
    await expect(flush).toHaveAttribute("data-status", "unlinked_found");
    await expect(flush).toContainText("Dreamship 9972256");
    await expect(flush).toContainText("FOUND, NOT LINKED");
    await expectNoAxeViolations(page);

    await panel.getByRole("button", { name: "Save all to Shopify" }).click();
    await expect(panel.getByTestId("dreamship-save-all-confirm")).toContainText("link 1 product to Dreamship");
    await panel.getByRole("button", { name: "Yes, save all" }).click();
    await expect(panel.getByTestId("dreamship-save-all-result")).toContainText("Saved 14 fields on 1 product, linked 1.");
    await expect(flush).toHaveAttribute("data-status", "up_to_date");

    const ev = (await admin().from("activity_log").select("props").eq("event", "admin_dreamship_saved_all").order("occurred_at", { ascending: false }).limit(1)).data!;
    expect(ev[0].props).toMatchObject({ products: 1, fields_changed: 14, linked: 1, failed: 0 });
  });

  test("a wrong id is refused and nothing is written", async ({ page }) => {
    await signInWithLink(page, "super@example.com", `/settings/shop/products/${FLUSH}`);
    await page.getByRole("tab", { name: "Print rules" }).click();
    const card = page.getByRole("region", { name: "Dreamship" });
    await card.getByLabel("Dreamship product id or designer link").fill("123");
    await card.getByRole("button", { name: "Link" }).click();
    await expect(card.getByRole("alert")).toHaveText("Dreamship has no product with that id for this account.");
    await expect(card.getByRole("button", { name: "Link" })).toBeVisible();
  });
});
