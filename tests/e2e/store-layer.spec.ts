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

async function setUpLayer(page: Page, art: string, opts: { reposition?: boolean } = {}) {
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
  if (opts.reposition) await editor.getByLabel(/Let customers reposition it/).check();
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

  test("a product whose layer asks for the name can stop asking for it next to the photo: one name box, none sent to Imagen", async ({ page }) => {
    await setUpLayer(page, `e2e-badge2-${test.info().project.name}`);
    await page.goto(`/settings/shop/products/${PILLOW}`);
    const ask = page.getByTestId("ask-name");
    await expect(ask.getByTestId("ask-name-twice")).toContainText("asked for a name twice");
    await ask.getByLabel(/Ask for the pet's name/).uncheck();
    await expect(ask.getByTestId("ask-name-twice")).toHaveCount(0);
    await page.getByRole("button", { name: "Save Magic Store fields" }).click();
    await expect(page.getByTestId("store-fields").getByRole("status")).toHaveText("Saved to Shopify.");
    await page.reload();
    await expect(page.getByTestId("ask-name").getByLabel(/Ask for the pet's name/)).not.toBeChecked();

    await page.goto(`/store/product/${PILLOW}`);
    await expect(page.getByLabel("Their name (optional, shown on the picture)")).toHaveCount(0);
    await expect(page.getByTestId("store-personalise").getByLabel(/Pet's name/)).toBeVisible();
    await page.getByLabel("Choose a photo: Their photo").setInputFiles({ name: "pet.jpg", mimeType: "image/jpeg", buffer: await sharp({ create: { width: 900, height: 900, channels: 3, background: "#c98a52" } }).jpeg().toBuffer() });
    await page.getByTestId("store-create").click();
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });
    const gen = (await admin().from("store_generations").select("names").eq("product_id", `gid://shopify/Product/${PILLOW}`).order("created_at", { ascending: false }).limit(1).single()).data!;
    expect(gen.names).toEqual([]);
    await expectNoAxeViolations(page);
    // Put it back for the next test.
    await page.request.post("/api/test/reset-fixtures?shop=1");
  });

  test("fill in the words and pick a badge: the preview changes, and the cart line carries them", async ({ page }) => {
    const art = `e2e-badge-${test.info().project.name}`;
    await setUpLayer(page, art);

    await page.goto(`/store/product/${PILLOW}`);
    // The step is there next to the photo, before any picture is made; the name can be typed first.
    // Just the fields, next to the photo: no heading or explanation.
    const step = page.getByTestId("store-personalise");
    await expect(step.getByLabel(/Pet's name/)).toBeVisible();
    await expect(page.getByText("Personalise it")).toHaveCount(0);
    await step.getByLabel(/Pet's name/).fill("Bis");
    await page.getByLabel("Choose a photo: Their photo").setInputFiles({ name: "pet.jpg", mimeType: "image/jpeg", buffer: await sharp({ create: { width: 900, height: 900, channels: 3, background: "#c98a52" } }).jpeg().toBuffer() });
    await page.getByTestId("store-create").click();
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });

    await expect(step.getByLabel(/Pet's name/)).toHaveValue("Bis");
    await step.getByLabel(/Pet's name/).fill("");
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

  test("Reposition (when the template allows it): move and turn the name; the preview and the cart line follow", async ({ page }) => {
    await page.request.post("/api/test/reset-fixtures?shop=1");
    const art = `e2e-badge3-${test.info().project.name}`;
    await setUpLayer(page, art, { reposition: true });

    await page.goto(`/store/product/${PILLOW}`);
    const step = page.getByTestId("store-personalise");
    await step.getByRole("textbox", { name: /Pet's name/ }).fill("Biscuit");
    await page.getByLabel("Choose a photo: Their photo").setInputFiles({ name: "pet.jpg", mimeType: "image/jpeg", buffer: await sharp({ create: { width: 900, height: 900, channels: 3, background: "#c98a52" } }).jpeg().toBuffer() });
    await page.getByTestId("store-create").click();
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });

    const preview = page.getByRole("img", { name: /Your picture on/ }).first();
    const pixels = () => preview.evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png").length);
    await expect.poll(pixels).toBeGreaterThan(1000);
    const before = await pixels();

    // The link is on the name's line; the editor shows the print with the name, to drag (or arrow keys) and turn.
    await step.getByRole("button", { name: "Reposition Pet's name" }).click();
    const editor = page.getByTestId("store-reposition");
    await expect(editor.getByRole("heading", { name: "Reposition" })).toBeVisible();
    await expect(editor.getByRole("radio", { name: "Pet's name" })).toBeChecked();
    await expectNoAxeViolations(page);
    await editor.getByTestId("store-reposition-handle").focus();
    await page.keyboard.press("Shift+ArrowUp");
    await page.keyboard.press("Shift+ArrowUp");
    await editor.getByTestId("store-reposition-turn").fill("20");
    await expect(editor.getByText("20°", { exact: true })).toBeVisible();
    // Cancel keeps nothing; Done keeps it.
    await editor.getByRole("button", { name: "Cancel" }).click();
    await expect(editor).toHaveCount(0);
    await step.getByRole("button", { name: "Reposition Pet's name" }).click();
    await expect(editor.getByText("0°", { exact: true })).toBeVisible();
    await editor.getByTestId("store-reposition-handle").focus();
    await page.keyboard.press("Shift+ArrowUp");
    await editor.getByTestId("store-reposition-turn").fill("20");
    await editor.getByTestId("store-reposition-done").click();
    await expect(editor).toHaveCount(0);
    await expect.poll(pixels, { timeout: 5_000 }).not.toBe(before);

    await page.getByTestId("store-add").click();
    await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
    const visitor = (await admin().from("store_visitors").select("shopify_cart_id").not("shopify_cart_id", "is", null).order("updated_at", { ascending: false }).limit(1).single()).data!;
    const cart = (await (await page.request.get(`/api/test/cart?id=${encodeURIComponent(visitor.shopify_cart_id)}`)).json()) as { lines: { attributes: { key: string; value: string }[] }[] };
    const attrs = Object.fromEntries(cart.lines.at(-1)!.attributes.map((a) => [a.key, a.value]));
    const pos = JSON.parse(attrs._shop_layer_pos) as { t1: [number, number, number, number] };
    expect(pos.t1[2]).toBe(20);
    expect(pos.t1[3]).toBe(1);
    if (test.info().project.name === "mobile") expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("a border choice: set up in the template editor, No border / Add border on the product page, on the preview and the cart line", async ({ page }) => {
    await page.request.post("/api/test/reset-fixtures?shop=1");
    await signInWithLink(page, "super@example.com", `/settings/shop/template/${PILLOW}`);
    const editor = page.getByTestId("layer-editor");
    await editor.getByLabel("Let customers personalise this product").check();
    await editor.getByRole("button", { name: "+ Add a border choice (No border / Add border)" }).click();
    const border = editor.getByTestId("layer-border");
    await border.getByLabel("Width set by").selectOption("");
    await border.getByLabel("Width (% of the shorter side)").fill("6");
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Publish to Shopify" }).click();
    await expect(page.getByText("Published to Shopify.")).toBeVisible();

    await page.goto(`/store/product/${PILLOW}`);
    const choice = page.getByTestId("store-border");
    await expect(choice.getByRole("radio", { name: "No border" })).toBeChecked();
    await page.getByLabel("Choose a photo: Their photo").setInputFiles({ name: "pet.jpg", mimeType: "image/jpeg", buffer: await sharp({ create: { width: 900, height: 900, channels: 3, background: "#c98a52" } }).jpeg().toBuffer() });
    await page.getByTestId("store-create").click();
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });
    const preview = page.getByRole("img", { name: /Your picture on/ }).first();
    const pixels = () => preview.evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png").length);
    await expect.poll(pixels).toBeGreaterThan(1000);
    const before = await pixels();
    await choice.getByText("Add border").click();
    await expect(choice.getByRole("radio", { name: "Add border" })).toBeChecked();
    await expect.poll(pixels, { timeout: 5_000 }).not.toBe(before);
    await expectNoAxeViolations(page);

    await page.getByTestId("store-add").click();
    await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
    const visitor = (await admin().from("store_visitors").select("shopify_cart_id").not("shopify_cart_id", "is", null).order("updated_at", { ascending: false }).limit(1).single()).data!;
    const cart = (await (await page.request.get(`/api/test/cart?id=${encodeURIComponent(visitor.shopify_cart_id)}`)).json()) as { lines: { attributes: { key: string; value: string }[] }[] };
    const attrs = Object.fromEntries(cart.lines.at(-1)!.attributes.map((a) => [a.key, a.value]));
    expect(attrs._shop_layer_border).toBe("0.06");
  });
});

