import { z } from "zod";
import { layerSchema } from "./layer";

/**
 * A product's preview template, kept in its `mmp_shop.template` metafield (docs/shop.md › Previews):
 * a photo of the blank product, where the picture goes on it (four corners, or a curved wrap for a
 * mug), an optional overlay and mask. Coordinates are fractions of the background photo (0–1).
 * Pure maths only, so the browser and the server draw exactly the same thing.
 */
const frac = z.number().min(-0.25).max(1.25);
const point = z.tuple([frac, frac]);
const media = z.object({ media_id: z.string().max(200), url: z.string().max(2000), w: z.number().int().positive().max(20000), h: z.number().int().positive().max(20000) });

export const BEND_RANGE = { min: -0.1, max: 0.2 } as const;
/**
 * One edge's curve: how far it has moved in at evenly spaced points along it (3 points sit at a
 * quarter, half and three quarters), as a fraction of the photo's height (top, bottom) or width
 * (left, right). Negative bulges out. Top and bottom run left to right, left and right top to bottom.
 */
const edgeBend = z.array(z.number().min(BEND_RANGE.min).max(BEND_RANGE.max)).min(1).max(9);
export const cornersZone = z.object({
  kind: z.literal("corners"),
  points: z.tuple([point, point, point, point]),
  /**
   * Curved edges, for soft products such as a filled cushion, whose edges pull in: the corners stay
   * put and each edge passes through its curve points. Left out = straight edges.
   */
  bend: z.object({ top: edgeBend, right: edgeBend, bottom: edgeBend, left: edgeBend }).optional(),
});
export type Bend = NonNullable<z.infer<typeof cornersZone>["bend"]>;
export type BendEdge = keyof Bend;
export const NO_BEND: Bend = { top: [0, 0, 0], right: [0, 0, 0], bottom: [0, 0, 0], left: [0, 0, 0] };
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
  /** The personalisation layer: text and a picture the Magic Store customer adds on top (lib/shop/layer.ts). */
  layer: layerSchema.optional(),
  /**
   * Another product photo per value of one option (26 Nov): a framed print's photo with a black, white or wood
   * frame. The preview swaps to the chosen value's photo; the picture sits in the same place (the zone is shared),
   * so the photos must be the same shot. Only the preview changes: never the print file.
   */
  scenes: z
    .object({
      option: z.string().trim().min(1).max(60),
      values: z.record(z.string().max(120), z.object({ background: media, overlay: media.nullable().default(null) })),
    })
    .optional(),
  updated_at: z.string().max(40).optional(),
});
export type Template = z.infer<typeof templateSchema>;

/** The template as drawn for a variant: its option value's own photo when the template has one, else unchanged. */
export function templateFor(t: Template, options: { name: string; value: string }[] | null | undefined): Template {
  if (!t.scenes) return t;
  const value = options?.find((o) => o.name === t.scenes!.option)?.value;
  const scene = value !== undefined ? t.scenes.values[value] : undefined;
  return scene ? { ...t, background: scene.background, overlay: scene.overlay } : t;
}
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

/** Where an edge's curve points sit along it (0–1 from its first corner). */
export function bendStops(edge: readonly number[]): number[] {
  return edge.map((_, i) => (i + 1) / (edge.length + 1));
}

/** True when a corners zone has any curved edge. */
export function isBent(zone: Template["zone"]): boolean {
  return zone.kind === "corners" && Boolean(zone.bend && Object.values(zone.bend).some((e) => e.some((n) => n !== 0)));
}

/**
 * How far an edge has moved in at t (0–1 along it): a smooth curve through 0 at both corners and
 * each curve point, level at the corners (a cushion's edge leaves its corner tip almost straight).
 */
export function bendAt(edge: readonly number[], t: number): number {
  const n = edge.length + 1;
  const h = 1 / n;
  const p = [0, ...edge, 0];
  const slope = (i: number) => (i === 0 || i === n ? 0 : (p[i + 1] - p[i - 1]) / (2 * h));
  const i = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
  const s = t * n - i;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p[i] + (s3 - 2 * s2 + s) * h * slope(i) + (-2 * s3 + 3 * s2) * p[i + 1] + (s3 - s2) * h * slope(i + 1);
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
    const flat = homography([a, b, c, d]);
    const bend = zone.bend;
    if (!bend || !isBent(zone)) return flat;
    // Each edge moves in along its curve, and the shift fades out towards the opposite edge, faster
    // than in a straight line: like the print on a filled cushion, the picture is squeezed where the
    // fabric turns away near the edges and left alone in the middle.
    return (u: number, v: number) => {
      const p = flat(u, v);
      const fu = 1 - u;
      const fv = 1 - v;
      return {
        x: p.x + (bendAt(bend.left, v) * fu * fu - bendAt(bend.right, v) * u * u) * bgW,
        y: p.y + (bendAt(bend.top, u) * fv * fv - bendAt(bend.bottom, u) * v * v) * bgH,
      };
    };
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
  if (isBent(zone)) {
    // Curved edges pull in between the corners, so measure across the picture, not along its edges.
    const at = [0.25, 0.5, 0.75];
    const w = at.reduce((s, t) => s + dist(m(0, t), m(1, t)), 0);
    const h = at.reduce((s, t) => s + dist(m(t, 0), m(t, 1)), 0);
    return w / h;
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
