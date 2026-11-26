import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { signInWithLink } from "./auth";
import { setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

// The open store (docs/open-store.md) against the fixtures: the Magic Store collection in
// lib/open-store/sources/fixtures.ts, products shared with the shop fixtures. Both switches are put back off.
test.describe.configure({ mode: "serial" });

const PILLOW = "8703000000";
const CANVAS = "8709000000";
const ACRYLIC = "8705000000";

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#c98a52" } }).png().toBuffer();

async function off() {
  await setSetting("open_store.enabled", false);
  await setSetting("open_store.super_user_preview", false);
}

test.describe("open store", () => {
  test.afterAll(off);

  test("hidden: every store address is a real 404 until a switch is on; the preview is for super users only", async ({ page, browser }) => {
    await off();
    for (const p of ["/store", `/store/product/${PILLOW}`, "/store/c/wall-art"]) expect((await page.request.get(p)).status(), p).toBe(404);
    const api = await page.request.get("/api/store/generations/x");
    expect(api.status()).toBe(404);
    await signInWithLink(page, "super@example.com", "/");
    expect((await page.request.get("/store")).status()).toBe(404);
    await setSetting("open_store.super_user_preview", true);
    expect((await page.request.get("/store")).status()).toBe(200);
    const other = await browser.newPage();
    expect((await other.request.get("/store")).status()).toBe(404);
    await signInWithLink(other, "sam@example.com", "/");
    expect((await other.request.get("/store")).status()).toBe(404);
    await other.close();
    await off();
  });

  test.describe("visible to everyone", () => {
    test.beforeAll(async () => setSetting("open_store.enabled", true));

    test("store page: circles, heading, the grid in the collection's order, filter and sort", async ({ page }) => {
      await page.goto("/store");
      await expect(page.getByRole("heading", { level: 1, name: "Bestsellers" })).toBeVisible();
      const circles = page.getByRole("navigation", { name: "Categories" }).first();
      await expect(circles.getByRole("link", { name: "Wall art" })).toBeVisible();
      await expect(circles.getByRole("link", { name: "Bestsellers" })).toHaveAttribute("aria-current", "page");
      const titles = page.getByTestId("store-card").getByTestId("store-card-title");
      await expect(titles).toHaveText(["Magic Pillow with Photo", "Magic Mug with Photo", "Magic Canvas", "Magic Puzzle", "Acrylic Block"]);
      // Related only, hidden and Store-only products never show in the grid.
      await expect(page.getByTestId("store-grid").getByText("Magic Xmas Ornaments")).toHaveCount(0);
      await expect(page.getByTestId("store-grid").getByText("Magic Poster")).toHaveCount(0);
      await expect(page.getByTestId("store-card").filter({ hasText: "Magic Pillow with Photo" }).getByText("The Admiral")).toBeVisible();
      await expect(page.getByTestId("store-card").filter({ hasText: "Magic Canvas" }).getByText("From $59.00")).toBeVisible();
      await expectNoAxeViolations(page);

      await page.getByRole("button", { name: /^Sort: Featured$/i }).click();
      await page.getByRole("navigation", { name: "Sort by" }).getByRole("link", { name: "Price, low to high" }).click();
      await expect(page).toHaveURL(/sort=price-asc/);
      await expect(titles).toHaveText(["Acrylic Block", "Magic Mug with Photo", "Magic Puzzle", "Magic Canvas", "Magic Pillow with Photo"]);
      await page.getByRole("button", { name: /^Filter$/i }).click();
      await page.getByRole("navigation", { name: "Filter by product type" }).getByRole("link", { name: "Mugs" }).click();
      await expect(page).toHaveURL(/type=Mugs/);
      await expect(titles).toHaveText(["Magic Mug with Photo"]);
    });

    test("a category narrows to the Magic Store's products in it; an unknown one is 404", async ({ page }) => {
      await page.goto("/store/c/wall-art");
      await expect(page.getByRole("heading", { level: 1, name: "Wall art" })).toBeVisible();
      // Canvas and Acrylic Block are in Wall art; the Poster (no rules on a size) and the Tile (no template) are hidden.
      await expect(page.getByTestId("store-card").getByTestId("store-card-title")).toHaveText(["Magic Canvas", "Acrylic Block"]);
      expect((await page.request.get("/store/c/no-such-thing")).status()).toBe(404);
      expect((await page.request.get("/store/product/8708000000")).status()).toBe(404); // Store only (Magic Tee)
      expect((await page.request.get("/store/product/8707000000")).status()).toBe(404); // hidden in the Magic Store (Tile)
    });

    test("product page before a picture: title, price, delivery, photo, details and more gifts", async ({ page }) => {
      await page.goto("/store");
      await page.getByTestId("store-card").filter({ hasText: "Magic Pillow with Photo" }).click();
      await expect(page).toHaveURL(new RegExp(`/store/product/${PILLOW}\\?from=grid`));
      // Just the Shopify name, on one line (no theme).
      const h1 = page.getByRole("heading", { level: 1, name: "Magic Pillow with Photo", exact: true });
      await expect(h1).toBeVisible();
      expect((await h1.evaluate((el) => getComputedStyle(el).whiteSpace))).toBe("nowrap");
      // Phones: dots under the picture to swipe through, no thumbnails; desktop keeps the thumbnails.
      if (test.info().project.name === "mobile") {
        await expect(page.getByTestId("store-dots").getByRole("button")).not.toHaveCount(0);
        await expect(page.getByTestId("store-rail")).toBeVisible();
      }
      // Before a photo there's no Generate yet (it comes with the photo); Add to cart is greyed until the picture is ready.
      await expect(page.getByTestId("store-create")).toHaveCount(0);
      await expect(page.getByTestId("store-add")).toBeDisabled();
      await expect(page.getByTestId("store-add-note")).toHaveText("Generate your picture first, then add it to your cart.");
      await expect(page.getByText(/Use a photo you have the right to use/)).toHaveCount(0);
      await expect(page.getByTestId("store-price")).toContainText("$59.99");
      await expect(page.getByRole("img", { name: "Rated 4.8 out of 5" })).toBeVisible();
      await expect(page.getByTestId("store-delivery")).toContainText(/Delivery approx\. \d{1,2} [A-Z][a-z]{2} – \d{1,2} [A-Z][a-z]{2}/);
      await expect(page.getByText("Sample · add a photo to see yours")).toBeVisible();
      await expect(page.getByLabel("Their name (optional, shown on the picture)")).toHaveAttribute("maxlength", "14");
      const create = page.getByTestId("store-create");
      await expectNoAxeViolations(page, { exclude: ["iframe"] });

      // A photo that's too small is refused in the browser; a good one shows in a row with Change photo and Generate.
      const input = page.getByLabel("Choose a photo: Their photo");
      await input.setInputFiles({ name: "small.png", mimeType: "image/png", buffer: await png(300, 300) });
      await expect(page.getByText(/This photo is a little small/)).toHaveAttribute("role", "alert");
      await input.setInputFiles({ name: "teddy.png", mimeType: "image/png", buffer: await png(900, 900) });
      const row = page.getByTestId("photo-added");
      await expect(row).toBeVisible();
      await expect(row.getByRole("button", { name: "Change photo" })).toBeVisible();
      await expect(row.getByTestId("store-create")).toHaveText("Generate");
      await expect(create).toBeEnabled();
      await expect(page.getByTestId("store-add")).toBeDisabled();
      await expectNoAxeViolations(page, { exclude: ["iframe"] });

      await page.getByRole("button", { name: "Product details" }).click();
      await expect(page.getByText("Linen-look cover, 12 × 12 in, zip closure. Insert included.")).toBeVisible();
      await page.getByRole("button", { name: "Shipping and returns" }).click();
      await expect(page.getByText(/Made to order and shipped/)).toBeVisible();
      // Before a picture, How it works (with photos) sits where "On more gifts" comes after the first picture.
      await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
      await expect(page.getByTestId("store-how").getByRole("listitem")).toHaveCount(3);
      await expect(page.getByTestId("store-related")).toHaveCount(0);
      // The trust card under the button, then the lower page from settings (docs/open-store.md › Product page).
      await expect(page.getByTestId("store-trust")).toContainText("1M+");
      await expect(page.getByTestId("store-trust")).toContainText("Great · 4.1 out of 5");
      await expect(page.getByRole("heading", { name: "We've got you covered" })).toBeVisible();
      // No reviews in settings, so no reviews section: nothing is ever made up.
      await expect(page.getByTestId("store-reviews")).toHaveCount(0);
      await page.getByText("Can I send it as a gift?").click();
      await expect(page.getByText("Add it to your cart and enter their address at checkout.")).toBeVisible();
      await expect(page.getByTestId("store-closing")).toContainText("See your pet on it, free");
      await expect(page.getByTestId("store-closing-cta")).toHaveText("Generate");
    });

    test("size chips: the badge, the price and the address follow the chosen size", async ({ page }) => {
      await page.goto(`/store/product/${CANVAS}`);
      await expect(page.getByTestId("store-price")).toContainText("$59.00");
      const sizes = page.getByRole("group", { name: /^Size:/ });
      await expect(sizes.getByText("Bestseller")).toBeVisible();
      await sizes.getByText("16 × 20 in").click();
      await expect(page.getByTestId("store-price")).toContainText("$79.00");
      await expect(page).toHaveURL(/variant=\d+/);
      await page.reload();
      await expect(page.getByTestId("store-price")).toContainText("$79.00");
    });

    test("a theme that takes two photos shows two photo slots with their own words", async ({ page }) => {
      await page.goto(`/store/product/${ACRYLIC}`);
      await expect(page.getByText("First pet's photo")).toBeVisible();
      await expect(page.getByText("Second pet's photo")).toBeVisible();
      const create = page.getByTestId("store-create");
      await page.getByLabel("Choose a photo: First pet's photo").setInputFiles({ name: "a.png", mimeType: "image/png", buffer: await png(800, 800) });
      // Generate comes with the last photo's row.
      await expect(create).toHaveCount(0);
      await page.getByLabel("Choose a photo: Second pet's photo").setInputFiles({ name: "b.png", mimeType: "image/png", buffer: await png(800, 800) });
      await expect(create).toBeEnabled();
    });

    test("the cart icon opens the cart drawer", async ({ page }) => {
      await page.goto("/store");
      await page.getByTestId("store-cart-button").click();
      await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
      await expect(page.getByText("Your cart is empty.")).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
});

