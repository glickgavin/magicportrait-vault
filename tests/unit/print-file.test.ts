import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { defaultLayerText, layerSchema, type Layer } from "@/lib/shop/layer";
import { composePrintFile } from "@/lib/shop/print-file";
import { layeredLines, PRINT_FILES_KEY, queuePrintFiles, runPrintFileJob } from "@/lib/shop/print-jobs";
import { getSources } from "@/lib/sources";
import type { ShopifyFixtures } from "@/lib/sources/fixtures";
import { putObject } from "@/lib/storage";
import { clearSettingsCache, setSetting } from "@/lib/settings";

// Print files for personalised lines (docs/shop.md › Personalisation layer): the composed file, and the job that
// makes it for printers other than Dreamship and links it from the order. Fixtures and the local stack; made-up orders.

const layer: Layer = layerSchema.parse({ enabled: true, texts: [{ ...defaultLayerText("t1"), color: "#FFFFFF", box: { x: 0.1, y: 0.7, w: 0.8, h: 0.2 }, size: 0.15 }], art: null });
const raw = async (b: Buffer) => sharp(b).raw().toBuffer({ resolveWithObject: true });

describe("the print file", () => {
  it("without a layer: the picture cropped and sized to print, as before", async () => {
    const pic = await sharp({ create: { width: 1536, height: 2048, channels: 3, background: "#123456" } }).png().toBuffer();
    const out = await composePrintFile(pic, { crop: { x: 0, y: 0, w: 1536, h: 2048 }, printPx: { w: 1800, h: 2400 } });
    const m = await sharp(out).metadata();
    expect([m.width, m.height, m.format]).toEqual([1800, 2400, "jpeg"]);
  });

  it("with a layer: the words are drawn at print size inside their box, and nothing changes outside it", async () => {
    const pic = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#203040" } }).png().toBuffer();
    const opts = { crop: { x: 0, y: 0, w: 900, h: 1200 }, printPx: { w: 1200, h: 1600 } };
    const plain = await raw(await composePrintFile(pic, opts));
    const layered = await raw(await composePrintFile(pic, { ...opts, layer: { layer, values: { t1: "WWWW" } } }));
    expect([layered.info.width, layered.info.height]).toEqual([1200, 1600]);
    const px = (d: Buffer, x: number, y: number) => d[(y * 1200 + x) * 3];
    let white = 0;
    let outside = 0;
    for (let y = 0; y < 1600; y += 4)
      for (let x = 0; x < 1200; x += 4) {
        const inBox = x >= 120 && x < 1080 && y >= 1120 && y < 1440;
        if (inBox && px(layered.data, x, y) > 200) white++;
        if (!inBox && Math.abs(px(layered.data, x, y) - px(plain.data, x, y)) > 8) outside++;
      }
    expect(white).toBeGreaterThan(500);
    expect(outside).toBe(0);
  });
});

describe("which lines get an app-made print file", () => {
  const props = (o: Record<string, string>) => Object.entries(o).map(([name, value]) => ({ name, value }));
  it("only personalised lines for printers other than Dreamship", () => {
    const found = layeredLines({
      id: 1,
      name: "#1",
      line_items: [
        { id: 11, product_id: 8703000000, quantity: 1, properties: props({ _shop: "true", _shop_maker: "prodigi", _shop_print_px: "3600x3600", _shop_page: "open_store", _shop_session_id: "s", _shop_image_id: "i", _shop_crop: "0,0,900,900", _shop_layer_t1: "Teddy" }) },
        { id: 12, product_id: 8703000000, quantity: 1, properties: props({ _shop: "true", _shop_maker: "prodigi", _shop_print_px: "3600x3600", _shop_page: "open_store", _shop_session_id: "s", _shop_image_id: "i" }) },
        { id: 13, product_id: 8710000000, quantity: 1, properties: props({ _shop: "true", _shop_maker: "dreamship", _shop_print_px: "1800x2400", _shop_page: "open_store", _shop_session_id: "s", _shop_image_id: "i", _shop_layer_t1: "Teddy" }) },
      ],
    })!;
    expect(found.lines.map((l) => [l.lineId, l.maker, l.layerValues, l.productId])).toEqual([["11", "prodigi", { t1: "Teddy" }, "gid://shopify/Product/8703000000"]]);
  });
});

describe("the print-file job", () => {
  let visitorId = "";
  const SESSION = `sess_${randomBytes(4).toString("hex")}`;
  beforeAll(async () => {
    visitorId = ((await db().from("store_visitors").insert({ token_hash: randomBytes(32).toString("hex") }).select("id").single()).data as { id: string }).id;
    const path = `${visitorId}/pictures/test/0.png`;
    await putObject("store-uploads", path, await sharp({ create: { width: 900, height: 900, channels: 3, background: "#c98a52" } }).png().toBuffer(), "image/png");
    await db().from("store_generations").insert({ visitor_id: visitorId, product_id: "gid://shopify/Product/8703000000", theme: "admiral-01", imagen_session_id: SESSION, status: "done", images: [{ imagen_id: "img_a", url: "https://imagen.example/a.png", width: 900, height: 900, storage_path: path }] });
  });
  afterAll(async () => {
    await db().from("store_visitors").delete().eq("id", visitorId);
  });

  it("makes the file with the layer kept on the job, links it from the order, and never puts the words in the log", async () => {
    const id = String(7_000_000_000 + Math.floor(Math.random() * 1e9));
    const order = { id, name: `#P${id.slice(-4)}`, line_items: [{ id: 91, product_id: 8703000000, quantity: 1, properties: Object.entries({ _shop: "true", _shop_maker: "prodigi", _shop_print_px: "1200x1200", _shop_page: "open_store", _shop_session_id: SESSION, _shop_image_id: "img_a", _shop_crop: "0,0,900,900", _shop_layer_t1: "Biscuit" }).map(([name, value]) => ({ name, value })) }] };
    const q = await queuePrintFiles(order);
    expect(q.queued).toBe(true);
    // The fixture Pillow has no layer: the job keeps none, so the line is flagged rather than printed without the words.
    const job = (await runPrintFileJob(q.jobId!))!;
    expect(job.status).toBe("needs_attention");
    expect(job.reason).toMatch(/no longer has a personalisation layer/);

    // With the layer kept on the job, the file is made; with the switch on, it's linked from the order.
    await setSetting("printers.print_files_to_order", true, "test@example.com");
    clearSettingsCache();
    await db().from("printer_jobs").update({ status: "waiting", lines: job.lines.map((l) => ({ ...l, layer, error: null })) }).eq("id", job.id);
    const done = (await runPrintFileJob(job.id))!;
    expect(done.status).toBe("picture_set");
    expect(done.lines[0].fileUrl).toMatch(/print\/\d+\/91\.jpg/);
    const shopify = (await getSources()).shopify as unknown as ShopifyFixtures;
    const write = shopify.writes.filter((w) => w.orderGid === `gid://shopify/Order/${id}`).at(-1)!;
    expect(write.payload).toMatchObject({ key: PRINT_FILES_KEY, namespace: "mmp_shop" });
    expect(Object.keys(JSON.parse((write.payload as { value: string }).value))).toEqual(["91"]);
    const ev = (await db().from("activity_log").select("props").eq("event", "shop_print_file_made").eq("ref_id", id).order("occurred_at")).data!;
    expect(ev.map((e) => e.props)).toEqual([expect.objectContaining({ status: "failed", reason: "no_layer" }), expect.objectContaining({ status: "picture_set", lines: 1, of: 1, maker: "prodigi" })]);
    expect(JSON.stringify(ev)).not.toContain("Biscuit");
    await setSetting("printers.print_files_to_order", false, "test@example.com");
    clearSettingsCache();
  });

  it("with the switch off (the default) the file is made but nothing is written to the order", async () => {
    const id = String(7_000_000_000 + Math.floor(Math.random() * 1e9));
    const order = { id, name: `#Q${id.slice(-4)}`, line_items: [{ id: 92, product_id: 8703000000, quantity: 1, properties: Object.entries({ _shop: "true", _shop_maker: "gelato", _shop_print_px: "1000x1000", _shop_page: "open_store", _shop_session_id: SESSION, _shop_image_id: "img_a", _shop_layer_t1: "Rex" }).map(([name, value]) => ({ name, value })) }] };
    const q = await queuePrintFiles(order);
    await db().from("printer_jobs").update({ lines: (await db().from("printer_jobs").select("lines").eq("id", q.jobId!).single()).data!.lines.map((l: object) => ({ ...l, layer })) }).eq("id", q.jobId!);
    const done = (await runPrintFileJob(q.jobId!))!;
    expect(done.status).toBe("picture_set");
    const shopify = (await getSources()).shopify as unknown as ShopifyFixtures;
    expect(shopify.writes.filter((w) => w.orderGid === `gid://shopify/Order/${id}`)).toEqual([]);
  });
});
