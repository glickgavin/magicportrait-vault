import { createHmac, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { admin, signInWithLink } from "./auth";
import { expectNoAxeViolations } from "./helpers";

// Print files for personalised lines (docs/shop.md › Personalisation layer), end to end on the fixtures: the Pillow
// (made by Prodigi) gets a layer in the template editor, a signed orders/paid webhook arrives for a personalised line,
// and the app makes the print file, links it from the order and lists it on Settings › Printers.
test.describe.configure({ mode: "serial" });

const PILLOW = "8703000000";
const SECRET = "local-test-shopify-secret";
const SESSION = `sess_e2e_${randomBytes(4).toString("hex")}`;
const PAW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#c33"/></svg>';
let visitorId = "";

async function setUpLayer(page: Page, art: string) {
  await signInWithLink(page, "super@example.com", `/settings/shop/template/${PILLOW}`);
  const editor = page.getByTestId("layer-editor");
  await editor.getByLabel("Let customers personalise this product").check();
  await editor.getByLabel("What to ask the customer (Text 1)").fill("Pet's name");
  await editor.getByRole("button", { name: "+ Add a picture slot" }).click();
  await editor.getByLabel("Upload a picture to the art library").setInputFiles({ name: `${art}.svg`, mimeType: "image/svg+xml", buffer: Buffer.from(PAW) });
  await expect(editor.getByText("Pictures offered (1 of 3), from the art library")).toBeVisible();
  await page.getByRole("button", { name: "Publish to Shopify" }).click();
  await expect(page.getByText("Published to Shopify.")).toBeVisible();
}

async function sendPaid(request: APIRequestContext, order: unknown) {
  const body = JSON.stringify(order);
  const r = await request.post("/api/webhooks/shopify/orders-paid", { data: body, headers: { "content-type": "application/json", "x-shopify-hmac-sha256": createHmac("sha256", SECRET).update(body).digest("base64"), "x-shopify-webhook-id": `wh-${randomBytes(6).toString("hex")}`, "x-shopify-topic": "orders/paid" } });
  expect(r.status()).toBe(200);
}

test.describe("Personalised print files", () => {
  test.beforeAll(async ({ request }) => {
    await request.post("/api/test/reset-fixtures?shop=1");
    visitorId = ((await admin().from("store_visitors").insert({ token_hash: randomBytes(32).toString("hex") }).select("id").single()).data as { id: string }).id;
    const path = `${visitorId}/pictures/e2e/0.png`;
    await admin().storage.from("store-uploads").upload(path, await sharp({ create: { width: 900, height: 900, channels: 3, background: "#c98a52" } }).png().toBuffer(), { contentType: "image/png", upsert: true });
    await admin().from("store_generations").insert({ visitor_id: visitorId, product_id: `gid://shopify/Product/${PILLOW}`, theme: "admiral-01", imagen_session_id: SESSION, status: "done", images: [{ imagen_id: "img_e2e", url: "https://imagen.example/e2e.png", width: 900, height: 900, storage_path: path }] });
  });
  test.afterAll(async ({ request }) => {
    await admin().from("store_visitors").delete().eq("id", visitorId);
    await request.post("/api/test/reset-fixtures?shop=1");
    await admin().from("layer_art").delete().like("name", "e2e-%");
  });

  test("a paid personalised Prodigi line gets its print file, listed on Settings › Printers", async ({ page, request }) => {
    const art = `e2e-pf-${test.info().project.name}`;
    await setUpLayer(page, art);
    const artId = (await admin().from("layer_art").select("id").eq("name", art).single()).data!.id;
    const id = String(5_300_000_000 + Math.floor(Math.random() * 1e8));
    const name = `#G${id.slice(-4)}`;
    const props = { _shop: "true", _shop_page: "open_store", _shop_maker: "prodigi", _shop_print_px: "1200x1200", _shop_crop: "0,0,900,900", _image_kind: "generated", _shop_session_id: SESSION, _shop_image_id: "img_e2e", _shop_layer_t1: "Biscuit", _shop_layer_art: artId };
    await sendPaid(request, { id, name, email: `pf-${randomBytes(3).toString("hex")}@example.com`, created_at: new Date().toISOString(), processed_at: new Date().toISOString(), financial_status: "paid", test: false, note_attributes: [{ name: "_source", value: "open_store" }], line_items: [{ id: 777, sku: "FX-CUSH-12X12", quantity: 1, product_id: Number(PILLOW), properties: Object.entries(props).map(([n, value]) => ({ name: n, value })) }] });
    await expect.poll(async () => (await admin().from("printer_jobs").select("status").eq("kind", "print_file").eq("shopify_order_id", id).maybeSingle()).data?.status, { timeout: 20_000 }).toBe("picture_set");

    await page.goto("/settings/printers");
    const row = page.getByTestId("print-file-jobs").getByRole("listitem", { name: `Order ${name}` });
    await expect(row).toContainText("FILES READY");
    await expect(row).toContainText("1/1 line");
    await expect(row.getByRole("link", { name: "Line 777 file" })).toHaveAttribute("href", /print\/\d+\/777\.jpg/);
    // The words are on the job (to make the file), never in the log.
    const ev = (await admin().from("activity_log").select("props").eq("event", "shop_print_file_made").eq("ref_id", id)).data!;
    expect(ev[0].props).toMatchObject({ status: "picture_set", maker: "prodigi" });
    expect(JSON.stringify(ev)).not.toContain("Biscuit");
    await expectNoAxeViolations(page);
  });
});
