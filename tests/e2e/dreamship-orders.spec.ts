import { createHmac, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";
import { admin, signInWithLink } from "./auth";
import { expectNoAxeViolations } from "./helpers";

// The customer's picture on Dreamship's imported order (docs/dreamship.md › Part B), end to end on the fixtures: a
// signed orders/paid webhook for a made-up Magic Store order of the Flush poster, Dreamship's (fixture) import, and
// Settings › Printers showing the picture set with Dreamship's own status. Nothing is ever submitted or cancelled.
test.describe.configure({ mode: "serial" });

const SECRET = "local-test-shopify-secret";
const SESSION = `sess_e2e_${randomBytes(4).toString("hex")}`;
let visitorId = "";

const prop = (o: Record<string, string>) => Object.entries(o).map(([name, value]) => ({ name, value }));
function paidOrder(id: string, name: string) {
  return {
    id,
    name,
    email: `dreamship-buyer-${randomBytes(3).toString("hex")}@example.com`,
    created_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    financial_status: "paid",
    test: false,
    note_attributes: prop({ _source: "open_store" }),
    line_items: [
      {
        id: Number(id.slice(-6)) * 10 + 1,
        sku: "45378125",
        quantity: 1,
        product_id: 8710000000,
        properties: prop({ _shop: "true", _shop_page: "open_store", _shop_maker: "dreamship", _shop_print_px: "1800x2400", _shop_crop: "0,0,1536,2048", _shop_extra: JSON.stringify({ item_id: 958, print_area: "8x10", product_variant_id: 45378125 }), _image_kind: "generated", _shop_session_id: SESSION, _shop_image_id: "img_e2e" }),
      },
    ],
  };
}

async function sendPaid(request: APIRequestContext, order: ReturnType<typeof paidOrder>) {
  const body = JSON.stringify(order);
  const r = await request.post("/api/webhooks/shopify/orders-paid", { data: body, headers: { "content-type": "application/json", "x-shopify-hmac-sha256": createHmac("sha256", SECRET).update(body).digest("base64"), "x-shopify-webhook-id": `wh-${randomBytes(6).toString("hex")}`, "x-shopify-topic": "orders/paid" } });
  expect(r.status()).toBe(200);
}

test.describe("Dreamship orders", () => {
  test.beforeAll(async ({ request }) => {
    await request.post("/api/test/reset-fixtures");
    visitorId = ((await admin().from("store_visitors").insert({ token_hash: randomBytes(32).toString("hex") }).select("id").single()).data as { id: string }).id;
    const path = `${visitorId}/pictures/e2e/0.png`;
    const pic = await sharp({ create: { width: 1536, height: 2048, channels: 3, background: "#c98a52" } }).png().toBuffer();
    await admin().storage.from("store-uploads").upload(path, pic, { contentType: "image/png", upsert: true });
    await admin().from("store_generations").insert({ visitor_id: visitorId, product_id: "gid://shopify/Product/8710000000", theme: "royal-flush", imagen_session_id: SESSION, status: "done", images: [{ imagen_id: "img_e2e", url: "https://imagen.example/e2e.png", width: 1536, height: 2048, storage_path: path }] });
  });
  test.afterAll(async () => {
    await admin().from("store_visitors").delete().eq("id", visitorId);
  });

  test("a paid order's picture is set on Dreamship's imported draft, and shows on Settings › Printers", async ({ page, request }) => {
    const id = String(5_100_000_000 + Math.floor(Math.random() * 1e8));
    const name = `#E${id.slice(-4)}`;
    // Dreamship's Shopify app imports the order as a draft (auto-submit off).
    await request.post("/api/test/dreamship", { data: { referenceId: id, productVariantIds: [45378125] } });
    await sendPaid(request, paidOrder(id, name));
    await expect.poll(async () => (await admin().from("printer_jobs").select("status").eq("shopify_order_id", id).maybeSingle()).data?.status, { timeout: 20_000 }).toBe("picture_set");

    await signInWithLink(page, "super@example.com", "/settings/printers");
    const row = page.getByTestId("dreamship-orders").getByRole("row", { name: new RegExp(name) });
    await expect(row).toContainText("PICTURE SET");
    await expect(row).toContainText("1/1 line");
    await expect(row).toContainText("draft");
    await expect(row.getByRole("link")).toHaveAttribute("href", /^https:\/\/app\.dreamship\.com\/app\/orders\/\d+$/);
    await expectNoAxeViolations(page);
  });

  test("an order Dreamship already sent to print is flagged with Retry, and nothing on it changes", async ({ page, request }) => {
    const id = String(5_200_000_000 + Math.floor(Math.random() * 1e8));
    const name = `#F${id.slice(-4)}`;
    await request.post("/api/test/dreamship", { data: { referenceId: id, productVariantIds: [45378125], status: "accepted" } });
    await sendPaid(request, paidOrder(id, name));
    await expect.poll(async () => (await admin().from("printer_jobs").select("status").eq("shopify_order_id", id).maybeSingle()).data?.status, { timeout: 20_000 }).toBe("needs_attention");

    await signInWithLink(page, "super@example.com", "/settings/printers");
    const row = page.getByTestId("dreamship-orders").getByRole("row", { name: new RegExp(name) });
    await expect(row).toContainText("NEEDS ATTENTION");
    await expect(row).toContainText("Dreamship had already sent it to print");
    await expect(row).toContainText("accepted");
    await row.getByRole("button", { name: `Retry ${name}` }).click();
    await expect(row.getByRole("status")).toHaveText("Queued again");
    expect((await admin().from("printer_jobs").select("status").eq("shopify_order_id", id).single()).data!.status).toBe("needs_attention");
  });
});
