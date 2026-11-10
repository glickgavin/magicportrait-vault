import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { centredCrop } from "@/lib/shop/fit";
import { FIXTURE_SCENES, fixtureTemplate } from "@/lib/shop/fixture-scenes";
import { grow } from "@/lib/shop/preview";
import { renderPreview } from "@/lib/shop/render";
import { homography, parseTemplate, templateSchema, zoneAspect, zoneMapper, type Template } from "@/lib/shop/template";

const GOLDEN = "tests/fixtures/golden/shop";

/** A made-up test picture: four coloured quarters, a grid and an "F", so flips and warps show. */
async function testPicture(w: number, h: number): Promise<Buffer> {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  const q = [
    ["#E4572E", 0, 0],
    ["#29335C", w / 2, 0],
    ["#F3A712", 0, h / 2],
    ["#669BBC", w / 2, h / 2],
  ] as const;
  for (const [col, x, y] of q) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w / 2, h / 2);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = Math.max(2, w / 200);
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo((w * i) / 8, 0);
    ctx.lineTo((w * i) / 8, h);
    ctx.moveTo(0, (h * i) / 8);
    ctx.lineTo(w, (h * i) / 8);
    ctx.stroke();
  }
  ctx.fillStyle = "#FFFFFF";
  const u = Math.min(w, h) / 10;
  ctx.fillRect(w / 2 - u, h / 2 - 2 * u, u * 0.6, u * 4);
  ctx.fillRect(w / 2 - u, h / 2 - 2 * u, u * 2, u * 0.6);
  ctx.fillRect(w / 2 - u, h / 2 - u * 0.3, u * 1.4, u * 0.6);
  return c.encode("png");
}

async function expectGolden(png: Buffer, name: string) {
  mkdirSync(GOLDEN, { recursive: true });
  const file = `${GOLDEN}/${name}.png`;
  if (!existsSync(file) || process.env.UPDATE_GOLDEN) {
    writeFileSync(file, png);
    return;
  }
  const [a, b] = await Promise.all([sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
  expect([a.info.width, a.info.height]).toEqual([b.info.width, b.info.height]);
  let differing = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 48) differing++;
  }
  expect(differing / (a.info.width * a.info.height)).toBeLessThan(0.005);
}

const PRINT = { poster: { w: 2400, h: 3000 }, tile: { w: 2400, h: 2400 }, mug: { w: 1155, h: 1155 } } as const;
const PICTURES = { square: [2048, 2048], "3x4": [1536, 2048] } as const;

describe("shop previews: golden images", () => {
  for (const scene of ["poster", "tile", "mug"] as const) {
    for (const [picName, [pw, ph]] of Object.entries(PICTURES)) {
      it(`${scene} with a ${picName} picture`, async () => {
        const template = templateSchema.parse(fixtureTemplate(scene));
        const background = await loadImage(readFileSync(`public/fixtures/shop/${scene}.jpg`));
        const target = PRINT[scene];
        const png = await renderPreview(
          {
            template,
            picture: await testPicture(pw, ph),
            crop: centredCrop(pw, ph, target.w, target.h),
            placement: scene === "mug" ? "wrap_zone" : "cover",
            backgroundColour: null,
            targetAspect: target.w / target.h,
            width: 500,
            images: { background, overlay: null },
          },
          "png",
        );
        expect(png).not.toBeNull();
        await expectGolden(png!, `${scene}-${picName}`);
      });
    }
  }
  it("contain puts the whole picture on the background colour", async () => {
    const template = templateSchema.parse(fixtureTemplate("poster"));
    const background = await loadImage(readFileSync("public/fixtures/shop/poster.jpg"));
    const png = await renderPreview({ template, picture: await testPicture(3000, 2000), crop: { x: 0, y: 0, w: 3000, h: 2000 }, placement: "contain", backgroundColour: "#FDE7FA", targetAspect: 0.8, width: 500, images: { background, overlay: null } }, "png");
    await expectGolden(png!, "poster-landscape-contain");
  });
});

describe("template maths", () => {
  it("maps the unit square exactly onto the four corners", () => {
    const q = [{ x: 10, y: 20 }, { x: 110, y: 25 }, { x: 105, y: 140 }, { x: 12, y: 130 }] as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
    const m = homography(q);
    for (const [[u, v], p] of [[[0, 0], q[0]], [[1, 0], q[1]], [[1, 1], q[2]], [[0, 1], q[3]]] as const) {
      const r = m(u, v);
      expect(r.x).toBeCloseTo(p.x, 6);
      expect(r.y).toBeCloseTo(p.y, 6);
    }
  });
  it("a mug wrap meets its edges and bows in the middle", () => {
    const z = FIXTURE_SCENES.mug.zone;
    const m = zoneMapper(z, 1000, 1000);
    if (z.kind !== "wrap") throw new Error("mug is a wrap");
    expect(m(0, 0).x).toBeCloseTo(z.left * 1000, 6);
    expect(m(1, 0).x).toBeCloseTo(z.right * 1000, 6);
    expect(m(0, 0).y).toBeCloseTo(z.top * 1000, 6);
    expect(m(0.5, 0).y).toBeCloseTo((z.top + z.curve) * 1000, 6);
    // Compressed towards the sides, as on a cylinder.
    expect(m(0.6, 0.5).x - m(0.5, 0.5).x).toBeGreaterThan(m(1, 0.5).x - m(0.9, 0.5).x);
  });
  it("measures the zone's shape to warn about a mismatch", () => {
    const t = templateSchema.parse(fixtureTemplate("acrylic"));
    expect(zoneAspect(t.zone, 1000, 1000)).toBeCloseTo(0.72, 2);
    expect(zoneAspect(templateSchema.parse(fixtureTemplate("ornament")).zone, 1000, 1000)).toBeCloseTo(1, 6);
  });
  it("refuses templates without a background or with a broken zone", () => {
    const good = JSON.stringify(fixtureTemplate("poster"));
    expect(parseTemplate(good)).not.toBeNull();
    const t = JSON.parse(good) as Template;
    expect(parseTemplate(JSON.stringify({ ...t, background: null }))).toBeNull();
    expect(parseTemplate(JSON.stringify({ ...t, zone: { kind: "corners", points: [[0, 0]] } }))).toBeNull();
    expect(parseTemplate(JSON.stringify({ ...t, v: 2 }))).toBeNull();
    expect(parseTemplate("not json")).toBeNull();
  });
});

describe("every fixture scene", () => {
  for (const name of Object.keys(FIXTURE_SCENES) as (keyof typeof FIXTURE_SCENES)[]) {
    it(`${name}: the template parses and draws`, async () => {
      const t = parseTemplate(JSON.stringify(fixtureTemplate(name)));
      expect(t).not.toBeNull();
      const background = await loadImage(readFileSync(`public/fixtures/shop/${name}.jpg`));
      const png = await renderPreview({ template: t!, picture: await testPicture(800, 800), crop: { x: 0, y: 0, w: 800, h: 800 }, placement: t!.zone.kind === "wrap" ? "wrap_zone" : "cover", backgroundColour: null, targetAspect: 1, width: 240, images: { background, overlay: null } }, "png");
      expect((await sharp(png!).metadata()).width).toBe(240);
    });
  }
});

describe("seamless triangles", () => {
  it("every edge moves out by the same amount, even on a thin triangle", () => {
    const t: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 100 }];
    const g = grow(t, 1);
    // Distance from the original long edge (x = 0) to the grown one is 1 px.
    expect(Math.min(g[0].x, g[2].x)).toBeCloseTo(-1, 6);
    // And from the bottom edge (y = 0).
    expect(Math.min(g[0].y, g[1].y)).toBeCloseTo(-1, 6);
  });
});

describe("overlays that would cover the picture", () => {
  it("ignores an overlay that is the background photo itself", () => {
    const bg = { media_id: "gid://shopify/MediaImage/1", url: "https://cdn.shopify.com/a.png", w: 1000, h: 1000 };
    const raw = { v: 1, background: bg, zone: { kind: "corners", points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]] }, overlay: bg, mask: { kind: "none", radius: 0 }, blend: "normal" };
    expect(parseTemplate(JSON.stringify(raw))?.overlay).toBeNull();
    const other = { ...bg, media_id: "gid://shopify/MediaImage/2", url: "https://cdn.shopify.com/shine.png" };
    expect(parseTemplate(JSON.stringify({ ...raw, overlay: other }))?.overlay?.media_id).toBe("gid://shopify/MediaImage/2");
  });
});
