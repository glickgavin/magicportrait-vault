import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { registerFonts } from "@/lib/render/render";
import { basePos, borderWidthFor, checkLayerValues, pictureRect, cleanLayerText, cleanPos, containIn, defaultLayerText, drawLayer, layerAttributes, layerSchema, layerValuesFromProps, placeBox, positionedLayer, type Layer, type LayerCtx } from "@/lib/shop/layer";
import { flatPicture, type PreviewCtx } from "@/lib/shop/preview";
import { defaultTemplate, templateSchema } from "@/lib/shop/template";

// The personalisation layer (docs/shop.md › Personalisation layer): schema, the customer's values, and drawing.

const ART = "6f1d2c3b-0000-4000-8000-000000000001";
const layer: Layer = layerSchema.parse({
  enabled: true,
  texts: [{ ...defaultLayerText("t1"), required: true, maxChars: 12 }, defaultLayerText("t2")],
  art: { label: "A badge", required: false, box: { x: 0.05, y: 0.05, w: 0.2, h: 0.2 }, choices: [ART] },
});

/** A fake canvas that records what's drawn; text is 10 px wide per character at size 20. */
function fakeCtx() {
  const calls: { op: string; args: unknown[]; font?: string }[] = [];
  const ctx = {
    font: "",
    fillStyle: "" as unknown,
    textAlign: "",
    textBaseline: "",
    save: () => calls.push({ op: "save", args: [] }),
    restore: () => calls.push({ op: "restore", args: [] }),
    translate: (x: number, y: number) => calls.push({ op: "translate", args: [x, y] }),
    rotate: (r: number) => calls.push({ op: "rotate", args: [r] }),
    drawImage: (...args: unknown[]) => calls.push({ op: "drawImage", args }),
    fillText: (text: string, x: number, y: number) => calls.push({ op: "fillText", args: [text, x, y], font: ctx.font }),
    measureText: (t: string) => ({ width: t.length * (parseFloat(/([\d.]+)px/.exec(ctx.font)?.[1] ?? "20") / 2) }),
  };
  return { ctx: ctx as LayerCtx, calls };
}

describe("the layer's schema", () => {
  it("a template without a layer is unchanged, and one with a layer round-trips", () => {
    const base = defaultTemplate({ media_id: "m", url: "u", w: 100, h: 100 });
    expect(templateSchema.parse(base).layer).toBeUndefined();
    expect(templateSchema.parse({ ...base, layer }).layer).toEqual(layer);
  });

  it("refuses boxes outside the print area, more than 3 pictures and a text box twice", () => {
    expect(layerSchema.safeParse({ ...layer, texts: [{ ...layer.texts[0], box: { x: 0.9, y: 0, w: 0.2, h: 0.1 } }] }).success).toBe(false);
    expect(layerSchema.safeParse({ ...layer, art: { ...layer.art, choices: [ART, ART.replace(/1$/, "2"), ART.replace(/1$/, "3"), ART.replace(/1$/, "4")] } }).success).toBe(false);
    expect(layerSchema.safeParse({ ...layer, texts: [layer.texts[0], layer.texts[0]] }).success).toBe(false);
  });
});

describe("what the customer fills in", () => {
  it("is cleaned: control characters and direction overrides gone, spaces squeezed, cut to the limit", () => {
    expect(cleanLayerText("  Te\u0000ddy‮  the\n\tdog ", 30)).toBe("Te ddy the dog");
    expect(cleanLayerText("abcdefghij", 4)).toBe("abcd");
    expect(cleanLayerText(42, 4)).toBe("");
  });

  it("is checked against the layer", () => {
    expect(checkLayerValues(layer, { t1: "Teddy", art: ART })).toEqual({ ok: true, values: { t1: "Teddy", art: ART } });
    expect(checkLayerValues(layer, { t1: " " })).toMatchObject({ ok: false, field: "t1" });
    expect(checkLayerValues(layer, { t1: "A name that is far too long" })).toMatchObject({ ok: false, field: "t1", error: "Their name: at most 12 characters." });
    expect(checkLayerValues(layer, { t1: "Teddy", art: "00000000-0000-4000-8000-000000000000" })).toMatchObject({ ok: false, field: "art" });
    expect(checkLayerValues(layer, { t1: "Teddy" })).toEqual({ ok: true, values: { t1: "Teddy", art: null } });
  });

  it("goes on the order line under fixed names, and comes back", () => {
    const attrs = layerAttributes({ t1: "Teddy", art: ART });
    expect(attrs).toEqual([{ key: "_shop_layer_t1", value: "Teddy" }, { key: "_shop_layer_art", value: ART }]);
    expect(layerValuesFromProps(Object.fromEntries(attrs.map((a) => [a.key, a.value])))).toEqual({ t1: "Teddy", art: ART });
    expect(layerValuesFromProps({ _shop: "true" })).toBeNull();
  });
});

describe("drawing", () => {
  it("text shrinks before it wraps and stays in its box; the picture is contained in its box", () => {
    const { ctx, calls } = fakeCtx();
    drawLayer(ctx, 1000, 1000, { layer, values: { t1: "Teddy", t2: "", art: ART }, art: new Map([[ART, { width: 400, height: 200 }]]), family: (f) => `"${f}"` });
    const img = calls.find((c) => c.op === "drawImage")!;
    // 0.2 × 1000 box, a 2:1 picture: 200 × 100, centred vertically in the box.
    expect(img.args.slice(5)).toEqual([50, 100, 200, 100]);
    const text = calls.filter((c) => c.op === "fillText");
    expect(text).toHaveLength(1);
    expect(text[0].args[0]).toBe("Teddy");
    expect(text[0].args[1]).toBe(500); // centred in a box from 100 to 900
    expect(text[0].font).toContain('"Playfair Display"');
  });

  it("a box at an angle turns about its centre; level boxes don't turn at all", () => {
    const tilted = layerSchema.parse({ ...layer, texts: [{ ...layer.texts[0], rotate: -15 }], art: null });
    const { ctx, calls } = fakeCtx();
    drawLayer(ctx, 1000, 1000, { layer: tilted, values: { t1: "Teddy" }, art: new Map(), family: (f) => `"${f}"` });
    // t1's box is x 0.1–0.9, y 0.78–0.90: centre (500, 840).
    expect(calls.find((c) => c.op === "translate")!.args).toEqual([500, 840]);
    expect(calls.find((c) => c.op === "rotate")!.args[0]).toBeCloseTo((-15 * Math.PI) / 180);
    const text = calls.find((c) => c.op === "fillText")!;
    expect(text.args[1]).toBe(0); // centred on the box's centre
    const level = fakeCtx();
    drawLayer(level.ctx, 1000, 1000, { layer, values: { t1: "Teddy" }, art: new Map(), family: (f) => `"${f}"` });
    expect(level.calls.some((c) => c.op === "rotate" || c.op === "translate")).toBe(false);
    // Saved before angles existed: reads as level.
    expect(layerSchema.parse({ ...layer, texts: [{ ...layer.texts[0], rotate: undefined }] }).texts[0].rotate).toBe(0);
    expect(layerSchema.safeParse({ ...layer, texts: [{ ...layer.texts[0], rotate: 200 }] }).success).toBe(false);
  });

  it("nothing is drawn when the layer is off", () => {
    const { ctx, calls } = fakeCtx();
    drawLayer(ctx, 100, 100, { layer: { ...layer, enabled: false }, values: { t1: "Teddy" }, art: new Map(), family: (f) => f });
    expect(calls).toEqual([]);
  });

  it("containIn never stretches", () => {
    expect(containIn({ x: 0, y: 0, w: 1, h: 1 }, 100, 50, 10, 10)).toEqual({ x: 25, y: 0, w: 50, h: 50 });
  });

  it("on a real canvas the flat picture is unchanged without a layer and changed inside the box with one", async () => {
    registerFonts();
    const pic = createCanvas(400, 400);
    const p = pic.getContext("2d");
    p.fillStyle = "#336699";
    p.fillRect(0, 0, 400, 400);
    const make = (w: number, h: number) => {
      const c = createCanvas(w, h);
      return { canvas: c, ctx: c.getContext("2d") as unknown as PreviewCtx };
    };
    const base = { picture: pic, crop: { x: 0, y: 0, w: 400, h: 400 }, placement: "cover" as const, backgroundColour: null, targetAspect: 1, makeCanvas: make, flatMax: 400, template: defaultTemplate({ media_id: "m", url: "u", w: 400, h: 400 }) };
    const png = async (layered: boolean) => {
      const f = flatPicture({ ...base, layer: layered ? { layer, values: { t1: "WWWWWW" }, art: new Map(), family: (x) => `"${x}"` } : null });
      return (f.canvas as unknown as { toBuffer(m: "image/png"): Buffer }).toBuffer("image/png");
    };
    const raw = async (b: Buffer) => (await sharp(b).raw().toBuffer({ resolveWithObject: true })).data;
    const [plain, layered] = [await raw(await png(false)), await raw(await png(true))];
    const pixel = (d: Buffer, x: number, y: number) => [...d.subarray((y * 400 + x) * 4, (y * 400 + x) * 4 + 3)];
    expect(pixel(plain, 200, 200)).toEqual([0x33, 0x66, 0x99]);
    // Outside the text boxes: the same. Inside t1's box (y 312–360): some white text.
    expect(pixel(layered, 20, 20)).toEqual(pixel(plain, 20, 20));
    let white = 0;
    for (let y = 312; y < 360; y++) for (let x = 40; x < 360; x++) if (pixel(layered, x, y)[0] > 200) white++;
    expect(white).toBeGreaterThan(100);
    for (let y = 0; y < 300; y++) for (let x = 0; x < 400; x += 7) expect(pixel(layered, x, y)).toEqual(pixel(plain, x, y));
  });
});

describe("repositioning (the template's switch, the customer's positions)", () => {
  const movable: Layer = { ...layer, reposition: true };
  const t1 = movable.texts[0];

  it("is off unless the template turns it on; old templates parse with it off", () => {
    expect(layerSchema.parse({ enabled: true, texts: [defaultLayerText("t1")] }).reposition).toBe(false);
    expect(positionedLayer(layer, { t1: "Teddy", pos: { t1: { cx: 0.2, cy: 0.2, rotate: 30, scale: 2 } } })).toBe(layer);
  });

  it("starts from the template's box: its centre, its turn, size 1", () => {
    expect(basePos(t1.box, 5)).toEqual({ cx: 0.5, cy: 0.84, rotate: 5, scale: 1 });
  });

  it("moves, turns and resizes a box about its centre, never past the print area", () => {
    // Twice the size about the same centre.
    expect(placeBox({ x: 0.4, y: 0.4, w: 0.2, h: 0.1 }, { cx: 0.5, cy: 0.45, rotate: 10, scale: 2 })).toEqual({ box: { x: 0.3, y: 0.35, w: 0.4, h: 0.2 }, rotate: 10, scale: 2 });
    // Dragged off the edge: the box stops at it.
    expect(placeBox({ x: 0.4, y: 0.4, w: 0.2, h: 0.1 }, { cx: 1.5, cy: -1, rotate: 0, scale: 1 }).box).toEqual({ x: 0.8, y: 0, w: 0.2, h: 0.1 });
    // A box as wide as the print area can't grow; a turn past 180° wraps round.
    expect(placeBox({ x: 0.1, y: 0.78, w: 0.8, h: 0.12 }, { cx: 0.5, cy: 0.84, rotate: 190, scale: 2.5 })).toMatchObject({ scale: 1.25, rotate: -170 });
  });

  it("the text's size grows with its box, and its turn follows", () => {
    const l = positionedLayer(movable, { t1: "Teddy", pos: { t1: { cx: 0.5, cy: 0.3, rotate: -15, scale: 1.25 } } });
    expect(l.texts[0]).toMatchObject({ rotate: -15, size: t1.size * 1.25 });
    expect(l.texts[0].box.y + l.texts[0].box.h / 2).toBeCloseTo(0.3, 4);
    // The other box is untouched.
    expect(l.texts[1]).toEqual(movable.texts[1]);
  });

  it("is checked on the server: only with the switch on, only for what's filled in, kept inside the limits", () => {
    const pos = { t1: { cx: 2, cy: 0.5, rotate: 400, scale: 9 }, t2: { cx: 0.5, cy: 0.5, rotate: 0, scale: 1 }, art: { cx: 0.1, cy: 0.1, rotate: 0, scale: 1 } };
    const ok = checkLayerValues(movable, { t1: "Teddy", pos });
    expect(ok).toEqual({ ok: true, values: { t1: "Teddy", art: null, pos: { t1: { cx: 1, cy: 0.5, rotate: 40, scale: 2.5 } } } });
    expect(checkLayerValues(layer, { t1: "Teddy", pos })).toEqual({ ok: true, values: { t1: "Teddy", art: null } });
    expect(cleanPos({ cx: "x", cy: 0, rotate: 0, scale: 1 })).toBeNull();
    expect(cleanPos({ cx: Number.NaN, cy: 0, rotate: 0, scale: 1 })).toBeNull();
  });

  it("goes on the order line as one short property and comes back", () => {
    const values = { t1: "Teddy", pos: { t1: { cx: 0.5, cy: 0.3, rotate: -15, scale: 1.25 } } };
    const attrs = layerAttributes(values);
    expect(attrs).toEqual([
      { key: "_shop_layer_t1", value: "Teddy" },
      { key: "_shop_layer_pos", value: '{"t1":[0.5,0.3,-15,1.25]}' },
    ]);
    expect(layerValuesFromProps(Object.fromEntries(attrs.map((a) => [a.key, a.value])))).toEqual(values);
    // A bad position property is ignored; positions alone (no words) put nothing on the line.
    expect(layerValuesFromProps({ _shop_layer_t1: "Teddy", _shop_layer_pos: "{nope" })).toEqual({ t1: "Teddy" });
    expect(layerAttributes({ pos: values.pos })).toEqual([]);
  });

  it("is drawn where the customer put it: moved and turned", () => {
    const { ctx, calls } = fakeCtx();
    drawLayer(ctx, 1000, 1000, { layer: movable, values: { t1: "Teddy", pos: { t1: { cx: 0.5, cy: 0.3, rotate: 90, scale: 1 } } }, art: new Map(), family: (f) => f });
    const turn = calls.find((c) => c.op === "rotate");
    expect(turn?.args[0]).toBeCloseTo(Math.PI / 2, 6);
    const at = calls.find((c) => c.op === "translate");
    expect(at?.args).toEqual([500, 300]);
  });
});

describe("the border (No border / Add border)", () => {
  const border = layerSchema.parse({ enabled: true, texts: [], border: { option: "Size", width: 0.04, widths: { '8x10"': 0.03, '24x36"': 0.06, "Mini": 0 } } }).border!;
  const withBorder: Layer = { ...layer, border };

  it("is a layer on its own, starts as No border and white", () => {
    expect(border).toMatchObject({ label: "Border", color: "#FFFFFF", start: "none" });
    expect(layerSchema.parse({ enabled: true, texts: [], border: {} }).border).toBeTruthy();
  });

  it("takes its width from the variant's value of the chosen option, else the border's own", () => {
    expect(borderWidthFor(border, [{ name: "Frame", value: "Black" }, { name: "Size", value: '24x36"' }])).toBe(0.06);
    expect(borderWidthFor(border, [{ name: "Size", value: '12x16"' }])).toBe(0.04);
    expect(borderWidthFor(border, [{ name: "Size", value: "Mini" }])).toBe(0);
    expect(borderWidthFor({ ...border, option: null }, [{ name: "Size", value: '24x36"' }])).toBe(0.04);
    expect(borderWidthFor(null, [])).toBe(0);
  });

  it("the customer sends only yes or no; it's kept only when the template offers it", () => {
    expect(checkLayerValues(withBorder, { t1: "Teddy", border: true, borderWidth: 0.2 })).toEqual({ ok: true, values: { t1: "Teddy", art: null, border: true } });
    expect(checkLayerValues(layer, { t1: "Teddy", border: true })).toEqual({ ok: true, values: { t1: "Teddy", art: null } });
    expect(checkLayerValues(withBorder, { t1: "Teddy", border: "yes" })).toEqual({ ok: true, values: { t1: "Teddy", art: null } });
  });

  it("goes on the order line as its width, even with no words, and comes back", () => {
    const attrs = layerAttributes({ border: true, borderWidth: 0.05 });
    expect(attrs).toEqual([{ key: "_shop_layer_border", value: "0.05" }]);
    expect(layerValuesFromProps({ _shop_layer_border: "0.05" })).toEqual({ border: true, borderWidth: 0.05 });
    expect(layerValuesFromProps({ _shop_layer_border: "nope" })).toBeNull();
    expect(layerAttributes({ border: false, borderWidth: 0.05 })).toEqual([]);
  });

  it("puts the picture inside an even margin of the shorter side", () => {
    expect(pictureRect(1200, 1600, { border: true, borderWidth: 0.05 })).toEqual({ x: 60, y: 60, w: 1080, h: 1480 });
    expect(pictureRect(1200, 1600, { border: false, borderWidth: 0.05 })).toEqual({ x: 0, y: 0, w: 1200, h: 1600 });
    expect(pictureRect(1200, 1600, null)).toEqual({ x: 0, y: 0, w: 1200, h: 1600 });
  });

  it("on a real canvas: the margin is the border's colour and the picture fills the rest", async () => {
    const pic = createCanvas(400, 400);
    const p = pic.getContext("2d");
    p.fillStyle = "#336699";
    p.fillRect(0, 0, 400, 400);
    const make = (w: number, h: number) => {
      const c = createCanvas(w, h);
      return { canvas: c, ctx: c.getContext("2d") as unknown as PreviewCtx };
    };
    const tpl = defaultTemplate({ media_id: "m", url: "u", w: 400, h: 400 });
    const lay: Layer = { ...withBorder, texts: [], border: { ...border, color: "#FF0000" } };
    const f = flatPicture({ picture: pic, crop: { x: 0, y: 0, w: 400, h: 400 }, placement: "cover", backgroundColour: null, targetAspect: 1, makeCanvas: make, flatMax: 400, template: tpl, layer: { layer: lay, values: { border: true, borderWidth: 0.05 }, art: new Map(), family: (x) => `"${x}"` } });
    const d = (await sharp((f.canvas as unknown as { toBuffer(m: "image/png"): Buffer }).toBuffer("image/png")).raw().toBuffer({ resolveWithObject: true })).data;
    const pixel = (x: number, y: number) => [...d.subarray((y * 400 + x) * 4, (y * 400 + x) * 4 + 3)];
    expect(pixel(5, 5)).toEqual([255, 0, 0]);
    expect(pixel(395, 200)).toEqual([255, 0, 0]);
    expect(pixel(25, 25)).toEqual([0x33, 0x66, 0x99]);
    expect(pixel(200, 200)).toEqual([0x33, 0x66, 0x99]);
  });
});
