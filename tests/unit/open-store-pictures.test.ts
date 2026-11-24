import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { ourStatus, parseFileId, pictureFileId, photoFileId } from "@/lib/open-store/pictures";
import { isVisitorToken, newVisitorTokenWeb } from "@/lib/open-store/visitor-token";
import { defaultCrop } from "@/lib/shop/fit";
import { fixtureTemplate } from "@/lib/shop/fixture-scenes";
import { renderPreview } from "@/lib/shop/render";
import { templateSchema } from "@/lib/shop/template";
import { FX_TIMINGS, ImagenApiFixtures, parseSession } from "@/lib/sources/imagen-api";

const GOLDEN = "tests/fixtures/golden/open-store";

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

/** A fixture session's time line, with the clock in our hands. */
function clock(start = 1_800_000_000_000) {
  let now = start;
  return { now: () => now, go: (ms: number) => (now += ms) };
}

const photo = Buffer.from("jpeg");

describe("Imagen API fixtures: every case the page handles", () => {
  it("ready: pending → preprocessing → generating → done with a 3:4 and a square result", async () => {
    const c = clock();
    const api = new ImagenApiFixtures(c.now);
    const { sessionId, status } = await api.generate({ theme: "admiral-01", names: ["Teddy"], photos: [photo], clientUserId: "open-store:v" });
    expect(status).toBe("pending");
    expect((await api.session(sessionId)).status).toBe("pending");
    c.go(FX_TIMINGS.ready * 0.3);
    expect((await api.session(sessionId)).status).toBe("preprocessing");
    c.go(FX_TIMINGS.ready * 0.3);
    expect((await api.session(sessionId)).status).toBe("generating");
    c.go(FX_TIMINGS.ready);
    const done = await api.session(sessionId);
    expect(done.status).toBe("done");
    expect(done.images.map((i) => [i.width, i.height])).toEqual([
      [1536, 2048],
      [2048, 2048],
    ]);
    expect(done.costUsd).toBeGreaterThan(0);
    const png = await api.download(done.images[1].url);
    const m = await sharp(png).metadata();
    expect([m.width, m.height, m.format]).toEqual([2048, 2048, "png"]);
  });

  it("slow: still generating after the slow mark, done later", async () => {
    const c = clock();
    const api = new ImagenApiFixtures(c.now);
    const { sessionId } = await api.generate({ theme: "admiral-01", names: ["Slowpoke"], photos: [photo], clientUserId: "x" });
    c.go(FX_TIMINGS.slow * 0.6);
    expect((await api.session(sessionId)).status).toBe("generating");
    c.go(FX_TIMINGS.slow);
    expect((await api.session(sessionId)).status).toBe("done");
  });

  it("failed, never finishing (for the time-out) and asking for faces", async () => {
    const c = clock();
    const api = new ImagenApiFixtures(c.now);
    const fail = await api.generate({ theme: "admiral-01", names: ["Oops"], photos: [photo], clientUserId: "x" });
    const never = await api.generate({ theme: "admiral-01", names: ["Forever"], photos: [photo], clientUserId: "x" });
    const faces = await api.generate({ theme: "admiral-01", names: ["Faces"], photos: [photo], clientUserId: "x" });
    c.go(10 * 60_000);
    expect((await api.session(fail.sessionId)).status).toBe("failed");
    expect((await api.session(never.sessionId)).status).toBe("generating");
    expect(ourStatus((await api.session(faces.sessionId)).status)).toBe("failed");
  });

  it("a two-photo theme returns three results; unknown or inactive themes are refused", async () => {
    const c = clock();
    const api = new ImagenApiFixtures(c.now);
    const { sessionId } = await api.generate({ theme: "duo-portrait-01", names: ["Peg", "Bo"], photos: [photo, photo], clientUserId: "x" });
    c.go(FX_TIMINGS.ready + 1);
    expect((await api.session(sessionId)).images).toHaveLength(3);
    await expect(api.generate({ theme: "retired-01", names: [], photos: [photo], clientUserId: "x" })).rejects.toThrow();
    await expect(api.generate({ theme: "admiral-01", names: [], photos: [], clientUserId: "x" })).rejects.toThrow();
    await expect(api.download("https://evil.example/x.png")).rejects.toThrow();
  });
});

describe("Imagen's session body", () => {
  it("reads status, images and cost, tolerating missing fields", () => {
    expect(parseSession({ status: "done", expected_image_count: 2, images: [{ id: 7, url: "https://x.supabase.co/a.png", width: 10, height: 20 }], total_cost_usd: "0.08" })).toEqual({ status: "done", expectedImageCount: 2, images: [{ id: "7", url: "https://x.supabase.co/a.png", width: 10, height: 20 }], costUsd: 0.08 });
    expect(parseSession({ session: { status: "generating" } }).status).toBe("generating");
    expect(parseSession({ status: "weird" }).status).toBe("pending");
    expect(parseSession(null).images).toEqual([]);
  });
  it("cancelled and face selection count as failed", () => {
    expect(ourStatus("cancelled")).toBe("failed");
    expect(ourStatus("awaiting_face_selection")).toBe("failed");
    expect(ourStatus("generating")).toBe("generating");
  });
});

describe("visitor cookie and file ids", () => {
  it("tokens are 32 random bytes, base64url", () => {
    const a = newVisitorTokenWeb();
    expect(isVisitorToken(a)).toBe(true);
    expect(a).not.toBe(newVisitorTokenWeb());
    expect(isVisitorToken("short")).toBe(false);
    expect(isVisitorToken(`${a.slice(0, 42)}=`)).toBe(false);
  });
  it("file ids round-trip and refuse anything else", () => {
    const id = "6f1c2d3e-0000-4000-8000-123456789abc";
    expect(parseFileId(photoFileId(id))).toEqual({ kind: "photo", photoId: id });
    expect(parseFileId(pictureFileId(id, 2))).toEqual({ kind: "picture", generationId: id, n: 2 });
    expect(parseFileId("p_../../etc")).toBeNull();
    expect(parseFileId(`g_${id}`)).toBeNull();
  });
});

describe("open store: golden images of the pillow", () => {
  for (const [shape, index] of [
    ["3x4", 0],
    ["square", 1],
  ] as const) {
    it(`with a ${shape} result`, async () => {
      const c = clock();
      const api = new ImagenApiFixtures(c.now);
      const { sessionId } = await api.generate({ theme: "admiral-01", names: ["Teddy"], photos: [photo], clientUserId: "x" });
      c.go(FX_TIMINGS.ready + 1);
      const img = (await api.session(sessionId)).images[index];
      const picture = await api.download(img.url);
      const template = templateSchema.parse(fixtureTemplate("pillow"));
      const background = await loadImage(readFileSync("public/fixtures/shop/pillow.jpg"));
      // The pillow prints 3600 × 3600 (fixtures), so the picture is cropped square from the top.
      const png = await renderPreview({ template, picture, crop: defaultCrop(img.width!, img.height!, 3600, 3600), placement: "cover", backgroundColour: null, targetAspect: 1, width: 500, images: { background, overlay: null } }, "png");
      expect(png).not.toBeNull();
      await expectGolden(png!, `pillow-${shape}`);
    });
  }
});
