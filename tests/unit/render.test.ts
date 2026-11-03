import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createCanvas } from "@napi-rs/canvas";
import { SEED_THEMES, defaultLayout } from "@/lib/seed-data";
import { fitText, parseLayout, photoSourceRect, placeLines, usableIdeas } from "@/lib/render/layout";
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
