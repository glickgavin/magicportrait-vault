import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { isUploadedTemplateUrl, processTemplateUpload, uploadKeyFor } from "@/lib/shop/template-media";

const png = (w: number, h: number, alpha: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 200, b: 200, alpha } } }).png().toBuffer();

describe("template uploads", () => {
  it("a blank product photo becomes a JPEG, scaled to the longest side kept", async () => {
    const r = await processTemplateUpload(await png(3000, 2000, 1), "background", { maxPx: 2400 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ext).toBe("jpg");
    expect([r.width, r.height]).toEqual([2400, 1600]);
    expect((await sharp(r.body).metadata()).format).toBe("jpeg");
  });

  it("an overlay keeps its see-through parts (WebP) and must have some", async () => {
    // See-through except a band along the top: like a shine or a rim.
    const frame = await sharp({ create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await png(800, 100, 1), left: 0, top: 0 }])
      .png()
      .toBuffer();
    const ok = await processTemplateUpload(frame, "overlay", { maxPx: 2400 });
    expect(ok.ok && ok.ext).toBe("webp");
    if (ok.ok) expect((await sharp(ok.body).metadata()).hasAlpha).toBe(true);
    expect(await processTemplateUpload(await png(800, 800, 1), "overlay", { maxPx: 2400 })).toEqual({ ok: false, reason: "overlay_not_see_through" });
    const jpeg = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    expect(await processTemplateUpload(jpeg, "overlay", { maxPx: 2400 })).toEqual({ ok: false, reason: "overlay_not_see_through" });
  });

  it("refuses files that aren't photos, and tiny ones", async () => {
    expect(await processTemplateUpload(Buffer.from("not an image"), "background", { maxPx: 2400 })).toEqual({ ok: false, reason: "not_an_image" });
    expect(await processTemplateUpload(await png(300, 900, 1), "background", { maxPx: 2400 })).toEqual({ ok: false, reason: "too_small" });
  });
});

describe("uploaded template links", () => {
  const before = process.env.NEXT_PUBLIC_SUPABASE_URL;
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = before;
  });
  it("only our own public template folder counts", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    expect(isUploadedTemplateUrl("https://abc.supabase.co/storage/v1/object/public/theme-assets/shop-templates/123/0123456789abcdef-800x600.jpg")).toBe(true);
    expect(isUploadedTemplateUrl("https://abc.supabase.co/storage/v1/object/public/theme-assets/other/x.jpg")).toBe(false);
    expect(isUploadedTemplateUrl("https://abc.supabase.co/storage/v1/object/public/theme-assets/shop-templates/../cards/x.jpg")).toBe(false);
    expect(isUploadedTemplateUrl("https://evil.example/storage/v1/object/public/theme-assets/shop-templates/1/x.jpg")).toBe(false);
  });
});

describe("removing an uploaded photo", () => {
  it("only names this product's own uploads", () => {
    expect(uploadKeyFor("123", "upload:123/0123456789abcdef-800x600.jpg")).toBe("shop-templates/123/0123456789abcdef-800x600.jpg");
    expect(uploadKeyFor("123", "upload:456/0123456789abcdef-800x600.jpg")).toBeNull();
    expect(uploadKeyFor("123", "upload:123/../cards/x.jpg")).toBeNull();
    expect(uploadKeyFor("123", "gid://shopify/MediaImage/1")).toBeNull();
  });
});

