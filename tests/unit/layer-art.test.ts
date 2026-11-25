import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cleanSvg, processLayerArt } from "@/lib/shop/layer-art";

// The art library's uploads (docs/shop.md › Personalisation layer): SVGs are cleaned and drawn as PNG; PNGs must be see-through.

const PAW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#c33"/></svg>';

describe("art uploads", () => {
  it("cleans an SVG: scripts, events, embedded HTML and outside links go; its own parts stay", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><foreignObject><div>x</div></foreignObject><a href="https://evil.example"><use href="#p"/></a><image href="https://evil.example/x.png"/><path id="p" style="fill:url(https://evil.example/f)" d="M0 0"/></svg>`;
    const s = cleanSvg(dirty)!;
    expect(s).not.toMatch(/script|onload|foreignObject|evil\.example/);
    expect(s).toContain('href="#p"');
    expect(cleanSvg('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>')).toBeNull();
    expect(cleanSvg("<html>no</html>")).toBeNull();
  });

  it("draws an SVG as a large PNG", async () => {
    const r = await processLayerArt(Buffer.from(PAW), "paw.svg");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.width, r.height]).toEqual([2400, 2400]);
    expect((await sharp(r.png).metadata()).format).toBe("png");
    expect(r.svg).toContain("<circle");
  });

  it("refuses a PNG with no see-through parts, or too small, or not a PNG", async () => {
    const solid = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#fff" } }).png().toBuffer();
    expect(await processLayerArt(solid, "a.png")).toEqual({ ok: false, reason: "not_see_through" });
    const tiny = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    expect(await processLayerArt(tiny, "a.png")).toEqual({ ok: false, reason: "too_small" });
    const jpg = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    expect(await processLayerArt(jpg, "a.jpg")).toEqual({ ok: false, reason: "not_an_image" });
    const ok = await sharp({ create: { width: 600, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    expect(await processLayerArt(ok, "a.png")).toMatchObject({ ok: true, width: 600, height: 400, svg: null });
  });
});
