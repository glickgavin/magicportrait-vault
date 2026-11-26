import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { admin, signInWithLink } from "./auth";
import { setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

// Settings › Magic Store › Testing › "Start again as a new visitor": a super user's own photos, pictures, carts and
// store cookies go; they stay signed in. Fixtures and the local stack only.
test.describe.configure({ mode: "serial" });

const PILLOW = "8703000000";

test.describe("Start again as a new visitor", () => {
  test.beforeAll(async () => {
    await setSetting("open_store.enabled", true);
    await setSetting("open_store.generations_per_ip_per_day", 100000);
    await admin().from("rate_limits").delete().like("key", "store-%");
  });
  test.afterAll(async () => {
    await setSetting("open_store.enabled", false);
    await setSetting("open_store.generations_per_ip_per_day", 15);
  });

  test("a picture and a cart, then reset: a fresh visitor, still signed in", async ({ page, context }) => {
    await signInWithLink(page, "super@example.com", `/store/product/${PILLOW}`);
    await page.getByLabel("Choose a photo: Their photo").setInputFiles({ name: "pet.jpg", mimeType: "image/jpeg", buffer: await sharp({ create: { width: 900, height: 900, channels: 3, background: "#c98a52" } }).jpeg().toBuffer() });
    await page.getByTestId("store-create").click();
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("store-add").click();
    await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
    const cookie = async () => (await context.cookies()).find((c) => c.name === "mmp_visitor");
    expect(await cookie()).toBeTruthy();
    const before = (await admin().from("store_visitors").select("id").order("created_at", { ascending: false }).limit(1).single()).data!.id;
    expect((await admin().from("store_generations").select("id").eq("visitor_id", before)).data!.length).toBeGreaterThan(0);

    await page.goto("/settings/shop/magic-store");
    const card = page.getByTestId("test-reset");
    await card.getByRole("button", { name: "Start again as a new visitor" }).click();
    await expectNoAxeViolations(page);
    await card.getByRole("button", { name: "Yes, start again" }).click();
    await expect(card.getByRole("status")).toContainText("You're still signed in");
    await expect(card.getByRole("status")).toContainText(/1 visitor, 1 picture/);

    // Gone: the visitor and its pictures, the cookie and the browser notes; still signed in.
    expect((await admin().from("store_visitors").select("id").eq("id", before)).data).toHaveLength(0);
    expect((await admin().from("store_generations").select("id").eq("visitor_id", before)).data).toHaveLength(0);
    expect(await cookie()).toBeUndefined();
    expect(await page.evaluate(() => window.localStorage.getItem("mmp_store_first_visit"))).toBeNull();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Magic Store" })).toBeVisible();
    // The product page starts from scratch: no picture, an empty cart.
    await page.goto(`/store/product/${PILLOW}`);
    await expect(page.getByTestId("store-create")).toBeVisible();
    await expect(page.getByTestId("store-ready")).toHaveCount(0);
    await expect(page.getByTestId("store-cart-button")).toHaveAccessibleName("Cart, empty");
  });

  test("only super users: anyone else gets a 404", async ({ page }) => {
    await signInWithLink(page, "sam@example.com", "/");
    expect((await page.request.post("/api/admin/test-reset")).status()).toBe(404);
  });
});
