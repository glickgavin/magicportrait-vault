import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { checkArtwork } from "@/lib/admin/artwork";

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
