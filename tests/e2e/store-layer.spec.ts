import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { admin, signInWithLink } from "./auth";
import { setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

// The personalisation layer in the Magic Store (docs/open-store.md › Personalise), on the fixture Pillow: set up in
// the template editor, filled in after the picture is made, drawn on the preview, checked, and put on the cart line.
test.describe.configure({ mode: "serial" });

const PILLOW = "8703000000";
const PAW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#c33"/></svg>';

async function setUpLayer(page: Page, art: string) {
  await signInWithLink(page, "super@example.com", `/settings/shop/template/${PILLOW}`);
  const editor = page.getByTestId("layer-editor");
  await editor.getByLabel("Let customers personalise this product").check();
  await editor.getByLabel("What to ask the customer (Text 1)").fill("Pet's name");
  await editor.getByLabel("Example words (Text 1)").fill("Teddy");
  await editor.getByLabel("The customer must fill this in (Text 1)").check();
  await editor.getByRole("button", { name: "+ Add a picture slot" }).click();
  await editor.getByLabel("What to ask the customer (picture)").fill("Add a badge");
  await editor.getByLabel("Upload a picture to the art library").setInputFiles({ name: `${art}.svg`, mimeType: "image/svg+xml", buffer: Buffer.from(PAW) });
  await expect(editor.getByText("Pictures offered (1 of 3), from the art library")).toBeVisible();
  await page.getByRole("button", { name: "Publish to Shopify" }).click();
  await expect(page.getByText("Published to Shopify.")).toBeVisible();
}

test.describe("Personalise in the Magic Store", () => {
  test.beforeAll(async ({ request }) => {
    // Compile both pages first: a cold dev server reloads the browser while it compiles them.
    await request.get(`/settings/shop/template/${PILLOW}`).catch(() => null);
    await request.get(`/store/product/${PILLOW}`).catch(() => null);
    await request.post("/api/test/reset-fixtures?shop=1");
    await setSetting("open_store.enabled", true);
    await setSetting("open_store.generations_per_ip_per_day", 100000);
    await admin().from("rate_limits").delete().like("key", "store-%");
  });
  test.afterAll(async ({ request }) => {
    await setSetting("open_store.enabled", false);
    await setSetting("open_store.generations_per_ip_per_day", 15);
    await request.post("/api/test/reset-fixtures?shop=1");
    await admin().from("layer_art").delete().like("name", "e2e-%");
  });

  test("fill in the words and pick a badge: the preview changes, and the cart line carries them", async ({ page }) => {
    const art = `e2e-badge-${test.info().project.name}`;
    await setUpLayer(page, art);

    await page.goto(`/store/product/${PILLOW}`);
    await page.getByLabel("Choose a photo: Add their photo").setInputFiles({ name: "pet.jpg", mimeType: "image/jpeg", buffer: await sharp({ create: { width: 900, height: 900, channels: 3, background: "#c98a52" } }).jpeg().toBuffer() });
    await page.getByTestId("store-create").click();
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });

    const step = page.getByTestId("store-personalise");
    await expect(step.getByRole("heading", { name: "Personalise it" })).toBeVisible();
    // The name is required: Add to cart says so and adds nothing.
    await page.getByTestId("store-add").click();
    await expect(step.getByRole("alert")).toHaveText("Pet's name: please fill this in.");
    await expect(page.getByRole("dialog", { name: "Your cart" })).toHaveCount(0);

    const preview = page.getByRole("img", { name: /Your picture on/ }).first();
    await expect(preview).toHaveAttribute("data-preview", "true");
    const pixels = () => preview.evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png").length);
    await expect.poll(pixels).toBeGreaterThan(1000);
    const before = await pixels();
    await step.getByLabel(/Pet's name/).fill("Biscuit");
    await step.getByAltText(art).click();
    await expect(step.getByRole("radio", { name: art })).toBeChecked();
    await expect.poll(pixels, { timeout: 5_000 }).not.toBe(before);
    await expect(step.getByText("7 / 16")).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByTestId("store-add").click();
    await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
    const visitor = (await admin().from("store_visitors").select("shopify_cart_id").not("shopify_cart_id", "is", null).order("updated_at", { ascending: false }).limit(1).single()).data!;
    const cart = (await (await page.request.get(`/api/test/cart?id=${encodeURIComponent(visitor.shopify_cart_id)}`)).json()) as { lines: { attributes: { key: string; value: string }[] }[] };
    const attrs = Object.fromEntries(cart.lines.at(-1)!.attributes.map((a) => [a.key, a.value]));
    const artId = (await admin().from("layer_art").select("id").eq("name", art).single()).data!.id;
    expect(attrs).toMatchObject({ _shop_layer_t1: "Biscuit", _shop_layer_art: artId });
    expect(attrs._shop_layer_v).toBeTruthy();
    // The words never reach the activity log.
    const ev = (await admin().from("activity_log").select("props").eq("event", "store_added_to_cart").order("occurred_at", { ascending: false }).limit(1)).data!;
    expect(ev[0].props).toMatchObject({ personalised: true });
    expect(JSON.stringify(ev[0].props)).not.toContain("Biscuit");
    if (test.info().project.name === "mobile") expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
