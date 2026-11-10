import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { evaluateCatalog, forPage } from "@/lib/shop/catalog";
import { centredCrop, cropAllowed, cropPercent, fitVariant, ideasFor, topIdeas } from "@/lib/shop/fit";
import { buildImageList, externalImageId, isAllowedUrl, looksLikeImageId, orderedPhotoTiles } from "@/lib/shop/images";
import type { VariantRules } from "@/lib/shop/rules";
import { FX_COLLECTION_ID, ShopCatalogFixtures } from "@/lib/shop/sources/fixtures";
import { measureImage, processUpload } from "@/lib/shop/upload";

// The four shapes the spec asks for: square, 3:4, landscape and small.
const SQUARE = { kind: "portrait" as const, width: 2048, height: 2048 };
const THREE_FOUR = { kind: "portrait" as const, width: 1536, height: 2048 };
const LANDSCAPE = { kind: "upload" as const, width: 3000, height: 2000 };
const SMALL = { kind: "upload" as const, width: 800, height: 600 };

const rules = (o: Partial<VariantRules> = {}): VariantRules => ({
  maker: "prodigi",
  makerSku: "X",
  printPx: { w: 2400, h: 3000 }, // 4:5
  zonePx: null,
  placement: "cover",
  minShortSidePx: 1000,
  maxCropPct: 30,
  adjustable: true,
  imageKinds: "both",
  background: null,
  extra: {},
  version: null,
  ...o,
});

describe("fit rules", () => {
  it("square on a 4:5 print: 20% cropped, centred", () => {
    const f = fitVariant(SQUARE, rules());
    expect(f).toEqual({ ok: true, cropPct: 20, crop: { x: 205, y: 0, w: 1638, h: 2048 } });
  });
  it("3:4 on a 4:5 print: a little cropped", () => {
    const f = fitVariant(THREE_FOUR, rules());
    expect(f.ok && f.cropPct).toBe(6.3);
    expect(f.ok && f.crop).toEqual({ x: 0, y: 64, w: 1536, h: 1920 });
  });
  it("landscape on a portrait print loses too much and is hidden", () => {
    expect(fitVariant(LANDSCAPE, rules())).toEqual({ ok: false, reason: "too_much_crop", cropPct: 46.7 });
  });
  it("landscape fits a landscape print", () => {
    expect(fitVariant(LANDSCAPE, rules({ printPx: { w: 3000, h: 2000 } }))).toMatchObject({ ok: true, cropPct: 0 });
  });
  it("a small picture is hidden from sizes that would print blurry", () => {
    expect(fitVariant(SMALL, rules())).toEqual({ ok: false, reason: "too_small" });
    expect(fitVariant(SMALL, rules({ minShortSidePx: 500, printPx: { w: 1200, h: 900 } }))).toMatchObject({ ok: true });
  });
  it("a mug fills only its zone, not the whole wrap", () => {
    const mug = rules({ placement: "wrap_zone", printPx: { w: 2475, h: 1155 }, zonePx: { w: 1155, h: 1155 } });
    expect(fitVariant(SQUARE, mug)).toMatchObject({ ok: true, cropPct: 0 });
    expect(fitVariant(SQUARE, { ...mug, zonePx: null })).toMatchObject({ ok: false, reason: "too_much_crop" });
  });
  it("contain never crops", () => {
    expect(fitVariant(LANDSCAPE, rules({ placement: "contain" }))).toEqual({ ok: true, cropPct: 0, crop: { x: 0, y: 0, w: 3000, h: 2000 } });
  });
  it("respects which pictures a size takes", () => {
    expect(fitVariant(LANDSCAPE, rules({ imageKinds: "portraits", printPx: { w: 3, h: 2 } }))).toEqual({ ok: false, reason: "wrong_kind" });
    expect(fitVariant(SQUARE, rules({ imageKinds: "photos" }))).toEqual({ ok: false, reason: "wrong_kind" });
    expect(fitVariant(SQUARE, rules({ imageKinds: "portraits" })).ok).toBe(true);
  });
  it("needs the picture's size first", () => {
    expect(fitVariant({ kind: "photo_tile", width: null, height: null }, rules())).toEqual({ ok: false, reason: "unknown_size" });
  });
  it("crop maths", () => {
    expect(cropPercent(100, 100, 100, 100)).toBe(0);
    expect(cropPercent(200, 100, 100, 100)).toBe(50);
    expect(centredCrop(200, 100, 1, 1)).toEqual({ x: 50, y: 0, w: 100, h: 100 });
  });
});

describe("a crop chosen with Adjust", () => {
  const img = { width: 2048, height: 2048 };
  it("must stay inside the picture, in the print shape", () => {
    expect(cropAllowed({ x: 0, y: 0, w: 1600, h: 2000 }, img, rules())).toBe(true);
    expect(cropAllowed({ x: 600, y: 0, w: 1600, h: 2000 }, img, rules())).toBe(false); // runs off the right edge
    expect(cropAllowed({ x: 0, y: 0, w: 2000, h: 2000 }, img, rules())).toBe(false); // wrong shape
    expect(cropAllowed({ x: 0.5, y: 0, w: 1600, h: 2000 }, img, rules())).toBe(false);
  });
  it("is the default crop only when the size can't be adjusted", () => {
    expect(cropAllowed({ x: 205, y: 0, w: 1638, h: 2048 }, img, rules({ adjustable: false }))).toBe(true);
    expect(cropAllowed({ x: 0, y: 0, w: 1638, h: 2048 }, img, rules({ adjustable: false }))).toBe(false);
  });
});

describe("product ideas for a picture", () => {
  const fx = new ShopCatalogFixtures();
  it("keeps the collection's order and drops sizes that don't suit the picture", async () => {
    const entries = evaluateCatalog(await fx.storeProducts(FX_COLLECTION_ID));
    const square = ideasFor(forPage(entries, "products"), SQUARE);
    expect(square.map((i) => i.entry.product.handle)).toEqual(["fx-mug", "fx-puzzle", "fx-acrylic-block", "fx-poster"]);
    const poster = square.find((i) => i.entry.product.handle === "fx-poster")!;
    // 18 × 24 needs 1,800 px on the short side; a 2,048 px square passes. 24 × 36 has no rules.
    expect(poster.variants.map((v) => v.variant.title)).toEqual(["8 × 10 in", "12 × 16 in", "18 × 24 in"]);
    expect(poster.fromPrice).toBe("29.99");
  });
  it("a small picture gets no ideas at all from these products", async () => {
    const entries = evaluateCatalog(await fx.storeProducts(FX_COLLECTION_ID));
    expect(ideasFor(forPage(entries, "gifts"), SMALL)).toEqual([]);
  });
  it("shows the first N and keeps the rest for See all", async () => {
    const entries = evaluateCatalog(await fx.storeProducts(FX_COLLECTION_ID));
    const { top, rest } = topIdeas(ideasFor(forPage(entries, "gifts"), SQUARE), 3);
    expect(top).toHaveLength(3);
    expect(rest.length).toBeGreaterThanOrEqual(1);
  });
});

describe("the picture list", () => {
  const IMG = "https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/public/images";
  const TILE = "https://afqxjwizbmpzmvzzkzdb.supabase.co/storage/v1/object/public/tiles-uploads/order-uploads";
  it("puts past photos, photo tiles and new uploads together, newest first, each URL once", () => {
    const list = buildImageList({
      portraits: [
        { imageId: "a", sessionId: "s1", imageUrl: `${IMG}/sessions/s1/a.png`, width: 1024, height: 1024, createdAt: "2026-10-01T00:00:00Z", ordered: true },
        { imageId: "a2", sessionId: "s1", imageUrl: `${IMG}/sessions/s1/a.png`, width: 1024, height: 1024, createdAt: "2026-10-02T00:00:00Z", ordered: false },
      ],
      pastUploads: [{ url: `${IMG}/user-uploads/dog.jpg`, createdAt: "2026-10-03T00:00:00Z" }],
      photoTiles: [
        { url: `${TILE}/t1.jpg`, tileId: "t1", createdAt: "2026-10-04T00:00:00Z", ordered: false },
        { url: `${TILE}/t1.jpg`, tileId: "t1", createdAt: "2026-09-01T00:00:00Z", ordered: true },
      ],
      newUploads: [{ id: "6b9f1c1e-7d2a-4c55-9e0a-5f9f2b9b0002", storagePath: "u/6b9f1c1e-7d2a-4c55-9e0a-5f9f2b9b0002.jpg", width: 2000, height: 1500, createdAt: "2026-10-05T00:00:00Z" }],
    });
    expect(list.portraits).toHaveLength(1);
    expect(list.photos.map((p) => p.kind)).toEqual(["new_upload", "upload", "photo_tile"]);
    expect(list.photos.find((p) => p.kind === "photo_tile")?.ordered).toBe(true);
    for (const p of [...list.portraits, ...list.photos]) expect(looksLikeImageId(p.id)).toBe(true);
  });
  it("ids are stable and don't show the URL", () => {
    const a = externalImageId("upload", `${IMG}/user-uploads/dog.jpg`);
    expect(a).toBe(externalImageId("upload", `${IMG}/user-uploads/dog.jpg`));
    expect(a).not.toContain("dog");
    expect(a).not.toBe(externalImageId("photo_tile", `${IMG}/user-uploads/dog.jpg`));
    expect(looksLikeImageId("n_not-a-uuid")).toBe(false);
    expect(looksLikeImageId("../etc")).toBe(false);
  });
  it("finds photo tiles on the person's paid orders, never signed or foreign links", () => {
    const hosts = ["afqxjwizbmpzmvzzkzdb.supabase.co"];
    const line = (attrs: Record<string, string>) => ({ customAttributes: Object.entries(attrs).map(([key, value]) => ({ key, value })) });
    const tiles = orderedPhotoTiles(
      [
        { createdAt: "2026-10-01T00:00:00Z", cancelledAt: null, lineItems: [line({ _tile_type: "photo", _tile_id: "t1", _image_url: `${TILE}/t1.jpg` }), line({ _tile_type: "portrait", _image_url: `${TILE}/x.jpg` }), line({ _tile_type: "photo", _image_url: "https://evil.example/t.jpg" })] },
        { createdAt: "2026-10-02T00:00:00Z", cancelledAt: "2026-10-03T00:00:00Z", lineItems: [line({ _tile_type: "photo", _image_url: `${TILE}/t2.jpg` })] },
      ],
      hosts,
    );
    expect(tiles).toEqual([{ url: `${TILE}/t1.jpg`, tileId: "t1", createdAt: "2026-10-01T00:00:00Z", ordered: true }]);
    expect(isAllowedUrl(`${TILE}/t1.jpg?token=abc`, hosts)).toBe(false);
    expect(isAllowedUrl(`http://afqxjwizbmpzmvzzkzdb.supabase.co/x.jpg`, hosts)).toBe(false);
  });
});

describe("new uploads", () => {
  const RULES = { maxBytes: 20 * 1024 * 1024, minShortSidePx: 1000, jpegQuality: 90 };
  let photo: Buffer;
  beforeAll(async () => {
    // A made-up 1600 × 1200 photo, stored sideways (EXIF orientation 6), with camera data.
    photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#7aa36b" } })
      .jpeg()
      .withExif({ IFD0: { Make: "FixtureCam", Model: "Test 1", Copyright: "nobody" } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
  });

  it("is turned upright and loses its camera data", async () => {
    const r = await processUpload(photo, RULES);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.width, r.height]).toEqual([1200, 1600]);
    const m = await sharp(r.jpeg).metadata();
    expect(m.format).toBe("jpeg");
    expect(m.exif).toBeUndefined();
    expect(m.orientation).toBeUndefined();
  });
  it("reads a sideways photo's upright size", async () => {
    expect(await measureImage(photo)).toEqual({ width: 1200, height: 1600 });
  });
  it("turns PNG and WEBP into JPEG", async () => {
    for (const fmt of ["png", "webp"] as const) {
      const img = await sharp({ create: { width: 1200, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })[fmt]().toBuffer();
      const r = await processUpload(img, RULES);
      expect(r.ok, fmt).toBe(true);
    }
  });
  it("refuses small, huge, empty and non-pictures, by content", async () => {
    const small = await sharp({ create: { width: 900, height: 700, channels: 3, background: "#cccccc" } }).jpeg().toBuffer();
    expect(await processUpload(small, RULES)).toEqual({ ok: false, reason: "too_small", width: 900, height: 700 });
    expect(await processUpload(photo, { ...RULES, maxBytes: 100 })).toEqual({ ok: false, reason: "too_large" });
    expect(await processUpload(Buffer.alloc(0), RULES)).toEqual({ ok: false, reason: "empty" });
    expect(await processUpload(Buffer.from("<svg onload=alert(1)>…</svg> pretending to be dog.jpg"), RULES)).toEqual({ ok: false, reason: "not_an_image" });
    const gif = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#cccccc" } }).gif().toBuffer();
    expect(await processUpload(gif, RULES)).toEqual({ ok: false, reason: "unsupported" });
  });
});
