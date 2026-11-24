import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { dreamshipLines, printFile, queueFromPaidOrder, runJob } from "@/lib/dreamship/artwork";
import { dreamshipFixtures } from "@/lib/sources/dreamship";
import { putObject } from "@/lib/storage";

// The customer's picture on Dreamship's imported order (docs/dreamship.md › Part B) against the Dreamship fixtures and
// the local database and storage. Made-up orders only.

const ds = dreamshipFixtures();
let visitorId = "";
const SESSION = `sess_${randomBytes(4).toString("hex")}`;

const prop = (o: Record<string, string>) => Object.entries(o).map(([name, value]) => ({ name, value }));
const dreamshipLine = (id: number, pv: number, area: string, px: string, picture: Record<string, string>) => ({
  id,
  sku: String(pv),
  quantity: 1,
  properties: prop({ _shop: "true", _shop_maker: "dreamship", _shop_print_px: px, _shop_crop: "0,0,1536,1920", _shop_extra: JSON.stringify({ item_id: 958, print_area: area, product_variant_id: pv }), _image_kind: "generated", ...picture }),
});
const openStorePicture = { _shop_page: "open_store", _shop_session_id: SESSION, _shop_image_id: "img_a" };

function paidOrder(id: string, lines: unknown[]) {
  return { id, name: `#${id.slice(-4)}`, line_items: lines };
}

beforeAll(async () => {
  visitorId = ((await db().from("store_visitors").insert({ token_hash: randomBytes(32).toString("hex") }).select("id").single()).data as { id: string }).id;
  const pic = await sharp({ create: { width: 1536, height: 2048, channels: 3, background: "#c98a52" } }).png().toBuffer();
  const path = `${visitorId}/pictures/test/0.png`;
  await putObject("store-uploads", path, pic, "image/png");
  await db().from("store_generations").insert({ visitor_id: visitorId, product_id: "gid://shopify/Product/8710000000", theme: "royal-flush", imagen_session_id: SESSION, status: "done", images: [{ imagen_id: "img_a", url: "https://imagen.example/a.png", width: 1536, height: 2048, storage_path: path }] });
});
afterAll(async () => {
  await db().from("store_visitors").delete().eq("id", visitorId);
});
beforeEach(() => ds.reset());

const orderId = () => String(6_000_000_000 + Math.floor(Math.random() * 1_000_000_000));

describe("which lines get the customer's picture", () => {
  it("only personalised Dreamship lines; a Prodigi line and a Dreamship line without a picture are left alone", () => {
    const found = dreamshipLines(
      paidOrder("1", [
        dreamshipLine(11, 45378125, "8x10", "1800x2400", openStorePicture),
        { id: 12, sku: "FX-1", quantity: 1, properties: prop({ _shop: "true", _shop_maker: "prodigi", _shop_print_px: "3600x3600", _shop_page: "open_store", _shop_session_id: SESSION, _shop_image_id: "img_a" }) },
        dreamshipLine(13, 45378127, "12x16", "3000x4200", {}),
        { id: 14, sku: "45378125", quantity: 1, properties: [] },
      ]),
    )!;
    expect(found.lines.map((l) => [l.lineId, l.productVariantId, l.printArea, l.printPx])).toEqual([["11", 45378125, "8x10", { w: 1800, h: 2400 }]]);
  });

  it("the print file is the picture cropped as the customer saw it and sized to the print area", async () => {
    const pic = await sharp({ create: { width: 1536, height: 2048, channels: 3, background: "#123456" } }).png().toBuffer();
    const out = await printFile(pic, { crop: { x: 0, y: 0, w: 1536, h: 2048 }, printPx: { w: 1800, h: 2400 } });
    const m = await sharp(out).metadata();
    expect([m.width, m.height, m.format]).toEqual([1800, 2400, "jpeg"]);
  });
});

describe("a personalised Dreamship line", () => {
  it("carries what the customer filled in, and its print file has the layer drawn on", async () => {
    const line = { ...dreamshipLine(71, 45378125, "8x10", "1800x2400", { ...openStorePicture, _shop_layer_t1: "Biscuit" }), product_id: 8710000000 };
    const found = dreamshipLines(paidOrder("2", [line]))!;
    expect(found.lines[0]).toMatchObject({ layerValues: { t1: "Biscuit" }, productId: "gid://shopify/Product/8710000000" });
    const { defaultLayerText, layerSchema } = await import("@/lib/shop/layer");
    const layer = layerSchema.parse({ enabled: true, texts: [{ ...defaultLayerText("t1"), size: 0.15 }], art: null });
    const pic = await sharp({ create: { width: 1536, height: 2048, channels: 3, background: "#123456" } }).png().toBuffer();
    const base = { crop: { x: 0, y: 0, w: 1536, h: 2048 }, printPx: { w: 1800, h: 2400 } };
    const [plain, layered] = await Promise.all([printFile(pic, base), printFile(pic, { ...base, layer, layerValues: { t1: "Biscuit" } })]);
    expect((await sharp(layered).metadata()).width).toBe(1800);
    expect(layered.equals(plain)).toBe(false);
  });
});

describe("the job", () => {
  it("waits for Dreamship's import, then sets the picture on each personalised line and records it", async () => {
    const id = orderId();
    const order = paidOrder(id, [dreamshipLine(21, 45378125, "8x10", "1800x2400", openStorePicture), dreamshipLine(22, 45378126, "16x24", "4200x6600", openStorePicture)]);
    const q = await queueFromPaidOrder(order);
    expect(q.queued).toBe(true);

    // Not imported yet: it waits and tries again later.
    let job = (await runJob(q.jobId!))!;
    expect(job.status).toBe("waiting");
    expect(job.reason).toBe("Waiting for Dreamship to import the order.");

    // Dreamship imports it as a draft (with a Prodigi-free order of the same two sizes).
    const imported = ds.importOrder(id, [{ productVariantId: 45378125 }, { productVariantId: 45378126 }]);
    await db().from("printer_jobs").update({ next_attempt_at: new Date().toISOString() }).eq("id", q.jobId!);
    job = (await runJob(q.jobId!))!;
    expect(job.status).toBe("picture_set");
    expect(job.dreamship_order_id).toBe(imported.id);
    const now = (await ds.orderByReference(id))!;
    const artworks = job.lines.map((l) => l.artworkId);
    expect(now.lineItems.map((l) => l.printAreas)).toEqual([[{ key: "8x10", artworkId: artworks[0] }], [{ key: "16x24", artworkId: artworks[1] }]]);
    // Only uploads and line updates: never a submit, cancel or status change.
    expect([...new Set(ds.calls.map((c) => c.op))].sort()).toEqual(["setLineArtwork", "uploadArtwork"]);
    expect(now.status).toBe("draft");

    const ev = (await db().from("activity_log").select("props").eq("event", "shop_order_sent_to_maker").eq("ref_id", id)).data!;
    expect(ev).toHaveLength(1);
    expect(ev[0].props).toMatchObject({ maker: "dreamship", status: "picture_set", lines: 2 });
  });

  it("is idempotent: a repeated webhook and a re-run change nothing", async () => {
    const id = orderId();
    const order = paidOrder(id, [dreamshipLine(31, 45378125, "8x10", "1800x2400", openStorePicture)]);
    ds.importOrder(id, [{ productVariantId: 45378125 }]);
    const first = await queueFromPaidOrder(order);
    await runJob(first.jobId!);
    const uploads = ds.calls.filter((c) => c.op === "uploadArtwork").length;
    const again = await queueFromPaidOrder(order);
    expect(again.jobId).toBe(first.jobId);
    const job = (await runJob(again.jobId!))!;
    expect(job.status).toBe("picture_set");
    expect(ds.calls.filter((c) => c.op === "uploadArtwork").length).toBe(uploads);
    // A flagged job run again (Retry) skips a line already carrying our artwork.
    await db().from("printer_jobs").update({ status: "waiting", lines: job.lines.map((l) => ({ ...l, done: false })) }).eq("id", job.id);
    expect((await runJob(job.id))!.status).toBe("picture_set");
    expect(ds.calls.filter((c) => c.op === "uploadArtwork").length).toBe(uploads);
    expect((await db().from("activity_log").select("id").eq("event", "shop_order_sent_to_maker").eq("ref_id", id)).data!.length).toBe(2);
  });

  it("an order Dreamship already sent to print is flagged, not changed", async () => {
    const id = orderId();
    ds.importOrder(id, [{ productVariantId: 45378125 }], { status: "accepted" });
    const q = await queueFromPaidOrder(paidOrder(id, [dreamshipLine(41, 45378125, "8x10", "1800x2400", openStorePicture)]));
    const job = (await runJob(q.jobId!))!;
    expect(job).toMatchObject({ status: "needs_attention", reason: "Dreamship had already sent it to print, so the picture couldn't be set.", dreamship_status: "accepted" });
    expect(ds.calls).toEqual([]);
    expect((await db().from("activity_log").select("props").eq("event", "shop_order_sent_to_maker").eq("ref_id", id)).data![0].props).toMatchObject({ status: "failed", reason: "already_submitted" });
  });

  it("an order Dreamship never imports is flagged after dreamship.import_wait_hours", async () => {
    const id = orderId();
    const q = await queueFromPaidOrder(paidOrder(id, [dreamshipLine(51, 45378125, "8x10", "1800x2400", openStorePicture)]));
    const job = (await runJob(q.jobId!, new Date(Date.now() + 7 * 3_600_000)))!;
    expect(job).toMatchObject({ status: "needs_attention", reason: "Dreamship hasn't imported this order after 6 hours." });
  });

  it("an order with no personalised Dreamship line isn't queued", async () => {
    expect(await queueFromPaidOrder(paidOrder(orderId(), [{ id: 61, sku: "FX-1", quantity: 1, properties: prop({ _shop: "true", _shop_maker: "gelato" }) }]))).toEqual({ queued: false });
    expect(await queueFromPaidOrder({ nope: true })).toEqual({ queued: false });
  });
});
