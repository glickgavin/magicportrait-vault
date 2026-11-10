import { expect, test, type Page } from "@playwright/test";
import { signInWithLink } from "./auth";
import { setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

// The customer flow on fixtures: Gifts → Choose a picture → Product ideas → Product sheet → Cart → checkout link.
test.describe.configure({ mode: "serial" });

const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

async function emptyCart(page: Page) {
  await page.goto("/cart");
  for (let i = 0; i < 10; i++) {
    const remove = page.getByRole("button", { name: "Remove" }).first();
    if (!(await remove.isVisible().catch(() => false))) break;
    await remove.click();
    await page.waitForLoadState("networkidle");
  }
}

test.describe("shop", () => {
  test.afterAll(async () => {
    await setSetting("shop.enabled", false);
    await setSetting("shop.super_user_preview", false);
  });

  test("hidden: every shop page is 404 and nothing shop shows on Home or in the menu", async ({ page }) => {
    await setSetting("shop.enabled", false);
    await setSetting("shop.super_user_preview", false);
    await signInWithLink(page, "sam@example.com", "/");
    for (const p of ["/gifts", "/products", "/gifts/choose", "/cart"]) expect((await page.request.get(p)).status(), p).toBe(404);
    await page.goto("/");
    await expect(page.getByTestId("shop-ways-in")).toHaveCount(0);
    await page.getByTestId("menu-button").click();
    await expect(page.getByRole("link", { name: /^Gifts/ })).toHaveCount(0);
  });

  for (const size of SIZES) {
    test(`${size.name}: pick a picture, add a gift, check out`, async ({ page }) => {
      await setSetting("shop.enabled", true);
      await page.setViewportSize({ width: size.width, height: size.height });
      await signInWithLink(page, "sam@example.com", "/");
      await emptyCart(page);

      await page.goto("/gifts");
      await expect(page.getByRole("heading", { name: "Gifts made from your pictures" })).toBeVisible();
      await expectNoAxeViolations(page);

      await page.getByRole("link", { name: "See gift ideas" }).click();
      await expect(page.getByRole("heading", { name: "Choose a picture" })).toBeVisible();
      await expectNoAxeViolations(page);
      await page.getByRole("radio").first().click();
      await page.getByRole("button", { name: "See gift ideas" }).click();

      await expect(page.getByRole("heading", { name: /ideas? for this picture/ })).toBeVisible();
      await expect(page.locator("canvas[data-preview]").first()).toBeVisible();
      await expectNoAxeViolations(page, { exclude: ["canvas"] });
      await page.getByRole("button", { name: /Magic Xmas Ornaments/ }).first().click();
      const sheet = page.getByRole("dialog");
      await expect(sheet.getByRole("heading", { name: /Magic Xmas Ornaments/ })).toBeVisible();
      await sheet.getByRole("button", { name: /Add to cart/ }).click();
      await expect(sheet.getByText("Added to your cart")).toBeVisible();
      await sheet.getByRole("link", { name: "View cart" }).click();

      await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Who's it for?" })).toBeVisible();
      await expect(page.getByRole("link", { name: /Cart, 1 item/ })).toBeVisible();
      await expectNoAxeViolations(page);

      // Name is required for a gift; the server says so too.
      await page.getByRole("button", { name: "Checkout" }).click();
      await expect(page.getByText("Add their name so we know who it's for.")).toBeVisible();
      await page.getByLabel("Their name").fill("Grandma Rose");
      await page.getByLabel("Gift message (optional)").fill("Happy Christmas!");
      await page.route("https://fixtures.myshopify.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>Shopify checkout (fixture)</h1>" }));
      await page.getByRole("button", { name: "Checkout" }).click();
      await expect(page.getByRole("heading", { name: "Shopify checkout (fixture)" })).toBeVisible();
    });
  }

  test("a Products-only cart never asks who it's for", async ({ page }) => {
    await setSetting("shop.enabled", true);
    await signInWithLink(page, "sam@example.com", "/");
    await emptyCart(page);
    await page.goto("/products/choose");
    await page.getByRole("radio").first().click();
    await page.getByRole("button", { name: "See product ideas" }).click();
    await page.getByRole("button", { name: /Acrylic Block/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: /Add to cart/ }).click();
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Who's it for?" })).toHaveCount(0);
    const r = await page.request.post("/api/shop/checkout", { data: {} });
    expect(r.status()).toBe(200);
    expect(((await r.json()) as { checkoutUrl: string }).checkoutUrl).toMatch(/^https:\/\/fixtures\.myshopify\.com\/cart\/c\//);
  });

  test("someone else's picture or line can't be used", async ({ page, browser }) => {
    await setSetting("shop.enabled", true);
    await signInWithLink(page, "sam@example.com", "/");
    const list = (await (await page.request.get("/api/shop/pictures")).json()) as { portraits: { id: string }[] };
    const other = await browser.newPage();
    await signInWithLink(other, "super@example.com", "/");
    // A picture id from Sam's list is not in super@'s list.
    const add = await other.request.post("/api/shop/cart/lines", { data: { page: "gifts", imageId: list.portraits[0].id, variantId: "gid://shopify/ProductVariant/4900100000000", quantity: 1 } });
    expect([404, 422]).toContain(add.status());
    expect((await other.request.get(`/gifts/i/${list.portraits[0].id}`)).status()).toBe(404);
    expect((await other.request.patch("/api/shop/cart/lines/6b9f1c1e-7d2a-4c55-9e0a-5f9f2b9b0009", { data: { quantity: 2 } })).status()).toBe(404);
    await other.close();
  });
});
