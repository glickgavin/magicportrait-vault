import "server-only";
import { randomBytes } from "node:crypto";
import { db, must } from "@/lib/db/client";
import { putObject } from "@/lib/storage";

/**
 * The personalisation layer's art library (docs/shop.md › Personalisation layer): pictures a super user uploads once
 * and offers on any product (at most 3 each). PNG or SVG; an SVG is cleaned (no scripts, events, outside links or
 * embedded HTML) and turned into a large PNG, which is what every canvas draws, so the browser and the print file
 * match. The PNGs live in the public theme-assets bucket under layer-art/; the cleaned SVG text is kept in the table.
 */
export const ART_FOLDER = "layer-art";
const ART_PX = 2400;
const MIN_PX = 300;

export type LayerArtRow = { id: string; name: string; kind: "png" | "svg"; storage_path: string; width: number; height: number; created_at: string; archived_at: string | null };
export type LayerArtItem = { id: string; name: string; kind: "png" | "svg"; url: string; width: number; height: number; archived: boolean };
export type ArtRefusal = "not_an_image" | "too_small" | "unsafe_svg" | "not_see_through";

const COLS = "id, name, kind, storage_path, width, height, created_at, archived_at";

export function artUrl(path: string): string {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/theme-assets/${path}`;
}

const toItem = (r: LayerArtRow): LayerArtItem => ({ id: r.id, name: r.name, kind: r.kind, url: artUrl(r.storage_path), width: r.width, height: r.height, archived: Boolean(r.archived_at) });

/** The library, newest first; archived pictures only when asked (products that still offer one keep working). */
export async function listLayerArt(opts: { archived?: boolean } = {}): Promise<LayerArtItem[]> {
  let q = db().from("layer_art").select(COLS).order("created_at", { ascending: false }).limit(500);
  if (!opts.archived) q = q.is("archived_at", null);
  return (must(await q, "layer art") as LayerArtRow[]).map(toItem);
}

/** Pictures by id, archived or not (a product's choices), in the order asked. */
export async function layerArtByIds(ids: readonly string[]): Promise<LayerArtItem[]> {
  const good = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!good.length) return [];
  const rows = (must(await db().from("layer_art").select(COLS).in("id", good), "layer art by id") as LayerArtRow[]).map(toItem);
  return good.flatMap((id) => rows.filter((r) => r.id === id));
}

export async function setLayerArtArchived(id: string, archived: boolean): Promise<boolean> {
  const r = await db().from("layer_art").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).select("id");
  return Boolean(r.data?.length);
}

/**
 * An SVG made safe to keep and draw: refused if it declares a DTD or entities, else scripts, event handlers,
 * embedded HTML, outside links and outside styles are removed. Only self-contained drawings survive.
 */
export function cleanSvg(text: string): string | null {
  if (!/<svg[\s>]/i.test(text)) return null;
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return null;
  let s = text.replace(/<\?xml[^>]*\?>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, "").replace(/<script[^>]*\/>/gi, "");
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "").replace(/<foreignObject[^>]*\/>/gi, "");
  s = s.replace(/<(iframe|embed|object|audio|video|animate\w*|set)\b[\s\S]*?(<\/\1\s*>|\/>)/gi, "");
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Links: only to this drawing's own parts (#id) or embedded raster pictures.
  s = s.replace(/\s+(xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, _x, _q, a, b) => {
    const v = String(a ?? b ?? "").trim();
    return v.startsWith("#") || /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(v) ? m : "";
  });
  s = s.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none");
  if (/<script|javascript:|<foreignObject/i.test(s)) return null;
  return s.trim();
}

/** Checks and converts an upload: the PNG to draw, and the cleaned SVG when it was one. */
export async function processLayerArt(body: Buffer, fileName: string): Promise<{ ok: true; png: Buffer; svg: string | null; width: number; height: number } | { ok: false; reason: ArtRefusal }> {
  const sharp = (await import("sharp")).default;
  const looksSvg = /\.svg$/i.test(fileName) || /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(body.subarray(0, 2048).toString("utf8"));
  if (looksSvg) {
    const svg = cleanSvg(body.toString("utf8"));
    if (!svg) return { ok: false, reason: "unsafe_svg" };
    let meta;
    try {
      meta = await sharp(Buffer.from(svg)).metadata();
    } catch {
      return { ok: false, reason: "not_an_image" };
    }
    if (!meta.width || !meta.height) return { ok: false, reason: "not_an_image" };
    // Draw it large: an SVG has no pixels of its own, so pick the density that gives ART_PX on the long side.
    const density = Math.min(2400, Math.max(1, (72 * ART_PX) / Math.max(meta.width, meta.height)));
    const out = await sharp(Buffer.from(svg), { density }).resize({ width: ART_PX, height: ART_PX, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
    return { ok: true, png: out.data, svg, width: out.info.width, height: out.info.height };
  }
  let meta;
  try {
    meta = await sharp(body).metadata();
  } catch {
    return { ok: false, reason: "not_an_image" };
  }
  if (meta.format !== "png" || !meta.width || !meta.height) return { ok: false, reason: "not_an_image" };
  if (Math.max(meta.width, meta.height) < MIN_PX) return { ok: false, reason: "too_small" };
  if (!meta.hasAlpha) return { ok: false, reason: "not_see_through" };
  const out = await sharp(body).resize({ width: ART_PX, height: ART_PX, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  return { ok: true, png: out.data, svg: null, width: out.info.width, height: out.info.height };
}

/** Saves a checked upload to the bucket and the library. */
export async function saveLayerArt(actor: { email: string }, name: string, body: Buffer, fileName: string): Promise<{ ok: true; item: LayerArtItem } | { ok: false; reason: ArtRefusal }> {
  const p = await processLayerArt(body, fileName);
  if (!p.ok) return p;
  const key = randomBytes(8).toString("hex");
  const pngPath = `${ART_FOLDER}/${key}.png`;
  await putObject("theme-assets", pngPath, p.png, "image/png");
  const row = must(await db().from("layer_art").insert({ name, kind: p.svg ? "svg" : "png", storage_path: pngPath, svg: p.svg, width: p.width, height: p.height, created_by: actor.email }).select(COLS).single(), "save layer art") as LayerArtRow;
  return { ok: true, item: toItem(row) };
}
