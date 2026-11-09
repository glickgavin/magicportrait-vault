import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { checkArtwork, prepareArtwork } from "@/lib/admin/artwork";

const bg = (w = 1500, h = 2100, q = 80) => sharp({ create: { width: w, height: h, channels: 3, background: "#F2F6F9" } }).jpeg({ quality: q }).toBuffer();
const overlay = (transparent: boolean) =>
  sharp({ create: { width: 1500, height: 2100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: transparent ? 0 : 1 } } })
    .png()
    .toBuffer();

describe("artwork upload checks", () => {
  it("accepts a 1500 × 2100 sRGB JPEG under 2 MB", async () => {
    expect(await checkArtwork(await bg(), "background")).toMatchObject({ ok: true, width: 1500, height: 2100, format: "jpeg" });
  });
  it("rejects the wrong size", async () => {
    const r = await checkArtwork(await bg(1000, 1400), "background");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("1500 × 2100");
  });
  it("rejects files of 2 MB or more", async () => {
    const r = await checkArtwork(await bg(), "background", { w: 1500, h: 2100 }, 1000);
    expect(r).toMatchObject({ ok: false });
  });
  it("rejects CMYK", async () => {
    const cmyk = await sharp(await bg()).toColourspace("cmyk").jpeg().toBuffer();
    const r = await checkArtwork(cmyk, "background");
    expect(r.ok).toBe(false);
  });
  it("overlays need real transparency", async () => {
    expect((await checkArtwork(await overlay(true), "overlay")).ok).toBe(true);
    const opaque = await checkArtwork(await overlay(false), "overlay");
    expect(opaque.ok).toBe(false);
    const jpeg = await checkArtwork(await bg(), "overlay");
    expect(jpeg.ok).toBe(false);
  });
  it("rejects files that aren't images", async () => expect((await checkArtwork(Buffer.from("hello"), "background")).ok).toBe(false));
});

describe("artwork preparation before the checks", () => {
  const transparentPng = (w = 1500, h = 2100) =>
    sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: { create: { width: 200, height: 200, channels: 4, background: { r: 221, g: 7, b: 196, alpha: 1 } } }, left: 50, top: 50 }])
      .png()
      .toBuffer();

  it("refuses a see-through picture in the Background slot, pointing to the Overlay", async () => {
    const r = await prepareArtwork(await transparentPng(), "background");
    expect(r.error).toMatch(/Overlay/);
  });
  it("resizes a 5:7 picture of another size to 1500 × 2100, keeping transparency", async () => {
    const r = await prepareArtwork(await transparentPng(750, 1050), "overlay");
    expect(r.notes.join()).toMatch(/resized/);
    const m = await sharp(r.buf).metadata();
    expect([m.width, m.height, m.hasAlpha]).toEqual([1500, 2100, true]);
    expect(await checkArtwork(r.buf, "overlay")).toMatchObject({ ok: true });
  });
  it("compresses a large overlay instead of refusing it, transparency kept", async () => {
    // Noisy pixels make a big PNG.
    const raw = Buffer.alloc(1500 * 2100 * 4);
    for (let i = 0; i < raw.length; i += 4) {
      raw[i] = (i * 7) % 256;
      raw[i + 1] = (i * 13) % 256;
      raw[i + 2] = (i * 17) % 256;
      raw[i + 3] = i % 3 === 0 ? 0 : 255;
    }
    const big = await sharp(raw, { raw: { width: 1500, height: 2100, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
    expect(big.length).toBeGreaterThan(2 * 1024 * 1024);
    const r = await prepareArtwork(big, "overlay");
    expect(r.notes.join()).toMatch(/compressed/);
    expect(r.buf.length).toBeLessThan(big.length);
    expect((await sharp(r.buf).metadata()).hasAlpha).toBe(true);
  });
});
