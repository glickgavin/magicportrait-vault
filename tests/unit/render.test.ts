import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createCanvas } from "@napi-rs/canvas";
import { SEED_THEMES, defaultLayout } from "@/lib/seed-data";
import { archRadius, fitText, fittedPhoto, parseLayout, photoFit, photoSourceRect, placeLines, usableIdeas, type Layout } from "@/lib/render/layout";
import { drawCard, registerFonts } from "@/lib/render/render";
import { measurer, type Ctx } from "@/lib/render/draw";

const portrait = readFileSync("public/fixtures/portraits/pet-1.jpg");
const GOLDEN = "tests/fixtures/golden";
const SIZE = { w: 500, h: 700 };

async function rgba(buf: Buffer) {
  return sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

describe("card renderer: golden images per seed version", () => {
  for (const theme of SEED_THEMES) {
    for (const v of theme.versions) {
      const name = `${theme.slug}-${v.slug}`;
      it(name, async () => {
        const canvas = await drawCard({
          layout: parseLayout(defaultLayout(v.look)),
          background: readFileSync(`public/theme-placeholders/${name}.jpg`),
          portrait,
          photoBg: v.look.photoBg,
          crop: { zoom: 1.2, x: 0.1, y: -0.1 },
          to: "Grandma Rose",
          from: "Sam",
          message: "Wishing you the happiest day. Thought you would love seeing Biscuit in his royal robes!",
          footerText: "Made with Magic Portraits AI",
          size: SIZE,
        });
        const png = await canvas.encode("png");
        const file = `${GOLDEN}/${name}.png`;
        if (!existsSync(file) || process.env.UPDATE_GOLDEN) {
          writeFileSync(file, png);
          return;
        }
        const [a, b] = await Promise.all([rgba(png), rgba(readFileSync(file))]);
        expect([a.info.width, a.info.height]).toEqual([b.info.width, b.info.height]);
        let differing = 0;
        for (let i = 0; i < a.data.length; i += 4) {
          const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
          if (d > 48) differing++;
        }
        expect(differing / (a.info.width * a.info.height)).toBeLessThan(0.005);
      });
    }
  }
});

async function expectGolden(png: Buffer, name: string) {
  const file = `${GOLDEN}/${name}.png`;
  if (!existsSync(file) || process.env.UPDATE_GOLDEN) {
    writeFileSync(file, png);
    return;
  }
  const [a, b] = await Promise.all([rgba(png), rgba(readFileSync(file))]);
  expect([a.info.width, a.info.height]).toEqual([b.info.width, b.info.height]);
  let differing = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 48) differing++;
  }
  expect(differing / (a.info.width * a.info.height)).toBeLessThan(0.005);
}

describe("photo window follows the image (photo.fit)", () => {
  const square = portrait;
  const tall = readFileSync("tests/fixtures/portrait-3x4.jpg");
  const base = parseLayout(defaultLayout(SEED_THEMES[0].versions[0].look));
  const bg = readFileSync(`public/theme-placeholders/${SEED_THEMES[0].slug}-${SEED_THEMES[0].versions[0].slug}.jpg`);
  const render = async (layout: Layout, p: Buffer) =>
    (await drawCard({ layout, background: bg, portrait: p, photoBg: "#E8E2D8", to: "Grandma Rose", from: "Sam", message: "Wishing you the happiest day.", footerText: "Made with Magic Portraits AI", size: SIZE })).encode("png");

  it("adapt: square portrait (golden)", async () => expectGolden(await render(base, square), "fit-adapt-square"));
  it("adapt: 3:4 portrait (golden)", async () => expectGolden(await render(base, tall), "fit-adapt-3x4"));
  it("cover: 3:4 portrait fills the designed box (golden)", async () => expectGolden(await render({ ...base, photo: { ...base.photo, fit: "cover" } }, tall), "fit-cover-3x4"));
  it("adapt: arch with a 3:4 portrait (golden)", async () => expectGolden(await render({ ...base, photo: { ...base.photo, shape: "arch" } }, tall), "fit-adapt-arch-3x4"));

  it("fits inside the maximum area at the image's own ratio, centred, frame included", () => {
    const p = { x: 100, y: 200, w: 800, h: 800, shape: "rounded" as const, radius: 30, frame: { color: "#FFFFFF", width: 20 } };
    const f = fittedPhoto(p, 600, 800); // 3:4
    expect(f.h).toBe(800);
    expect((f.w - 40) / (f.h - 40)).toBeCloseTo(0.75, 5);
    expect(f.x + f.w / 2).toBeCloseTo(500, 5);
    expect(f.y).toBe(200);
    const wide = fittedPhoto(p, 800, 600);
    expect(wide.w).toBe(800);
    expect(wide.y + wide.h / 2).toBeCloseTo(600, 5);
  });
  it("circles and cover keep the designed box; no portrait keeps it too", () => {
    const p = { x: 0, y: 0, w: 500, h: 500, shape: "circle" as const };
    expect(fittedPhoto(p, 600, 800)).toEqual(p);
    const c = { x: 0, y: 0, w: 500, h: 700, shape: "rounded" as const, fit: "cover" as const };
    expect(fittedPhoto(c, 800, 800)).toEqual(c);
    expect(fittedPhoto({ ...c, fit: "adapt" }, null, null)).toEqual({ ...c, fit: "adapt" });
  });
  it("defaults: cover when the art draws the frame (frame.width 0), otherwise adapt", () => {
    expect(photoFit({ x: 0, y: 0, w: 1, h: 1, shape: "rect", frame: { color: "#FFFFFF", width: 0 } })).toBe("cover");
    expect(photoFit({ x: 0, y: 0, w: 1, h: 1, shape: "rounded", frame: { color: "#FFFFFF", width: 28 } })).toBe("adapt");
    expect(photoFit({ x: 0, y: 0, w: 1, h: 1, shape: "rounded" })).toBe("adapt");
  });
  it("arch keeps a semicircular top across the width, capped for wide boxes", () => {
    expect(archRadius(600, 800)).toBe(300);
    expect(archRadius(800, 600)).toBe(300);
  });
});

describe("text fitting", () => {
  registerFonts();
  const ctx = createCanvas(10, 10).getContext("2d") as unknown as Ctx;
  const measure = measurer(ctx, (f) => `"${f}"`);
  const layout = parseLayout(defaultLayout(SEED_THEMES[0].versions[0].look));
  const zone = layout.text.message;

  it("short text stays at full size on one line", () => {
    const fit = fitText("Merry Christmas!", zone, measure);
    expect(fit.size).toBe(zone.size);
    expect(fit.lines).toHaveLength(1);
  });

  it("shrinks before it wraps", () => {
    let text = "Merry Christmas";
    while (measure(text, zone.font, zone.size) <= zone.w) text += " and love";
    expect(measure(text, zone.font, zone.size * 0.7)).toBeLessThanOrEqual(zone.w); // fits once shrunk
    const fit = fitText(text, zone, measure);
    expect(fit.lines).toHaveLength(1);
    expect(fit.size).toBeLessThan(zone.size);
    expect(fit.size).toBeGreaterThanOrEqual(zone.size * 0.7);
  });

  for (const n of [60, 120, 220, 400, 1000]) {
    it(`a ${n}-character message never overflows its box`, () => {
      const text = "Wishing you the happiest day ".repeat(40).slice(0, n);
      const fit = fitText(text, zone, measure);
      for (const l of fit.lines) expect(measure(l, zone.font, fit.size)).toBeLessThanOrEqual(zone.w + 0.5);
      expect(fit.lines.length * fit.size * fit.lineHeight).toBeLessThanOrEqual(zone.h! + 0.5);
      const placed = placeLines(fit, zone);
      expect(placed[0].y - fit.size).toBeGreaterThanOrEqual(zone.y - 1);
    });
  }

  it("very long single words break instead of overflowing", () => {
    const fit = fitText("A".repeat(300), zone, measure);
    for (const l of fit.lines) expect(measure(l, zone.font, fit.size)).toBeLessThanOrEqual(zone.w + 0.5);
  });

  it("crop: cover, zoom and pan stay inside the image", () => {
    const r = photoSourceRect(1000, 800, 500, 500, { zoom: 2, x: 1, y: -1 });
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy).toBeGreaterThanOrEqual(0);
    expect(r.sx + r.sw).toBeLessThanOrEqual(1000.001);
    expect(r.sw).toBeCloseTo(400);
  });

  it("message ideas with {pet} are skipped when the pet name isn't known", () => {
    const ideas = ["Hi from {pet}!", "Merry Christmas!"];
    expect(usableIdeas(ideas, null)).toEqual(["Merry Christmas!"]);
    expect(usableIdeas(ideas, "Biscuit")[0]).toBe("Hi from Biscuit!");
  });
});
