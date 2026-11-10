import { z } from "zod";

/**
 * A product's preview template, kept in its `mmp_shop.template` metafield (docs/shop.md › Previews):
 * a photo of the blank product, where the picture goes on it (four corners, or a curved wrap for a
 * mug), an optional overlay and mask. Coordinates are fractions of the background photo (0–1).
 * Pure maths only, so the browser and the server draw exactly the same thing.
 */
const frac = z.number().min(-0.25).max(1.25);
const point = z.tuple([frac, frac]);
const media = z.object({ media_id: z.string().max(200), url: z.string().max(2000), w: z.number().int().positive().max(20000), h: z.number().int().positive().max(20000) });

export const cornersZone = z.object({ kind: z.literal("corners"), points: z.tuple([point, point, point, point]) });
export const wrapZone = z.object({
  kind: z.literal("wrap"),
  left: frac,
  right: frac,
  top: frac,
  bottom: frac,
  /** How far the middle of the top and bottom edges bows down, as a fraction of the photo's height. */
  curve: z.number().min(0).max(0.25),
  /** How much of the cylinder's front the picture spans: 1 = half the mug, smaller = flatter. */
  spread: z.number().min(0.2).max(1),
});

export const templateSchema = z.object({
  v: z.literal(1),
  background: media,
  zone: z.discriminatedUnion("kind", [cornersZone, wrapZone]),
  overlay: media.nullable().default(null),
  mask: z.object({ kind: z.enum(["none", "rounded", "circle"]), radius: z.number().min(0).max(0.5).default(0) }).default({ kind: "none", radius: 0 }),
  blend: z.enum(["normal", "multiply"]).default("normal"),
  updated_at: z.string().max(40).optional(),
});
export type Template = z.infer<typeof templateSchema>;
export type Point = { x: number; y: number };

export function parseTemplate(value: string | null | undefined): Template | null {
  if (!value) return null;
  try {
    const r = templateSchema.safeParse(JSON.parse(value));
    if (!r.success) return null;
    // An overlay that is the background photo itself would cover the picture completely: ignore it.
    return r.data.overlay && r.data.overlay.media_id === r.data.background.media_id ? { ...r.data, overlay: null } : r.data;
  } catch {
    return null;
  }
}

/** Projective map of the unit square onto a quad (TL, TR, BR, BL). */
export function homography(q: [Point, Point, Point, Point]) {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-12 || Math.abs(dy3) > 1e-12) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y;
  return (u: number, v: number): Point => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
  };
}

/** Where (u, v) on the flat picture lands on the background, in background pixels. */
export function zoneMapper(zone: Template["zone"], bgW: number, bgH: number): (u: number, v: number) => Point {
  if (zone.kind === "corners") {
    const [a, b, c, d] = zone.points.map(([x, y]) => ({ x: x * bgW, y: y * bgH })) as [Point, Point, Point, Point];
    return homography([a, b, c, d]);
  }
  const half = (Math.PI / 2) * zone.spread;
  const sinE = Math.sin(half);
  const cosE = Math.cos(half);
  const cx = ((zone.left + zone.right) / 2) * bgW;
  const halfW = ((zone.right - zone.left) / 2) * bgW;
  return (u: number, v: number) => {
    const t = (u - 0.5) * 2 * half;
    const x = cx + (halfW * Math.sin(t)) / sinE;
    const bow = cosE < 1 ? ((Math.cos(t) - cosE) / (1 - cosE)) * zone.curve * bgH : 0;
    const y = zone.top * bgH + bow + v * (zone.bottom - zone.top) * bgH;
    return { x, y };
  };
}

/** A grid of points, cols × rows cells, for drawing the warp as small triangles. */
export function mesh(map: (u: number, v: number) => Point, cols: number, rows: number): Point[][] {
  const out: Point[][] = [];
  for (let j = 0; j <= rows; j++) {
    const row: Point[] = [];
    for (let i = 0; i <= cols; i++) row.push(map(i / cols, j / rows));
    out.push(row);
  }
  return out;
}

/** The zone's rough width ÷ height on the photo, to warn when it doesn't match the size's print shape. */
export function zoneAspect(zone: Template["zone"], bgW: number, bgH: number): number {
  const m = zoneMapper(zone, bgW, bgH);
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  if (zone.kind === "wrap") {
    // Unrolled width: the arc length of the visible front, measured across the middle.
    let w = 0;
    let prev = m(0, 0.5);
    for (let i = 1; i <= 32; i++) {
      const p = m(i / 32, 0.5);
      w += dist(prev, p);
      prev = p;
    }
    return w / dist(m(0.5, 0), m(0.5, 1));
  }
  const w = (dist(m(0, 0), m(1, 0)) + dist(m(0, 1), m(1, 1))) / 2;
  const h = (dist(m(0, 0), m(0, 1)) + dist(m(1, 0), m(1, 1))) / 2;
  return w / h;
}

/** A starting template on a blank product photo: a centred flat zone. */
export function defaultTemplate(background: Template["background"], kind: "corners" | "wrap" = "corners"): Template {
  return {
    v: 1,
    background,
    zone: kind === "corners" ? { kind: "corners", points: [[0.25, 0.2], [0.75, 0.2], [0.75, 0.8], [0.25, 0.8]] } : { kind: "wrap", left: 0.25, right: 0.65, top: 0.3, bottom: 0.75, curve: 0.04, spread: 0.7 },
    overlay: null,
    mask: { kind: "none", radius: 0 },
    blend: "normal",
  };
}
